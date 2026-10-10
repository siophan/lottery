// 「保存到K线」弹窗（kLineComp.vue）按需求回复第 1、2 条：
//   - 按设计稿增加 1–6 号屏按钮，单选、每次打开默认 1 号屏；「新建分组」改为「新建组」
//   - 方案保存成功后把 {分组, 方案} 追加到所选屏位的记录（userData/<user>/<id>/kline_screens.json），
//     目标屏已有方案时追加、不覆盖；列表最后一项即该屏当前显示的方案
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CHUNK = path.join(__dirname, '..', 'client', 'js', 'chunk-213546c3.fe5d553d.js');

function evalSources(raw) {
  const captured = [];
  const window = { webpackJsonp: [] };
  const ctx = vm.createContext({ window, eval: (s) => { captured.push(s); } });
  new vm.Script(raw).runInContext(ctx);
  const req = Object.assign(() => ({}), { r() {}, d() {}, n: () => () => ({}) });
  for (const fn of Object.values(window.webpackJsonp[0][1])) {
    try { fn.call({}, { exports: {} }, {}, req); } catch (e) { /* 只关心 eval 源码 */ }
  }
  return captured;
}

// 载入组件；ipcRenderer 换成记录 send / on 的假对象
function loadComp() {
  const src = evalSources(fs.readFileSync(CHUNK, 'utf8'))
    .find((s) => s.includes('src/components/kLineComp.vue?vue&type=template'));
  const sent = [];
  const handlers = {};
  const ipcRenderer = { send: (ch, arg) => sent.push([ch, JSON.parse(JSON.stringify(arg))]), on: (ch, f) => { (handlers[ch] = handlers[ch] || []).push(f); } };
  const fn = new vm.Script('(function(module, __webpack_exports__, __webpack_require__){' + src + '\n})')
    .runInNewContext({ window: { electron: { ipcRenderer } }, JSON, Object, Date, String, Number, Array });
  const exp = {};
  const normalizer = { a: (o, render) => ({ exports: Object.assign({}, o, { render }) }) };
  const req = Object.assign((id) => (id === '2877' ? normalizer : {}), {
    r() {}, d(e, n, g) { Object.defineProperty(e, n, { get: g, enumerable: true }); },
  });
  fn({ exports: exp }, exp, req);
  return { comp: exp.a, sent, handlers };
}

// 组装一个最小的 Vue 实例：data + methods + created
function instance() {
  const { comp, sent, handlers } = loadComp();
  const errors = [];
  const vmThis = Object.assign(comp.data(), {
    $store: { getters: { userName: 'Z0000001' } },
    $message: { error: (m) => errors.push(m) },
    _v: (t) => ({ text: String(t) }),
    _s: (x) => String(x),
    _l: (arr, f) => arr.map(f),
    _e: () => null,
  });
  vmThis._self = { _c: (tag, data, children) => ({ tag, data: Array.isArray(data) ? {} : data || {}, children: Array.isArray(data) ? data : children || [] }) };
  for (const [k, f] of Object.entries(comp.methods)) vmThis[k] = f.bind(vmThis);
  comp.created.call(vmThis);
  const emit = (ch, arg) => (handlers[ch] || []).forEach((f) => f({}, arg));
  return { vm: vmThis, comp, sent, emit, errors };
}

const texts = (node) => (!node ? [] : node.text !== undefined ? [node.text] : (node.children || []).flatMap(texts));
const nodes = (node) => (!node || node.text !== undefined ? [] : [node, ...(node.children || []).flatMap(nodes)]);
const screenBtns = (tree) => nodes(tree).filter((n) => n.data.attrs && n.data.attrs.role === 'radio');

// 打开弹窗（config 里已有一个分组）
function open(t, groups = { 老组: ['旧方案'] }) {
  t.vm.showKLineComponent('{"k":1}', 'TOP1');
  t.emit('initGroup', { result: true, context: JSON.stringify(groups) });
}

test('弹窗有 1–6 号屏按钮，单选，默认 1 号屏', () => {
  const t = instance();
  open(t);
  const btns = screenBtns(t.comp.render.call(t.vm));
  assert.deepStrictEqual(btns.map((b) => texts(b).join('')), ['1号', '2号', '3号', '4号', '5号', '6号']);
  assert.deepStrictEqual(btns.map((b) => b.data.attrs['aria-checked']), ['true', 'false', 'false', 'false', 'false', 'false']);
  assert.deepStrictEqual(btns.map((b) => b.data.attrs['aria-label']), ['1号屏', '2号屏', '3号屏', '4号屏', '5号屏', '6号屏']);
  btns[3].data.on.click();
  const after = screenBtns(t.comp.render.call(t.vm));
  assert.deepStrictEqual(after.map((b) => b.data.attrs['aria-checked']), ['false', 'false', 'false', 'true', 'false', 'false']);
});

test('每次打开弹窗都重新默认 1 号屏', () => {
  const t = instance();
  open(t);
  t.vm.screenNo = 5;
  open(t);
  assert.strictEqual(t.vm.screenNo, 1);
});

