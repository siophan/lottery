const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { patchChunk, CHUNKS, MARK, patchApp, APP_CHUNK, APP_MARK, CHUNK_LAYERS, APP_LAYERS, RACE_MARK, patchTrend, TREND_CHUNK, TREND_LAYERS, AUTH_MARK } = require('../scripts/patch-ds-client.js');
const dsSources = require('../client/ds-sources.js');

const DIR = path.join(__dirname, '..', 'client', 'js');

// 在 vm 里执行 chunk，截获每个模块交给 eval 的源码（不真正执行页面逻辑）
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

// 把页面模块源码当作 webpack 模块执行，拿到组件选项（methods 可直接 call 到假的 this 上）。
// 未关心的依赖一律给一个「什么都能点、什么都能调」的桩；window 是模块函数的形参，可以注入假的 dsSources
function anyStub() {
  const f = function () { return anyStub(); };
  return new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      return anyStub();
    },
    apply() { return anyStub(); },
    construct() { return anyStub(); },
  });
}
function loadComponent(src, { modules = {}, window = {}, globals = {} } = {}) {
  const fn = new vm.Script('(function(module, __webpack_exports__, __webpack_require__, window){' + src + '\n})')
    .runInNewContext(Object.assign({ console }, globals));
  const exp = {};
  const all = Object.assign({ '2877': { a: (o) => ({ exports: o, options: o }) } }, modules); // componentNormalizer
  const req = Object.assign((id) => (id in all ? all[id] : anyStub()), {
    r() {}, d(e, n, g) { Object.defineProperty(e, n, { get: g, enumerable: true }); },
    n: (m) => { const g = () => m; g.a = m; return g; },
  });
  fn({ exports: exp }, exp, req, Object.assign({ electron: { ipcRenderer: { send() {}, on() {} } } }, window));
  return exp.default;
}
const pageSource = (name) => evalSources(fs.readFileSync(path.join(DIR, name), 'utf8')).find((s) => s.includes('switchCode(index) {'));
const tick = () => new Promise((r) => setImmediate(r));
// vm 里创建的对象/数组原型属于另一个 realm，比较前转成本 realm 的普通 JSON 值
const plain = (x) => JSON.parse(JSON.stringify(x));
const API_URL = 'https://lottery.jh8.ai/api';
const SRV = (key) => `${API_URL}/ds/${key}/draw-result`;

const NEEDLES = [
  'dsLoad(first) {',
  'dsInit() {',
  'this.dsInit();',
  'window.dsSources.optKey(this.options[index]) != window.dsSources.optKey({ value: this.codeId, requestUrl: this.requestUrl })',
  "this.requestUrl = this.options[index].requestUrl;\n        this.num = '';",
  'JSON.stringify(window.dsSources.persistable(this.options))',
  "return [!scope.row.server && scope.row.value != '11001'",
  'window.dsSources.dotColor(item)',
  'clearInterval(this.dsTimer);',
];

for (const name of CHUNKS) {
  const file = path.join(DIR, name);

  test(`${name}: 已打补丁且再次运行不变（幂等）`, () => {
    const raw = fs.readFileSync(file, 'utf8');
    for (const l of CHUNK_LAYERS) {
      if (l.only && !l.only.includes(name)) assert.ok(!raw.includes(l.mark), `不应有补丁层 ${l.mark}`);
      else assert.ok(raw.includes(l.mark), `缺少补丁层 ${l.mark}`);
    }
    assert.strictEqual(patchChunk(raw, name), raw);
  });

  test(`${name}: 全部模块源码语法有效，页面模块含补丁逻辑`, () => {
    const srcs = evalSources(fs.readFileSync(file, 'utf8'));
    assert.ok(srcs.length > 10);
    for (const s of srcs) new vm.Script(s);          // 编码出错会在这里抛 SyntaxError
    const page = srcs.find((s) => s.includes('switchCode(index) {'));
    for (const n of NEEDLES) assert.ok(page.includes(n), `缺少: ${n}`);
    assert.strictEqual(page.split('JSON.stringify(window.dsSources.persistable(this.options))').length - 1, 2);
  });
}

