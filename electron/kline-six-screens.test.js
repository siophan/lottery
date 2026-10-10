// K线独立页六屏（需求回复第 1–3 条 / 第 011 章第 4 节）：
//   - 默认「主副屏」：上部大屏（默认 1 号）+ 下部 5 个小屏；点小屏换成大屏
//   - 「同屏」：3 列 × 2 行等大，上排 1、3、5，下排 2、4、6；同屏下点某屏放大，再点屏号栏还原
//   - 每屏一个 k_2.html?…&screen=N 实例，回调父页面带屏号，IPC 回调名带屏号按屏分发
//   - 打开时读 kline_screens.json，各屏自动加载该屏最近保存的方案（最后一项）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { ROOT, load, start } = require('./kline-page-harness');

const rect = (b) => [b.x, b.y, b.w, b.h].map((v) => Math.round(v));

test('打开时读取本彩种的屏位记录', () => {
  const t = load();
  t.comp.created.call(t.self);
  const req = t.sent.find(([c, a]) => c === 'loadtempdata' && a.file === 'kline_screens');
  assert.ok(req);
  assert.deepStrictEqual([req[1].topid, req[1].id, req[1].user, req[1].func], ['1105r5_kline', '1105r5', 'Z0000001', 'klineScreens']);
});

test('固定方案列表与屏位记录都就绪后才给 6 个屏设置地址，地址带屏号', () => {
  const t = load();
  t.comp.created.call(t.self);
  assert.strictEqual(t.self.url, '');                       // 屏位记录还没回来
  t.emit('klineScreens', { result: false });
  assert.ok(t.self.url.startsWith('/kline/k2/k_2.html?code=201&cat=11x5&playId=1105r5'));
  const tree = t.comp.render.call(t.self);
  const nodes = (n) => (!n || n.text !== undefined ? [] : [n, ...(n.children || []).flatMap(nodes)]);
  const frames = nodes(tree).filter((n) => n.tag === 'iframe');
  assert.deepStrictEqual(frames.map((f) => f.data.attrs.id), ['iframeId1', 'iframeId2', 'iframeId3', 'iframeId4', 'iframeId5', 'iframeId6']);
  assert.deepStrictEqual(frames.map((f) => f.data.attrs.src.split('&screen=')[1]), ['1', '2', '3', '4', '5', '6']);
});

test('主副屏：默认 1 号大屏在上，2–6 号小屏按顺序排在下面', () => {
  const t = load();
  start(t);
  const b = (n) => t.self.boxOf(n);
  assert.strictEqual(t.self.layout, 'main');
  const big = b(1);
  assert.deepStrictEqual([Math.round(big.x), Math.round(big.y), Math.round(big.w)], [0, 0, 1200]);
  const smalls = [2, 3, 4, 5, 6].map(b);
  smalls.forEach((s) => assert.ok(s.y > big.y + big.h - 1 && s.visible));
  assert.deepStrictEqual(smalls.map((s) => s.x), [...smalls.map((s) => s.x)].sort((x, y) => x - y));
  assert.ok(Math.abs(smalls[4].x + smalls[4].w - 1200) < 1);
  assert.ok(big.h > smalls[0].h * 2);
});

test('主副屏：点小屏换成大屏，其余按屏号顺序排到下面', () => {
  const t = load();
  start(t);
  t.self.coverClick(4);
  assert.strictEqual(t.self.bigScreen, 4);
  const big = t.self.boxOf(4);
  assert.deepStrictEqual([Math.round(big.x), Math.round(big.y), Math.round(big.w)], [0, 0, 1200]);
  const order = [1, 2, 3, 5, 6].map((n) => [n, t.self.boxOf(n).x]).sort((a, b) => a[1] - b[1]).map(([n]) => n);
  assert.deepStrictEqual(order, [1, 2, 3, 5, 6]);
});

test('同屏：3 列 × 2 行等大，上排 1、3、5，下排 2、4、6', () => {
  const t = load();
  start(t);
  t.self.setLayout('grid');
  const boxes = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [n, t.self.boxOf(n)]));
  const top = [1, 3, 5], bottom = [2, 4, 6];
  top.forEach((n) => assert.strictEqual(Math.round(boxes[n].y), 0));
  bottom.forEach((n) => assert.ok(boxes[n].y > boxes[1].y + boxes[1].h - 1));
  for (const row of [top, bottom]) {
    const xs = row.map((n) => boxes[n].x);
    assert.deepStrictEqual(xs, [...xs].sort((a, b) => a - b));
  }
  const sizes = new Set(Object.values(boxes).map((b) => Math.round(b.w) + 'x' + Math.round(b.h)));
  assert.strictEqual(sizes.size, 1);
});

