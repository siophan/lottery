// kLine.vue 的 getPlan 发给主进程的 file 必须用 '/' 拼「分组/方案」：主进程按 `<id>/<group>/<plan>.json`
// 写盘，原代码用 Windows 的 '\\' 拼接，macOS 上读成 `<id>/group\plan.json`，自定义方案永远加载不到。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CHUNK = path.join(__dirname, '..', 'client', 'js', 'chunk-8db28b46.2b3ca481.js');

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

function loadComponent(src, window) {
  const fn = new vm.Script('(function(module, __webpack_exports__, __webpack_require__, window){' + src + '\n})')
    .runInNewContext({ console });
  const exp = {};
  const stub = () => new Proxy(function () {}, { get: () => stub(), apply: () => stub() });
  const normalizer = { a: (o) => ({ exports: o, options: o }) };   // componentNormalizer
  const req = Object.assign((id) => (id === '2877' ? normalizer : stub()), {
    r() {}, d(e, n, g) { Object.defineProperty(e, n, { get: g, enumerable: true }); },
    n: (m) => { const g = () => m; g.a = m; return g; },
  });
  fn({ exports: exp }, exp, req, window);
  return exp.default;
}

test('kLine getPlan: 分组与方案用 / 拼接（macOS 可读到 addkline 写下的文件）', () => {
  const src = evalSources(fs.readFileSync(CHUNK, 'utf8')).find((s) => s.includes('getPlan(group, plan, data, screen) {'));
  assert.ok(src, 'kLine.vue 模块源码未找到');
  const sent = [];
  const comp = loadComponent(src, { electron: { ipcRenderer: { send: (ch, arg) => sent.push([ch, arg]), on() {} } } });
  const self = { $store: { getters: { userName: 'u1' } }, topid: 7, pid: '1105r5' };
  comp.methods.getPlan.call(Object.assign(self, { plotData: {}, screenOf: comp.methods.screenOf }), '分组20261010', '方案20261010', null, '1');
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0][0], 'loadtempdata');
  assert.strictEqual(sent[0][1].file, '分组20261010/方案20261010');
});
