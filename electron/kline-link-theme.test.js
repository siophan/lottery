// K线独立页顶部「关联」屏位下拉框与背景主题（第 011 章：原「固定」改「关联」，默认关联 1 号屏，可切 2–6 号屏；
// 主题提供深夜黑 / 深海蓝 / 暖灰琥珀三套，只换背景、网格线和辅助文字颜色）
const test = require('node:test');
const assert = require('node:assert');

const { load, start, nodes, texts, QUERY } = require('./kline-page-harness');

const render = (t) => nodes(t.comp.render.call(t.self));
const selectOf = (t, label) => render(t).find((n) => n.tag === 'select' && n.data.attrs && n.data.attrs['aria-label'] === label);
const optionsOf = (sel) => Array.from(sel.children, (o) => [o.data.domProps.value, texts(o).join('')]);
const stageOf = (t) => render(t).find((n) => n.data && n.data.ref === 'stage');

// ---------------- 关联屏位 ----------------

test('顶部有「关联」和 1–6 号屏下拉框，默认 1 号屏', () => {
  const t = load();
  start(t);
  assert.ok(render(t).some((n) => texts(n).join('') === '关联' && n.tag === 'span'), '没有「关联」文字');
  const sel = selectOf(t, '关联屏位');
  assert.ok(sel, '没有屏位下拉框');
  assert.deepStrictEqual(optionsOf(sel), [['1', '1号屏'], ['2', '2号屏'], ['3', '3号屏'], ['4', '4号屏'], ['5', '5号屏'], ['6', '6号屏']]);
  assert.strictEqual(sel.data.domProps.value, '1');
});

test('主副屏下切换屏位：该屏换成上部大屏', () => {
  const t = load();
  start(t);
  selectOf(t, '关联屏位').data.on.change({ target: { value: '4' } });
  assert.strictEqual(t.self.bigScreen, 4);
  assert.strictEqual(selectOf(t, '关联屏位').data.domProps.value, '4');
  assert.ok(t.calls.some(([c]) => c === 'resize'), '切换后要通知各屏重新排版');
});

test('同屏下切换屏位：放大该屏', () => {
  const t = load();
  start(t);
  t.self.setLayout('grid');
  t.self.linkScreen('6');
  assert.deepStrictEqual([t.self.layout, t.self.zoomed, t.self.bigScreen], ['grid', 6, 6]);
});

test('点小屏 / 放大某屏后，下拉框跟着显示当前查看的屏', () => {
  const t = load();
  start(t);
  t.self.coverClick(3);
  assert.strictEqual(selectOf(t, '关联屏位').data.domProps.value, '3');
  t.self.setLayout('grid');
  t.self.coverClick(5);
  assert.strictEqual(selectOf(t, '关联屏位').data.domProps.value, '5');
});

test('屏位值不对时按 1 号屏', () => {
  const t = load();
  start(t);
  t.self.linkScreen('9');
  assert.strictEqual(t.self.bigScreen, 1);
});

// ---------------- 各屏的「关联」单选：回到该屏保存的方案 ----------------

const CONFIG = { 老组: ['旧方案'], 分组A: ['方案B', '方案C'] };

test('打开时各屏默认「关联」：有保存方案的屏选中最近保存的方案并按关联画图', () => {
  const t = load();
  start(t, { screens: { 3: [{ group: '老组', plan: '旧方案' }, { group: '分组A', plan: '方案C' }] } });
  t.emit('initGroup_3', { result: true, context: JSON.stringify(CONFIG) });
  assert.deepStrictEqual([t.frames[3].els.zdyfa3.innerHTML, t.frames[3].els.zdyfa4.innerHTML], ['分组A', '方案C']);
  assert.deepStrictEqual(t.calls.filter(([c]) => /^use/.test(c)), [['useLinked', 3, true]]);
});

