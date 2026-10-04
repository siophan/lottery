const test = require('node:test');
const assert = require('node:assert');
const ds = require('../client/ds-sources.js');

const API = 'https://lottery.jh8.ai/api';
const ITEM = { source: 'qqtj', sourceName: '全球统计', code: '6001', name: '哈希分分彩', status: 'ok' };

test('toOption 生成走服务端接口的下拉项', () => {
  assert.deepStrictEqual(ds.toOption(ITEM, API), {
    value: '6001', label: '哈希分分彩 · 全球统计',
    requestUrl: 'https://lottery.jh8.ai/api/ds/qqtj/draw-result', server: true, status: 'ok',
  });
});

test('optKey 区分同彩种不同源', () => {
  const a = ds.toOption(ITEM, API);
  const b = ds.toOption({ ...ITEM, source: 'qkltj', sourceName: '区块链统计' }, API);
  assert.notStrictEqual(ds.optKey(a), ds.optKey(b));
  assert.strictEqual(ds.optKey({ value: '11001', requestUrl: null }), '11001|');
});

test('merge：服务端项在前，旧服务端项被替换，本地项保留', () => {
  const local = { value: '9', label: '我的源', requestUrl: 'https://x/api' };
  const stale = { ...ds.toOption(ITEM, API), status: 'error' };
  const out = ds.merge([ITEM], [stale, local], API);
  assert.deepStrictEqual(out, [ds.toOption(ITEM, API), local]);
});

test('persistable 去掉服务端项', () => {
  const local = { value: '9', label: 'x', requestUrl: 'https://x' };
  assert.deepStrictEqual(ds.persistable([ds.toOption(ITEM, API), local]), [local]);
  assert.deepStrictEqual(ds.persistable(undefined), []);
});

test('dotColor', () => {
  assert.strictEqual(ds.dotColor({ status: 'ok' }), '#19be6b');
  assert.strictEqual(ds.dotColor({ status: 'error' }), '#ed4014');
  assert.strictEqual(ds.dotColor({ status: 'unknown' }), '#c5c8ce');
});

test('fetchServer：带 token 请求并返回 data', async () => {
  let seen;
  const fake = async (url, opts) => { seen = { url, opts }; return { json: async () => ({ code: 0, data: [ITEM] }) }; };
  assert.deepStrictEqual(await ds.fetchServer(API, 'hash', 'TOK', fake), [ITEM]);
  assert.strictEqual(seen.url, 'https://lottery.jh8.ai/api/ds/sources?cat=hash');
  assert.strictEqual(seen.opts.headers.token, 'TOK');
});

test('fetchServer：业务错误或网络失败返回空数组', async () => {
  assert.deepStrictEqual(await ds.fetchServer(API, 'hash', 'T', async () => ({ json: async () => ({ code: 10020 }) })), []);
  assert.deepStrictEqual(await ds.fetchServer(API, 'hash', 'T', async () => { throw new Error('offline'); }), []);
});

test('Electron nodeIntegration 环境（module 和 window 共存）', () => {
  const fs = require('fs');
  const vm = require('vm');
  const code = fs.readFileSync(__dirname + '/../client/ds-sources.js', 'utf8');

  // 模拟 Electron nodeIntegration:true, contextIsolation:false 的环境
  // 同时有 module（Node.js）和 window（浏览器）全局对象
  const sandbox = {
    module: { exports: {} },
    window: {}
  };

  vm.runInNewContext(code, sandbox);

  // 验证两边都被设置了
  assert(typeof sandbox.module.exports.merge === 'function', 'module.exports 应该有 merge 函数');
  assert(typeof sandbox.window.dsSources.merge === 'function', 'window.dsSources 应该有 merge 函数');
  // 验证它们是同一个对象
  assert.strictEqual(sandbox.module.exports, sandbox.window.dsSources, 'module.exports 和 window.dsSources 应该是同一对象');
});