test('单选项文字为「已有组」「新建组」，默认新建组', () => {
  const t = instance();
  open(t);
  const labels = nodes(t.comp.render.call(t.vm)).filter((n) => n.tag === 'el-radio').map((n) => n.data.attrs.label);
  assert.deepStrictEqual(labels, ['已有组', '新建组']);
  assert.strictEqual(t.vm.isSelectNewZu, '新建组');
});

function saveFlow(t, { screen, existing }) {
  open(t);
  t.vm.screenNo = screen;
  t.vm.fenZuName = '分组A';
  t.vm.fangAnName = '方案B';
  t.vm.confirmClick();
  const [ch, arg] = t.sent.find(([c]) => c === 'addkline');
  assert.strictEqual(ch, 'addkline');
  assert.deepStrictEqual([arg.group, arg.file, arg.id], ['分组A', '方案B', 'TOP1']);
  t.emit('addKlineFinished', null);                       // 方案写入成功
  const load = t.sent.find(([c, a]) => c === 'loadtempdata' && a.file === 'kline_screens');
  assert.ok(load, '应读取屏位记录');
  assert.deepStrictEqual([load[1].topid, load[1].id, load[1].user], ['TOP1', 'TOP1', 'Z0000001']);
  t.emit(load[1].func, existing === undefined ? { result: false, context: 'kline_screens directory is not exist' }
    : { result: true, context: JSON.stringify(existing) });
  const save = t.sent.find(([c, a]) => c === 'addtempdata' && a.file === 'kline_screens');
  assert.ok(save, '应写回屏位记录');
  assert.deepStrictEqual([save[1].id, save[1].user, save[1].group], ['TOP1', 'Z0000001', '']);
  return save[1].data;
}

test('保存成功后把方案记到所选屏位（首次保存时新建记录）', () => {
  const t = instance();
  const data = saveFlow(t, { screen: 3 });
  assert.deepStrictEqual(Object.keys(data), ['3']);
  assert.deepStrictEqual(data['3'].map(({ group, plan }) => [group, plan]), [['分组A', '方案B']]);
  assert.strictEqual(typeof data['3'][0].savedAt, 'number');
  assert.strictEqual(t.vm.showKLineDialog, false);
});

test('目标屏已有方案时追加到末尾（最新的即当前显示），其他屏不受影响', () => {
  const t = instance();
  const existing = { 3: [{ group: '老组', plan: '旧方案', savedAt: 1 }], 5: [{ group: 'x', plan: 'y', savedAt: 2 }] };
  const data = saveFlow(t, { screen: 3, existing });
  assert.deepStrictEqual(data['3'].map(({ group, plan }) => [group, plan]), [['老组', '旧方案'], ['分组A', '方案B']]);
  assert.deepStrictEqual(data['5'], existing['5']);
});

test('选「已有组」保存时记录的是所选已有分组', () => {
  const t = instance();
  open(t, { 老组: ['旧方案'] });
  t.vm.isSelectNewZu = '已有组';
  t.vm.screenNo = 2;
  t.vm.fangAnName = '方案C';
  t.vm.confirmClick();
  t.emit('addKlineFinished', null);
  const load = t.sent.find(([c, a]) => c === 'loadtempdata' && a.file === 'kline_screens');
  t.emit(load[1].func, { result: false });
  const save = t.sent.find(([c, a]) => c === 'addtempdata' && a.file === 'kline_screens');
  assert.deepStrictEqual(save[1].data['2'].map(({ group, plan }) => [group, plan]), [['老组', '方案C']]);
});

test('方案保存失败（如重名）时不写屏位记录', () => {
  const t = instance();
  open(t);
  t.vm.confirmClick();
  t.emit('addKlineFinished', { result: false, errcode: 1 });
  assert.deepStrictEqual(t.errors, ['方案名重名,请修改方案名']);
  assert.ok(!t.sent.some(([c, a]) => a && a.file === 'kline_screens'));
});

test('屏位记录文件损坏时按空记录处理，不影响保存', () => {
  const t = instance();
  open(t);
  t.vm.screenNo = 1;
  t.vm.confirmClick();
  t.emit('addKlineFinished', null);
  const load = t.sent.find(([c, a]) => c === 'loadtempdata' && a.file === 'kline_screens');
  t.emit(load[1].func, { result: true, context: '{坏' });
  const save = t.sent.find(([c, a]) => c === 'addtempdata' && a.file === 'kline_screens');
  assert.deepStrictEqual(Object.keys(save[1].data), ['1']);
});

test('同一窗口里没发起保存的实例不会重复记录屏位', () => {
  const t = instance();
  open(t);
  t.emit('addKlineFinished', null);                       // 别的实例的回调
  assert.ok(!t.sent.some(([c, a]) => a && a.file === 'kline_screens'));
  t.emit('klineScreensLoaded', { result: false });
  assert.ok(!t.sent.some(([c]) => c === 'addtempdata'));
});

test('屏位记录写入失败时提示', () => {
  const t = instance();
  saveFlow(t, { screen: 1 });
  t.emit('klineScreensSaved', { result: false, errcode: 5 });
  assert.deepStrictEqual(t.errors, ['方案已保存，但屏号记录失败']);
});