test('点各屏的「关联」：重新加载分组后选中该屏最近保存的方案', () => {
  const t = load();
  start(t, { screens: { 2: [{ group: '分组A', plan: '方案C' }] } });
  t.emit('initGroup_2', { result: true, context: JSON.stringify(CONFIG) });
  // 用户改成自定义、选了别的方案
  t.frames[2].els.zdyfa3.innerHTML = '老组';
  t.frames[2].els.zdyfa4.innerHTML = '旧方案';
  t.calls.length = 0;
  t.sent.length = 0;
  t.self.linkPlan('2');
  assert.deepStrictEqual(t.sent.map(([c, a]) => [c, a.func]), [['loadtempdata', 'initGroup_2']]);
  t.emit('initGroup_2', { result: true, context: JSON.stringify(CONFIG) });
  assert.deepStrictEqual([t.frames[2].els.zdyfa3.innerHTML, t.frames[2].els.zdyfa4.innerHTML], ['分组A', '方案C']);
  assert.deepStrictEqual(t.calls.filter(([c]) => /^use/.test(c)), [['useLinked', 2, true]]);
});

test('点「关联」时该屏没有保存方案（或已被删）：保留当前分组显示，按兜底方案画图', () => {
  const t = load();
  start(t, { screens: { 5: [{ group: '分组A', plan: '已删' }] } });
  t.emit('initGroup_5', { result: true, context: JSON.stringify(CONFIG) });
  t.calls.length = 0;
  t.self.linkPlan(5);
  t.emit('initGroup_5', { result: true, context: JSON.stringify(CONFIG) });
  assert.deepStrictEqual(t.calls.filter(([c]) => /^use/.test(c)), [['useLinked', 5, false]]);
  // 之后普通的分组刷新（如别的屏删方案）不再触发关联
  t.emit('initGroup_5', { result: true, context: JSON.stringify(CONFIG) });
  assert.strictEqual(t.calls.filter(([c]) => /^use/.test(c)).length, 1);
});

test('复制窗口：关联中的屏记成关联，副本里按保存记录重新关联', () => {
  const t = load();
  start(t);
  const els = t.frames[1].els;
  els.zdyfa = { checked: false };
  els.tjfa3 = { value: '9' };
  t.frames[1].contentWindow.k.linked = true;
  t.self.copyWindow();
  const state = JSON.parse(t.resolved[0].query.state);
  assert.strictEqual(state.screens['1'].linked, true);

  const copy = load({ query: Object.assign({}, QUERY, { topid: 'c1', state: JSON.stringify({ layout: 'main', bigScreen: 1, screens: { 1: { custom: false, linked: true, group: '', plan: '', fixed: '9' } } }) }) });
  start(copy, { screens: { 1: [{ group: '分组A', plan: '方案B' }] } });
  copy.emit('initGroup_1', { result: true, context: JSON.stringify(CONFIG) });
  assert.deepStrictEqual(copy.calls.filter(([c]) => /^use/.test(c)), [['useLinked', 1, true]]);
});

// ---------------- 背景主题 ----------------

test('顶部有主题下拉框：深夜黑 / 深海蓝 / 暖灰琥珀，首次进入默认深夜黑', () => {
  const t = load();
  start(t);
  const sel = selectOf(t, '背景主题');
  assert.ok(sel, '没有主题下拉框');
  assert.deepStrictEqual(optionsOf(sel), [['night', '深夜黑'], ['ocean', '深海蓝'], ['amber', '暖灰琥珀']]);
  assert.strictEqual(sel.data.domProps.value, 'night');
  assert.ok(render(t).some((n) => texts(n).join('') === '主题' && n.tag === 'span'), '没有「主题」文字');
});

test('切换主题：记住选择，6 个屏即时换色，屏位和布局不变', () => {
  const t = load();
  start(t);
  t.self.coverClick(4);
  const before = stageOf(t).data.style.background;
  selectOf(t, '背景主题').data.on.change({ target: { value: 'ocean' } });
  assert.strictEqual(t.self.theme, 'ocean');
  assert.strictEqual(t.store.kline_theme, 'ocean');
  assert.deepStrictEqual(t.calls.filter(([c]) => c === 'applyTheme'), [1, 2, 3, 4, 5, 6].map((n) => ['applyTheme', n, 'ocean']));
  assert.notStrictEqual(stageOf(t).data.style.background, before, '屏与屏之间的底色也要跟着换');
  assert.deepStrictEqual([t.self.layout, t.self.bigScreen], ['main', 4]);
  assert.strictEqual(t.calls.filter(([c]) => c === 'loadingData').length, 0, '换主题不重新取数');
});

