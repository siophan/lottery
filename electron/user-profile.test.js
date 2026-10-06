const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const up = require('../client/user-profile.js');

const API = 'https://lottery.jh8.ai/api';
const tick = () => new Promise((r) => setImmediate(r));

// ---- 极简假 DOM：只实现 user-profile.js 用到的部分 ----
function makeEl(tag) {
  const style = { setProperty(k, v) { this[k] = v; } };
  return {
    tagName: tag, style, attributes: {}, children: [], parentNode: null, listeners: {},
    value: '', textContent: '', disabled: false, src: '', files: null, clicks: 0,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
    dispatch(t, ev) { (this.listeners[t] || []).slice().forEach((f) => f(ev || { target: this })); },
    click() { this.clicks++; },
    // 沿 parentNode 走到根，根是 attached（挂载点 / body）才算在文档里
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.attached === true; },
  };
}
function find(root, role) {
  for (const c of root.children) {
    if (c.attributes['data-role'] === role) return c;
    const r = find(c, role);
    if (r) return r;
  }
  return null;
}
function makeDoc() {
  const doc = makeEl('document');
  doc.body = makeEl('body');
  doc.body.attached = true;
  doc.createElement = (tag) => makeEl(tag);
  return doc;
}

// request 桩：按 url 后缀取预置回复（函数 / 值 / Error 实例 = reject），记录每次调用
function harness({ points = '5', replies = {}, readImage } = {}) {
  const doc = makeDoc();
  const el = makeEl('div');
  el.attached = true;                        // 挂载点在文档里
  const calls = [];
  const timers = [];
  const cleared = [];
  const request = (cfg) => {
    calls.push(cfg);
    const key = cfg.method + ' ' + cfg.url.slice(API.length);
    let r = replies[key];
    if (typeof r === 'function') r = r(cfg);
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const ctl = up.mount(el, {
    request, apiURL: API, points, doc,
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return 7; },
    clearInterval: (id) => cleared.push(id),
    readImage,
  });
  const q = (role) => find(el, role) || find(doc.body, role);
  return { doc, el, calls, timers, cleared, ctl, q };
}
const PROFILE = {
  code: 0, data: { code: 'U1', nickname: '好运的海豚', avatar: 'data:A', defaultAvatar: 'data:D', points: 9,
                   nicknameIsDefault: true, avatarIsDefault: true },
};

test('fmtPoints / nicknameProblem / cropBox', () => {
  assert.strictEqual(up.fmtPoints(5), '积分：5');
  assert.strictEqual(up.fmtPoints('12'), '积分：12');
  for (const v of [null, '', undefined, 'x']) assert.strictEqual(up.fmtPoints(v), '积分：—');
  assert.strictEqual(up.nicknameProblem('  '), '昵称不能为空');
  assert.strictEqual(up.nicknameProblem('a'.repeat(13)), '昵称最多 12 个字');
  assert.strictEqual(up.nicknameProblem('🐬'.repeat(12)), null);           // 按码点计数
  assert.deepStrictEqual(up.cropBox(200, 100), { sx: 50, sy: 0, s: 100 });
  assert.deepStrictEqual(up.cropBox(80, 120), { sx: 0, sy: 20, s: 80 });
  assert.deepStrictEqual([up.NICK_MAX, up.AVATAR_SIZE, up.AVATAR_QUALITY, up.POLL_MS], [12, 128, 0.85, 60000]);
});

test('squareDataURL：居中裁剪缩放到 size，白底 JPEG', () => {
  const ops = [];
  const canvas = {
    getContext: () => ({ fillRect: (...a) => ops.push(['fillRect', ...a]), drawImage: (...a) => ops.push(['drawImage', ...a.slice(1)]),
                         set fillStyle(v) { ops.push(['fillStyle', v]); } }),
    toDataURL: (type, q) => `data:${type};q=${q}`,
  };
  const doc = { createElement: (t) => (assert.strictEqual(t, 'canvas'), canvas) };
  const url = up.squareDataURL({ naturalWidth: 300, naturalHeight: 200 }, doc, 128);
  assert.strictEqual(url, 'data:image/jpeg;q=0.85');
  assert.deepStrictEqual([canvas.width, canvas.height], [128, 128]);
  assert.deepStrictEqual(ops, [['fillStyle', '#ffffff'], ['fillRect', 0, 0, 128, 128], ['drawImage', 50, 0, 200, 200, 0, 0, 128, 128]]);
});

