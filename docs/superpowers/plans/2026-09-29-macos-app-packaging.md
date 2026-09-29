# macOS App Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ys-mac（复用前端 + 转发/算号）整合成一个可双击运行、未签名的 macOS `.app`（并出 `.dmg`）。

**Architecture:** 纯 Electron 单进程应用。主进程用 Node 内嵌一个本地 HTTP 服务（同源托管前端静态资源 + `/api/*` 透明转发上游），preload 用 contextBridge 注入真实 `window.electron.ipcRenderer`，算号 IPC 走本地 JS 引擎（pl3），窗口/更新 IPC 由主进程处理。electron-builder 出未签名产物。

**Tech Stack:** Electron ^33、electron-builder ^25（均 devDependency）；运行时仅 Node 内置模块（http/https/fs/path/zlib）+ 全局 `fetch`；测试用 `node:test`；CommonJS。

## Global Constraints

- 平台 macOS；Node 18+（依赖内置 `fetch` 与 `node:test`）；本机 Node v26。
- 运行时**零第三方依赖**——转发与静态托管只用 Node 内置模块 + 全局 `fetch`。
- devDependencies 仅 `electron` 与 `electron-builder`。
- 固定本地端口 **46813**；前端 `apiURL` 端口必须与之严格一致，端口不可动态递增。
- 上游固定 `https://soft-api.data-ys.com/api`。
- 测试**绝不**访问真实 `data-ys.com`——一律用本地 mock 上游。
- 转发日志对 `token` 请求头打码（`前4…后4`，长度≤8 用 `***`），绝不落明文；token 本身原样转发给上游。
- 全部新代码用 CommonJS（与现有 `src/engine/pl3.js` 一致）。
- 算号范围：本 plan 仅支持"排列三、且 `play` 条件按 pl3 引擎字段（`id` ∈ 7 个 plsr30xx，配 `arr`/`pos`/`kai`/`reaction` 等）给出"的情形；其余一律优雅 `fail`。前端各玩法的真实 `play` 字段接入是后续工作项，不在本 plan。
- 每个 commit message 结尾附：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

```
ys-mac/
  electron/
    server.js            # 内嵌 HTTP：静态前端 + /api 转发上游 + 打码日志 + 502 降级
    server.test.js       # server 单测(mock 上游)
    arithmetic-core.js   # parameter → pl3 → showResult 契约格式(纯函数)
    arithmetic-core.test.js
    preload.js           # contextBridge 暴露 ipcRenderer(白名单)
    main.js              # app 入口：启动服务 + 建窗口 + 注册 IPC
    ipc/
      arithmetic.js      # 绑定 arithmetic → computeArithmetic → reply showResult
      window.js          # close / minimize / getsub
      update.js          # checkForUpdate / runInstaller 占位
  client/
    js/app.9ba1133b.js   # 修改：apiURL 端口 8000 → 46813
  src/engine/pl3.js      # 现有引擎(不改)，被 arithmetic-core 调用
  build/icon.png         # 打包图标(由 favicon 转)
  package.json           # 新建：main/scripts/build/devDeps
  README.md              # 新建：构建与运行说明
```

---

### Task 1: 内嵌 HTTP 服务 (server.js)

**Files:**
- Create: `electron/server.js`
- Test: `electron/server.test.js`

**Interfaces:**
- Produces: `startServer({ port, clientDir, upstream, log }) -> Promise<{ server, port }>`
  （`port:0` 时由 OS 选端口，返回的 `port` 为实际端口）；`maskToken(t) -> string`；
  常量 `HOP_BY_HOP`、`RESP_DROP`。

- [ ] **Step 1: 写失败测试** — `electron/server.test.js`

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test electron/server.test.js`
Expected: FAIL — `Cannot find module './server'`

- [ ] **Step 3: 实现 server.js**

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test electron/server.test.js`
Expected: PASS（5 个测试全过）

- [ ] **Step 5: Commit**

```bash
git add electron/server.js electron/server.test.js
git commit -m "feat(electron): embedded HTTP server for static hosting and API proxy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 算号计算模块 (arithmetic-core.js)

**Files:**
- Create: `electron/arithmetic-core.js`
- Test: `electron/arithmetic-core.test.js`

**Interfaces:**
- Consumes: `require('../src/engine/pl3')` 的 `filter(play)`（现有，返回号码字符串数组）。
- Produces: `computeArithmetic(parameterJson) -> { result:'success', data:string } | { result:'fail', message:string }`
  （`data` = `JSON.stringify({ Result: JSON.stringify(<号码数组>) })`，匹配前端 `showResult` 消费契约）；
  `PL3_IDS`（Set，7 个受支持条件 id）。

- [ ] **Step 1: 写失败测试** — `electron/arithmetic-core.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { computeArithmetic } = require('./arithmetic-core');

