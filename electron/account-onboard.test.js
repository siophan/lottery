const test = require('node:test');
const assert = require('node:assert');
const ob = require('../client/account-onboard.js');

const API = 'https://lottery.jh8.ai/api';

// ---- 极简假 DOM：只实现 account-onboard.js 用到的那部分 ----
function makeEl(tag) {
  const el = {
    tagName: tag, style: {}, attributes: {}, children: [], parentNode: null,
    value: '', textContent: '', disabled: false, listeners: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; }
      return c;
    },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
    dispatch(t, ev) {
      ev = ev || {};
      (this.listeners[t] || []).slice().forEach((f) => f(ev));
    },
    querySelector(sel) {
      const m = /^\[data-role="(.+)"\]$/.exec(sel);
      const role = m && m[1];
      const walk = (n) => {
        for (const c of n.children) {
          if (c.attributes['data-role'] === role) return c;
          const r = walk(c);
          if (r) return r;
        }
        return null;
      };
      return walk(this);
    },
  };
  return el;
}

function makeDoc() {
  const doc = makeEl('document');
  doc.body = makeEl('body');
  doc.createElement = makeEl;
  // 文档级监听带 capture 标记，便于断言 Esc 拦截走捕获阶段
  doc.captureListeners = [];
  doc.addEventListener = (t, fn, cap) => { doc.captureListeners.push({ t, fn, cap: !!cap }); };
  doc.removeEventListener = (t, fn, cap) => {
    doc.captureListeners = doc.captureListeners.filter((l) => !(l.t === t && l.fn === fn && l.cap === !!cap));
  };
  doc.fire = (t, ev) => doc.captureListeners.filter((l) => l.t === t).forEach((l) => l.fn(ev));
  return doc;
}

// 可手动驱动的假定时器
function makeTimers() {
  const t = { fns: new Map(), next: 1 };
  t.setIntervalImpl = (fn) => { const id = t.next++; t.fns.set(id, fn); return id; };
  t.clearIntervalImpl = (id) => { t.fns.delete(id); };
  t.tick = () => { Array.from(t.fns.values()).forEach((f) => f()); };
  return t;
}

// responses：按路径给出响应（对象）或抛错（Error）；记录每次请求
function makeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const path = url.slice(API.length);
    const r = typeof responses[path] === 'function' ? responses[path]() : responses[path];
    if (r instanceof Error) throw r;
    return { json: async () => r };
  };
  impl.calls = calls;
  return impl;
}

function setup(responses, extra) {
  const doc = makeDoc();
  const timers = makeTimers();
  const fetchImpl = makeFetch(responses || {});
  const cb = { done: [], expired: [], exit: 0 };
  const opts = Object.assign({
    apiURL: API, onboardToken: 'tok', doc, fetchImpl,
    setIntervalImpl: timers.setIntervalImpl, clearIntervalImpl: timers.clearIntervalImpl,
    onDone: (m) => cb.done.push(m), onExpired: (m) => cb.expired.push(m), onExit: () => { cb.exit++; },
  }, extra || {});
  const handle = ob.open(opts);
  const q = (r) => doc.body.querySelector('[data-role="' + r + '"]');
  return { doc, timers, fetchImpl, cb, handle, q };
}

function fill(q, over) {
  const v = Object.assign({ old: '123456', new: 'abc12345', confirm: 'abc12345', phone: '13812345678', code: '123456' }, over);
  Object.keys(v).forEach((k) => { q(k).value = v[k]; });
}

const tick = () => new Promise((r) => setImmediate(r));
const flush = async () => { await tick(); await tick(); await tick(); };