test('mount：先显示登录余额，再拉取头像昵称；no-drag', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE } });
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：5');
  assert.strictEqual(h.q('ds-profile').style['-webkit-app-region'], 'no-drag');
  assert.deepStrictEqual(h.calls.map((c) => [c.method, c.url]), [['get', API + '/user/profile']]);
  await tick();
  assert.strictEqual(h.q('ds-profile-nick').textContent, '好运的海豚');
  assert.strictEqual(h.q('ds-profile-avatar').src, 'data:A');
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：9');
});

test('refresh：请求进行中不重复；可先显示传入的余额', async () => {
  const h = harness({ points: null, replies: { 'get /user/profile': PROFILE } });
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：—');
  h.ctl.refresh('3');
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：3');
  assert.strictEqual(h.calls.length, 1);
  await tick();
  h.ctl.refresh();
  assert.strictEqual(h.calls.length, 2);
});

test('每 60 秒刷新余额；失败 / 被拦截 / 非 0 时保留上次显示', async () => {
  let reply = { code: 0, data: { points: 4 } };
  const h = harness({ replies: { 'get /user/profile': PROFILE, 'get /user/points': () => reply } });
  await tick();
  assert.deepStrictEqual(h.timers.map((t) => t.ms), [60000]);
  await h.timers[0].fn(); await tick();
  assert.strictEqual(h.calls.at(-1).url, API + '/user/points');
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：4');
  for (reply of [undefined, { code: 1, msg: 'x' }, new Error('net')]) {
    await h.timers[0].fn(); await tick();
    assert.strictEqual(h.q('ds-profile-points').textContent, '积分：4');
  }
});

test('挂载点离开文档（keep-alive 停用）后轮询不请求，回到文档后恢复', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE, 'get /user/points': { code: 0, data: { points: 4 } } } });
  await tick();
  const n = h.calls.length;
  h.el.attached = false;
  await h.timers[0].fn(); await tick();
  assert.strictEqual(h.calls.length, n);
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：9');
  h.el.attached = true;
  await h.timers[0].fn(); await tick();
  assert.strictEqual(h.calls.length, n + 1);
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：4');
});

test('编辑：打开弹窗预填昵称；未改动直接关闭不请求', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE } });
  await tick();
  h.q('ds-profile').dispatch('click');
  const editor = find(h.doc.body, 'ds-profile-editor');
  assert.ok(editor);
  assert.strictEqual(find(editor, 'nick-input').value, '好运的海豚');
  assert.strictEqual(find(editor, 'preview').src, 'data:A');
  find(editor, 'save').dispatch('click');
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
  assert.strictEqual(h.calls.length, 1);
});

test('编辑：保存昵称与新头像，成功后关闭并更新左上角', async () => {
  const saved = { code: 0, data: { ...PROFILE.data, nickname: '新名字', avatar: 'data:image/jpeg;NEW', avatarIsDefault: false } };
  const h = harness({
    replies: { 'get /user/profile': PROFILE, 'post /user/profile': saved },
    readImage: (f) => Promise.resolve('data:image/jpeg;NEW'),
  });
  await tick();
  h.q('ds-profile').dispatch('click');
  const ed = find(h.doc.body, 'ds-profile-editor');
  find(ed, 'pick').dispatch('click');
  assert.strictEqual(find(ed, 'file').clicks, 1);
  find(ed, 'file').files = [{ type: 'image/png' }];
  find(ed, 'file').dispatch('change');
  await tick();
  assert.strictEqual(find(ed, 'preview').src, 'data:image/jpeg;NEW');
  find(ed, 'nick-input').value = ' 新名字 ';
  find(ed, 'save').dispatch('click');
  assert.deepStrictEqual(h.calls.at(-1), { url: API + '/user/profile', method: 'post', data: { nickname: '新名字', avatar: 'data:image/jpeg;NEW' } });
  await tick();
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
  assert.strictEqual(h.q('ds-profile-nick').textContent, '新名字');
  assert.strictEqual(h.q('ds-profile-avatar').src, 'data:image/jpeg;NEW');
});