test('锚点不匹配时报错，而不是静默跳过', () => {
  assert.throws(() => patchChunk("eval('switchCode(index) {')", CHUNKS[0]), /命中 0 次/);
  // v1 已打、后续层锚点缺失：同样报错而不是跳过
  assert.throws(() => patchChunk("eval('switchCode(index) {/* ds-patch v1 */')", CHUNKS[0]), /命中 0 次/);
  // race 层锚点缩进按文件名确定，未知 chunk 直接报错
  const preRace = CHUNK_LAYERS.slice(0, CHUNK_LAYERS.findIndex((l) => l.mark === RACE_MARK)).map((l) => l.mark).join('');
  assert.throws(() => patchChunk(`eval('switchCode(index) {${preRace}')`, 'chunk-unknown.js'), /未知 chunk/);
  assert.throws(() => patchChunk(`eval('switchCode(index) {${preRace}')`, CHUNKS[1]), /命中 0 次/);
});

// ---- keep v1：服务端列表拉取失败（null）时保留现有下拉项与选中项 ----
function dsLoadHarness(name, fetchResult) {
  const sent = [];
  const h = { result: fetchResult };
  const comp = loadComponent(pageSource(name), {
    modules: { f121: { apiURL: API_URL } },
    window: {
      dsSources: Object.assign({}, dsSources, { fetchServer: async () => h.result }),
      electron: { ipcRenderer: { send: (...a) => sent.push(a), on() {} } },
    },
    globals: { localStorage: { getItem: () => 'TOK' }, setInterval: () => 0, clearInterval() {} },
  });
  const local = { value: '9', label: '我的源', requestUrl: 'https://x.example/api' };
  const server = dsSources.toOption({ source: 'qqtj', sourceName: '全球统计', code: '6001', name: '哈希分分彩', status: 'ok' }, API_URL);
  const vmThis = {
    options: [server, local], codeId: server.value, codeName: server.label, requestUrl: server.requestUrl, catId: 'hash',
    typeId: 'TYPE', pageId: 'PAGE', num: { expect: '1' }, opened: 0,
    showOpenNum() { this.opened++; },
  };
  return Object.assign(h, { comp, vmThis, server, local, sent });
}
// 关闭子窗口（走势/遗漏/K线）时用的 id：运动会按 pageId，其余按 typeId（与各自 switchCode 一致）
const CHILD_ID = { 'chunk-b7e0f68a.59391aa2.js': 'TYPE', 'chunk-50732e0a.702f76ce.js': 'TYPE', 'chunk-60235acf.b3ce76aa.js': 'PAGE' };
const closes = (sent) => sent.filter((a) => a[0] === 'closeChildWindow').map((a) => plain(a[1]));

for (const name of CHUNKS) {
  test(`${name}: dsLoad 在 fetchServer 失败（null）时保留下拉项与选中项`, async () => {
    for (const first of [true, false]) {
      const { comp, vmThis, server, local } = dsLoadHarness(name, null);
      await comp.methods.dsLoad.call(vmThis, first);
      assert.deepStrictEqual(vmThis.options, [server, local]);
      assert.strictEqual(vmThis.codeId, server.value);
      assert.strictEqual(vmThis.requestUrl, server.requestUrl);
      assert.strictEqual(vmThis.opened, 0);
    }
  });

  test(`${name}: dsLoad 成功拿到空列表时照常合并（去掉旧服务端项）`, async () => {
    const { comp, vmThis, local } = dsLoadHarness(name, []);
    vmThis.codeId = local.value; vmThis.requestUrl = local.requestUrl;
    await comp.methods.dsLoad.call(vmThis, false);
    assert.deepStrictEqual(vmThis.options, [local]);
  });
}

