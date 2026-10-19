// 开奖推送客户端（client/draw-feed.js）：订阅地址、SSE 解析、连接 / 重连 / 登录失效停止
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const df = require('../client/draw-feed.js');

const API = 'https://lottery.jh8.ai/api';

test('订阅地址：上游彩种、尾数、自家数据源；第三方地址没有推送', () => {
  assert.strictEqual(df.streamUrl(API, { code: '201' }), API + '/draws/stream?code=201');
  assert.strictEqual(df.streamUrl(API, { code: '301', mantissa: '7' }), API + '/draws/stream?code=301&mantissa=7');
  assert.strictEqual(df.streamUrl(API, { code: '301', mantissa: 'undefined', requestUrl: 'null' }), API + '/draws/stream?code=301');
  assert.strictEqual(df.streamUrl(API, { code: '6001', requestUrl: API + '/ds/qkltj/draw-result' }),
    API + '/draws/stream?code=6001&source=qkltj');
  assert.strictEqual(df.streamUrl(API, { code: '6001', requestUrl: 'https://other.example/api/ds/qkltj/draw-result' }), null);
  assert.strictEqual(df.streamUrl(API, { code: '6001', requestUrl: 'https://api.qkltj.com/x?code=1' }), null);
  assert.strictEqual(df.streamUrl(API, { code: '6001', requestUrl: API + '/ds/a/b/draw-result' }), null);
  assert.strictEqual(df.streamUrl(API, { code: '' }), null);
  assert.strictEqual(df.streamUrl('', { code: '201' }), null);
});

test('SSE 解析：事件可被拆成多段到达；注释和心跳忽略；CRLF 也能解析', () => {
  const got = [];
  const feed = df.createParser((name, data) => got.push([name, data]));
  feed(': ok\n\nevent: ready\nda');
  feed('ta: {}\n\n: ping\n\n');
  feed('event: draws\r\ndata: {"rows":[1]}\r\n\r\ndata: x\n\n');
  assert.deepStrictEqual(got, [['ready', '{}'], ['draws', '{"rows":[1]}'], ['message', 'x']]);
});

// 假 fetch：返回可以逐段推数据的流
function fakeServer() {
  const conns = [];
  const fetch = (url, init) => {
    const conn = { url, init, chunks: [], waiters: [], ended: false };
    conn.push = (text) => { conn.chunks.push(new TextEncoder().encode(text)); flush(); };
    conn.end = () => { conn.ended = true; flush(); };
    function flush() {
      while (conn.waiters.length && (conn.chunks.length || conn.ended)) {
        const w = conn.waiters.shift();
        w(conn.chunks.length ? { done: false, value: conn.chunks.shift() } : { done: true });
      }
    }
    conns.push(conn);
    return new Promise((resolve) => {
      conn.respond = (type, json) => resolve({
        headers: { get: () => type },
        json: () => Promise.resolve(json),
        body: type.startsWith('text/event-stream') ? { getReader: () => ({ read: () => new Promise((r) => { conn.waiters.push(r); flush(); }), cancel() {} }) } : null,
      });
    });
  };
  return { conns, fetch };
}

const tick = () => new Promise((r) => setImmediate(r));

function clock() {
  const timers = [];
  return {
    timers,
    setTimeout: (f, ms) => { const t = { f, ms }; timers.push(t); return t; },
    clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    fire: (ms) => { const t = timers.find((x) => x.ms === ms); assert.ok(t, '没有 ' + ms + 'ms 的定时器'); timers.splice(timers.indexOf(t), 1); t.f(); },
  };
}

