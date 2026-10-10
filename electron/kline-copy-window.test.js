// 复制 K 线窗口（需求回复第 3 条 / 第 011 章「复制/拓展」）：
//   整个 K 线独立页复制到一个新的独立窗口（可拖到其他显示器），保留布局、各屏方案和条件；
//   新窗口可继续独立修改，不影响源窗口；开奖刷新由主进程直接送到复制出来的窗口，源窗口关掉也不影响
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { ROOT, load, start, nodes, texts, QUERY } = require('./kline-page-harness');

// 给第 n 号屏的假文档设好「自定义 / 固定」选择
function pick(t, n, { custom, group = '', plan = '', fixed = '' }) {
  const els = t.frames[n].els;
  els.zdyfa = { checked: !!custom };
  els.zdyfa3 = { innerHTML: group };
  els.zdyfa4 = { innerHTML: plan };
  els.tjfa3 = { value: fixed };
}

function copyButton(t) {
  return nodes(t.comp.render.call(t.self)).find((n) => texts(n).join('') === '复制到新窗口' && n.data.on);
}

test('页面上有「复制到新窗口」按钮', () => {
  const t = load();
  start(t);
  const btn = copyButton(t);
  assert.ok(btn, '没有找到复制按钮');
  assert.strictEqual(btn.data.attrs.role, 'button');
});

test('复制：按当前窗口大小新开一个独立窗口，挂在同一个工作台下，窗口编号唯一', () => {
  const t = load();
  start(t);
  copyButton(t).data.on.click();
  const opens = t.sent.filter(([c]) => c === 'newPage');
  assert.strictEqual(opens.length, 1);
  const arg = opens[0][1];
  assert.strictEqual(arg.pid, '1105r5');                       // 与源窗口同一个工作台
  assert.strictEqual(arg.id, '1105r5_kline_copy1700000000000');
  assert.strictEqual(arg.topid, arg.id);
  assert.deepStrictEqual([arg.width, arg.height, arg.resizable], [1600, 900, true]);
  assert.strictEqual(arg.path, '#/kLine?resolved=1');
  const loc = t.resolved[0];
  assert.strictEqual(loc.path, '/kLine');
  // 原有参数原样带过去，只换窗口编号和标题
  for (const k of ['typeId', 'pid', 'code', 'cat']) assert.strictEqual(loc.query[k], QUERY[k], k);
  assert.strictEqual(loc.query.topid, arg.id);
  assert.strictEqual(loc.query.title, 'K线走势（副本）');
});

test('复制的副本再复制，标题不叠加「副本」', () => {
  const t = load({ query: Object.assign({}, QUERY, { topid: 'a_copy1', title: 'K线走势（副本）' }) });
  start(t);
  t.self.copyWindow();
  assert.strictEqual(t.resolved[0].query.title, 'K线走势（副本）');
});

test('复制时带上布局、大屏 / 放大的屏和每个屏的方案选择', () => {
  const t = load();
  start(t);
  t.self.setLayout('grid');
  t.self.coverClick(4);
  pick(t, 1, { custom: true, group: '分组A', plan: '方案C', fixed: '9' });
  pick(t, 2, { custom: false, group: '分组A', plan: '方案B', fixed: '12' });
  t.frames[3].contentWindow.document = { getElementById: () => null };   // 3 号屏页面还没加载完
  t.self.copyWindow();
  const state = JSON.parse(t.resolved[0].query.state);
  assert.deepStrictEqual([state.layout, state.bigScreen, state.zoomed], ['grid', 1, 4]);
  assert.deepStrictEqual(state.screens['1'], { custom: true, linked: false, group: '分组A', plan: '方案C', fixed: '9' });
  assert.deepStrictEqual(state.screens['2'], { custom: false, linked: false, group: '分组A', plan: '方案B', fixed: '12' });
  assert.ok(!('3' in state.screens), '还没加载好的屏不记录');
});

function openCopy(state, screens) {
  const t = load({ query: Object.assign({}, QUERY, { topid: '1105r5_kline_copy1', state: JSON.stringify(state) }) });
  start(t, { screens });
  return t;
}

test('副本打开时恢复源窗口的布局', () => {
  const t = openCopy({ layout: 'main', bigScreen: 5, zoomed: null, screens: {} });
  assert.deepStrictEqual([t.self.layout, t.self.bigScreen, t.self.zoomed], ['main', 5, null]);
  const g = openCopy({ layout: 'grid', bigScreen: 2, zoomed: 6, screens: {} });
  assert.deepStrictEqual([g.self.layout, g.self.bigScreen, g.self.zoomed], ['grid', 2, 6]);
});

test('副本窗口栏显示「（副本）」标题，原窗口不显示标题', () => {
  const bar = (t) => nodes(t.comp.render.call(t.self)).find((n) => n.tag === 'numbertop');
  const copy = load({ query: Object.assign({}, QUERY, { topid: 'c1', title: 'K线走势（副本）', state: '{}' }) });
  start(copy);
  assert.deepStrictEqual([bar(copy).data.attrs.id, bar(copy).data.attrs.title], ['c1', 'K线走势（副本）']);
  const t = load();
  start(t);
  assert.strictEqual(bar(t).data.attrs.title, undefined);
});