// ---- reselect v1：选中的服务端源被后台停用/删除后，刷新时切到 options[0] ----
const ITEM2 = { source: 'qkltj', sourceName: '区块链统计', code: '6001', name: '哈希分分彩', status: 'ok' };
for (const name of CHUNKS) {
  test(`${name}: dsLoad(false) 发现选中的服务端源已消失 → 切到 options[0] 并刷新开奖`, async () => {
    const { comp, vmThis } = dsLoadHarness(name, [ITEM2]);
    await comp.methods.dsLoad.call(vmThis, false);
    const first = dsSources.toOption(ITEM2, API_URL);
    assert.deepStrictEqual(vmThis.options[0], first);
    assert.strictEqual(vmThis.codeId, first.value);
    assert.strictEqual(vmThis.codeName, first.label);
    assert.strictEqual(vmThis.requestUrl, first.requestUrl);
    assert.strictEqual(vmThis.num, '');
    assert.strictEqual(vmThis.opened, 1);
  });

  test(`${name}: dsLoad(false) 服务端列表清空但有本地源 → 切到本地源；全空 → 保持不动`, async () => {
    let h = dsLoadHarness(name, []);
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    assert.strictEqual(h.vmThis.requestUrl, h.local.requestUrl);
    assert.strictEqual(h.vmThis.opened, 1);
    h = dsLoadHarness(name, []);
    h.vmThis.options = [h.server];
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    assert.deepStrictEqual(h.vmThis.options, []);
    assert.strictEqual(h.vmThis.requestUrl, h.server.requestUrl);
    assert.strictEqual(h.vmThis.opened, 0);
  });

  test(`${name}: dsLoad(false) 选中项仍在 / 选中的是本地源 → 不切换`, async () => {
    let h = dsLoadHarness(name, [{ ...ITEM2 }, { source: 'qqtj', sourceName: '全球统计', code: '6001', name: '哈希分分彩', status: 'error' }]);
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    assert.strictEqual(h.vmThis.requestUrl, h.server.requestUrl);
    assert.strictEqual(h.vmThis.opened, 0);
    h = dsLoadHarness(name, [ITEM2]);
    Object.assign(h.vmThis, { codeId: h.local.value, codeName: h.local.label, requestUrl: h.local.requestUrl });
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    assert.strictEqual(h.vmThis.requestUrl, h.local.requestUrl);
    assert.strictEqual(h.vmThis.opened, 0);
  });
}

// ---- close v1：reselect 切走时关闭绑定旧源的子窗口（首次自动选择不关）----
for (const name of CHUNKS) {
  test(`${name}: reselect 切走时发送 closeChildWindow（id 与 switchCode 一致）`, async () => {
    const h = dsLoadHarness(name, [ITEM2]);
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    assert.strictEqual(h.vmThis.requestUrl, dsSources.toOption(ITEM2, API_URL).requestUrl);
    assert.deepStrictEqual(closes(h.sent), [{ id: CHILD_ID[name] }]);
  });

  test(`${name}: 首次加载自动选择 / 无需切换时不发送 closeChildWindow`, async () => {
    let h = dsLoadHarness(name, [ITEM2]);
    Object.assign(h.vmThis, { options: [], codeId: null, codeName: '', requestUrl: null });
    await h.comp.methods.dsLoad.call(h.vmThis, true);
    assert.strictEqual(h.vmThis.requestUrl, dsSources.toOption(ITEM2, API_URL).requestUrl);
    assert.strictEqual(h.vmThis.opened, 1);
    assert.deepStrictEqual(closes(h.sent), []);
    h = dsLoadHarness(name, [ITEM2, { ...ITEM2, source: 'qqtj', sourceName: '全球统计' }]);
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    assert.strictEqual(h.vmThis.opened, 0);
    assert.deepStrictEqual(closes(h.sent), []);
  });
}

