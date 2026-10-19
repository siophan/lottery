// 开奖号码更新后 K 线即时刷新（工单「K线渲染延迟约10秒」）：
//   - 单屏（k_2.html）：新一期只标它自己的命中，拼到已有数据最前面，在内存里重算指标、原图上更新，不重新取数；
//     结果必须和整屏重新取数画出来的一模一样；接不上（跳期、换方案、还没画完）时整屏重载
//   - 隐藏的 MACD / KDJ 不计算，切换显示时用已有数据重画
//   - K线窗口（kLine.vue）：一条推送连接；新一期先画正在看的屏，其余逐帧画；被盖住的屏露出来再画；
//     工作台轮询兜底时只让一个屏取最新几期再分给各屏，不再六屏各自重拉全量
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { ROOT, load, start } = require('./kline-page-harness');
const KDIR = path.join(ROOT, 'kline');
const read = (p) => fs.readFileSync(path.join(KDIR, p), 'utf8');

// ---------------- 单屏页面 ----------------

const PLAN_ID = '9';
const PLAN = ['01,02,03', '04,05,06', '07,08,09', '02,05,08', '03,06,09'];

// 130 期（新的在前），号码按固定规则生成，保证有中有不中
function draws(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = 2000 + n - i;
    const nums = [0, 1, 2, 3, 4].map((j) => String(((e * (j + 3) + j * 7) % 11) + 1).padStart(2, '0'));
    out.push({ expect: String(e), opennumber: nums.join(','), openTime: '2026-10-20 10:00', lottoId: '201' });
  }
  return out;
}