test('主题值不对时用深夜黑；下次打开沿用上次的主题', () => {
  const t = load();
  start(t);
  t.self.setTheme('pink');
  assert.strictEqual(t.self.theme, 'night');
  const again = load({ stored: { kline_theme: 'amber' } });
  start(again);
  assert.strictEqual(again.self.theme, 'amber');
  const bad = load({ stored: { kline_theme: '乱码' } });
  start(bad);
  assert.strictEqual(bad.self.theme, 'night');
});

test('各屏页面加载时向父页面取当前主题', () => {
  const t = load({ stored: { kline_theme: 'amber' } });
  t.comp.mounted.call(t.self);
  start(t);
  assert.strictEqual(t.winObj.klineTheme(), 'amber');
  t.self.setTheme('ocean');
  assert.strictEqual(t.winObj.klineTheme(), 'ocean');
});

test('复制窗口带上主题，副本按源窗口的主题打开', () => {
  const t = load();
  start(t);
  t.self.setTheme('amber');
  t.self.copyWindow();
  const state = JSON.parse(t.resolved[0].query.state);
  assert.strictEqual(state.theme, 'amber');
  const copy = load({ query: Object.assign({}, QUERY, { topid: 'c1', state: JSON.stringify(state) }), stored: { kline_theme: 'ocean' } });
  start(copy);
  assert.strictEqual(copy.self.theme, 'amber');
});

// ---------------- 单屏页面（iframe）侧 ----------------

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./kline-page-harness');
const K2 = path.join(ROOT, 'kline', 'k2');

// 极简 jQuery 替身：两个单选（自定义 zdyfa / 关联 tjfa）、固定方案下拉 tjfa3、body
function fakePage() {
  const st = { zdyfa: false, tjfa: true, fixed: '9', disabled: false, body: {}, drawn: 0, tongping: 'shown' };
  const $ = (sel) => {
    if (typeof sel === 'function') return {};
    if (sel === '#zdyfa' || sel === '#tjfa') {
      const key = sel.slice(1);
      return { prop: (k, v) => {
        if (v === undefined) return st[key];
        st[key] = v;
        st[key === 'zdyfa' ? 'tjfa' : 'zdyfa'] = !v;
      } };
    }
    if (sel === "input[name='fa']:eq(1)") return { prop: (k, v) => { st.tjfa = v; st.zdyfa = !v; } };
    if (sel === "input[name='fa']:checked") return { val: () => (st.zdyfa ? '1' : st.tjfa ? '2' : undefined) };
    if (sel === '#tjfa3') return { val: (v) => (v === undefined ? st.fixed : (st.fixed = v)), attr: (k, v) => { st.disabled = v; } };
    if (sel === '#tjfa3 option') return { filter: () => ({ length: 1 }) };
    if (sel === '#tongping') return { show: () => { st.tongping = 'shown'; }, hide: () => { st.tongping = 'hidden'; } };
    if (sel === 'body') return { css: (k, v) => { st.body[k] = v; } };
    return {};
  };
  return { $, st };
}

function runPage({ screen = '2', parent, chart } = {}) {
  const page = fakePage();
  const kjs = fs.readFileSync(path.join(K2, 'k.js'), 'utf8');
  const ctx = {
    window: { location: { search: screen ? '?code=1&screen=' + screen : '?code=1' } },
    $: page.$, document: {}, localStorage: {},
    loadingData: () => { page.st.drawn++; },
    myChart: chart,
  };
  ctx.parent = parent || ctx.window;
  vm.runInNewContext(kjs + '\nthis.k = k;', ctx);
  return { k: ctx.k, st: page.st, ctx };
}