// ---- 纯函数 ----
test('isMobile 按 ^1[3-9]\\d{9}$ 判断', () => {
  assert.strictEqual(ob.isMobile('13812345678'), true);
  assert.strictEqual(ob.isMobile('19912345678'), true);
  assert.strictEqual(ob.isMobile('12812345678'), false);
  assert.strictEqual(ob.isMobile('1381234567'), false);
  assert.strictEqual(ob.isMobile('138123456789'), false);
  assert.strictEqual(ob.isMobile('1381234567a'), false);
  assert.strictEqual(ob.isMobile(''), false);
  assert.strictEqual(ob.isMobile(undefined), false);
});

test('passwordProblem 各分支文案与顺序同后端', () => {
  assert.strictEqual(ob.passwordProblem('123456', 'abc1234', 'abc1234'), '新密码长度不能少于8位');
  assert.strictEqual(ob.passwordProblem('123456', 'abcdefgh1234567890123', 'abcdefgh1234567890123'), '新密码长度不能超过20位');
  assert.strictEqual(ob.passwordProblem('123456', 'abcdefgh', 'abcdefgh'), '新密码必须同时包含字母和数字');
  assert.strictEqual(ob.passwordProblem('123456', '12345678', '12345678'), '新密码必须同时包含字母和数字');
  // 全角字母不算字母
  assert.strictEqual(ob.passwordProblem('123456', 'ａｂｃｄ12345', 'ａｂｃｄ12345'), '新密码必须同时包含字母和数字');
  assert.strictEqual(ob.passwordProblem('Abcd1234', 'Abcd1234', 'Abcd1234'), '新密码不能与初始密码相同');
  assert.strictEqual(ob.passwordProblem('x', 'abc12345', 'abc12346'), '两次输入的新密码不一致');
  assert.strictEqual(ob.passwordProblem('123456', 'abc12345', 'abc12345'), null);
  // 顺序：长度先于字符类型，字符类型先于“同旧密码”，同旧密码先于不一致
  assert.strictEqual(ob.passwordProblem('x', 'abc', 'zzz'), '新密码长度不能少于8位');
  assert.strictEqual(ob.passwordProblem('abcdefgh', 'abcdefgh', 'zzz'), '新密码必须同时包含字母和数字');
  assert.strictEqual(ob.passwordProblem('abc12345', 'abc12345', 'zzz'), '新密码不能与初始密码相同');
});

test('validate 顺序：旧密码 → 新密码规则 → 手机号 → 验证码', () => {
  const ok = { oldPassword: '123456', newPassword: 'abc12345', confirmPassword: 'abc12345', phone: '13812345678', smsCode: '123456' };
  assert.strictEqual(ob.validate(ok), null);
  assert.strictEqual(ob.validate(Object.assign({}, ok, { oldPassword: '' })), '请输入旧密码');
  assert.strictEqual(ob.validate({ oldPassword: '', newPassword: '', confirmPassword: '', phone: '', smsCode: '' }), '请输入旧密码');
  assert.strictEqual(ob.validate(Object.assign({}, ok, { newPassword: 'abc', phone: 'x', smsCode: '' })), '新密码长度不能少于8位');
  assert.strictEqual(ob.validate(Object.assign({}, ok, { phone: '123', smsCode: '' })), '手机号格式错误');
  assert.strictEqual(ob.validate(Object.assign({}, ok, { smsCode: '12345' })), '请输入6位短信验证码');
  assert.strictEqual(ob.validate(Object.assign({}, ok, { smsCode: '12345a' })), '请输入6位短信验证码');
  assert.strictEqual(ob.validate(Object.assign({}, ok, { smsCode: '1234567' })), '请输入6位短信验证码');
});

