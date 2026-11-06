// 工单「K线与基本走势图开奖号码不一致」：走势图与 K 线同源取数（client/trend-sync.js）、本地走势页取数桥
// （client/trend-ext/trend-bridge.js）、本地 3D 走势页新开奖自动刷新
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('../client/trend-sync.js');
const ds = require('../client/ds-sources.js');

const CLIENT = path.join(__dirname, '..', 'client');
const API = 'https://lottery.jh8.ai/api';
const SRV = (key) => `${API}/ds/${key}/draw-result`;
const tick = () => new Promise((r) => setImmediate(r));

// K 线的选源（client/kline/js/k_sync.js send）在 vm 里跑一遍，记下它会请求什么
function klineRequest(src) {
  const calls = [];
  const ctx = {
    k_util: {
      request: (p, body) => calls.push({ method: 'POST', path: p, body }),
      requestA: (url) => calls.push({ method: 'GET', url }),
    },
    document: { getElementById: () => null, createElement: () => ({ appendChild() {}, querySelector() { return {}; } }), body: { appendChild() {} } },
  };
  vm.createContext(ctx);
  new vm.Script(fs.readFileSync(path.join(CLIENT, 'kline', 'js', 'k_sync.js'), 'utf8') + '\nthis.kSync = kSync;').runInContext(ctx);
  ctx.kSync.fetchLatest(src, () => {}, () => {});
  return calls[0];
}

test('pick 与 K 线 k_sync.js 的选源规则一致：尾数 → mantissaTopRows，数据源 → GET 该地址，否则 topRows', () => {
  const cases = [
    { code: '6001', rows: 30, requestUrl: SRV('qqtj') },
    { code: '202', rows: 100 },
    { code: '202', rows: 100, requestUrl: 'null' },
    { code: '6001', rows: 5, mantissa: '3', requestUrl: SRV('qkltj') },
    { code: '6001', rows: 5, mantissa: 'undefined', requestUrl: 'undefined' },
  ];
  for (const c of cases) {
    const k = klineRequest(c);
    const t = ts.pick(Object.assign({ api: API }, c));
    assert.strictEqual(t.method, k.method, JSON.stringify(c));
    if (k.method === 'GET') {
      assert.strictEqual(t.url, k.url);
    } else {
      assert.strictEqual(t.url, API + k.path);
      assert.deepStrictEqual(t.body, { code: k.body.code, rows: k.body.rows, ...(k.body.mantissa ? { mantissa: k.body.mantissa } : {}) });
    }
  }
});

test('headersFor 只给自家接口带 token，第三方数据源地址不带', () => {
  const own = ts.pick({ api: API, code: '202', rows: 1 });
  assert.deepStrictEqual(ts.headersFor(own, API, 'T1'), { 'Content-Type': 'application/json', token: 'T1' });
  assert.deepStrictEqual(ts.headersFor(ts.pick({ api: API, code: '6001', rows: 1, requestUrl: SRV('qqtj') }), API, 'T1'), { token: 'T1' });
  assert.deepStrictEqual(ts.headersFor(ts.pick({ api: API, code: '6001', rows: 1, requestUrl: 'https://api.qkltj.com/api/draw-result' }), API, 'T1'), {});
  assert.deepStrictEqual(ts.headersFor(ts.pick({ api: API, code: '6001', rows: 1, requestUrl: API + '.evil.com/x' }), API, 'T1'), {});
});

test('check：剔除无效行、同一期号只留第一条、按期号从新到旧排，并逐条说明问题', () => {
  const ok = [{ expect: '2026295', opennumber: '7,4,1' }, { expect: '2026294', opennumber: '2,6,1' }];
  assert.deepStrictEqual(ts.check(ok), { rows: ok, problems: [] });
  const r = ts.check([
    { expect: '2026294', opennumber: '2,6,1' },
    { expect: '2026295', opennumber: '7,4,1' },
    { expect: '2026295', opennumber: '9,9,9' },
    { expect: '', opennumber: '1,1,1' },
    { expect: '2026293', opennumber: '1,x,5' },
    null,
  ]);
  assert.deepStrictEqual(r.rows.map((x) => x.expect + ':' + x.opennumber), ['2026295:7,4,1', '2026294:2,6,1']);
  assert.strictEqual(r.problems.length, 5);
  assert.ok(r.problems.some((p) => p.includes('期号重复：2026295')));
  assert.ok(r.problems.some((p) => p.includes('顺序错乱')));
  // 期号位数不同按数值比较（9 < 10），不按字符串
  assert.deepStrictEqual(ts.check([{ expect: '9', opennumber: '1' }, { expect: '10', opennumber: '2' }]).rows.map((x) => x.expect), ['10', '9']);
});

function fakeFetch(replies) {
  const calls = [];
  const f = (url, init) => {
    calls.push({ url, init });
    const r = replies.shift();
    return r instanceof Error ? Promise.reject(r) : Promise.resolve({ json: () => Promise.resolve(r) });
  };
  return { f, calls };
}
function logger() {
  const info = [];
  const warn = [];
  return { info: (m) => info.push(m), warn: (m) => warn.push(m), lines: { info, warn } };
}

