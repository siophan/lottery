const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { patchChunk, CHUNKS, MARK, patchApp, APP_CHUNK, APP_MARK } = require('../scripts/patch-ds-client.js');

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
    assert.ok(raw.includes(MARK));
    assert.strictEqual(patchChunk(raw), raw);
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
  assert.throws(() => patchChunk("eval('switchCode(index) {')"), /命中 0 次/);
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
