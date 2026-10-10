// K线页数据同步失败（第 011 章 3「数据同步」、9「数据同步失败」）：
//   取开奖数据失败（网络错误、超时、返回内容不对）时显示失败状态和「重试」入口，不画旧数据；
//   点重试重新取数，成功后失败提示消失并正常画图
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { ROOT } = require('./kline-page-harness');
const KDIR = path.join(ROOT, 'kline');
const read = (p) => fs.readFileSync(path.join(KDIR, p), 'utf8');

// 假 DOM：只实现 k_sync.js 用到的部分
function fakeDocument() {
  const byId = {};
  function el(tag) {
    const node = {
      tagName: tag.toUpperCase(), id: '', className: '', style: {}, children: [], disabled: false, textContent: '', onclick: null,
      appendChild(c) { node.children.push(c); if (c.id) byId[c.id] = c; return c; },
      querySelector(sel) { return all(node).find((n) => n !== node && n.className.split(' ').includes(sel.replace('.', ''))) || null; },
    };
    return node;
  }
  const all = (n) => [n, ...n.children.flatMap(all)];
  const k1 = el('div');
  k1.id = 'k1';
  byId.k1 = k1;
  return {
    k1,
    createElement: el,
    getElementById: (id) => byId[id] || null,
  };
}

function setup({ query = {} } = {}) {
  const document = fakeDocument();
  const calls = [];
  const k_util = {
    request: (url, data, before, ok, async, fail) => calls.push({ url, data, ok, fail }),
    requestA: (url, ok, fail) => calls.push({ url, ok, fail }),
  };
  const ctx = { document, k_util, Array };
  vm.runInNewContext(read('js/k_sync.js'), ctx);
  const drawn = [];
  const retries = [];
  const fetch = (src) => ctx.kSync.fetchDraws(Object.assign({ code: '201', rows: 120 }, src),
    (res) => drawn.push(res), () => retries.push(1));
  const box = () => document.getElementById('kSyncFail');
  const visible = () => !!box() && box().style.display !== 'none';
  return { ctx, document, calls, drawn, retries, fetch, box, visible };
}

test('按数据来源选接口：默认 topRows；尾数走 mantissaTopRows；配置了数据源地址走该地址', () => {
  const t = setup();
  t.fetch({});
  t.fetch({ mantissa: '3' });
  t.fetch({ requestUrl: 'https://x/api/ds/a/draw-result' });
  assert.deepStrictEqual(t.calls.map((c) => c.url), [
    '/lotteryNumber/topRows', '/lotteryNumber/mantissaTopRows', 'https://x/api/ds/a/draw-result?code=201&rows=120']);
  assert.deepStrictEqual({ ...t.calls[0].data }, { code: '201', rows: 120 });
  assert.deepStrictEqual({ ...t.calls[1].data }, { code: '201', rows: 120, mantissa: '3' });
});

test('地址栏里的 "undefined" / "null" 字样不算配置了数据源', () => {
  const t = setup();
  t.fetch({ mantissa: 'undefined', requestUrl: 'null' });
  t.fetch({ mantissa: '', requestUrl: 'undefined' });
  assert.deepStrictEqual(t.calls.map((c) => c.url), ['/lotteryNumber/topRows', '/lotteryNumber/topRows']);
});

test('取数成功：照常画图，不显示失败提示', () => {
  const t = setup();
  t.fetch({});
  t.calls[0].ok({ result: 0, data: [{ expect: '1' }] });
  assert.strictEqual(t.drawn.length, 1);
  assert.ok(!t.visible());
});

test('网络失败或超时：显示「数据同步失败」和「重试」，不画图', () => {
  for (const src of [{}, { requestUrl: 'https://x/api/ds/a/draw-result' }]) {
    const t = setup();
    t.fetch(src);
    t.calls[0].fail('timeout');
    assert.ok(t.visible(), '没有显示失败提示');
    assert.strictEqual(t.box().querySelector('.k-sync-msg').textContent, '数据同步失败');
    assert.strictEqual(t.box().querySelector('.k-sync-retry').textContent, '重试');
    assert.strictEqual(t.drawn.length, 0);
    assert.ok(t.document.k1.children.includes(t.box()), '提示要盖在图表区域上');
  }
});

