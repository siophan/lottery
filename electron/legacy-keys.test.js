const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lk = require('../client/legacy-keys.js');

const API = 'https://lottery.jh8.ai/api/';

// 极简 localStorage：只实现 migrate 用到的部分
function store(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}
// 假后端：candidates 里属于 known 的算命中
const fakeFetch = (known, calls = [], override) => (u, o) => {
  calls.push([u, o]);
  const body = override || { code: 0, msg: '成功', data: { matches: JSON.parse(o.body).candidates.filter((c) => known.includes(c)) } };
  return Promise.resolve({ json: () => Promise.resolve(body) });
};

test('url：去掉 apiURL 末尾斜杠', () => {
  assert.strictEqual(lk.url(API), 'https://lottery.jh8.ai/api/user/legacy-prefixes');
});

test('groups：按前缀分组遗漏 key，不含本账号与无关 key', () => {
  const s = store({ Y1888omitData3dr3x: '1', Y1888omissionListp: '2', Z1omitDataa: '3', Z2omitDataa: '4',
                    token: 't', omitDataNoPrefix: '5', userInfo: '{}' });
  assert.deepStrictEqual(lk.groups(s, 'Z1'), { Y1888: ['Y1888omitData3dr3x', 'Y1888omissionListp'], Z2: ['Z2omitDataa'] });
});

test('migrate：只把后端确认的旧编号下的数据复制过来，旧 key 保留，带 token 请求', async () => {
  const calls = [];
  const s = store({ Y1888omitData3dr3x: '[1]', Y1888omissionListp: '[2]', Z2omitDataa: '[9]' });
  assert.strictEqual(await lk.migrate(API, 'TOK', 'Z1', s, fakeFetch(['Y1888'], calls)), 2);
  assert.strictEqual(s.getItem('Z1omitData3dr3x'), '[1]');
  assert.strictEqual(s.getItem('Z1omissionListp'), '[2]');
  assert.strictEqual(s.getItem('Z1omitDataa'), null);           // 别的账号的数据不复制
  assert.strictEqual(s.getItem('Y1888omitData3dr3x'), '[1]');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], 'https://lottery.jh8.ai/api/user/legacy-prefixes');
  assert.strictEqual(calls[0][1].method, 'POST');
  assert.strictEqual(calls[0][1].headers.token, 'TOK');
  assert.deepStrictEqual(JSON.parse(calls[0][1].body), { candidates: ['Y1888', 'Z2'] });
  assert.strictEqual(s.getItem(lk.FLAG + 'Z1'), '1');
});

test('migrate：本账号已有数据不覆盖；空串 / "null" 视为没有；旧值为空不复制', async () => {
  const s = store({ Y1888omitDataa: '[1]', Z1omitDataa: '[mine]', Y1888omitDatab: '[2]', Z1omitDatab: '',
                    Y1888omitDatac: '[3]', Z1omitDatac: 'null', Y1888omitDatad: '' });
  assert.strictEqual(await lk.migrate(API, 'TOK', 'Z1', s, fakeFetch(['Y1888'])), 2);
  assert.strictEqual(s.getItem('Z1omitDataa'), '[mine]');
  assert.strictEqual(s.getItem('Z1omitDatab'), '[2]');
  assert.strictEqual(s.getItem('Z1omitDatac'), '[3]');
  assert.strictEqual(s.getItem('Z1omitDatad'), null);
});

test('migrate：多个旧编号都有数据时取后端排在前面的（最近用过的共用账号）', async () => {
  const s = store({ Y1888omitDataa: '[old]', Y2000omitDataa: '[new]', Y1888omitDatab: '[only-old]' });
  const fetchNewestFirst = () => Promise.resolve({ json: () => Promise.resolve({ code: 0, data: { matches: ['Y2000', 'Y1888'] } }) });
  assert.strictEqual(await lk.migrate(API, 'TOK', 'Z1', s, fetchNewestFirst), 2);
  assert.strictEqual(s.getItem('Z1omitDataa'), '[new]');
  assert.strictEqual(s.getItem('Z1omitDatab'), '[only-old]');
});

test('migrate：成功一次后不再请求；没有候选时也记标记、不发请求', async () => {
  const calls = [];
  const s = store({ Y1888omitDataa: '[1]' });
  await lk.migrate(API, 'TOK', 'Z1', s, fakeFetch(['Y1888'], calls));
  assert.strictEqual(await lk.migrate(API, 'TOK', 'Z1', s, fakeFetch(['Y1888'], calls)), 0);
  assert.strictEqual(calls.length, 1);
  const empty = store();
  assert.strictEqual(await lk.migrate(API, 'TOK', 'Z1', empty, fakeFetch([], calls)), 0);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(empty.getItem(lk.FLAG + 'Z1'), '1');
});

test('migrate：未登录不请求；业务失败 / 网络异常不记标记，下次再试', async () => {
  const calls = [];
  const s = store({ Y1888omitDataa: '[1]' });
  assert.strictEqual(await lk.migrate(API, '', 'Z1', s, fakeFetch(['Y1888'], calls)), 0);
  assert.strictEqual(await lk.migrate(API, 'TOK', '', s, fakeFetch(['Y1888'], calls)), 0);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(await lk.migrate(API, 'TOK', 'Z1', s, fakeFetch([], calls, { code: 10020, msg: 'x' })), 0);
  assert.strictEqual(await lk.migrate(API, 'TOK', 'Z1', s, () => Promise.reject(new Error('net'))), 0);
  assert.strictEqual(await lk.migrate(API, 'TOK', 'Z1', s, () => { throw new Error('sync'); }), 0);
  assert.strictEqual(s.getItem(lk.FLAG + 'Z1'), null);
  assert.strictEqual(await lk.migrate(API, 'TOK', 'Z1', s, fakeFetch(['Y1888'])), 1);
});

test('migrate：候选最多 50 个、前缀超过 64 字符的不发', async () => {
  const init = {};
  for (let i = 0; i < 60; i++) init[`P${i}omitDataa`] = '1';
  init[`${'x'.repeat(65)}omitDataa`] = '1';
  const calls = [];
  await lk.migrate(API, 'TOK', 'Z1', store(init), fakeFetch([], calls));
  const cands = JSON.parse(calls[0][1].body).candidates;
  assert.strictEqual(cands.length, 50);
  assert.ok(cands.every((c) => c.length <= 64));
});

test('index.html 在业务脚本之前加载 legacy-keys.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.html'), 'utf8');
  const i = html.indexOf('<script src=app://./legacy-keys.js></script>');
  assert.ok(i > 0);
  assert.ok(i < html.indexOf('js/app.9ba1133b.js></script>'));
});