test('单屏页面：「关联」且已关联到保存方案时按自定义方案画，否则按固定方案画', () => {
  const p = runPage();
  assert.strictEqual(p.k.planMode(), '2');
  p.k.linked = true;
  assert.strictEqual(p.k.planMode(), '1');
  p.st.zdyfa = true;
  p.st.tjfa = false;
  p.k.linked = false;
  assert.strictEqual(p.k.planMode(), '1');
});

test('单屏页面：k.useLinked 选中「关联」、记下是否关联到保存方案并重画', () => {
  const p = runPage();
  p.st.zdyfa = true;
  p.st.tjfa = false;
  p.k.useLinked(true);
  assert.deepStrictEqual([p.st.tjfa, p.st.zdyfa, p.k.linked, p.st.drawn], [true, false, true, 1]);
  assert.strictEqual(p.k.planMode(), '1');
  p.k.useLinked(false);
  assert.deepStrictEqual([p.k.linked, p.k.planMode(), p.st.drawn], [false, '2', 2]);
});

test('单屏页面：k.useFixed 恢复固定方案时不再按关联画', () => {
  const p = runPage();
  p.k.linked = true;
  p.k.useFixed('12');
  assert.deepStrictEqual([p.k.linked, p.k.planMode()], [false, '2']);
});

test('单屏页面：六屏里点「关联」交给父页面按本屏保存记录选方案，自己不直接画', () => {
  const linked = [];
  const p = runPage({ screen: '4', parent: { linkPlan: (n) => linked.push(n) } });
  p.k.checkfa(2, 1);
  assert.deepStrictEqual(linked, ['4']);
  assert.strictEqual(p.st.drawn, 0);
  assert.strictEqual(p.st.tjfa, true);
});

test('单屏页面：单独打开时点「关联」照旧直接重画', () => {
  const p = runPage({ screen: '' });
  p.k.checkfa(2, 1);
  assert.strictEqual(p.st.drawn, 1);
});

function fakeChart(option) {
  const merged = [];
  return { merged, getOption: () => option, setOption: (o) => merged.push(JSON.parse(JSON.stringify(o))) };
}

