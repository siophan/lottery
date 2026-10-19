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

// 元素的 innerHTML 与 textContent 按浏览器的规则互相转换：写 textContent 时 & < > 会转义，读 textContent 时还原；
// innerHTML 里的裸 & 读回来是 &amp;
const htmlText = (h) => String(h).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function fakeEl() {
  let html = '';
  return {
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v).replace(/&(?!(amp|lt|gt|quot|#39);)/g, '&amp;'); },
    get textContent() { return htmlText(html); },
    set textContent(v) { html = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  };
}

// 假 iframe 文档：记录各元素 innerHTML / checked / value，以及 k.useCustom / useFixed / useLinked / applyTheme / loadingData 调用；
// kSubmit.seq 是该屏当前的画图序号（k_submit.js）
function fakeFrame(n, calls) {
  const els = {};
  const doc = { getElementById: (id) => (els[id] = els[id] || fakeEl()) };
  const win = {
    document: doc,
    k: {
      linked: false,
      planMode: () => ((els.zdyfa && els.zdyfa.checked) || win.k.linked ? '1' : '2'),
      useCustom: () => calls.push(['useCustom', n]),
      useFixed: (id) => calls.push(['useFixed', n, id]),
      useLinked: (has) => calls.push(['useLinked', n, has]),
      applyTheme: (name) => calls.push(['applyTheme', n, name]),
    },
    kSubmit: { seq: 0, isCurrent: (s) => s === win.kSubmit.seq },
    loadingData: () => calls.push(['loadingData', n]),
    k_util: { getyesAndno: (data, cat, pid, res) => calls.push(['draw', n, res]) },
    onBack() {},
    dispatchEvent: () => calls.push(['resize', n]),
  };
  return { contentWindow: win, els };
}

const QUERY = { topid: '1105r5_kline', typeId: '1105r5', pid: '1105r5', code: '201', cat: '11x5', title: 'K线走势' };

// drawFeed：给定时挂到 window.drawFeed，并提供 fetch 与 config.apiURL，用来测开奖推送（startFeed）
function load({ query = QUERY, now = 1700000000000, stored = {}, drawFeed } = {}) {
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
  if (drawFeed) winObj.drawFeed = drawFeed;
  const documentObj = { getElementById: (id) => frames[Number(String(id).replace('iframeId', ''))] || null };
  const FakeDate = { now: () => now };
  const fn = new vm.Script('(function(module, __webpack_exports__, __webpack_require__){' + src + '\n})')
    .runInNewContext({ window: winObj, document: documentObj, JSON, Object, Math, String, Number, Array, Date: FakeDate, Event: function (t) { this.type = t; }, setTimeout: (f) => timers.push(f), clearTimeout() {}, console, fetch: drawFeed ? () => {} : undefined, localStorage: { setItem: (k, v) => { store[k] = v; }, getItem: (k) => store[k] } });
  const exp = {};
  const normalizer = { a: (o, render) => ({ exports: Object.assign({}, o, { render }) }) };
  const planFixedList = () => ({ then: (f) => { f({ code: 0, data: [{ id: 9, name: '固定1', content: '[]' }] }); return { catch() {} }; } });
  const req = Object.assign((id) => {
    if (id === '2877') return normalizer;
    if (id === 'b456') return { p: planFixedList };
    if (id === 'f121') return { apiURL: 'https://api.test/api' };
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

module.exports = { ROOT, CHUNK, evalSources, fakeFrame, fakeEl, htmlText, load, start, nodes, texts, QUERY };