// ---- autopick v1：首次自动选择改由组件标记控制，首次拉取失败后后续成功的刷新仍会补做 ----
function emptyHarness(name, result) {
  const h = dsLoadHarness(name, result);
  Object.assign(h.vmThis, { options: [], codeId: null, codeName: '请选择', requestUrl: null });
  return h;
}
for (const name of CHUNKS) {
  test(`${name}: 首次拉取失败 → 之后 dsLoad(false) 成功时补做首次自动选择，且只做一次`, async () => {
    const h = emptyHarness(name, null);
    await h.comp.methods.dsLoad.call(h.vmThis, true);
    assert.strictEqual(h.vmThis.requestUrl, null);
    h.result = [ITEM2];
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    const first = dsSources.toOption(ITEM2, API_URL);
    assert.strictEqual(h.vmThis.codeId, first.value);
    assert.strictEqual(h.vmThis.requestUrl, first.requestUrl);
    assert.strictEqual(h.vmThis.opened, 1);
    assert.deepStrictEqual(closes(h.sent), []);                // 自动选择不关子窗口
    h.result = [{ ...ITEM2, source: 'qqtj', sourceName: '全球统计' }, ITEM2];
    await h.comp.methods.dsLoad.call(h.vmThis, false);         // 已自动选过、选中项仍在 → 不再动
    assert.strictEqual(h.vmThis.requestUrl, first.requestUrl);
    assert.strictEqual(h.vmThis.opened, 1);
  });

  test(`${name}: 首次加载成功照常自动选择；之后用户回到「未选择」也不会再自动选`, async () => {
    const h = emptyHarness(name, [ITEM2]);
    await h.comp.methods.dsLoad.call(h.vmThis, true);
    assert.strictEqual(h.vmThis.opened, 1);
    Object.assign(h.vmThis, { codeId: null, requestUrl: null });
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    assert.strictEqual(h.vmThis.requestUrl, null);
    assert.strictEqual(h.vmThis.opened, 1);
  });

  test(`${name}: 有本地源或已有选中项时 dsLoad(false) 不做首次自动选择`, async () => {
    let h = emptyHarness(name, [ITEM2]);
    h.vmThis.options = [h.local];
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    assert.strictEqual(h.vmThis.requestUrl, null);
    assert.strictEqual(h.vmThis.opened, 0);
    h = emptyHarness(name, [ITEM2]);
    h.vmThis.requestUrl = 'https://other.example/api';         // 已选了某个（非服务端）源
    await h.comp.methods.dsLoad.call(h.vmThis, false);
    assert.strictEqual(h.vmThis.requestUrl, 'https://other.example/api');
    assert.strictEqual(h.vmThis.opened, 0);
  });
}

// ---- race v1：showOpenNum 的响应回来时若已切换数据源，丢弃旧响应 ----
function openNumHarness(name) {
  const pending = [];
  const call = (api) => (params) => new Promise((resolve) => pending.push({ api, params, resolve }));
  const softNum = { t: call('topRows'), j: call('mantissaTopRows') };
  const comp = loadComponent(pageSource(name), { modules: { b456: softNum, f121: { apiURL: API_URL } } });
  const vmThis = {
    codeId: '6001', requestUrl: SRV('qqtj'), qitwId: null, num: {}, numList: [], numArr: [],
    drawer: false, titleId: 0, saveConditionUtils: [], typeId: 'hash5', pageId: 'p',
  };
  const DRAW = { code: 0, data: [{ expect: '202610050001', opennumber: '1,2,3,4,5', lottoId: '6001' }] };
  return { comp, vmThis, pending, DRAW };
}

for (const name of CHUNKS) {
  test(`${name}: showOpenNum 请求期间切换了数据源 → 丢弃旧响应`, async () => {
    for (const change of [{ codeId: '6002' }, { requestUrl: SRV('qkltj') }]) {
      const { comp, vmThis, pending, DRAW } = openNumHarness(name);
      comp.methods.showOpenNum.call(vmThis);
      assert.strictEqual(pending.length, 1);
      assert.strictEqual(pending[0].params.rows, 2);
      Object.assign(vmThis, change);
      pending[0].resolve(DRAW);
      await tick();
      assert.deepStrictEqual(vmThis.num, {}, `切换 ${JSON.stringify(change)} 后不应写入旧响应`);
      assert.deepStrictEqual(vmThis.numList, []);
    }
  });

  test(`${name}: showOpenNum 期间未切换 → 照常写入开奖号`, async () => {
    const { comp, vmThis, pending, DRAW } = openNumHarness(name);
    comp.methods.showOpenNum.call(vmThis);
    pending[0].resolve(DRAW);
    await tick();
    assert.strictEqual(vmThis.num, DRAW.data[0]);
    assert.strictEqual(vmThis.numArr.join(','), '1,2,3,4,5');   // numArr 由 vm 内的 split 产生，跨 realm 不能 deepStrictEqual
  });
}

