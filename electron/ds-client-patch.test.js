const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { patchChunk, CHUNKS, MARK, patchApp, APP_CHUNK, APP_MARK, CHUNK_LAYERS, APP_LAYERS } = require('../scripts/patch-ds-client.js');
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
    for (const l of CHUNK_LAYERS) assert.ok(raw.includes(l.mark), `缺少补丁层 ${l.mark}`);
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
});

// ---- keep v1：服务端列表拉取失败（null）时保留现有下拉项与选中项 ----
function dsLoadHarness(name, fetchResult) {
  const comp = loadComponent(pageSource(name), {
    modules: { f121: { apiURL: API_URL } },
    window: { dsSources: Object.assign({}, dsSources, { fetchServer: async () => fetchResult }) },
    globals: { localStorage: { getItem: () => 'TOK' }, setInterval: () => 0, clearInterval() {} },
  });
  const local = { value: '9', label: '我的源', requestUrl: 'https://x.example/api' };
  const server = dsSources.toOption({ source: 'qqtj', sourceName: '全球统计', code: '6001', name: '哈希分分彩', status: 'ok' }, API_URL);
  const vmThis = {
    options: [server, local], codeId: server.value, codeName: server.label, requestUrl: server.requestUrl, catId: 'hash',
    num: { expect: '1' }, opened: 0,
    showOpenNum() { this.opened++; },
  };
  return { comp, vmThis, server, local };
}

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