test('load：按所选数据源取数，全球统计字段归一化成 expect/opennumber，并记取数日志', async () => {
  const { f, calls } = fakeFetch([{ code: 0, data: [{ issue: '202611060773', drawResult: '8,5,9,6,6', drawTime: 't' }] }]);
  const log = logger();
  const s = ts.create({ fetch: f, log, token: 'T1', normalize: ds.normalizeDraws });
  const rows = await s.load({ api: API, code: '6001', rows: 1, requestUrl: SRV('qqtj') });
  assert.strictEqual(calls[0].url, SRV('qqtj') + '?code=6001&rows=1');
  assert.strictEqual(calls[0].init.method, 'GET');
  assert.strictEqual(calls[0].init.headers.token, 'T1');
  assert.strictEqual(rows[0].expect, '202611060773');
  assert.strictEqual(rows[0].opennumber, '8,5,9,6,6');
  assert.ok(log.lines.info[0].startsWith('[trend-data] ' + SRV('qqtj') + '|6001 rows=1 最新 202611060773 8,5,9,6,6'));
});

test('load：同一来源同一期号码前后不一致时记「号码不一致」日志；不同来源互不比对', async () => {
  const { f } = fakeFetch([
    { code: 0, data: [{ expect: '773', opennumber: '6,4,4,6,0' }, { expect: '772', opennumber: '8,9,6,2,7' }] },
    { code: 0, data: [{ expect: '773', opennumber: '8,5,9,6,6' }] },
    { code: 0, data: [{ expect: '773', opennumber: '1,1,1,1,1' }] },
  ]);
  const log = logger();
  const s = ts.create({ fetch: f, log });
  await s.load({ api: API, code: '6001', rows: 2, requestUrl: SRV('qkltj') });
  await s.load({ api: API, code: '6001', rows: 1, requestUrl: SRV('qkltj') });
  assert.deepStrictEqual(log.lines.warn, ['[trend-data] 号码不一致 ' + SRV('qkltj') + '|6001：773：6,4,4,6,0 → 8,5,9,6,6']);
  await s.load({ api: API, code: '6001', rows: 1, requestUrl: SRV('qqtj') });
  assert.strictEqual(log.lines.warn.length, 1);
});

test('load：校验出问题时记日志并返回清理后的列表；接口报错 / 网络失败时 reject', async () => {
  const { f } = fakeFetch([
    { code: 0, data: [{ expect: '2', opennumber: '1,2' }, { expect: '2', opennumber: '3,4' }] },
    { code: 10020, msg: '未登录' },
    new Error('offline'),
    { code: 0, data: 'x' },
  ]);
  const log = logger();
  const s = ts.create({ fetch: f, log });
  const rows = await s.load({ api: API, code: '202', rows: 2 });
  assert.strictEqual(rows.length, 1);
  assert.ok(log.lines.warn[0].startsWith('[trend-data] 校验 topRows|202：期号重复：2'));
  await assert.rejects(s.load({ api: API, code: '202', rows: 2 }), /code=10020/);
  await assert.rejects(s.load({ api: API, code: '202', rows: 2 }), /offline/);
  await assert.rejects(s.load({ api: API, code: '202', rows: 2 }), /code=0/);
});

// ---- 本地走势页取数桥 ----
function bridge({ parentSync, obj }) {
  const ctx = {
    window: {},
    sessionStorage: { getItem: (k) => (k === 'obj' && obj ? JSON.stringify(obj) : null) },
    console: { warn() {} },
  };
  ctx.window.parent = parentSync ? { trendSync: parentSync } : ctx.window;
  vm.createContext(ctx);
  new vm.Script(fs.readFileSync(path.join(CLIENT, 'trend-ext', 'trend-bridge.js'), 'utf8')).runInContext(ctx);
  return ctx.trendSyncRequest;
}

test('trend-bridge：开奖列表请求交给 parent.trendSync（带 apiURL 与所选数据源），其他接口和独立打开时走原逻辑', async () => {
  const calls = [];
  const sync = { load: (src) => { calls.push(src); return Promise.resolve([{ expect: '1', opennumber: '1,2,3' }]); } };
  const req = bridge({ parentSync: sync, obj: { api: API, ds: SRV('qqtj') } });
  const got = [];
  assert.strictEqual(req('/lotteryNumber/topRows', { code: '6001', rows: 50 }, (r) => got.push(r)), true);
  assert.strictEqual(req('/lotteryNumber/mantissaTopRows', { code: '6001', rows: 1, mantissa: '3' }, () => {}), true);
  await tick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [
    { api: API, code: '6001', rows: 50, requestUrl: SRV('qqtj') },
    { api: API, code: '6001', rows: 1, mantissa: '3', requestUrl: SRV('qqtj') },
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(got)), [{ code: 0, data: [{ expect: '1', opennumber: '1,2,3' }] }]);
  assert.strictEqual(req('/codeTrend/sscList', { code: '6001' }, () => {}), false);
  assert.strictEqual(bridge({ parentSync: null, obj: { api: API } })('/lotteryNumber/topRows', {}, () => {}), false);
  assert.strictEqual(bridge({ parentSync: sync, obj: {} })('/lotteryNumber/topRows', {}, () => {}), false);
});