// ---- race mantissa v1：运动会按尾数取开奖（qitwId 非空）同样丢弃切换后的旧响应 ----
const SPORTS = 'chunk-60235acf.b3ce76aa.js';
test(`${SPORTS}: 尾数分支 mantissaTopRows 请求期间切换了彩种 → 丢弃旧响应；未切换照常写入`, async () => {
  let h = openNumHarness(SPORTS);
  h.vmThis.qitwId = 3;
  h.comp.methods.showOpenNum.call(h.vmThis);
  assert.strictEqual(h.pending.length, 1);
  assert.strictEqual(h.pending[0].api, 'mantissaTopRows');
  h.vmThis.codeId = '6002';
  h.pending[0].resolve(h.DRAW);
  await tick();
  assert.deepStrictEqual(h.vmThis.num, {});
  assert.deepStrictEqual(h.vmThis.numList, []);
  h = openNumHarness(SPORTS);
  h.vmThis.qitwId = 3;
  h.comp.methods.showOpenNum.call(h.vmThis);
  h.pending[0].resolve(h.DRAW);
  await tick();
  assert.strictEqual(h.vmThis.num, h.DRAW.data[0]);
});

// ---- trend v1：走势图带上当前数据源（工作台 openTrend 传 requestUrl，走势页 topRows 按它取数）----
for (const name of CHUNKS) {
  test(`${name}: openTrend 打开的走势页参数带 requestUrl`, () => {
    const comp = loadComponent(pageSource(name), { modules: { f121: { apiURL: API_URL } } });
    for (const [id, type] of [['zs1', undefined], ['zs1', 'dm1'], ['dmzs', 'dm2']]) {
      const routes = [];
      const vmThis = {
        typeId: 'hash5', pageId: 'p', qitwId: null, codeId: 'trxbhffc', catId: 'hash', requestUrl: SRV('qqtj'),
        $router: { resolve: (r) => { routes.push(r); return { href: '#/trend/trend' }; } },
      };
      comp.methods.openTrend.call(vmThis, id, type);
      assert.strictEqual(routes.length, 1);
      assert.strictEqual(routes[0].path, '/trend/trend');
      const data = JSON.parse(routes[0].query.data);
      assert.strictEqual(data.requestUrl, SRV('qqtj'), `${id}/${type}`);
      assert.strictEqual(data.code, 'trxbhffc');
    }
  });
}

const TREND = path.join(DIR, TREND_CHUNK);
const trendSource = () => evalSources(fs.readFileSync(TREND, 'utf8')).find((s) => s.includes('topRows(res, callback) {'));

test('trend chunk: 已打补丁且再次运行不变（幂等），全部模块源码语法有效', () => {
  const raw = fs.readFileSync(TREND, 'utf8');
  for (const l of TREND_LAYERS) assert.ok(raw.includes(l.mark), `缺少补丁层 ${l.mark}`);
  assert.strictEqual(patchTrend(raw), raw);
  const srcs = evalSources(raw);
  assert.ok(srcs.length > 3);
  for (const s of srcs) new vm.Script(s);
});

test('trend chunk: 锚点不匹配时报错', () => {
  assert.throws(() => patchTrend("eval('topRows(res, callback) {')"), /命中 0 次/);
  assert.throws(() => patchTrend('nothing'), /topRows\(res, callback\)/);
});