test('返回内容里没有开奖列表也按失败处理', () => {
  const t = setup();
  t.fetch({});
  t.calls[0].ok({ result: 0, msg: 'error' });
  assert.ok(t.visible());
  assert.strictEqual(t.drawn.length, 0);
});

test('点重试：按钮变为不可点并重新取数；成功后提示消失', () => {
  const t = setup();
  t.fetch({});
  t.calls[0].fail('error');
  const btn = t.box().querySelector('.k-sync-retry');
  btn.onclick();
  assert.strictEqual(t.retries.length, 1);
  assert.strictEqual(btn.disabled, true, '重试中要防止重复点击');
  assert.strictEqual(t.box().querySelector('.k-sync-msg').textContent, '正在重新同步…');
  t.fetch({});
  t.calls[1].ok({ data: [] });
  assert.ok(!t.visible());
  assert.strictEqual(t.drawn.length, 1);
});

test('重试又失败：恢复失败提示和可点的重试按钮，不重复插入提示', () => {
  const t = setup();
  t.fetch({});
  t.calls[0].fail('error');
  t.box().querySelector('.k-sync-retry').onclick();
  t.fetch({});
  t.calls[1].fail('error');
  const btn = t.box().querySelector('.k-sync-retry');
  assert.strictEqual(btn.disabled, false);
  assert.strictEqual(t.box().querySelector('.k-sync-msg').textContent, '数据同步失败');
  assert.strictEqual(t.document.k1.children.length, 1);
});

// k_Util 的两个请求方法在失败时回调 fail；不传 fail 的老调用不受影响
function runUtil() {
  const opts = [];
  const ctx = { $: { ajax: (o) => opts.push(o), extend: Object.assign }, btutil: { cookieGet: () => '' }, window: {}, JSON, Object };
  vm.runInNewContext(read('js/k_Util.js'), ctx);
  return { k_util: ctx.k_util, opts };
}

test('k_util.request / requestA 请求出错时调用失败回调', () => {
  const { k_util, opts } = runUtil();
  const failed = [];
  k_util.request('/lotteryNumber/topRows', {}, '', () => {}, true, (s) => failed.push(s));
  k_util.requestA('https://x/a?code=1', () => {}, (s) => failed.push(s));
  opts[0].error({}, 'timeout');
  opts[1].error({}, 'error');
  assert.deepStrictEqual(failed, ['timeout', 'error']);
  // 老调用没传失败回调
  k_util.request('/x', {}, '', () => {}, true);
  k_util.requestA('https://x/b', () => {});
  assert.doesNotThrow(() => { opts[2].error({}, 'error'); opts[3].error({}, 'error'); });
});

test('K线页取开奖数据都走 kSync.fetchDraws，重试就是重新加载本屏', () => {
  const main = read('k2/k_2main.js');
  const start = main.indexOf('function loadingData(');
  const body = main.slice(start, main.indexOf('\nfunction onBack(', start));
  assert.strictEqual(body.split('kSync.fetchDraws(').length - 1, 2, '推荐方案和自定义方案两处都要走 fetchDraws');
  assert.ok(!/k_util\.request/.test(body), 'loadingData 里不应再直接请求');
  assert.strictEqual(body.split('function() { loadingData(); }').length - 1, 2);
  const html = read('k2/k_2.html');
  const i = html.indexOf('../js/k_sync.js');
  assert.ok(i > 0 && i < html.indexOf('k_2main.js'), 'k_2.html 要在 k_2main.js 之前加载 k_sync.js');
});

test('失败提示盖住整个图表区域', () => {
  const css = read('css/k.css');
  assert.match(css, /#k1\s*\{[^}]*position:\s*relative/);
  assert.match(css, /\.k-sync-fail\s*\{[^}]*position:\s*absolute/);
});
