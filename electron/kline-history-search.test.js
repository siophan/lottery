// K线页「后退 / 前进」与方案搜索（第 011 章 3、6、7）：
//   - 后退 / 前进在本屏看过的方案之间切换，不改已保存的分组和方案；没有可后退 / 前进的方案时按钮置灰
//   - 在分组 / 方案区域搜索方案名称，选中后本屏加载该方案
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { ROOT, load, start } = require('./kline-page-harness');
const KDIR = path.join(ROOT, 'kline');
const read = (p) => fs.readFileSync(path.join(KDIR, p), 'utf8');

// ---------------- 单屏页面（k_2.html）里的假 DOM ----------------
function fakeEl(id, extra = {}) {
  const node = Object.assign({
    id, innerHTML: '', value: '', textContent: '', className: '', title: '', checked: false, disabled: false,
    style: {}, children: [], options: [], onclick: null,
    appendChild(c) { node.children.push(c); return c; },
    contains(x) { return x === node || node.children.includes(x); },
  }, extra);
  Object.defineProperty(node, 'innerHTML', {
    get() { return node._html || ''; },
    set(v) { node._html = v; if (v === '') node.children = []; },
  });
  return node;
}

// 一个屏：自定义方案（分组 / 方案下拉）+ 固定方案下拉；parent 记录 pickPlan，loadingData 按页面里的钩子调 kHistory.record
function page({ collection = { 组A: ['方案1', '方案2'], 组B: ['方案3'] }, fixed = ['512', '513'], screen = '3' } = {}) {
  const els = {
    zdyfa: fakeEl('zdyfa'), tjfa: fakeEl('tjfa', { checked: true }),
    zdyfa3: fakeEl('zdyfa3'), zdyfa4: fakeEl('zdyfa4'),
    tjfa3: fakeEl('tjfa3', { value: fixed[0], options: fixed.map((value) => ({ value })) }),
    houtui: fakeEl('houtui'), qianjin: fakeEl('qianjin'),
    faSearchBox: fakeEl('faSearchBox'), faSearch: fakeEl('faSearch'), faSearchList: fakeEl('faSearchList'),
  };
  // 搜索框容器包着输入框和结果列表
  els.faSearchBox.contains = (x) => [els.faSearchBox, els.faSearch, els.faSearchList].includes(x) || els.faSearchList.children.includes(x);
  const docListeners = [];
  const document = {
    getElementById: (id) => els[id] || null,
    createElement: (tag) => fakeEl('', { tagName: tag.toUpperCase() }),
    addEventListener: (type, f) => docListeners.push([type, f]),
  };
  const draws = [];
  const msgs = [];
  const k = {
    linked: false,
    planMode: () => (els.zdyfa.checked || els.tjfa.checked && k.linked ? '1' : '2'),
    useCustom: () => { els.zdyfa.checked = true; els.tjfa.checked = false; ctx.loadingData(); },
  };
  const parentWin = {
    collection,
    picks: [],
    pickPlan(group, plan, screen) {
      parentWin.picks.push([group, plan, screen]);
      if (!Array.isArray(parentWin.collection[group]) || parentWin.collection[group].indexOf(plan) == -1) return false;
      els.zdyfa3.innerHTML = group;
      els.zdyfa4.innerHTML = plan;
      k.useCustom();
      return true;
    },
    searchPlans: (kw) => [].concat(...Object.keys(parentWin.collection).map((g) => parentWin.collection[g]
      .filter((p) => p.includes(kw) || g.includes(kw)).map((p) => ({ group: g, plan: p })))),
    refreshed: 0,
    refreshPlans() { parentWin.refreshed++; },
  };
  const ctx = {
    document, k, parent: parentWin, String, Array, Object,
    kScreenNo: () => screen,
    layer: { msg: (m) => msgs.push(m) },
    loadingData() { draws.push(snapshot()); ctx.kHistory.record(); },
  };
  function snapshot() {
    return k.planMode() == '1' ? `${els.zdyfa3.innerHTML}/${els.zdyfa4.innerHTML}` : `固定${els.tjfa3.value}`;
  }
  vm.runInNewContext(read('js/k_history.js'), ctx);
  vm.runInNewContext(read('js/k_search.js'), ctx);
  // 用户操作：选自定义方案 / 选固定方案
  const chooseCustom = (g, p) => { els.zdyfa.checked = true; els.tjfa.checked = false; els.zdyfa3.innerHTML = g; els.zdyfa4.innerHTML = p; ctx.loadingData(); };
  const chooseFixed = (id) => { els.zdyfa.checked = false; els.tjfa.checked = true; k.linked = false; els.tjfa3.value = id; ctx.loadingData(); };
  const buttons = () => [els.houtui.disabled, els.qianjin.disabled];
  return { ctx, els, k, parentWin, draws, msgs, docListeners, chooseCustom, chooseFixed, buttons, h: ctx.kHistory, s: ctx.kSearch };
}