function trendHarness(data, reply) {
  const calls = [];
  const softNum = { t: (p) => { calls.push(p); return Promise.resolve(reply); } };
  const comp = loadComponent(trendSource(), { modules: { b456: softNum, f121: {} } });
  const got = [];
  const vmThis = {
    data, code_id: null, topid: 't', htmlCallback: '',
    $store: { getters: { num_101: JSON.stringify([{ expect: 's1', opennumber: '9,9,9' }, { expect: 's2' }]) } },
  };
  const run = (res) => comp.methods.topRows.call(vmThis, res, (arr) => got.push(arr));
  return { calls, got, run };
}
const ROWS = () => ({ code: 0, data: [{ expect: '1', opennumber: '1,2,3,4,5' }, { expect: '2', opennumber: '6,7,8,9,0' }] });

test('trend: 选了数据源（requestUrl）时按该源取数；哈希只保留前 3 位且不改原对象', async () => {
  const reply = ROWS();
  const { calls, got, run } = trendHarness({ cat: 'hash', requestUrl: SRV('qqtj') }, reply);
  run({ code: 'trxbhffc', rows: 30 });
  await tick();
  assert.deepStrictEqual(plain(calls), [{ code: 'trxbhffc', rows: 30, requestUrl: SRV('qqtj') }]);
  assert.strictEqual(got.length, 1);
  assert.deepStrictEqual(plain(got[0].map((x) => x.opennumber)), ['1,2,3', '6,7,8']);
  assert.strictEqual(reply.data[0].opennumber, '1,2,3,4,5');
  assert.strictEqual(got[0][0].expect, '1');
});

test('trend: 6001 也走所选数据源；非哈希原样回传；失败不回调', async () => {
  let h = trendHarness({ cat: 'hash', requestUrl: SRV('qkltj') }, ROWS());
  h.run({ code: 6001, rows: 2 });
  await tick();
  assert.strictEqual(h.calls[0].requestUrl, SRV('qkltj'));
  assert.deepStrictEqual(plain(h.got[0].map((x) => x.opennumber)), ['1,2,3', '6,7,8']);
  const reply = ROWS();
  h = trendHarness({ cat: '1105', requestUrl: 'https://x.example/api' }, reply);
  h.run({ code: 'c1', rows: 2 });
  await tick();
  assert.deepStrictEqual(plain(h.got[0].map((x) => x.opennumber)), ['1,2,3,4,5', '6,7,8,9,0']);
  h = trendHarness({ cat: 'hash', requestUrl: SRV('qqtj') }, { code: 10020, msg: 'x' });
  h.run({ code: 'trxbhffc', rows: 2 });
  await tick();
  assert.strictEqual(h.got.length, 0);
});

