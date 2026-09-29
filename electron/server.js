// electron/server.js
// 内嵌 HTTP 服务：同源托管前端静态资源 + /api/* 透明转发上游。
// 无第三方依赖：Node 内置 http + 全局 fetch。
const http = require('http');
const fs = require('fs');
const path = require('path');

const UPSTREAM_DEFAULT = 'https://soft-api.data-ys.com/api';
const PORT_DEFAULT = 46813;

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);
// 响应额外剥离：fetch 已解压 body，content-encoding/length 若透传会让客户端二次解压/长度不符
const RESP_DROP = new Set([...HOP_BY_HOP, 'content-encoding', 'content-length']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function maskToken(t) {
  if (!t) return t;
  return t.length > 8 ? `${t.slice(0, 4)}…${t.slice(-4)}` : '***';
}

async function proxy(req, res, url, upstream, log) {
  const t0 = Date.now();
  const target = upstream + url.pathname.replace(/^\/api/, '') + url.search;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk) || lk === 'host' || lk === 'content-length') continue;
    headers[k] = v;
  }
  try {
    const up = await fetch(target, {
      method: req.method,
      headers,
      body: (req.method === 'GET' || req.method === 'HEAD') ? undefined : body,
    });
    const buf = Buffer.from(await up.arrayBuffer());
    const outHeaders = {};
    up.headers.forEach((v, k) => { if (!RESP_DROP.has(k.toLowerCase())) outHeaders[k] = v; });
    res.writeHead(up.status, outHeaders);
    res.end(buf);
    log(`${req.method} ${url.pathname} -> ${up.status} ${Date.now() - t0}ms token=${maskToken(req.headers.token)}`);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'upstream_unreachable', message: String((e && e.message) || e) }));
    log(`${req.method} ${url.pathname} -> 502 ${Date.now() - t0}ms token=${maskToken(req.headers.token)}`);
  }
}

function serveStatic(req, res, url, clientDir) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const root = path.resolve(clientDir);
  const filePath = path.join(root, path.normalize(rel));
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 找不到文件回 index.html(支持前端路由)；index.html 也缺才 404
      fs.readFile(path.join(root, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('not found'); }
        else { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(d2); }
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function startServer({ port = PORT_DEFAULT, clientDir, upstream = UPSTREAM_DEFAULT, log = console.log } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port || 0}`);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      proxy(req, res, url, upstream, log);
    } else {
      serveStatic(req, res, url, clientDir);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { startServer, maskToken, HOP_BY_HOP, RESP_DROP, PORT_DEFAULT, UPSTREAM_DEFAULT };