function screen({ macd = '', kdj = '' } = {}) {
  const store = { userName: 'Z1', klink_info: JSON.stringify({ dataRange: 120, step: 20, coefficient: 2, macd: 0, cycle: 9 }) };
  store[PLAN_ID] = JSON.stringify(PLAN);
  store.Z1_macdK = macd;
  store.Z1_kdjK = kdj;
  const el = { value: PLAN_ID, innerHTML: '', innerText: '', disabled: false };
  const jq = (sel) => ({
    val: () => (sel === '#tjfa3' ? PLAN_ID : '1105r3'),
    text: () => '',
    find: () => ({ text: () => '方案9' }),
    is: () => true,
    ready() {},
    click() {},
    html() {}, show() {}, hide() {}, append() {}, remove() {},
  });
  jq.each = (arr, f) => arr.forEach((x, i) => f(i, x));
  jq.extend = (t, ...src) => Object.assign(t, ...src);
  const chart = { options: [], clears: 0, setOption(o) { this.options.push(JSON.parse(JSON.stringify(o))); }, clear() { this.clears++; } };
  const ctx = {
    window: { location: { href: 'k_2.html?code=201&cat=11x5&playId=1105r3&screen=1', search: '?code=201&cat=11x5&playId=1105r3&screen=1' } },
    document: { URL: 'k_2.html?code=201', getElementById: () => el },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    $: jq, JSON, Math, Array, Object, String, Number, parseInt, parseFloat, isNaN, console,
    setTimeout: () => 0, clearTimeout() {},
    k: { planMode: () => '2', themeChart: (o) => o, getName: () => '' },
    getsunzs: () => 165,
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  for (const f of ['js/k_submit.js', 'js/k_line.js', 'js/k_Util.js', 'k2/k_2main.js']) vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext('window.onBack = onBack; main_id = "201"; requestUrl = false;', ctx);
  ctx.myChart = chart;
  ctx.reloads = 0;
  vm.runInContext('loadingData = function() { reloads++; };', ctx);
  // 整屏加载：与 loadingData 取数成功后的步骤相同（新一次画图序号 → 重置 → 读参数 → 标命中 → 画图）
  const full = (rows) => vm.runInContext(`(function(rows){
    kSubmit.loading(); resetCalc(); wfType = "1105r3"; faName = "";
    var s = calcSettings(); sjfw = s.dataRange; bcfw = s.step; xs = s.coefficient; macdZb = s.macd; kdjZq = s.cycle;
    k_util.getyesAndno(rows, "11x5", "1105r3", "${PLAN_ID}", onBack);
  })`, ctx)(JSON.parse(JSON.stringify(rows)));
  return { ctx, chart, full, store, apply: (m) => ctx.kFeed.apply(JSON.parse(JSON.stringify(m))) };
}

test('新一期增量追加的结果与整屏重新取数完全一致（命中标记、指标、图表配置）', () => {
  const all = draws(130);
  const s = screen();
  s.full(all.slice(1, 121));
  assert.strictEqual(s.apply({ rows: [all[0]], prev: all[1].expect }), 'append');
  const appended = s.chart.options[s.chart.options.length - 1];
  const ref = screen();
  ref.full(all.slice(0, 120));
  const expected = ref.chart.options[ref.chart.options.length - 1];
  assert.deepStrictEqual(appended, expected);
  assert.strictEqual(s.chart.clears, 0);          // 原图上更新，不清空
  assert.strictEqual(s.ctx.reloads, 0);           // 不重新取数
  // 连续再来两期也一样
  const s2 = screen();
  s2.full(all.slice(3, 123));
  assert.strictEqual(s2.apply({ rows: [all[2]], prev: all[3].expect }), 'append');
  assert.strictEqual(s2.apply({ rows: [all[0], all[1]], prev: all[2].expect }), 'append');
  assert.deepStrictEqual(s2.chart.options[s2.chart.options.length - 1], expected);
});

test('工作台轮询兜底送来的最新几期：只追加本屏没有的', () => {
  const all = draws(130);
  const s = screen();
  s.full(all.slice(2, 122));
  assert.strictEqual(s.apply({ rows: all.slice(0, 5) }), 'append');
  const ref = screen();
  ref.full(all.slice(0, 120));
  assert.deepStrictEqual(s.chart.options.pop(), ref.chart.options.pop());
  assert.strictEqual(s.apply({ rows: all.slice(0, 5) }), 'noop');     // 再来一次：已有
  assert.strictEqual(s.apply({ rows: [all[0]], prev: all[1].expect }), 'noop');
});

test('接不上时整屏重载：跳了期、换了方案还没画完、还没画过', () => {
  const all = draws(130);
  const s = screen();
  assert.strictEqual(s.apply({ rows: [all[0]], prev: all[1].expect }), 'reload');   // 还没画过
  s.full(all.slice(5, 125));
  assert.strictEqual(s.apply({ rows: [all[0]], prev: all[1].expect }), 'reload');   // 中间漏了 4 期
  assert.strictEqual(s.apply({ rows: all.slice(0, 3) }), 'reload');
  s.full(all.slice(1, 121));
  s.ctx.kSubmit.loading();                                                     // 又开始画别的方案
  assert.strictEqual(s.apply({ rows: [all[0]], prev: all[1].expect }), 'reload');
  assert.strictEqual(s.ctx.reloads, 4);
  assert.strictEqual(s.apply({ rows: [] }), 'noop');
  assert.strictEqual(s.apply(null), 'noop');
});

test('隐藏的 MACD / KDJ 不计算；切换显示时用已有数据清空重画，不重新取数', () => {
  const all = draws(130);
  const s = screen({ macd: '1', kdj: '1' });
  s.full(all.slice(0, 120));
  assert.deepStrictEqual([s.ctx.difList.length, s.ctx.kList.length], [0, 0]);
  s.store.Z1_macdK = '';
  assert.strictEqual(s.ctx.kFeed.redraw(), true);
  assert.deepStrictEqual([s.ctx.difList.length, s.ctx.kList.length], [120, 0]);
  assert.strictEqual(s.chart.clears, 1);
  assert.strictEqual(s.ctx.reloads, 0);
  const ref = screen({ macd: '', kdj: '1' });
  ref.full(all.slice(0, 120));
  assert.deepStrictEqual(s.chart.options.pop(), ref.chart.options.pop());
  assert.strictEqual(screen().ctx.kFeed.redraw(), false);   // 还没画过：调用方照旧整屏加载
});

test('兜底取最新几期走本屏的数据来源，不显示同步失败', () => {
  const s = screen();
  const calls = [];
  s.ctx.kSync = { fetchLatest: (src, done, failed) => calls.push(src) };
  s.ctx.kFeed.fetchLatest(() => {}, () => {});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [{ code: '201', rows: 5, mantissa: false, requestUrl: false }]);
});

// ---------------- K线窗口（六屏） ----------------

function withFeeds(t) {
  const applied = [];
  for (let n = 1; n <= 6; n++) {
    t.frames[n].contentWindow.kFeed = {
      apply: (m) => applied.push([n, m.rows.map((r) => r.expect)]),
      fetchLatest: (done, failed) => t.latest.push({ n, done, failed }),
    };
  }
  t.latest = [];
  return applied;
}

function fakeDrawFeed() {
  const subs = [];
  return {
    subs,
    streamUrl: (api, o) => api + '/draws/stream?code=' + o.code + (o.mantissa ? '&mantissa=' + o.mantissa : ''),
    subscribe: (opts) => { const s = { opts, closed: false, close() { s.closed = true; } }; subs.push(s); return s; },
  };
}