test('刚打开（还没看过方案）时后退、前进都置灰', () => {
  const t = page();
  assert.deepStrictEqual(t.buttons(), [true, true]);
  t.chooseFixed('512');
  assert.deepStrictEqual(t.buttons(), [true, true], '只看过一个方案时也不能后退');
});

test('后退 / 前进在看过的方案之间切换（自定义方案、固定方案都算），到头时按钮置灰', () => {
  const t = page();
  t.chooseFixed('512');
  t.chooseCustom('组A', '方案1');
  t.chooseCustom('组B', '方案3');
  assert.deepStrictEqual(t.buttons(), [false, true]);
  t.h.back();
  assert.strictEqual(t.draws.at(-1), '组A/方案1');
  assert.deepStrictEqual(t.buttons(), [false, false]);
  t.h.back();
  assert.strictEqual(t.draws.at(-1), '固定512');
  assert.ok(t.els.tjfa.checked && !t.els.zdyfa.checked && t.k.linked === false);
  assert.deepStrictEqual(t.buttons(), [true, false]);
  t.h.back();                                            // 置灰时点了也不动
  assert.strictEqual(t.draws.length, 5);
  t.h.forward();
  t.h.forward();
  assert.strictEqual(t.draws.at(-1), '组B/方案3');
  assert.deepStrictEqual(t.buttons(), [false, true]);
  assert.deepStrictEqual(t.parentWin.picks.map((p) => p.join('/')), ['组A/方案1/3', '组A/方案1/3', '组B/方案3/3'], '切回自定义方案时带上本屏屏号');
});

test('同一方案重画（开奖刷新、切指标）不重复记录', () => {
  const t = page();
  t.chooseCustom('组A', '方案1');
  t.ctx.loadingData();
  t.ctx.loadingData();
  t.chooseCustom('组A', '方案2');
  t.h.back();
  assert.strictEqual(t.draws.at(-1), '组A/方案1');
  assert.deepStrictEqual(t.buttons(), [true, false]);
});

test('后退后再选别的方案，丢掉原来前进方向的记录', () => {
  const t = page();
  t.chooseCustom('组A', '方案1');
  t.chooseCustom('组A', '方案2');
  t.chooseCustom('组B', '方案3');
  t.h.back();
  t.h.back();
  t.chooseFixed('513');
  assert.deepStrictEqual(t.buttons(), [false, true]);
  t.h.back();
  assert.strictEqual(t.draws.at(-1), '组A/方案1');
});

test('方案被删除后后退 / 前进跳过它；不会删掉已保存的分组', () => {
  const t = page();
  t.chooseCustom('组A', '方案1');
  t.chooseCustom('组A', '方案2');
  t.chooseCustom('组B', '方案3');
  t.parentWin.collection.组A = ['方案1'];                 // 别的屏删了方案2
  t.h.back();
  assert.strictEqual(t.draws.at(-1), '组A/方案1');
  assert.deepStrictEqual(t.buttons(), [true, false]);
  t.h.forward();
  assert.strictEqual(t.draws.at(-1), '组B/方案3');
  assert.deepStrictEqual(Object.keys(t.parentWin.collection), ['组A', '组B']);
  t.parentWin.collection = {};
  t.h.back();                                            // 全删光了：停在原地
  assert.strictEqual(t.draws.at(-1), '组B/方案3');
  assert.deepStrictEqual(t.buttons(), [true, true]);
});

test('固定方案下拉里已没有的方案也跳过', () => {
  const t = page();
  t.chooseFixed('999');
  t.els.tjfa3.value = '512';
  t.chooseCustom('组A', '方案1');
  t.h.back();
  assert.strictEqual(t.draws.at(-1), '组A/方案1');
  assert.deepStrictEqual(t.buttons(), [true, true]);
});

test('没选中方案（空分组）时不记录', () => {
  const t = page();
  t.chooseCustom('组A', '');
  t.chooseCustom('组A', '方案1');
  assert.deepStrictEqual(t.buttons(), [true, true]);
});

test('最多记 50 个方案', () => {
  const t = page({ collection: { 组: Array.from({ length: 60 }, (_, i) => 'p' + i) } });
  for (let i = 0; i < 60; i++) t.chooseCustom('组', 'p' + i);
  for (let i = 0; i < 60; i++) t.h.back();
  assert.strictEqual(t.draws.at(-1), '组/p10');
});

