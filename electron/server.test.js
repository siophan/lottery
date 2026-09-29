const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { startServer, maskToken } = require('./server');

function listen(server) {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
}

test('maskToken masks long and short tokens', () => {
  assert.equal(maskToken('abcdefghij'), 'abcd…ghij');
  assert.equal(maskToken('short'), '***');
  assert.equal(maskToken(''), '');
  assert.equal(maskToken(undefined), undefined);
});

test('serves static files with correct mime', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ys-static-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>hi</h1>');
  fs.mkdirSync(path.join(dir, 'js'));
  fs.writeFileSync(path.join(dir, 'js', 'a.js'), 'console.log(1)');
  const { server, port } = await startServer({ port: 0, clientDir: dir, log() {} });
  const r1 = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(r1.status, 200);
  assert.match(await r1.text(), /hi/);
  const r2 = await fetch(`http://127.0.0.1:${port}/js/a.js`);
  assert.equal(r2.headers.get('content-type'), 'text/javascript');
  server.close();
});

test('proxies /api to upstream: full token forwarded, masked only in log', async () => {
  let seenToken;
  const logs = [];
  const upstream = http.createServer((req, res) => {
    seenToken = req.headers.token;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: 1, path: req.url }));
  });
  const uport = await listen(upstream);
  const { server, port } = await startServer({
    port: 0, clientDir: __dirname, upstream: `http://127.0.0.1:${uport}`, log: (m) => logs.push(m),
  });
  const r = await fetch(`http://127.0.0.1:${port}/api/user/info`, { headers: { token: 'abcdefghij' } });
  const j = await r.json();
  assert.equal(j.ok, 1);
  assert.equal(j.path, '/user/info');
  assert.equal(seenToken, 'abcdefghij');
  assert.ok(logs.some((l) => l.includes('abcd…ghij')));
  assert.ok(!logs.some((l) => l.includes('abcdefghij')));
  server.close();
  upstream.close();
});

test('strips content-encoding on proxied response', async () => {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ hello: 'world' })));
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
    res.end(gz);
  });
  const uport = await listen(upstream);
  const { server, port } = await startServer({
    port: 0, clientDir: __dirname, upstream: `http://127.0.0.1:${uport}`, log() {},
  });
  const r = await fetch(`http://127.0.0.1:${port}/api/x`);
  assert.equal(r.headers.get('content-encoding'), null);
  assert.deepEqual(await r.json(), { hello: 'world' });
  server.close();
  upstream.close();
});

test('returns 502 json when upstream unreachable', async () => {
  const { server, port } = await startServer({
    port: 0, clientDir: __dirname, upstream: 'http://127.0.0.1:1', log() {},
  });
  const r = await fetch(`http://127.0.0.1:${port}/api/x`);
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, 'upstream_unreachable');
  server.close();
});