test('trend-bridge：取数失败或空列表时不回调', async () => {
  const got = [];
  for (const sync of [{ load: () => Promise.reject(new Error('x')) }, { load: () => Promise.resolve([]) }]) {
    bridge({ parentSync: sync, obj: { api: API } })('/lotteryNumber/topRows', { code: '1', rows: 1 }, (r) => got.push(r));
  }
  await tick();
  assert.strictEqual(got.length, 0);
});

test('本地走势页副本：先加载取数桥，request 先交给桥；页面认得 api / ds 参数', () => {
  for (const d of ['table', 'table1105']) {
    const html = fs.readFileSync(path.join(CLIENT, 'trend-ext', d, 'trend.html'), 'utf8');
    const b = html.indexOf('src="../trend-bridge.js"');
    assert.ok(b > 0 && b < html.indexOf("src='js/common.js"), d);
    assert.ok(html.includes('key == "api" || key == "ds"'), d);
    const common = fs.readFileSync(path.join(CLIENT, 'trend-ext', d, 'js', 'common.js'), 'utf8');
    assert.ok(/request: function\([^)]*\) \{\r?\n\t+if \(trendSyncRequest\(/.test(common), d);
    assert.ok(fs.existsSync(path.join(CLIENT, 'trend-ext', d, 'pic', 'icon.png')), d);
    assert.ok(fs.existsSync(path.join(CLIENT, 'trend-ext', d, 'js', 'theme', 'default', 'layer.css')), d);
    // 副本里的脚本必须完整（下载中断会留下半截文件，页面直接空白）
    for (const f of fs.readdirSync(path.join(CLIENT, 'trend-ext', d, 'js')).filter((x) => x.endsWith('.js'))) {
      new vm.Script(fs.readFileSync(path.join(CLIENT, 'trend-ext', d, 'js', f), 'utf8'), { filename: f });
    }
  }
});

test('index.html 在业务脚本之前加载 trend-sync.js', () => {
  const html = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');
  const i = html.indexOf('<script src=app://./trend-sync.js></script>');
  assert.ok(i > 0 && i < html.indexOf('app://./js/app.9ba1133b.js></script>'));
});

// ---- 本地 3D 等走势页（client/trend）：新开奖自动刷新 ----
function trendPage({ obj, cookies, topRows }) {
  const ctx = { obj, parent: { topRows }, window: {}, document: { addEventListener() {} }, $: () => ({ attr() {}, show() {}, hide() {}, parent() { return this; }, scrollTop() {}, scrollLeft() {} }) };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(CLIENT, 'trend', 'js', 'common.js'), 'utf8');
  new vm.Script(src + '\nthis.common = common;').runInContext(ctx);
  ctx.common.cookieGet = (k) => cookies[k] || null;
  const reloads = [];
  ctx.common.receiveWindows = (n) => reloads.push(n);
  return { common: ctx.common, reloads };
}

test('本地走势页每 10 秒查最新一期：期号或号码变了按当前期数重取，没变不动；代码走势不查', () => {
  let reply = [{ expect: '2026295', opennumber: '7,4,1' }];
  const asked = [];
  const topRows = (p, cb) => { asked.push(p); cb(reply); };
  const page = trendPage({ obj: { from_Id: '901', code: '202' }, cookies: {}, topRows });
  page.common.pollLatest();
  assert.strictEqual(asked.length, 0, '首次整表还没回来时不查');
  page.common.lastDraw = '2026295|7,4,1';
  page.common.lastNum = 50;
  page.common.pollLatest();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(asked)), [{ rows: 1, code: '202' }]);
  assert.deepStrictEqual(page.reloads, []);
  reply = [{ expect: '2026296', opennumber: '1,2,3' }];
  page.common.pollLatest();
  assert.deepStrictEqual(page.reloads, [50]);
  const dm = trendPage({ obj: { from_Id: '901', code: '202', dm: 'dm1' }, cookies: {}, topRows });
  dm.common.lastDraw = 'x';
  dm.common.pollLatest();
  const codeId = trendPage({ obj: { from_Id: '901', code: '202' }, cookies: { code_id: 'dm2' }, topRows });
  codeId.common.lastDraw = 'x';
  codeId.common.pollLatest();
  assert.strictEqual(asked.length, 2);
});

test('本地走势页：整表回来时记下第一行，receiveWindows 记下用户选的期数', () => {
  const src = fs.readFileSync(path.join(CLIENT, 'trend', 'js', 'common.js'), 'utf8');
  assert.ok(src.includes('common.lastDraw = result && result[0] ? result[0].expect + "|" + result[0].opennumber : null;'));
  assert.ok(src.includes('this.lastNum = num;'));
  const html = fs.readFileSync(path.join(CLIENT, 'trend', 'trend.html'), 'utf8');
  assert.ok(/common\.server\(\);\r?\n\t+window\.setInterval\(function\(\) \{\r?\n\t+common\.pollLatest\(\);\r?\n\t+\}, 10000\);/.test(html));
});
