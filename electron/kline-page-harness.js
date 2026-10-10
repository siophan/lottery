// K线独立页（kLine.vue，六屏）测试用的载入工具：在 vm 里执行打包后的模块，iframe / IPC / 路由都换成记录调用的假对象
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'client');
const CHUNK = path.join(ROOT, 'js', 'chunk-8db28b46.2b3ca481.js');

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

// 假 iframe 文档：记录各元素 innerHTML / checked / value，以及 k.useCustom / useFixed / useLinked / applyTheme / loadingData 调用
function fakeFrame(n, calls) {
  const els = {};
  const doc = { getElementById: (id) => (els[id] = els[id] || { innerHTML: '' }) };
  const win = {
    document: doc,
    k: {
      useCustom: () => calls.push(['useCustom', n]),
      useFixed: (id) => calls.push(['useFixed', n, id]),
      useLinked: (has) => calls.push(['useLinked', n, has]),
      applyTheme: (name) => calls.push(['applyTheme', n, name]),
    },
    loadingData: () => calls.push(['loadingData', n]),
    k_util: { getyesAndno: (data, cat, pid, res) => calls.push(['draw', n, res]) },
    onBack() {},
    dispatchEvent: () => calls.push(['resize', n]),
  };
  return { contentWindow: win, els };
}

const QUERY = { topid: '1105r5_kline', typeId: '1105r5', pid: '1105r5', code: '201', cat: '11x5', title: 'K线走势' };

function load({ query = QUERY, now = 1700000000000, stored = {} } = {}) {
  const src = evalSources(fs.readFileSync(CHUNK, 'utf8')).find((s) => s.includes('src/views/templetes/kLine.vue?vue&type=template'));
  assert.ok(src, 'kLine.vue 模块未找到');
  const sent = [];
  const store = Object.assign({}, stored);
  const handlers = {};
  const calls = [];
  const frames = {};
  const timers = [];   // setTimeout 回调按顺序记下，测试里手动触发
  for (let n = 1; n <= 6; n++) frames[n] = fakeFrame(n, calls);
  const winObj = {
    electron: { ipcRenderer: { send: (ch, arg) => sent.push([ch, JSON.parse(JSON.stringify(arg))]), on: (ch, f) => { (handlers[ch] = handlers[ch] || []).push(f); } } },
    addEventListener() {}, removeEventListener() {},
    outerWidth: 1600, outerHeight: 900,
  };
  const documentObj = { getElementById: (id) => frames[Number(String(id).replace('iframeId', ''))] || null };
  const FakeDate = { now: () => now };
  const fn = new vm.Script('(function(module, __webpack_exports__, __webpack_require__){' + src + '\n})')
    .runInNewContext({ window: winObj, document: documentObj, JSON, Object, Math, String, Number, Array, Date: FakeDate, Event: function (t) { this.type = t; }, setTimeout: (f) => timers.push(f), clearTimeout() {}, console, localStorage: { setItem: (k, v) => { store[k] = v; }, getItem: (k) => store[k] } });
  const exp = {};
  const normalizer = { a: (o, render) => ({ exports: Object.assign({}, o, { render }) }) };
  const planFixedList = () => ({ then: (f) => { f({ code: 0, data: [{ id: 9, name: '固定1', content: '[]' }] }); return { catch() {} }; } });
  const req = Object.assign((id) => {
    if (id === '2877') return normalizer;
    if (id === 'b456') return { p: planFixedList };
    return { a: {} };
  }, { r() {}, d(e, n, g) { Object.defineProperty(e, n, { get: g, enumerable: true }); } });
  fn({ exports: exp }, exp, req);
  const comp = exp.default;
  const resolved = [];
  const self = Object.assign(comp.data(), {
    $route: { path: '/kLine', query: Object.assign({}, query) },
    $router: { resolve: (loc) => { resolved.push(JSON.parse(JSON.stringify(loc))); return { href: '#/kLine?resolved=' + resolved.length }; } },
    $store: { getters: { userName: 'Z0000001' } },
    $message: { error() {}, success() {} },
    $nextTick: (f) => f && f(),
    $on() {},
    $refs: {},
    _v: (t) => ({ text: String(t) }),
    _s: (x) => String(x),
    _l: (arr, f) => arr.map(f),
    _e: () => null,
  });
  self._self = { _c: (tag, data, children) => ({ tag, data: Array.isArray(data) ? {} : data || {}, children: Array.isArray(data) ? data : children || [] }) };
  for (const [k, f] of Object.entries(comp.methods)) self[k] = f.bind(self);
  for (const [k, f] of Object.entries(comp.computed || {})) Object.defineProperty(self, k, { get: f.bind(self) });
  const emit = (ch, arg) => (handlers[ch] || []).forEach((f) => f({}, arg));
  return { comp, self, sent, emit, calls, frames, winObj, resolved, store, timers };
}

function start(t, { screens, config } = {}) {
  t.comp.created.call(t.self);
  t.self.stageW = 1200;
  t.self.stageH = 732;
  t.emit('klineScreens', screens === undefined ? { result: false } : { result: true, context: JSON.stringify(screens) });
  return config;
}

const nodes = (n) => (!n || n.text !== undefined ? [] : [n, ...(n.children || []).flatMap(nodes)]);
const texts = (n) => (!n ? [] : n.text !== undefined ? [n.text] : (n.children || []).flatMap(texts));

module.exports = { ROOT, CHUNK, evalSources, fakeFrame, load, start, nodes, texts, QUERY };