test('K线窗口打开时订阅本彩种的开奖推送，推送到达后分给各屏', () => {
  const df = fakeDrawFeed();
  const t = load({ drawFeed: df });
  start(t);
  assert.strictEqual(df.subs.length, 1);
  assert.strictEqual(df.subs[0].opts.url, 'https://api.test/api/draws/stream?code=201');
  t.store.token = 'tok1';
  assert.strictEqual(df.subs[0].opts.token(), 'tok1');
  const applied = withFeeds(t);
  df.subs[0].opts.onDraws({ rows: [{ expect: '9' }], prev: '8' });
  assert.deepStrictEqual(applied, [[1, ['9']]]);         // 先画大屏，其余每屏让一帧
  while (t.timers.length) t.timers.shift()();
  assert.deepStrictEqual(applied.map(([n]) => n), [1, 2, 3, 4, 5, 6]);
  assert.strictEqual(t.calls.filter(([c]) => c === 'loadingData').length, 0);
});

test('正在看的屏最先画；同屏放大时被盖住的屏先不画，还原后再补', () => {
  const df = fakeDrawFeed();
  const t = load({ drawFeed: df });
  start(t);
  const applied = withFeeds(t);
  t.self.setLayout('grid');
  t.self.coverClick(4);                                   // 放大 4 号屏
  df.subs[0].opts.onDraws({ rows: [{ expect: '9' }], prev: '8' });
  while (t.timers.length) t.timers.shift()();
  assert.deepStrictEqual(applied.map(([n]) => n), [4]);
  df.subs[0].opts.onDraws({ rows: [{ expect: '10' }], prev: '9' });
  t.self.labelClick(4);                                   // 还原同屏：其余各屏按顺序补上两期
  assert.deepStrictEqual(applied, [[4, ['9']], [4, ['10']],
    [1, ['9']], [1, ['10']], [2, ['9']], [2, ['10']], [3, ['9']], [3, ['10']],
    [5, ['9']], [5, ['10']], [6, ['9']], [6, ['10']]]);
});

test('推送断线重连后补一次最新几期；首次连上不补', () => {
  const df = fakeDrawFeed();
  const t = load({ drawFeed: df });
  start(t);
  const applied = withFeeds(t);
  df.subs[0].opts.onReady();
  assert.strictEqual(t.latest.length, 0);
  df.subs[0].opts.onReady();
  assert.strictEqual(t.latest.length, 1);
  t.latest[0].done([{ expect: '9' }, { expect: '8' }]);
  while (t.timers.length) t.timers.shift()();
  assert.strictEqual(applied.length, 6);
});

test('工作台轮询兜底：只有一个屏取最新几期再分给六屏；取不到时六屏各自整屏重载', () => {
  const t = load();
  start(t);
  const applied = withFeeds(t);
  t.emit('lodDate', {});
  assert.deepStrictEqual(t.latest.map((x) => x.n), [1]);
  t.latest[0].done([{ expect: '9' }]);
  while (t.timers.length) t.timers.shift()();
  assert.deepStrictEqual(applied.map(([n]) => n), [1, 2, 3, 4, 5, 6]);
  assert.strictEqual(t.calls.filter(([c]) => c === 'loadingData').length, 0);
  t.emit('lodDate', {});
  t.latest[1].failed();
  assert.strictEqual(t.calls.filter(([c]) => c === 'loadingData').length, 6);
});

test('第三方数据源地址没有推送，不建连接', () => {
  const df = fakeDrawFeed();
  df.streamUrl = () => null;
  const t = load({ drawFeed: df });
  start(t);
  assert.strictEqual(df.subs.length, 0);
});

test('别的屏改了指标参数：本屏下一期整屏重载；别的屏切换了 MACD / KDJ：追加时清空重画', () => {
  const all = draws(130);
  const s = screen();
  s.full(all.slice(2, 122));
  s.store.klink_info = JSON.stringify({ dataRange: 240, step: 20, coefficient: 2, macd: 0, cycle: 9 });
  assert.strictEqual(s.apply({ rows: [all[1]], prev: all[2].expect }), 'reload');

  const t = screen();
  t.full(all.slice(1, 121));
  t.store.Z1_kdjK = '1';
  assert.strictEqual(t.apply({ rows: [all[0]], prev: all[1].expect }), 'append');
  assert.strictEqual(t.chart.clears, 1);
  const ref = screen({ kdj: '1' });
  ref.full(all.slice(0, 120));
  assert.deepStrictEqual(t.chart.options.pop(), ref.chart.options.pop());
});

test('被盖住的屏攒了好几期：露出来时整屏重载一次，不逐期重画', () => {
  const df = fakeDrawFeed();
  const t = load({ drawFeed: df });
  start(t);
  const applied = withFeeds(t);
  t.self.setLayout('grid');
  t.self.coverClick(4);
  for (let e = 1; e <= 5; e++) df.subs[0].opts.onDraws({ rows: [{ expect: String(e) }], prev: String(e - 1) });
  while (t.timers.length) t.timers.shift()();
  t.self.labelClick(4);
  assert.strictEqual(applied.filter(([n]) => n !== 4).length, 0);
  assert.deepStrictEqual(t.calls.filter(([c]) => c === 'loadingData').map(([, n]) => n), [1, 2, 3, 5, 6]);
});