test('连上收到 ready 才算可用；draws 事件交给回调；带 token 头', async () => {
  const srv = fakeServer();
  const c = clock();
  const events = [];
  const sub = df.subscribe({ url: 'U', token: () => 'tok', fetch: srv.fetch, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
    onReady: () => events.push('ready'), onDraws: (m) => events.push(m) });
  await tick();
  assert.strictEqual(srv.conns.length, 1);
  assert.strictEqual(srv.conns[0].init.headers.token, 'tok');
  srv.conns[0].respond('text/event-stream; charset=utf-8');
  await tick();
  assert.strictEqual(sub.live(), false);
  srv.conns[0].push(': ok\n\nevent: ready\ndata: {}\n\n');
  await tick(); await tick();
  assert.strictEqual(sub.live(), true);
  srv.conns[0].push('event: draws\ndata: {"rows":[{"expect":"9"}],"prev":"8"}\n\n');
  await tick(); await tick();
  assert.deepStrictEqual(events, ['ready', { rows: [{ expect: '9' }], prev: '8' }]);
  sub.close();
  assert.strictEqual(sub.live(), false);
  assert.deepStrictEqual(c.timers, []);
});

test('断开后按 1s、2s… 退避重连，重连成功后退避复位；45 秒没数据视为断开', async () => {
  const srv = fakeServer();
  const c = clock();
  df.subscribe({ url: 'U', token: () => 'tok', fetch: srv.fetch, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout });
  await tick();
  srv.conns[0].respond('text/event-stream');
  await tick();
  srv.conns[0].end();
  await tick(); await tick();
  c.fire(1000);
  await tick();
  assert.strictEqual(srv.conns.length, 2);
  srv.conns[1].respond('text/event-stream');
  await tick();
  srv.conns[1].end();
  await tick(); await tick();
  c.fire(2000);
  await tick();
  srv.conns[2].respond('text/event-stream');
  await tick();
  srv.conns[2].push('event: ready\ndata: {}\n\n');
  await tick(); await tick();
  c.fire(45000);                               // 一直没有数据（心跳也没有）
  c.fire(1000);                                // 收到过 ready，退避已复位
  await tick();
  assert.strictEqual(srv.conns.length, 4);
});

test('登录失效不再重连；其余错误 30 秒后再试；网络错误照常退避', async () => {
  const srv = fakeServer();
  const c = clock();
  let stopped = 0;
  df.subscribe({ url: 'U', token: () => 'tok', fetch: srv.fetch, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, onStop: () => stopped++ });
  await tick();
  srv.conns[0].respond('application/json', { code: 10020, msg: '未登录' });
  await tick(); await tick();
  assert.strictEqual(stopped, 1);
  assert.deepStrictEqual(c.timers, []);

  const srv2 = fakeServer();
  const c2 = clock();
  df.subscribe({ url: 'U', token: () => 'tok', fetch: srv2.fetch, setTimeout: c2.setTimeout, clearTimeout: c2.clearTimeout });
  await tick();
  srv2.conns[0].respond('application/json', { code: 1, msg: '推送连接过多' });
  await tick(); await tick();
  c2.fire(30000);
  await tick();
  assert.strictEqual(srv2.conns.length, 2);

  const c3 = clock();
  let n = 0;
  df.subscribe({ url: 'U', token: () => 'tok', fetch: () => { n++; return Promise.reject(new Error('net')); }, setTimeout: c3.setTimeout, clearTimeout: c3.clearTimeout });
  await tick(); await tick();
  c3.fire(1000);
  await tick(); await tick();
  assert.strictEqual(n, 2);
  assert.strictEqual(c3.timers[0].ms, 2000);
});

test('没有 token（未登录）不连接', async () => {
  let n = 0, stopped = 0;
  df.subscribe({ url: 'U', token: () => null, fetch: () => { n++; }, onStop: () => stopped++ });
  await tick();
  assert.deepStrictEqual([n, stopped], [0, 1]);
});

test('index.html 在业务脚本之前加载 draw-feed.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.html'), 'utf8');
  const i = html.indexOf('app://./draw-feed.js');
  assert.ok(i > 0 && i < html.indexOf('<script type=module src=app://./js/app.'));
});