test('trend: 所选数据源请求失败（reject）时不产生未处理的 Promise 拒绝，也不回调', async () => {
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    const calls = [];
    const softNum = { t: (p) => { calls.push(p); return Promise.reject(new Error('offline')); } };
    const comp = loadComponent(trendSource(), { modules: { b456: softNum, f121: {} } });
    const got = [];
    const vmThis = { data: { cat: 'hash', requestUrl: SRV('qqtj') }, htmlCallback: '' };
    comp.methods.topRows.call(vmThis, { code: 'trxbhffc', rows: 2 }, (arr) => got.push(arr));
    await tick();
    await tick();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(got.length, 0);
    assert.strictEqual(unhandled.length, 0, String(unhandled[0]));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('trend: 没有 requestUrl 时保持原逻辑（600x 走后端、其他走 store）', async () => {
  let h = trendHarness({ cat: 'hash', requestUrl: null }, ROWS());
  h.run({ code: 6002, rows: 2 });
  await tick();
  assert.deepStrictEqual(plain(h.calls), [{ code: 6002, rows: 2 }]);
  assert.deepStrictEqual(plain(h.got[0].map((x) => x.opennumber)), ['1,2,3', '6,7,8']);
  h = trendHarness({ cat: 'hash' }, ROWS());
  h.run({ code: 101, rows: 1 });
  await tick();
  assert.strictEqual(h.calls.length, 0);
  assert.strictEqual(h.got[0].length, 1);
  assert.strictEqual(h.got[0][0].expect, 's1');
});

// ---- app 入口 chunk：topRows 的第三方请求分支归一化返回体 ----
// app.9ba1133b.js 是 webpack 入口 chunk，evalSources 不适用；直接用正则抠出 topRows 模块的 eval('...') 字面量求值
function topRowsSource(raw) {
  const i = raw.indexOf('function topRows(params)');
  const e = raw.lastIndexOf("eval('", i);
  assert.ok(i > 0 && e > 0);
  const m = /^eval\(('(?:[^'\\]|\\[\s\S])*')\)/.exec(raw.slice(e));
  return new vm.Script('(' + m[1] + ')').runInNewContext({});
}

test('app chunk: topRows 仅在 requestUrl 分支套用 normalizeDraws，且已打补丁', () => {
  const raw = fs.readFileSync(path.join(DIR, APP_CHUNK), 'utf8');
  assert.ok(raw.includes(APP_MARK));
  const src = topRowsSource(raw);
  assert.ok(src.includes(APP_MARK));
  assert.ok(src.includes('window.dsSources.normalizeDraws(res, params.code)'));
  assert.strictEqual(src.split('normalizeDraws').length - 1, 1);
  const body = src.slice(src.indexOf('function topRows(params)'), src.indexOf('function mantissaTopRows'));
  assert.ok(/if \(requestUrl != null && requestUrl != ""\) \{\s*return dsReq\.then\(/.test(body));
  assert.ok(body.includes('return dsReq;'));          // 后端分支原样返回
  new vm.Script(src);                               // 编码出错会在这里抛 SyntaxError
});

test('app chunk: 补丁幂等', () => {
  const raw = fs.readFileSync(path.join(DIR, APP_CHUNK), 'utf8');
  for (const g of APP_LAYERS) for (const l of g.layers) assert.ok(raw.includes(l.mark), `缺少补丁层 ${l.mark}`);
  assert.strictEqual(patchApp(raw), raw);
});

test('app chunk: 锚点不匹配时报错', () => {
  assert.throws(() => patchApp("eval('function topRows(params) {')"), /命中 0 次/);
  assert.throws(() => patchApp('no eval here'), /topRows/);
  // norm v1 已打、auth 层缺 request 模块或锚点：报错
  assert.throws(() => patchApp(`eval('function topRows(params) {${APP_MARK}')`), /service\.interceptors\.request\.use/);
  assert.throws(() => patchApp(`eval('function topRows(params) {${APP_MARK}');eval('service.interceptors.request.use(config => {')`), /命中 0 次/);
});

test('app chunk: 补丁后的 topRows 行为——后端分支不套归一化，第三方分支套', async () => {
  const src = topRowsSource(fs.readFileSync(path.join(DIR, APP_CHUNK), 'utf8'));
  const calls = [];
  const req = (cfg) => { calls.push(cfg); return Promise.resolve({ code: 0, data: [{ issue: '1', drawResult: '1,2', drawTime: 't' }] }); };
  const mod = { exports: {} };
  const win = { dsSources: require('../client/ds-sources.js') };
  const fn = new vm.Script('(function(module, __webpack_exports__, __webpack_require__, window){' + src + '\n})').runInNewContext({});
  const wr = (id) => (id === 'f121' ? { apiURL: 'http://api' } : { a: req });   // b775=request, f121=config
  const exp = {};
  fn(mod, exp, Object.assign(wr, { r() {}, d(e, n, g) { Object.defineProperty(e, n, { get: g }); }, n() {} }), win);
  const third = await exp.t({ requestUrl: 'http://x/draw', code: 'c1', rows: 1 });
  assert.strictEqual(third.data[0].expect, '1');
  assert.strictEqual(third.data[0].lottoId, 'c1');
  assert.strictEqual(calls[0].url, 'http://x/draw?code=c1&rows=1');
  const own = await exp.t({ code: 'c1', rows: 1 });
  assert.strictEqual(own.data[0].expect, undefined);
  assert.strictEqual(calls[1].url, 'http://api/lotteryNumber/topRows');
});

// ---- auth v1：request 拦截器只给自家接口带 token/fromId；第三方返回 1002x 不踢人 ----
function appModuleSource(raw, locator) {
  const i = raw.indexOf(locator);
  const e = raw.lastIndexOf('eval(', i);
  assert.ok(i > 0 && e > 0);
  const m = /^eval\(('(?:[^'\\]|\\[\s\S])*'|"(?:[^"\\]|\\[\s\S])*")\)/.exec(raw.slice(e));
  return new vm.Script('(' + m[1] + ')').runInNewContext({});
}
const REQ_LOCATOR = 'service.interceptors.request.use(config => {';

function requestHarness(token = 'TOK') {
  const src = appModuleSource(fs.readFileSync(path.join(DIR, APP_CHUNK), 'utf8'), REQ_LOCATOR);
  const ic = {};
  const service = {
    interceptors: {
      request: { use: (ok, bad) => { ic.req = ok; } },
      response: { use: (ok, bad) => { ic.res = ok; } },
    },
  };
  const alerts = [];
  const sent = [];
  loadComponent(src, {
    modules: {
      bc3a: { create: () => service },
      '5c96': { MessageBox: { alert: (msg) => alerts.push(msg) } },
      f121: { apiURL: API_URL, fromId: 1004 },
    },
    window: { electron: { ipcRenderer: { send: (...a) => sent.push(a) } } },
    globals: { localStorage: { getItem: (k) => (k === 'token' ? token : null), removeItem() {} } },
  });
  const send = (url) => ic.req({ url, headers: {} }).headers;
  return { ic, alerts, sent, send };
}

test('app chunk: request 模块已打 auth 补丁，幂等，源码语法有效', () => {
  const raw = fs.readFileSync(path.join(DIR, APP_CHUNK), 'utf8');
  const src = appModuleSource(raw, REQ_LOCATOR);
  assert.ok(src.includes(AUTH_MARK));
  new vm.Script(src);
  assert.strictEqual(patchApp(raw), raw);
});

test('app chunk: 自家接口（apiURL 前缀 / 相对地址）带 token 与 fromId', () => {
  const { send } = requestHarness();
  for (const url of [API_URL + '/lotteryNumber/topRows', SRV('qqtj') + '?code=6001&rows=2', API_URL, API_URL + '?a=1', '/user/isExpire', undefined]) {
    const h = send(url);
    assert.strictEqual(h.token, 'TOK', String(url));
    assert.strictEqual(h.fromId, 1004, String(url));
  }
});

test('app chunk: 第三方地址不带 token / fromId', () => {
  const { send, ic } = requestHarness();
  for (const url of [
    'https://qqtj.example.com/api/draw-result?code=6001&rows=2',
    'HTTP://qkltj.example.com/x',
    '//evil.example.com/api',
    'https://lottery.jh8.ai/api.evil.com/x',
    'https://lottery.jh8.ai.evil.com/api/x',
    'https://evil.com/?u=' + API_URL,
  ]) {
    const h = send(url);
    assert.ok(!('token' in h), url);
    assert.ok(!('fromId' in h), url);
  }
  const cfg = ic.req({ url: 'https://x.example/a', headers: {} });
  assert.deepStrictEqual(plain(cfg.data), {});                       // 其他行为不变：data 默认 {}
});

test('app chunk: 第三方返回 10020/10021/10022 不踢人，原样 resolve；自家接口照旧踢', async () => {
  let h = requestHarness();
  for (const code of [10020, 10021, 10022]) {
    const res = { code, msg: 'x' };
    assert.strictEqual(await h.ic.res({ status: 200, data: res, config: { url: 'https://qqtj.example.com/draw' } }), res);
  }
  assert.strictEqual(h.alerts.length, 0);
  h = requestHarness();
  const out = h.ic.res({ status: 200, data: { code: 10021 }, config: { url: API_URL + '/user/isExpire' } });
  assert.strictEqual(out, undefined);
  assert.strictEqual(h.alerts.length, 1);
  const ok = { code: 0, data: [] };
  assert.strictEqual(await h.ic.res({ status: 200, data: ok, config: { url: 'https://qqtj.example.com/draw' } }), ok);
});
