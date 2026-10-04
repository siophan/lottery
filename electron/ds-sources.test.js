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

test('fetchServer：任何失败都返回 null（与「服务端确实没有源」的 [] 区分）', async () => {
  const bad = (body) => async () => ({ json: async () => body });
  assert.strictEqual(await ds.fetchServer(API, 'hash', 'T', bad({ code: 10020 })), null);            // 业务错误
  assert.strictEqual(await ds.fetchServer(API, 'hash', 'T', bad({ code: 0, data: { a: 1 } })), null); // data 非数组
  assert.strictEqual(await ds.fetchServer(API, 'hash', 'T', bad({ code: 0 })), null);
  assert.strictEqual(await ds.fetchServer(API, 'hash', 'T', bad(null)), null);
  assert.strictEqual(await ds.fetchServer(API, 'hash', 'T', async () => { throw new Error('offline'); }), null); // 网络错误
  assert.strictEqual(await ds.fetchServer(API, 'hash', 'T', async () => ({ json: async () => { throw new SyntaxError('not json'); } })), null);
});

test('fetchServer：服务端确实返回空列表时是 []', async () => {
  assert.deepStrictEqual(await ds.fetchServer(API, 'hash', 'T', async () => ({ json: async () => ({ code: 0, data: [] }) })), []);
});

test('fetchServer：没有 fetch 实现时返回 null', async () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  const old = globalThis.fetch;
  delete globalThis.fetch;
  try {
    assert.strictEqual(await ds.fetchServer(API, 'hash', 'T'), null);
  } finally {
    if (had) globalThis.fetch = old;
  }
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

// ---- normalizeDraws：把全球统计返回体映射为区块链统计字段 ----
const QQ = { cycleNo: 1440, issue: '202610041440', drawResult: '4,5,7,2,2', drawTime: '2026-10-05 00:00:00', context: { a: 1 } };
const QK = { expect: '202610041440', opennumber: '4,5,7,2,2', openTime: '2026-10-05 00:00:00', lottoId: 'trxbhffc' };

test('normalizeDraws：全球统计条目映射出 expect/opennumber/openTime/lottoId，其余字段保留', () => {
  const out = ds.normalizeDraws({ code: 0, msg: '成功', data: [QQ] }, 'trxbhffc');
  assert.strictEqual(out.msg, '成功');
  assert.deepStrictEqual(out.data[0], {
    ...QQ, expect: '202610041440', opennumber: '4,5,7,2,2', openTime: '2026-10-05 00:00:00', lottoId: 'trxbhffc',
  });
});

test('normalizeDraws：区块链统计形态的条目保持不变（深相等）', () => {
  const out = ds.normalizeDraws({ code: 0, data: [QK] }, 'other');
  assert.deepStrictEqual(out.data[0], QK);
});

test('normalizeDraws：code 为空时不设置 lottoId；非对象条目原样透传', () => {
  const out = ds.normalizeDraws({ code: 0, data: [QQ, null, 5] }, '');
  assert.ok(!('lottoId' in out.data[0]));
  assert.strictEqual(out.data[1], null);
  assert.strictEqual(out.data[2], 5);
  assert.ok(!('lottoId' in ds.normalizeDraws({ code: 0, data: [QQ] }, undefined).data[0]));
});

test('normalizeDraws：res 非对象 / code 非 0 / data 非数组 时原样返回', () => {
  const bad = { code: 10020, data: [QQ] };
  const noArr = { code: 0, data: { a: 1 } };
  assert.strictEqual(ds.normalizeDraws(null, 'x'), null);
  assert.strictEqual(ds.normalizeDraws('str', 'x'), 'str');
  assert.strictEqual(ds.normalizeDraws(bad, 'x'), bad);
  assert.strictEqual(ds.normalizeDraws(noArr, 'x'), noArr);
});

test('normalizeDraws：幂等，且不修改入参', () => {
  const input = { code: 0, data: [QQ] };
  const snapshot = JSON.parse(JSON.stringify(input));
  const once = ds.normalizeDraws(input, 'c1');
  assert.deepStrictEqual(input, snapshot);
  assert.notStrictEqual(once, input);
  assert.notStrictEqual(once.data[0], input.data[0]);
  assert.deepStrictEqual(ds.normalizeDraws(once, 'c1'), once);
});

// ---- serverHeaders：只对自家 /api/ds/<key>/draw-result 带 token ----
function withLocalStorage(stub, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const old = globalThis.localStorage;
  if (stub === undefined) delete globalThis.localStorage;
  else Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
  try { return fn(); } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', { value: old, configurable: true, writable: true });
    else delete globalThis.localStorage;
  }
}
const lsWith = (tok) => ({ getItem: (k) => (k === 'token' ? tok : null) });

test('serverHeaders：服务端 draw-result 地址（含 query）带 token', () => {
  withLocalStorage(lsWith('T123'), () => {
    assert.deepStrictEqual(ds.serverHeaders(API + '/ds/qqtj/draw-result?code=6001&rows=50'), { token: 'T123' });
    assert.deepStrictEqual(ds.serverHeaders(API + '/ds/qkltj/draw-result'), { token: 'T123' });
  });
});