// ---- 弹窗 DOM ----
test('open 构建弹窗：文案、预填旧密码、输入属性、遮罩样式', () => {
  const { q, doc } = setup();
  assert.strictEqual(doc.body.children.length, 1);
  const overlay = q('overlay');
  assert.strictEqual(overlay.style.position, 'fixed');
  assert.strictEqual(overlay.style.zIndex, '2147483000');
  assert.strictEqual(overlay.style.background, 'rgba(0,0,0,0.55)');
  assert.strictEqual(q('title').textContent, '首次登录 - 修改密码并绑定手机号');
  assert.strictEqual(q('note').textContent, '为保障账号安全，首次登录需修改初始密码并绑定实名手机号，完成后请使用新密码重新登录。');
  assert.strictEqual(q('hint').textContent, '8-20位，须同时包含字母和数字');
  assert.strictEqual(q('old').value, '123456');
  ['old', 'new', 'confirm'].forEach((r) => assert.strictEqual(q(r).attributes.type, 'password'));
  assert.strictEqual(q('phone').attributes.maxlength, '11');
  assert.strictEqual(q('code').attributes.maxlength, '6');
  assert.strictEqual(q('submit').textContent, '确认提交');
  assert.strictEqual(q('send').textContent, '获取验证码');
  assert.strictEqual(q('exit').textContent, '退出程序');
});

test('未提供 onExit 时不渲染退出链接；点击退出调用 onExit', () => {
  const a = setup({}, { onExit: undefined });
  assert.strictEqual(a.q('exit'), null);
  const b = setup();
  b.q('exit').dispatch('click');
  assert.strictEqual(b.cb.exit, 1);
  // 退出不关闭弹窗（下次登录仍会弹出，由调用方决定退出进程）
  assert.strictEqual(b.doc.body.children.length, 1);
});

test('重复 open 先移除旧弹窗，且旧弹窗的 Esc 监听被摘掉', () => {
  const doc = makeDoc();
  const base = { apiURL: API, onboardToken: 't', doc, fetchImpl: makeFetch({}) };
  ob.open(base);
  ob.open(base);
  assert.strictEqual(doc.body.children.length, 1);
  assert.strictEqual(doc.captureListeners.length, 1);
});