test('编辑：恢复默认头像发送 avatar:null 并预览默认头像', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE, 'post /user/profile': PROFILE } });
  await tick();
  h.q('ds-profile').dispatch('click');
  const ed = find(h.doc.body, 'ds-profile-editor');
  find(ed, 'reset').dispatch('click');
  assert.strictEqual(find(ed, 'preview').src, 'data:D');
  find(ed, 'save').dispatch('click');
  assert.deepStrictEqual(h.calls.at(-1).data, { avatar: null });
});

test('编辑：本地校验、非图片、解码失败', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE }, readImage: () => Promise.reject(new Error('bad')) });
  await tick();
  h.q('ds-profile').dispatch('click');
  const ed = find(h.doc.body, 'ds-profile-editor');
  const err = () => find(ed, 'error').textContent;
  find(ed, 'nick-input').value = '   ';
  find(ed, 'save').dispatch('click');
  assert.strictEqual(err(), '昵称不能为空');
  find(ed, 'nick-input').value = 'a'.repeat(13);
  find(ed, 'save').dispatch('click');
  assert.strictEqual(err(), '昵称最多 12 个字');
  assert.strictEqual(h.calls.length, 1);
  find(ed, 'file').files = [{ type: 'text/plain' }];
  find(ed, 'file').dispatch('change');
  assert.strictEqual(err(), '请选择图片文件');
  find(ed, 'file').files = [{ type: 'image/png' }];
  find(ed, 'file').dispatch('change');
  await tick();
  assert.strictEqual(err(), '请选择图片文件');
});

test('编辑：服务端报错留在弹窗；网络失败；被统一拦截则关闭', async () => {
  let reply = { code: 1, msg: '头像图片过大' };
  const h = harness({ replies: { 'get /user/profile': PROFILE, 'post /user/profile': () => reply } });
  await tick();
  const attempt = async () => {
    h.q('ds-profile').dispatch('click');
    const ed = find(h.doc.body, 'ds-profile-editor');
    find(ed, 'nick-input').value = '别的名字';
    find(ed, 'save').dispatch('click');
    assert.strictEqual(find(ed, 'save').disabled, true);
    assert.strictEqual(find(ed, 'save').textContent, '保存中…');
    await tick(); await tick();
    return ed;
  };
  let ed = await attempt();
  assert.strictEqual(find(ed, 'error').textContent, '头像图片过大');
  assert.strictEqual(find(ed, 'save').disabled, false);
  assert.strictEqual(find(ed, 'save').textContent, '保存');
  reply = new Error('net');
  find(ed, 'save').dispatch('click'); await tick(); await tick();
  assert.strictEqual(find(ed, 'error').textContent, '网络异常，请稍后重试');
  reply = { code: 1 };
  find(ed, 'save').dispatch('click'); await tick(); await tick();
  assert.strictEqual(find(ed, 'error').textContent, '保存失败，请稍后重试');
  reply = undefined;
  find(ed, 'save').dispatch('click'); await tick(); await tick();
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
});

test('编辑：点遮罩或取消关闭', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE } });
  await tick();
  h.q('ds-profile').dispatch('click');
  let ed = find(h.doc.body, 'ds-profile-editor');
  ed.dispatch('click', { target: find(ed, 'nick-input') });
  assert.ok(find(h.doc.body, 'ds-profile-editor'));
  ed.dispatch('click', { target: ed });
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
  h.q('ds-profile').dispatch('click');
  ed = find(h.doc.body, 'ds-profile-editor');
  find(ed, 'cancel').dispatch('click');
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
});

test('destroy：停止刷新、移除信息区与弹窗，迟到的响应被忽略', async () => {
  let resolve;
  const h = harness({ replies: { 'get /user/profile': () => new Promise((r) => { resolve = r; }) } });
  h.ctl.openEditor();
  h.ctl.destroy();
  assert.deepStrictEqual(h.cleared, [7]);
  assert.strictEqual(h.el.children.length, 0);
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
  resolve(PROFILE); await tick();
  assert.strictEqual(find(h.el, 'ds-profile-nick'), null);
});

test('index.html 在业务脚本之前加载 user-profile.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.html'), 'utf8');
  const i = html.indexOf('<script src=app://./user-profile.js></script>');
  assert.ok(i > html.indexOf('<script src=app://./account-onboard.js></script>'));
  assert.ok(i < html.indexOf('app://./js/app.9ba1133b.js></script>'));
});
