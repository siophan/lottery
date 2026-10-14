const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const st = require('../client/site-texts.js');

const API = 'https://lottery.jh8.ai/api/';
const fakeFetch = (body, calls = []) => (u, o) => { calls.push([u, o]); return Promise.resolve({ json: () => Promise.resolve(body) }); };

test('url：去掉 apiURL 末尾斜杠，key 逐个编码', () => {
  assert.strictEqual(st.url(API, ['pl3.rules', 'a b']), 'https://lottery.jh8.ai/api/texts?keys=pl3.rules,a%20b');
});

test('load：成功返回 data；请求不走缓存；空 key 不发请求', async () => {
  const calls = [];
  const data = { 'pl3.rules': { title: 't', content: '<p>x</p>' } };
  assert.deepStrictEqual(await st.load(API, ['pl3.rules', '', null], fakeFetch({ code: 0, data }, calls)), data);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][1].cache, 'no-store');
  assert.deepStrictEqual(await st.load(API, [], fakeFetch({ code: 0, data }, calls)), {});
  assert.strictEqual(calls.length, 1);
});

test('load：业务失败 / 网络异常 / 非 JSON 一律兑现为空对象', async () => {
  assert.deepStrictEqual(await st.load(API, ['k'], fakeFetch({ code: 1, msg: 'x' })), {});
  assert.deepStrictEqual(await st.load(API, ['k'], () => Promise.reject(new Error('net'))), {});
  assert.deepStrictEqual(await st.load(API, ['k'], () => { throw new Error('sync'); }), {});
  assert.deepStrictEqual(await st.load(API, ['k'], () => Promise.resolve({ json: () => Promise.reject(new Error('bad')) })), {});
});

test('load：最多读取 KEYS_MAX 个 key', async () => {
  const calls = [];
  const keys = Array.from({ length: st.KEYS_MAX + 5 }, (_, i) => 'k' + i);
  await st.load(API, keys, fakeFetch({ code: 0, data: {} }, calls));
  assert.strictEqual(calls[0][0].split('keys=')[1].split(',').length, st.KEYS_MAX);
});

test('fill：有文案时替换 innerHTML；没有该 key / 失败时保留原文案', async () => {
  const el = { innerHTML: '原文案' };
  assert.strictEqual(await st.fill(el, API, 'k', fakeFetch({ code: 0, data: {} })), false);
  assert.strictEqual(el.innerHTML, '原文案');
  assert.strictEqual(await st.fill(el, API, 'k', () => Promise.reject(new Error('x'))), false);
  assert.strictEqual(el.innerHTML, '原文案');
  assert.strictEqual(await st.fill(el, API, 'k', fakeFetch({ code: 0, data: { k: { content: '<p>新</p>' } } })), true);
  assert.strictEqual(el.innerHTML, '<p>新</p>');
});

test('index.html 在业务脚本之前加载 site-texts.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.html'), 'utf8');
  const i = html.indexOf('<script src=app://./site-texts.js></script>');
  assert.ok(i > 0 && i < html.indexOf('app://./js/app.9ba1133b.js></script>'));
});