// ---------------- 搜索 ----------------
const items = (t) => t.els.faSearchList.children.map((li) => li.textContent);

test('输入关键字列出名称匹配的方案（分组 / 方案），清空关键字时收起', () => {
  const t = page();
  t.els.faSearch.value = '方案';
  t.els.faSearch.oninput();
  assert.deepStrictEqual(items(t), ['组A / 方案1', '组A / 方案2', '组B / 方案3']);
  assert.notStrictEqual(t.els.faSearchList.style.display, 'none');
  t.els.faSearch.value = '3';
  t.els.faSearch.oninput();
  assert.deepStrictEqual(items(t), ['组B / 方案3']);
  t.els.faSearch.value = '  ';
  t.els.faSearch.oninput();
  assert.deepStrictEqual(items(t), []);
  assert.strictEqual(t.els.faSearchList.style.display, 'none');
});

test('没有匹配时提示，提示项不可点', () => {
  const t = page();
  t.els.faSearch.value = '不存在';
  t.els.faSearch.oninput();
  assert.deepStrictEqual(items(t), ['没有找到方案']);
  assert.strictEqual(t.els.faSearchList.children[0].onclick, null);
});

test('点结果：本屏加载该方案，清空搜索框并收起；会记入后退记录', () => {
  const t = page();
  t.chooseFixed('512');
  t.els.faSearch.value = '方案2';
  t.els.faSearch.oninput();
  t.els.faSearchList.children[0].onclick();
  assert.deepStrictEqual(t.parentWin.picks, [['组A', '方案2', '3']]);
  assert.strictEqual(t.draws.at(-1), '组A/方案2');
  assert.strictEqual(t.els.faSearch.value, '');
  assert.strictEqual(t.els.faSearchList.style.display, 'none');
  assert.deepStrictEqual(t.buttons(), [false, true]);
});

test('回车选第一个结果，Esc 收起；结果项按文字显示（不当 HTML 解析）', () => {
  const t = page({ collection: { '<b>组</b>': ['<img src=x>'] } });
  t.els.faSearch.value = '<';
  t.els.faSearch.oninput();
  assert.deepStrictEqual(items(t), ['<b>组</b> / <img src=x>']);
  assert.strictEqual(t.els.faSearchList._html || '', '', '不能拼 innerHTML');
  t.els.faSearch.onkeydown({ key: 'Escape' });
  assert.strictEqual(t.els.faSearchList.style.display, 'none');
  t.els.faSearch.oninput();
  t.els.faSearch.onkeydown({ key: 'Enter', preventDefault() {} });
  assert.deepStrictEqual(t.parentWin.picks, [['<b>组</b>', '<img src=x>', '3']]);
});

test('选中时方案已被删：提示，不切换', () => {
  const t = page();
  t.els.faSearch.value = '方案3';
  t.els.faSearch.oninput();
  t.parentWin.collection.组B = [];
  t.els.faSearchList.children[0].onclick();
  assert.deepStrictEqual(t.msgs, ['该方案已不存在']);
  assert.strictEqual(t.draws.length, 0);
});

test('点进搜索框时先刷新方案列表（窗口打开后可能又保存了方案）；点搜索框外收起', () => {
  const t = page();
  t.els.faSearch.onfocus();
  assert.strictEqual(t.parentWin.refreshed, 1);
  t.els.faSearch.value = '方案';
  t.els.faSearch.oninput();
  const [[type, onDocClick]] = t.docListeners;
  assert.strictEqual(type, 'click');
  onDocClick({ target: t.els.faSearch });
  assert.notStrictEqual(t.els.faSearchList.style.display, 'none');
  onDocClick({ target: {} });
  assert.strictEqual(t.els.faSearchList.style.display, 'none');
});

test('单独打开（不在六屏里）时隐藏搜索框', () => {
  const t = page({ screen: '' });
  assert.strictEqual(t.els.faSearchBox.style.display, 'none');
  assert.strictEqual(t.els.faSearch.oninput, undefined);
});

// ---------------- 父页面（kLine.vue） ----------------
const CONFIG = { 分组A: ['方案B', '方案C'], 老组: ['旧方案', 'abc方案'] };

test('父页面 searchPlans：按方案名或分组名匹配（不分大小写），空关键字不列', () => {
  const t = load();
  start(t);
  t.emit('initGroup_1', { result: true, context: JSON.stringify(CONFIG) });
  const s = (kw) => Array.from(t.self.searchPlans(kw), (r) => `${r.group}/${r.plan}`);
  assert.deepStrictEqual(s('方案c'), ['分组A/方案C']);
  assert.deepStrictEqual(s('ABC'), ['老组/abc方案']);
  assert.deepStrictEqual(s('老组'), ['老组/旧方案', '老组/abc方案']);
  assert.deepStrictEqual(s(' '), []);
});