test('Esc 在捕获阶段被拦截，关闭后监听被移除', async () => {
  const { doc, q } = setup({ '/auth/onboard': { code: 0, msg: 'ok' } });
  assert.strictEqual(doc.captureListeners.length, 1);
  assert.strictEqual(doc.captureListeners[0].t, 'keydown');
  assert.strictEqual(doc.captureListeners[0].cap, true);
  let prevented = 0, stopped = 0;
  doc.fire('keydown', { key: 'Escape', preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
  assert.deepStrictEqual([prevented, stopped], [1, 1]);
  // 其他按键不拦截
  doc.fire('keydown', { key: 'a', preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
  assert.deepStrictEqual([prevented, stopped], [1, 1]);
  fill(q);
  q('submit').dispatch('click');
  await flush();
  assert.strictEqual(doc.captureListeners.length, 0);
});

// ---- 获取验证码 ----
test('获取验证码前只校验手机号，不发请求', () => {
  const { q, fetchImpl } = setup();
  q('phone').value = '123';
  q('send').dispatch('click');
  assert.strictEqual(q('error').textContent, '手机号格式错误');
  assert.strictEqual(fetchImpl.calls.length, 0);
});

test('发码成功：POST 正确、按钮禁用并按 resendAfter 倒计时，结束后恢复', async () => {
  const { q, fetchImpl, timers } = setup({ '/auth/onboard/sms': { code: 0, msg: '验证码已发送', data: { resendAfter: 3 } } });
  q('phone').value = '13812345678';
  q('send').dispatch('click');
  assert.strictEqual(q('send').disabled, true); // 请求期间即禁用，防连点
  await flush();
  assert.strictEqual(fetchImpl.calls.length, 1);
  const c = fetchImpl.calls[0];
  assert.strictEqual(c.url, API + '/auth/onboard/sms');
  assert.strictEqual(c.init.method, 'POST');
  assert.strictEqual(c.init.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(c.body, { onboardToken: 'tok', phone: '13812345678' });
  assert.strictEqual(q('send').disabled, true);
  assert.strictEqual(q('send').textContent, '3秒后重发');
  timers.tick();
  assert.strictEqual(q('send').textContent, '2秒后重发');
  timers.tick(); timers.tick();
  assert.strictEqual(q('send').disabled, false);
  assert.strictEqual(q('send').textContent, '获取验证码');
  assert.strictEqual(timers.fns.size, 0);
});

test('发码成功但无 resendAfter 时默认 60 秒', async () => {
  const { q } = setup({ '/auth/onboard/sms': { code: 0, msg: '验证码已发送' } });
  q('phone').value = '13812345678';
  q('send').dispatch('click');
  await flush();
  assert.strictEqual(q('send').textContent, '60秒后重发');
});

test('发码 code 1：显示错误、按钮恢复、弹窗仍在', async () => {
  const { q, doc } = setup({ '/auth/onboard/sms': { code: 1, msg: '验证码发送过于频繁，请稍后再试' } });
  q('phone').value = '13812345678';
  q('send').dispatch('click');
  await flush();
  assert.strictEqual(q('error').textContent, '验证码发送过于频繁，请稍后再试');
  assert.strictEqual(q('send').disabled, false);
  assert.strictEqual(doc.body.children.length, 1);
});

test('发码网络失败：提示网络异常并恢复按钮', async () => {
  const { q } = setup({ '/auth/onboard/sms': new Error('boom') });
  q('phone').value = '13812345678';
  q('send').dispatch('click');
  await flush();
  assert.strictEqual(q('error').textContent, '网络异常，请稍后重试');
  assert.strictEqual(q('send').disabled, false);
});

for (const code of [10031, 10024, 10022]) {
  test('发码返回 ' + code + '：移除弹窗并 onExpired', async () => {
    const { q, doc, cb } = setup({ '/auth/onboard/sms': { code, msg: '终态消息' } });
    q('phone').value = '13812345678';
    q('send').dispatch('click');
    await flush();
    assert.strictEqual(doc.body.children.length, 0);
    assert.deepStrictEqual(cb.expired, ['终态消息']);
    assert.deepStrictEqual(cb.done, []);
  });
}

// ---- 提交 ----
test('提交前校验失败：显示文案、不发请求', async () => {
  const { q, fetchImpl } = setup();
  fill(q, { old: '' });
  q('submit').dispatch('click');
  assert.strictEqual(q('error').textContent, '请输入旧密码');
  fill(q, { confirm: 'abc12346' });
  q('submit').dispatch('click');
  assert.strictEqual(q('error').textContent, '两次输入的新密码不一致');
  fill(q, { phone: '1' });
  q('submit').dispatch('click');
  assert.strictEqual(q('error').textContent, '手机号格式错误');
  fill(q, { code: '12' });
  q('submit').dispatch('click');
  assert.strictEqual(q('error').textContent, '请输入6位短信验证码');
  assert.strictEqual(fetchImpl.calls.length, 0);
});

test('提交成功：POST 正确、移除弹窗、调用 onDone(msg)、不调用 onExpired', async () => {
  const { q, doc, cb, fetchImpl, timers } = setup({ '/auth/onboard': { code: 0, msg: '密码修改与手机号绑定成功，请使用新密码重新登录' } });
  fill(q);
  q('submit').dispatch('click');
  assert.strictEqual(q('submit').disabled, true);
  assert.strictEqual(q('submit').textContent, '提交中…');
  await flush();
  assert.deepStrictEqual(fetchImpl.calls[0].body, {
    onboardToken: 'tok', oldPassword: '123456', newPassword: 'abc12345', confirmPassword: 'abc12345',
    phone: '13812345678', smsCode: '123456',
  });
  assert.strictEqual(fetchImpl.calls[0].url, API + '/auth/onboard');
  assert.strictEqual(doc.body.children.length, 0);
  assert.deepStrictEqual(cb.done, ['密码修改与手机号绑定成功，请使用新密码重新登录']);
  assert.deepStrictEqual(cb.expired, []);
  assert.strictEqual(timers.fns.size, 0);
});

test('提交中重复点击只发一次请求', async () => {
  const { q, fetchImpl } = setup({ '/auth/onboard': { code: 1, msg: 'x' } });
  fill(q);
  q('submit').dispatch('click');
  q('submit').dispatch('click');
  await flush();
  assert.strictEqual(fetchImpl.calls.length, 1);
});

test('Enter 键提交表单', async () => {
  const { q, fetchImpl, cb } = setup({ '/auth/onboard': { code: 0, msg: 'ok' } });
  fill(q);
  q('code').dispatch('keydown', { key: 'Enter', preventDefault() {} });
  await flush();
  assert.strictEqual(fetchImpl.calls.length, 1);
  assert.deepStrictEqual(cb.done, ['ok']);
});

test('提交 code 1：红字显示后端文案、弹窗仍在、按钮恢复', async () => {
  const { q, doc, cb } = setup({ '/auth/onboard': { code: 1, msg: '旧密码错误' } });
  fill(q);
  q('submit').dispatch('click');
  await flush();
  assert.strictEqual(q('error').textContent, '旧密码错误');
  assert.strictEqual(doc.body.children.length, 1);
  assert.strictEqual(q('submit').disabled, false);
  assert.strictEqual(q('submit').textContent, '确认提交');
  assert.deepStrictEqual(cb.done, []);
  assert.deepStrictEqual(cb.expired, []);
  assert.strictEqual(q('error').style.color, '#e74c3c');
});

test('提交网络失败：提示网络异常、弹窗仍在', async () => {
  const { q, doc } = setup({ '/auth/onboard': new Error('offline') });
  fill(q);
  q('submit').dispatch('click');
  await flush();
  assert.strictEqual(q('error').textContent, '网络异常，请稍后重试');
  assert.strictEqual(doc.body.children.length, 1);
  assert.strictEqual(q('submit').disabled, false);
});

test('提交返回非 JSON 视为网络异常', async () => {
  const doc = makeDoc();
  const h = ob.open({ apiURL: API, onboardToken: 't', doc, fetchImpl: async () => ({ json: async () => { throw new Error('bad json'); } }) });
  const q = (r) => doc.body.querySelector('[data-role="' + r + '"]');
  fill(q);
  q('submit').dispatch('click');
  await flush();
  assert.strictEqual(q('error').textContent, '网络异常，请稍后重试');
  h.close();
});

for (const code of [10031, 10024, 10022]) {
  test('提交返回 ' + code + '：移除弹窗并 onExpired(msg)，不调 onDone', async () => {
    const { q, doc, cb } = setup({ '/auth/onboard': { code, msg: '请重新登录' } });
    fill(q);
    q('submit').dispatch('click');
    await flush();
    assert.strictEqual(doc.body.children.length, 0);
    assert.deepStrictEqual(cb.expired, ['请重新登录']);
    assert.deepStrictEqual(cb.done, []);
  });
}

test('倒计时中关闭弹窗会清理定时器', async () => {
  const { q, timers, handle } = setup({ '/auth/onboard/sms': { code: 0, msg: 'ok', data: { resendAfter: 60 } } });
  q('phone').value = '13812345678';
  q('send').dispatch('click');
  await flush();
  assert.strictEqual(timers.fns.size, 1);
  handle.close();
  assert.strictEqual(timers.fns.size, 0);
});

test('弹窗关闭后迟到的响应被忽略', async () => {
  let release;
  const doc = makeDoc();
  const cb = [];
  const h = ob.open({
    apiURL: API, onboardToken: 't', doc, onDone: (m) => cb.push(m),
    fetchImpl: () => new Promise((r) => { release = () => r({ json: async () => ({ code: 0, msg: 'late' }) }); }),
  });
  const q = (r) => doc.body.querySelector('[data-role="' + r + '"]');
  fill(q);
  q('submit').dispatch('click');
  await tick();
  h.close();
  release();
  await flush();
  assert.deepStrictEqual(cb, []);
});