test('单屏页面：三套主题都是深色底，红蓝柱、布林线、MACD、KDJ 用的颜色不在主题里', () => {
  const { k } = runPage();
  assert.deepStrictEqual(Object.keys(k.themes), ['night', 'ocean', 'amber']);
  for (const name of Object.keys(k.themes)) {
    const p = k.themes[name];
    for (const key of ['bg', 'panel', 'text', 'sub', 'line']) assert.match(p[key], /^#[0-9a-f]{6}$/i, name + '.' + key);
    // 背景亮度要低，白 / 黄 / 品红线和红、青柱才清楚
    const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
    assert.ok(lum(p.bg) < 0.2 && lum(p.panel) < 0.25, name + ' 背景太亮');
    assert.ok(lum(p.text) > 0.75, name + ' 文字太暗');
  }
});

test('单屏页面：k.themeChart 只改背景、文字、坐标轴颜色', () => {
  const { k } = runPage();
  const option = {
    backgroundColor: '#000', textStyle: { color: '#fff' }, title: { text: 't', textStyle: { color: '#fff', fontSize: 15 } },
    xAxis: [{ axisLabel: { show: true } }, { axisLabel: { show: false } }], yAxis: [{ axisLabel: { show: false } }],
    series: [{ itemStyle: { normal: { color: 'red', color0: '#47e1e9' } } }, { itemStyle: { normal: { color: '#FFFF00' } } }],
  };
  k.applyTheme('ocean');
  const p = k.themes.ocean;
  k.themeChart(option);
  assert.strictEqual(option.backgroundColor, p.bg);
  assert.strictEqual(option.textStyle.color, p.text);
  assert.deepStrictEqual([option.title.textStyle.color, option.title.textStyle.fontSize, option.title.text], [p.text, 15, 't']);
  assert.deepStrictEqual([option.xAxis[0].axisLabel.color, option.xAxis[0].axisLabel.show, option.xAxis[1].axisLine.lineStyle.color], [p.sub, true, p.line]);
  assert.strictEqual(option.yAxis[0].axisLabel.color, p.sub);
  assert.deepStrictEqual(option.series[0].itemStyle.normal, { color: 'red', color0: '#47e1e9' });
  assert.deepStrictEqual(option.series[1].itemStyle.normal, { color: '#FFFF00' });
});

test('单屏页面：k.applyTheme 换页面底色并即时重涂当前图表（不重新取数）；未知主题按深夜黑', () => {
  const chart = fakeChart({ xAxis: [{}, {}], yAxis: [{}] });
  const p = runPage({ chart });
  p.k.applyTheme('amber');
  const amber = p.k.themes.amber;
  assert.strictEqual(p.st.body['background-color'], amber.panel);
  assert.strictEqual(chart.merged.length, 1);
  assert.strictEqual(chart.merged[0].backgroundColor, amber.bg);
  assert.strictEqual(chart.merged[0].xAxis.length, 2);
  assert.strictEqual(chart.merged[0].yAxis[0].axisLabel.color, amber.sub);
  assert.strictEqual(p.st.drawn, 0);
  p.k.applyTheme('乱码');
  assert.strictEqual(p.k.themeName, 'night');
});

test('单屏页面：图表还没画时换主题只换页面底色', () => {
  const p = runPage({ chart: { getOption: () => undefined, setOption: () => { throw new Error('不该调用'); } } });
  p.k.applyTheme('ocean');
  assert.strictEqual(p.st.body['background-color'], p.k.themes.ocean.panel);
});

test('单屏页面：加载时按父页面当前主题，单独打开时用深夜黑', () => {
  const p = runPage({ parent: { klineTheme: () => 'ocean' } });
  assert.strictEqual(p.k.startTheme(), 'ocean');
  assert.strictEqual(runPage({ screen: '' }).k.startTheme(), 'night');
  const broken = runPage({ parent: { get klineTheme() { throw new Error('跨域'); } } });
  assert.strictEqual(broken.k.startTheme(), 'night');
});

test('单屏页面：k_line 生成的图表配置按当前主题上色', () => {
  const { k, ctx } = runPage();
  k.applyTheme('amber');
  const src = fs.readFileSync(path.join(ROOT, 'kline', 'js', 'k_line.js'), 'utf8');
  Object.assign(ctx, { localStorage: { getItem: () => null }, ktitle: '组三', macdList: [], difList: [], deaList: [], kList: [], dList: [], jList: [], zgValue: [], sgValue: [], xgValue: [] });
  const option = vm.runInNewContext(src + '\nk_line({ times: [], datas: [] }, [], [], "0%", "no")', ctx);
  assert.strictEqual(option.backgroundColor, k.themes.amber.bg);
  assert.strictEqual(option.title.textStyle.color, k.themes.amber.text);
});

test('单屏页面：「固定」改名「关联」，推荐方案下拉框隐藏；画图 / 比对 / 提交都按 k.planMode 判断方案', () => {
  const html = fs.readFileSync(path.join(K2, 'k_2.html'), 'utf8');
  const main = fs.readFileSync(path.join(K2, 'k_2main.js'), 'utf8');
  const util = fs.readFileSync(path.join(ROOT, 'kline', 'js', 'k_Util.js'), 'utf8');
  assert.ok(main.includes('$("#tjding").html("关联");'));
  assert.ok(!main.includes('$("#tjding").html("固定")'));
  assert.ok(/id="tjding">关联<\/span>/.test(html));
  assert.ok(/<select id="tjfa3"\s+style="display: none;/.test(html), '推荐方案下拉框要隐藏');
  const body = (name) => { const i = main.indexOf('function ' + name + '('); return main.slice(i, main.indexOf('\n}', i)); };
  for (const name of ['loadingData', 'onBack', 'tj']) {
    assert.ok(body(name).includes('k.planMode()'), name);
    assert.ok(!/name=.fa.\]:checked/.test(body(name)), name + ' 还在直接读单选');
  }
  const i = util.indexOf('getyesAndno');
  assert.ok(util.slice(i, i + 300).includes('var fa = k.planMode();'));
});