test('父页面 pickPlan：本屏选中该分组 / 方案并按自定义方案重画；方案不存在时返回 false', () => {
  const t = load();
  start(t);
  t.emit('initGroup_1', { result: true, context: JSON.stringify(CONFIG) });
  t.calls.length = 0;
  assert.strictEqual(t.self.pickPlan('老组', '旧方案', '4'), true);
  const els = t.frames[4].els;
  assert.deepStrictEqual([els.zdyfa3.innerHTML, els.zdyfa4.innerHTML], ['老组', '旧方案']);
  assert.deepStrictEqual(t.calls, [['useCustom', 4]]);
  assert.strictEqual(t.self.pickPlan('老组', '没有', '4'), false);
  assert.strictEqual(t.self.pickPlan('没有', '旧方案', '4'), false);
  assert.strictEqual(t.calls.length, 1);
});

test('父页面 refreshPlans：重读分组列表，只更新方案列表、不改各屏选择；读取失败沿用原列表', () => {
  const t = load();
  start(t);
  t.emit('initGroup_1', { result: true, context: JSON.stringify(CONFIG) });
  t.calls.length = 0;
  t.self.refreshPlans();
  const req = t.sent.filter(([c, a]) => c === 'loadtempdata' && a.file === 'config').at(-1)[1];
  assert.strictEqual(req.func, 'klinePlans');
  t.emit('klinePlans', { result: true, context: JSON.stringify(Object.assign({ 新组: ['新方案'] }, CONFIG)) });
  assert.deepStrictEqual(Array.from(t.self.searchPlans('新'), (r) => r.plan), ['新方案']);
  assert.deepStrictEqual(t.calls, []);
  t.emit('klinePlans', { result: false });
  t.emit('klinePlans', { result: true, context: '{坏' });
  assert.deepStrictEqual(Array.from(t.self.searchPlans('新'), (r) => r.plan), ['新方案']);
});

test('父页面把 pickPlan / searchPlans / refreshPlans 挂到 window 供各屏调用', () => {
  const t = load();
  t.comp.mounted.call(Object.assign(t.self, { $nextTick() {}, $on() {} }));
  for (const name of ['pickPlan', 'searchPlans', 'refreshPlans']) assert.strictEqual(typeof t.winObj[name], 'function', name);
});

// ---------------- 页面接线 ----------------
test('k_2.html：后退 / 前进按钮走 kHistory，加载 k_history.js / k_search.js，有搜索框', () => {
  const html = read('k2/k_2.html');
  assert.match(html, /id="houtui"[^>]*onclick="kHistory\.back\(\)"/);
  assert.match(html, /id="qianjin"[^\n]*onclick="kHistory\.forward\(\)"/);   // value 里有 ">"
  for (const f of ['../js/k_history.js', '../js/k_search.js']) {
    const i = html.indexOf(f);
    assert.ok(i > html.indexOf('k.js"') && i < html.indexOf('k_2main.js'), f);
  }
  assert.match(html, /id="faSearchBox"[\s\S]*id="faSearch"[\s\S]*id="faSearchList"/);
});

test('每次画图记下当前方案；原来按期数翻页的后退 / 前进去掉了', () => {
  const main = read('k2/k_2main.js');
  const start = main.indexOf('function loadingData(');
  const body = main.slice(start, main.indexOf('\nfunction onBack(', start));
  assert.ok(body.includes('kHistory.record();'));
  assert.ok(!/Kxtqianjin/.test(main), 'k_2main 不再读翻页偏移');
  const kjs = read('k2/k.js');
  assert.ok(!/function goTo\(|function goBack\(|Kxtqianjin/.test(kjs));
});

test('按钮置灰样式；搜索结果列表盖在图表上方', () => {
  const css = read('css/k.css');
  assert.match(css, /\.buttonK:disabled\s*\{[^}]*cursor:\s*default/);
  assert.match(css, /\.fa-search ul\s*\{[^}]*position:\s*absolute/);
});

test('设置参数里去掉了已不起作用的「前进后退步长」', () => {
  const szcs = read('k2/szcs.html');
  assert.ok(!/前进后退步长|id="fyzb"|backIndex/.test(szcs));
  for (const id of ['sjfw', 'bc', 'xs', 'jszq']) assert.ok(szcs.includes(`id="${id}"`), id);   // 其他参数还在
  assert.ok(!/backIndex/.test(read('k2/k_2main.js')));
});