test('computes 排列三 和值=1 into showResult contract', () => {
  const param = JSON.stringify({ type_id: 104, cat: 'p3', play: [{ id: 'plsr3002', arr: [1] }] });
  const r = computeArithmetic(param);
  assert.equal(r.result, 'success');
  const data = JSON.parse(r.data);
  const nums = JSON.parse(data.Result);
  assert.deepEqual(nums, ['001', '010', '100']);
});

test('supports multiple pl3 conditions (AND)', () => {
  const param = JSON.stringify({ play: [{ id: 'plsr3002', arr: [1] }, { id: 'plsr3004', arr: [1] }] });
  const r = computeArithmetic(param);
  assert.equal(r.result, 'success');
  assert.deepEqual(JSON.parse(JSON.parse(r.data).Result), ['001', '010', '100']);
});

test('fails on unsupported condition id', () => {
  assert.equal(computeArithmetic(JSON.stringify({ play: [{ id: 'unknown999' }] })).result, 'fail');
});

test('fails on invalid json', () => {
  assert.equal(computeArithmetic('{bad').result, 'fail');
});

test('fails on empty or missing play', () => {
  assert.equal(computeArithmetic(JSON.stringify({ play: [] })).result, 'fail');
  assert.equal(computeArithmetic(JSON.stringify({})).result, 'fail');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test electron/arithmetic-core.test.js`
Expected: FAIL — `Cannot find module './arithmetic-core'`

- [ ] **Step 3: 实现 arithmetic-core.js**

```js
// electron/arithmetic-core.js
// 把前端 arithmetic 的 parameter 映射到本地 JS 算号引擎(pl3)，
// 产出前端 showResult 期望的契约：
//   { result:'success', data: JSON.stringify({ Result: JSON.stringify(<号码数组>) }) }
//   或 { result:'fail', message }
// 当前仅支持"排列三、play 按 pl3 引擎字段给出"的情形；其余优雅 fail。
// 前端各玩法真实 play 字段的接入是后续工作项。
const { filter } = require('../src/engine/pl3');

const PL3_IDS = new Set([
  'plsr3001', 'plsr3002', 'plsr3004', 'plsr3009', 'plsr3015', 'plsr3023', 'plsr3025',
]);

function fail(message) { return { result: 'fail', message }; }

function isPl3Cond(c) {
  return !!c && typeof c === 'object' && PL3_IDS.has(c.id);
}

function computeArithmetic(parameterJson) {
  let p;
  try { p = JSON.parse(parameterJson); } catch { return fail('参数解析失败'); }
  const play = p && Array.isArray(p.play) ? p.play : null;
  if (!play || play.length === 0) return fail('缺少 play 条件');
  if (!play.every(isPl3Cond)) return fail('该玩法/条件暂未支持');
  let nums;
  try { nums = filter(play); } catch (e) { return fail('算号失败: ' + ((e && e.message) || e)); }
  return { result: 'success', data: JSON.stringify({ Result: JSON.stringify(nums) }) };
}

module.exports = { computeArithmetic, PL3_IDS };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test electron/arithmetic-core.test.js`
Expected: PASS（5 个测试全过）

- [ ] **Step 5: Commit**

```bash
git add electron/arithmetic-core.js electron/arithmetic-core.test.js
git commit -m "feat(electron): arithmetic core mapping parameter to pl3 engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Electron 外壳与 IPC (main/preload/ipc) + 前端端口对齐

**Files:**
- Create: `package.json`（根）、`electron/preload.js`、`electron/main.js`、
  `electron/ipc/arithmetic.js`、`electron/ipc/window.js`、`electron/ipc/update.js`
- Modify: `client/js/app.9ba1133b.js`（apiURL 端口 8000 → 46813）

**Interfaces:**
- Consumes: `startServer`（Task 1）、`computeArithmetic`（Task 2）。
- Produces: 可 `npm start` 起 Electron 的应用；`electron/ipc/<name>.js` 各导出 `register(ipcMain)`。

**说明：** 本任务的产物依赖 Electron GUI，自动化单测无法覆盖窗口/IPC 集成；
以 Task 1/2 的自动化测试 + `npm start` 手动冒烟为验收。冒烟需在有图形界面的 macOS 会话进行。

- [ ] **Step 1: 创建根 package.json**

```json
{
  "name": "ys-mac",
  "version": "1.0.0",
  "description": "赢晟 数据/选号工具 macOS 版",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "test": "node --test electron/",
    "test:engine": "node src/engine/pl3.test.js"
  },
  "devDependencies": {
    "electron": "^33.0.0"
  }
}
```

- [ ] **Step 2: 安装 electron**

Run: `npm install`
Expected: `node_modules/electron` 出现（首次会下载 Electron 二进制，需联网）。

- [ ] **Step 3: 实现 preload.js**

```js
// electron/preload.js
// 用 contextBridge 暴露真实 ipcRenderer(白名单)，取代浏览器阶段的 no-op 垫片。
const { contextBridge, ipcRenderer } = require('electron');

const SEND = new Set(['arithmetic', 'getsub', 'close', 'minimize', 'checkForUpdate', 'runInstaller']);
const RECV = new Set(['showResult']);

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, arg) => { if (SEND.has(channel)) ipcRenderer.send(channel, arg); },
    on: (channel, listener) => { if (RECV.has(channel)) ipcRenderer.on(channel, listener); },
    once: (channel, listener) => { if (RECV.has(channel)) ipcRenderer.once(channel, listener); },
    removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
    invoke: () => Promise.resolve(),
  },
});
```

- [ ] **Step 4: 实现 ipc/arithmetic.js**

```js
// electron/ipc/arithmetic.js
const { computeArithmetic } = require('../arithmetic-core');

function register(ipcMain) {
  ipcMain.on('arithmetic', (event, arg) => {
    const out = computeArithmetic(arg && arg.parameter);
    event.reply('showResult', out);
  });
}

module.exports = { register };
```

- [ ] **Step 5: 实现 ipc/window.js**

```js
// electron/ipc/window.js
const { BrowserWindow } = require('electron');

function register(ipcMain) {
  ipcMain.on('minimize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) w.minimize();
  });
  ipcMain.on('close', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) w.close();
  });
  // getsub 原用于打开子视图；Mac 版先占位记录，不阻塞主流程
  ipcMain.on('getsub', (e, arg) => {
    console.log('[ipc] getsub (占位，暂不开子窗):', arg && arg.interface);
  });
}

module.exports = { register };
```

- [ ] **Step 6: 实现 ipc/update.js**

```js
// electron/ipc/update.js
// Mac 版不做自动更新，占位吞掉相关 IPC。
function register(ipcMain) {
  ipcMain.on('checkForUpdate', () => { console.log('[ipc] checkForUpdate: Mac 版不自动更新'); });
  ipcMain.on('runInstaller', () => { console.log('[ipc] runInstaller: 忽略'); });
}

module.exports = { register };
```

- [ ] **Step 7: 实现 main.js**

```js
// electron/main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { startServer, PORT_DEFAULT } = require('./server');

const PORT = PORT_DEFAULT; // 46813
const CLIENT_DIR = path.join(__dirname, '..', 'client');

let serverRef = null;

async function boot() {
  try {
    const { server } = await startServer({ port: PORT, clientDir: CLIENT_DIR });
    serverRef = server;
  } catch (e) {
    dialog.showErrorBox('启动失败', `本地端口 ${PORT} 被占用或服务无法启动：\n${(e && e.message) || e}`);
    app.quit();
    return;
  }

  require('./ipc/window').register(ipcMain);
  require('./ipc/update').register(ipcMain);
  require('./ipc/arithmetic').register(ipcMain);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(boot);

app.on('window-all-closed', () => {
  if (serverRef) serverRef.close();
  app.quit();
});
```

- [ ] **Step 8: 前端 apiURL 端口对齐**

Run:
```bash
perl -pi -e 's{127\.0\.0\.1:8000/api}{127.0.0.1:46813/api}g' client/js/app.9ba1133b.js
grep -c '127.0.0.1:46813/api' client/js/app.9ba1133b.js
```
Expected: 输出 `1`（apiURL 已指向 46813）。

- [ ] **Step 9: 冒烟——起 app 验证登录页 + 一次算号通道**

Run: `npm start`
Expected（人工确认）：
1. 弹出应用窗口，显示"赢晟"登录页（软件编号/密码表单）。
2. 终端出现内嵌服务日志（登录时会有 `POST /api/... -> <状态码>`）。
3. 窗口的最小化/关闭按钮可用。

若当前会话无 GUI，跳过本步、标注"待有界面会话冒烟"，不阻塞后续任务（自动化测试已覆盖 server/core 逻辑）。

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json electron/preload.js electron/main.js electron/ipc client/js/app.9ba1133b.js
git commit -m "feat(electron): app shell, preload bridge, IPC handlers, and client port alignment

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 打包与文档 (electron-builder + 图标 + README)

**Files:**
- Modify: `package.json`（加 electron-builder devDep、`build` 配置、`dist` 脚本）
- Create: `build/icon.png`、`README.md`

**Interfaces:**
- Consumes: Task 3 的完整 Electron 应用。
- Produces: `dist/` 下未签名的 `.app` 与 `.dmg`。

- [ ] **Step 1: 生成打包图标**

Run:
```bash
mkdir -p build
sips -s format png -z 512 512 client/favicon.ico --out build/icon.png
ls -l build/icon.png
```
Expected: `build/icon.png` 存在（512×512 PNG）。

- [ ] **Step 2: 安装 electron-builder 并加打包配置**

先安装：
```bash
npm install --save-dev electron-builder@^25.0.0
```

再把 `package.json` 更新为（在 Task 3 基础上加 `dist` 脚本、`electron-builder` devDep、`build` 段）：

```json
{
  "name": "ys-mac",
  "version": "1.0.0",
  "description": "赢晟 数据/选号工具 macOS 版",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "test": "node --test electron/",
    "test:engine": "node src/engine/pl3.test.js",
    "dist": "electron-builder --mac"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0"
  },
  "build": {
    "appId": "com.yingsheng.ysmac",
    "productName": "赢晟",
    "directories": { "output": "dist" },
    "files": ["electron/**/*", "client/**/*", "src/engine/**/*", "package.json"],
    "mac": {
      "target": ["dmg", "dir"],
      "identity": null,
      "icon": "build/icon.png"
    }
  }
}
```

- [ ] **Step 3: 确认自动化测试仍全绿**

Run: `npm test && npm run test:engine`
Expected: `node --test electron/` 全过（server 5 + arithmetic 5）；pl3 引擎 16 过。

- [ ] **Step 4: 打包**

Run: `npm run dist`
Expected: `dist/mac*/赢晟.app` 与 `dist/赢晟-1.0.0*.dmg` 生成（未签名，`identity: null`）。

- [ ] **Step 5: 打包产物冒烟**

Run: `open "dist/mac-arm64/赢晟.app" 2>/dev/null || open dist/mac*/*.app`
Expected（人工确认）：首次打开若被 Gatekeeper 拦，右键 → 打开；应用启动显示登录页。
（无 GUI 会话则标注"待有界面会话冒烟"。）

- [ ] **Step 6: 写 README.md**

创建 `README.md`：

```markdown
# 赢晟 macOS 版 (ys-mac)

原 Windows Electron 应用的 macOS 打包版：纯 Electron，主进程内嵌本地 HTTP
服务（同源托管前端 + `/api` 转发上游 `soft-api.data-ys.com`），算号走本地 JS 引擎。

## 开发运行
```bash
npm install
npm start
```
应用起本地服务于 `http://127.0.0.1:46813`，窗口加载该地址。

## 测试
```bash
npm test          # 内嵌服务 + 算号核心(node:test)
npm run test:engine  # 排列三过滤引擎(16 项)
```

## 打包
```bash
npm run dist
```
产物在 `dist/`：未签名 `.app` 与 `.dmg`。首次打开：右键 → 打开，绕过 Gatekeeper。

## 已知范围
- 算号目前仅支持排列三、且条件按引擎字段给出的情形；其他玩法显示"暂不支持"。
- 窗口最小化/关闭已实现；`getsub` 子窗口、自动更新为占位。
- 未做 Apple 签名/公证（自用）。
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json build/icon.png README.md
git commit -m "build(electron): electron-builder packaging config, icon, and README

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 说明：与现有资产的关系

- 现有 Python `backend/` 保留在仓库作参考，不参与打包（其转发逻辑已翻译进 `electron/server.js`）。
- 浏览器阶段注入的 `client/electron-shim.js` 在 Electron 里由真实 preload 取代；其 `if (window.electron...) return` 守卫使它在 preload 先注入时自动跳过，无需删除。
- `client/js/app.9ba1133b.js` 的 `app://` → `/` 改动（上一阶段完成）保留，是内嵌 http 同源加载的前提。