test('同屏下点某屏放大为整页，点屏号栏还原，布局与各屏实例不变', () => {
  const t = load();
  start(t);
  t.self.setLayout('grid');
  t.self.coverClick(3);
  assert.strictEqual(t.self.zoomed, 3);
  assert.deepStrictEqual(rect(t.self.boxOf(3)), [0, 0, 1200, 732]);
  [1, 2, 4, 5, 6].forEach((n) => assert.strictEqual(t.self.boxOf(n).visible, false));
  t.self.labelClick(3);
  assert.strictEqual(t.self.zoomed, null);
  assert.strictEqual(t.self.layout, 'grid');
  assert.ok([1, 2, 3, 4, 5, 6].every((n) => t.self.boxOf(n).visible));
});

test('切回主副屏时清掉放大状态；屏号栏在各布局都显示', () => {
  const t = load();
  start(t);
  t.self.setLayout('grid');
  t.self.coverClick(5);
  t.self.setLayout('main');
  assert.strictEqual(t.self.zoomed, null);
  const tree = t.comp.render.call(t.self);
  const texts = (n) => (!n ? [] : n.text !== undefined ? [n.text] : (n.children || []).flatMap(texts));
  const all = texts(tree).join('|');
  for (let n = 1; n <= 6; n++) assert.ok(all.includes(n + '号屏'), n + '号屏');
});

test('iframe 内「同屏」按钮切换页面布局', () => {
  const t = load();
  start(t);
  t.self.toggleTongPing();
  assert.strictEqual(t.self.layout, 'grid');
  t.self.toggleTongPing();
  assert.strictEqual(t.self.layout, 'main');
});

test('小屏按比例缩小（内容按参考宽度渲染再缩放），大屏宽度足够时不缩放', () => {
  const t = load();
  start(t);
  const big = t.self.boxOf(1), small = t.self.boxOf(2);
  assert.strictEqual(big.scale, 1);
  assert.ok(small.scale < 0.5 && small.scale > 0);
  assert.ok(Math.abs(small.frameW * small.scale - small.w) < 1);
});

test('回调按屏号分发：IPC 回调名与读取参数带屏号；缺省屏号按 1 号', () => {
  const t = load();
  start(t);
  t.self.getPlan('分组A', '方案B', [1], '3');
  t.self.loadGroup('2');
  t.self.delPlan('分组A', '方案B', '5');
  t.self.delGroup('分组A', '6');
  t.self.getPlan('g', 'p', [], undefined);
  const pick = (ch) => t.sent.filter(([c]) => c === ch).map(([, a]) => a);
  const loads = pick('loadtempdata').filter((a) => a.file !== 'kline_screens');
  assert.deepStrictEqual(loads.map((a) => [a.func, a.file]), [['loadPlan_3', '分组A/方案B'], ['initGroup_2', 'config'], ['loadPlan_1', 'g/p']]);
  assert.deepStrictEqual(pick('rmkline').map((a) => [a.func, a.type, a.group, a.plan]), [['delResult_5', 'file', '分组A', '方案B'], ['delResult_6', 'dir', '分组A', '']]);
});

test('loadPlan_N 只在第 N 号屏画图', () => {
  const t = load();
  start(t);
  t.self.getPlan('分组A', '方案B', ['d'], '4');
  t.emit('loadPlan_4', { result: true, context: '{"plan":1}' });
  assert.deepStrictEqual(t.calls.filter(([c]) => c === 'draw'), [['draw', 4, { plan: 1 }]]);
});