test('副本里的回调发回副本自己的窗口', () => {
  const t = openCopy({ layout: 'main', bigScreen: 1, screens: {} });
  const req = t.sent.find(([c, a]) => c === 'loadtempdata' && a.file === 'kline_screens');
  assert.strictEqual(req[1].topid, '1105r5_kline_copy1');
  t.self.loadGroup(2);
  assert.strictEqual(t.sent[t.sent.length - 1][1].topid, '1105r5_kline_copy1');
});

test('副本各屏恢复源窗口的方案：自定义方案选中原分组 / 方案，固定方案选中原方案', () => {
  const config = { 老组: ['旧方案'], 分组A: ['方案B', '方案C'] };
  const t = openCopy({
    layout: 'main', bigScreen: 1,
    screens: { 1: { custom: true, group: '分组A', plan: '方案C', fixed: '9' }, 2: { custom: false, group: '老组', plan: '旧方案', fixed: '12' } },
  });
  t.emit('initGroup_1', { result: true, context: JSON.stringify(config) });
  assert.deepStrictEqual([t.frames[1].els.zdyfa3.innerHTML, t.frames[1].els.zdyfa4.innerHTML], ['分组A', '方案C']);
  t.emit('initGroup_2', { result: true, context: JSON.stringify(config) });
  assert.deepStrictEqual(t.calls.filter(([c]) => c === 'useCustom' || c === 'useFixed'), [['useCustom', 1], ['useFixed', 2, '12']]);
  // 只在首次加载分组时恢复，之后各屏独立
  t.emit('initGroup_1', { result: true, context: JSON.stringify(config) });
  t.emit('initGroup_2', { result: true, context: JSON.stringify(config) });
  assert.strictEqual(t.calls.filter(([c]) => c === 'useCustom' || c === 'useFixed').length, 2);
});

test('副本里源窗口的分组已被删掉时改用固定方案；没带状态的屏按保存记录加载', () => {
  const config = { 分组A: ['方案B'] };
  const t = openCopy(
    { layout: 'main', bigScreen: 1, screens: { 1: { custom: true, group: '已删', plan: 'x', fixed: '9' } } },
    { 3: [{ group: '分组A', plan: '方案B' }] },
  );
  t.emit('initGroup_1', { result: true, context: JSON.stringify(config) });
  t.emit('initGroup_3', { result: true, context: JSON.stringify(config) });
  assert.deepStrictEqual(t.calls.filter(([c]) => /^use/.test(c)), [['useFixed', 1, '9'], ['useLinked', 3, true]]);
});

test('副本状态损坏时按普通 K 线页打开', () => {
  const t = load({ query: Object.assign({}, QUERY, { state: '{坏' }) });
  start(t);
  assert.deepStrictEqual([t.self.layout, t.self.bigScreen, t.self.zoomed], ['main', 1, null]);
  assert.ok(t.self.url);
  const bad = load({ query: Object.assign({}, QUERY, { state: JSON.stringify({ layout: 'x', bigScreen: 9, zoomed: 3 }) }) });
  start(bad);
  assert.deepStrictEqual([bad.self.layout, bad.self.bigScreen, bad.self.zoomed], ['main', 1, null]);
});

test('开奖刷新只重画本窗口六个屏，不再转发给副本（副本由主进程直接通知，见 kline-copies.js）', () => {
  const t = load();
  start(t);
  t.self.copyWindow();
  t.sent.length = 0;
  t.emit('lodDate', {});
  assert.deepStrictEqual(t.sent, []);
  assert.strictEqual(t.calls.filter(([c]) => c === 'loadingData').length, 6);
});

// ---------------- 单屏页面（iframe）侧 ----------------

// 极简 jQuery 替身：只支持 useFixed 用到的选择器
function fakeJq() {
  const state = { tjfa: false, value: '1', disabled: true, options: ['1', '9', '12'], drawn: 0 };
  const $ = (sel) => {
    if (sel === '#tjfa') return { prop: (k, v) => (v === undefined ? state.tjfa : (state.tjfa = v)) };
    if (sel === '#tjfa3') return { val: (v) => (v === undefined ? state.value : (state.value = v)), attr: (k, v) => { state.disabled = v; } };
    if (sel === '#tjfa3 option') return { filter: (f) => ({ length: state.options.filter((value) => f.call({ value })).length }) };
    return {};
  };
  return { $, state };
}

function runKjs(jq) {
  const kjs = fs.readFileSync(path.join(ROOT, 'kline', 'k2', 'k.js'), 'utf8');
  const ctx = { window: { location: { search: '?screen=2' } }, $: jq.$, document: {}, localStorage: {}, loadingData: () => { jq.state.drawn++; } };
  vm.runInNewContext(kjs + '\nthis.k = k;', ctx);
  return ctx.k;
}

test('单屏页面：k.useFixed 切到固定方案并选中指定方案后重画', () => {
  const jq = fakeJq();
  runKjs(jq).useFixed('12');
  assert.deepStrictEqual([jq.state.tjfa, jq.state.value, jq.state.disabled, jq.state.drawn], [true, '12', false, 1]);
});

test('单屏页面：k.useFixed 已是同一个固定方案时不重复画；方案不存在时保持原选择', () => {
  const jq = fakeJq();
  jq.state.tjfa = true;
  const k = runKjs(jq);
  k.useFixed('1');
  assert.strictEqual(jq.state.drawn, 0);
  k.useFixed('404');
  assert.deepStrictEqual([jq.state.value, jq.state.drawn], ['1', 0]);
});