test('serverHeaders：第三方地址不带 token', () => {
  withLocalStorage(lsWith('T123'), () => {
    assert.deepStrictEqual(ds.serverHeaders('https://evil.example.com/qqtj/draw-result?code=1'), {});
    assert.deepStrictEqual(ds.serverHeaders('https://soft-api.bajiaoxing-tech.com/api/lotteryNumber/topRows'), {});
    assert.deepStrictEqual(ds.serverHeaders('https://evil.com/?u=/api/ds/x/draw-result'), {});
    assert.deepStrictEqual(ds.serverHeaders(''), {});
    assert.deepStrictEqual(ds.serverHeaders(undefined), {});
  });
});

test('serverHeaders：无 localStorage / 无 token / getItem 抛错 时返回 {}', () => {
  const url = API + '/ds/qqtj/draw-result?code=1';
  withLocalStorage(undefined, () => assert.deepStrictEqual(ds.serverHeaders(url), {}));
  withLocalStorage(lsWith(null), () => assert.deepStrictEqual(ds.serverHeaders(url), {}));
  withLocalStorage(lsWith(''), () => assert.deepStrictEqual(ds.serverHeaders(url), {}));
  withLocalStorage({ getItem: () => { throw new Error('denied'); } }, () => assert.deepStrictEqual(ds.serverHeaders(url), {}));
});

test('serverHeaders：withLocalStorage 还原全局状态', () => {
  const before = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  withLocalStorage(lsWith('x'), () => {});
  withLocalStorage(undefined, () => {});
  assert.strictEqual(Object.prototype.hasOwnProperty.call(globalThis, 'localStorage'), before);
});

// ---- 静态页（omit / kline）的 requestUrl ajax 必须合并 serverHeaders ----
test('ylcx.js / k_Util.js 的 requestUrl ajax 调用了 serverHeaders(', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ylcx = fs.readFileSync(path.join(__dirname, '../client/omit/js/ylcx.js'), 'utf8');
  const kutil = fs.readFileSync(path.join(__dirname, '../client/kline/js/k_Util.js'), 'utf8');
  assert.match(ylcx, /dsSources\.serverHeaders\(\s*requestUrl/);
  assert.match(kutil, /dsSources\.serverHeaders\(\s*url\s*\)/);
});

test('k_Util.js：decodeURIComponent 有 try/catch 兜底', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const kutil = fs.readFileSync(path.join(__dirname, '../client/kline/js/k_Util.js'), 'utf8');
  assert.match(kutil, /try\s*\{[^}]*decodeURIComponent\(codeM\[1\]\)[^}]*\}\s*catch/);
});

// ---- isServerUrl / needsReselect：选中的服务端源被停用/删除后自动切走 ----
test('isServerUrl：只认自家 /api/ds/<key>/draw-result 路径（忽略 query/hash）', () => {
  assert.strictEqual(ds.isServerUrl(API + '/ds/qqtj/draw-result'), true);
  assert.strictEqual(ds.isServerUrl(API + '/ds/qqtj/draw-result?code=1#x'), true);
  assert.strictEqual(ds.isServerUrl('https://evil.com/?u=/api/ds/x/draw-result'), false);
  assert.strictEqual(ds.isServerUrl('https://x.example/api'), false);
  assert.strictEqual(ds.isServerUrl(''), false);
  assert.strictEqual(ds.isServerUrl(null), false);
  assert.strictEqual(ds.isServerUrl(undefined), false);
});

test('needsReselect：当前选中的服务端源已不在列表中 → true', () => {
  const kept = ds.toOption(ITEM, API);
  const gone = ds.toOption({ ...ITEM, source: 'qkltj', sourceName: '区块链统计' }, API);
  const local = { value: '9', label: '我的源', requestUrl: 'https://x.example/api' };
  assert.strictEqual(ds.needsReselect([kept, local], gone.value, gone.requestUrl), true);
  // 同源不同彩种也算消失
  assert.strictEqual(ds.needsReselect([kept, local], '6002', kept.requestUrl), true);
});

test('needsReselect：仍在列表中 / 本地源 / 后端默认源 / 列表为空 → false', () => {
  const kept = ds.toOption(ITEM, API);
  const local = { value: '9', label: '我的源', requestUrl: 'https://x.example/api' };
  assert.strictEqual(ds.needsReselect([kept, local], kept.value, kept.requestUrl), false);
  assert.strictEqual(ds.needsReselect([kept], local.value, local.requestUrl), false);   // 不从本地源切走
  assert.strictEqual(ds.needsReselect([kept], '11001', null), false);                   // requestUrl 为空的内置项
  assert.strictEqual(ds.needsReselect([], '6001', kept.requestUrl), false);
  assert.strictEqual(ds.needsReselect(undefined, '6001', kept.requestUrl), false);
});