test('各屏自动加载该屏最近保存的方案（列表最后一项），只在首次加载分组时生效', () => {
  const t = load();
  const config = { 老组: ['旧方案'], 分组A: ['方案B', '方案C'] };
  start(t, { screens: { 3: [{ group: '老组', plan: '旧方案' }, { group: '分组A', plan: '方案C' }] } });
  t.emit('initGroup_3', { result: true, context: JSON.stringify(config) });
  const els = t.frames[3].els;
  assert.strictEqual(els.zdyfa3.innerHTML, '分组A');
  assert.strictEqual(els.zdyfa4.innerHTML, '方案C');
  assert.ok(els.zdyfa2.innerHTML.includes('方案B') && els.zdyfa2.innerHTML.includes('方案C'));
  assert.deepStrictEqual(t.calls.filter(([c]) => c === 'useCustom'), [['useCustom', 3]]);
  // 没有记录的屏照旧：第一个分组、第一个方案，不切自定义
  t.emit('initGroup_2', { result: true, context: JSON.stringify(config) });
  assert.strictEqual(t.frames[2].els.zdyfa3.innerHTML, '老组');
  assert.strictEqual(t.frames[2].els.zdyfa4.innerHTML, '旧方案');
  // 再次加载分组（如删方案后刷新）不再强制切回记录的方案
  t.emit('initGroup_3', { result: true, context: JSON.stringify(config) });
  assert.strictEqual(t.calls.filter(([c]) => c === 'useCustom').length, 1);
});

test('记录的方案已被删除时不自动切换，按默认显示', () => {
  const t = load();
  start(t, { screens: { 1: [{ group: '分组A', plan: '已删' }] } });
  t.emit('initGroup_1', { result: true, context: JSON.stringify({ 分组A: ['方案B'] }) });
  assert.strictEqual(t.frames[1].els.zdyfa4.innerHTML, '方案B');
  assert.deepStrictEqual(t.calls.filter(([c]) => c === 'useCustom'), []);
});

test('屏位记录损坏时按无记录处理，页面照常打开', () => {
  const t = load();
  t.comp.created.call(t.self);
  t.emit('klineScreens', { result: true, context: '{坏' });
  assert.ok(t.self.url);
});

test('删除方案 / 分组后所有屏重新加载分组（分组列表是共享的）', () => {
  const t = load();
  start(t);
  t.sent.length = 0;
  t.emit('delResult_2', { result: true });
  const loads = t.sent.filter(([c, a]) => c === 'loadtempdata').map(([, a]) => a.func);
  assert.deepStrictEqual(loads, ['initGroup_1', 'initGroup_2', 'initGroup_3', 'initGroup_4', 'initGroup_5', 'initGroup_6']);
});

test('开奖刷新（lodDate）让 6 个屏都重画', () => {
  const t = load();
  start(t);
  t.emit('lodDate', {});
  assert.deepStrictEqual(t.calls.filter(([c]) => c === 'loadingData').map(([, n]) => n), [1, 2, 3, 4, 5, 6]);
});

// ---------------- 单屏页面（iframe）侧 ----------------

test('单屏页面：回调父页面时带上本屏屏号', () => {
  const kjs = fs.readFileSync(path.join(ROOT, 'kline', 'k2', 'k.js'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'kline', 'k2', 'k_2main.js'), 'utf8');
  for (const call of ['parent.printPlan($(v).text(), kScreenNo())', 'parent.delPlan(groupName, name, kScreenNo())',
    'parent.delGroup(name, kScreenNo())', 'parent.loadGroup(kScreenNo())']) {
    assert.ok(kjs.includes(call), call);
  }
  assert.ok(main.includes('parent.getPlan(zdyfa3, zdyfa4, res.data, kScreenNo())'));
  assert.ok(!/parent\.getPlan\(zdyfa3, zdyfa4, res\.data\)/.test(main));
});

test('单屏页面：kScreenNo 从地址取屏号，没有时为空', () => {
  const kjs = fs.readFileSync(path.join(ROOT, 'kline', 'k2', 'k.js'), 'utf8');
  const run = (search) => vm.runInNewContext(kjs + '\nkScreenNo()', { window: { location: { search } }, $: () => ({}), document: {}, localStorage: {} });
  assert.strictEqual(run('?code=1&screen=4'), '4');
  assert.strictEqual(run('?code=1'), '');
});

test('单屏页面：六屏模式下「同屏」按钮交给父页面切换布局，且切自定义方案时不隐藏', () => {
  const kjs = fs.readFileSync(path.join(ROOT, 'kline', 'k2', 'k.js'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'kline', 'k2', 'k_2main.js'), 'utf8');
  assert.ok(/function TongPing\(\) \{\n\tif \(kScreenNo\(\) && parent\.toggleTongPing\) \{\n\t\tparent\.toggleTongPing\(\);\n\t\treturn;\n\t\}/.test(main));
  assert.ok(kjs.includes('if (!kScreenNo()) $("#tongping").hide();'));
  assert.ok(kjs.includes('useCustom : function()'));
});
