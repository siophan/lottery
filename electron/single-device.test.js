// 单设备登录：主进程 device-session.js（设备码、请求头、被挤下线回登录页、退出注销）与渲染进程 session-guard.js（心跳）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const ds = require('./device-session');
const guard = require('../client/session-guard');

const REG_OUT = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    3F2504E0-4F89-11D3-9A0C-0305E82C3301\r\n\r\n';
const IOREG_OUT = '+-o J316sAP  <class IOPlatformExpertDevice>\n    {\n      "IOPlatformSerialNumber" = "XYZ"\n      "IOPlatformUUID" = "A1B2C3D4-0000-1111-2222-333344445555"\n    }\n';

test('解析 Windows MachineGuid / Mac IOPlatformUUID', () => {
  assert.strictEqual(ds.parseMachineGuid(REG_OUT), '3f2504e0-4f89-11d3-9a0c-0305e82c3301');
  assert.strictEqual(ds.parsePlatformUuid(IOREG_OUT), 'a1b2c3d4-0000-1111-2222-333344445555');
  assert.strictEqual(ds.parseMachineGuid(''), null);
  assert.strictEqual(ds.parsePlatformUuid('nothing'), null);
});

test('Windows 先读 64 位注册表视图，读不到再退回默认视图', () => {
  const calls = [];
  const id = ds.readHardwareId('win32', (file, args) => {
    calls.push(args);
    return args.includes('/reg:64') ? '' : REG_OUT;
  });
  assert.strictEqual(id, '3f2504e0-4f89-11d3-9a0c-0305e82c3301');
  assert.deepStrictEqual(calls.map((a) => a.includes('/reg:64')), [true, false]);
  assert.ok(calls[0].join(' ').includes('HKLM\\SOFTWARE\\Microsoft\\Cryptography'));
});

test('设备码：同一硬件码结果稳定、是 32 位十六进制、不含原始硬件码；取不到时用保存的随机码', () => {
  const exec = () => REG_OUT;
  const a = ds.computeDeviceId({ platform: 'win32', exec });
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.strictEqual(a, ds.computeDeviceId({ platform: 'win32', exec }));
  assert.ok(!a.includes('3f2504e0'));
  assert.notStrictEqual(a, ds.computeDeviceId({ platform: 'darwin', exec: () => IOREG_OUT }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ys-dev-'));
  const r1 = ds.computeDeviceId({ platform: 'win32', exec: () => '', userDataDir: dir });
  const r2 = ds.computeDeviceId({ platform: 'win32', exec: () => '', userDataDir: dir });
  assert.strictEqual(r1, r2);                                        // 随机码存在用户数据目录，下次启动不变
  assert.match(fs.readFileSync(path.join(dir, 'device-id'), 'utf8'), /^[0-9a-f]{32}$/);
  // 服务端 gate.DEVICE_RE 要求 16-128 位 [A-Za-z0-9_-]
  assert.match(r1, /^[A-Za-z0-9_-]{16,128}$/);
});

test('设备名：URL 编码的「计算机名 (系统)」，请求头只含 ASCII', () => {
  const n = ds.deviceName('win32', '前台电脑');
  assert.strictEqual(decodeURIComponent(n), '前台电脑 (Windows)');
  assert.match(n, /^[\x21-\x7e]+$/);
  assert.strictEqual(decodeURIComponent(ds.deviceName('darwin', 'x'.repeat(80))), 'x'.repeat(48) + ' (Mac)');
  assert.strictEqual(decodeURIComponent(ds.deviceName('darwin', 'mini-2.tail4dd1fd.ts.net')), 'mini-2 (Mac)');
});

test('请求头：加上设备码（覆盖页面自带的任意大小写同名头），返回请求里的 token', () => {
  const h = { 'x-device-id': 'forged', Token: 'TOK1', Accept: '*/*' };
  assert.strictEqual(ds.stampHeaders(h, 'DEV', 'NAME'), 'TOK1');
  assert.deepStrictEqual(h, { Token: 'TOK1', Accept: '*/*', 'X-Device-Id': 'DEV', 'X-Device-Name': 'NAME' });
  assert.strictEqual(ds.stampHeaders({ token: 'null' }, 'D', 'N'), null);
  assert.strictEqual(ds.stampHeaders({}, 'D', 'N'), null);
});

test('回登录页：主窗口地址去掉 #/路由', () => {
  assert.strictEqual(ds.loginUrlOf('app://./index.html#/index'), 'app://./index.html');
  assert.strictEqual(ds.loginUrlOf('app://./index.html'), 'app://./index.html');
});

// ---- install()：用桩代替 Electron ----
function fakeWin(name) {
  const w = new EventEmitter();
  Object.assign(w, {
    name, destroyed: false, closed: 0, sent: [], size: null, centered: 0, loaded: null, shown: 0,
    isDestroyed() { return this.destroyed; }, close() { this.closed++; this.destroyed = true; },
    isMinimized() { return false; }, restore() {}, show() { this.shown++; }, focus() {},
    isMaximized() { return true; }, unmaximize() { this.unmax = true; },
    setSize(w2, h2) { this.size = [w2, h2]; }, center() { this.centered++; },
    loadURL(u) { this.loaded = u; },
    webContents: { send: (...a) => w.sent.push(a), getURL: () => 'app://./index.html#/index' },
  });
  return w;
}

function setup({ fetchImpl } = {}) {
  const app = new EventEmitter();
  app.quits = 0;
  app.quit = () => { app.quits++; app.emit('before-quit', { preventDefault() { app.prevented = (app.prevented || 0) + 1; } }); };
  const ipcMain = new EventEmitter();
  const main = fakeWin('main');
  const sub1 = fakeWin('kline');
  const sub2 = fakeWin('trend');
  const wins = [main, sub1, sub2];
  const BrowserWindow = { getAllWindows: () => wins.filter((w) => !w.destroyed) };
  global.mainwindow = main;
  let hook = null;
  const session = { webRequest: { onBeforeSendHeaders: (filter, fn) => { hook = { filter, fn }; } } };
  const fetches = [];
  const net = { fetch: fetchImpl || ((url, init) => { fetches.push([url, init]); return Promise.resolve({ ok: true }); }) };
  const logs = [];
  const ctl = ds.install({ app, session, ipcMain, BrowserWindow, net, deviceId: 'DEVICE0123456789', name: 'PC%20(Mac)', log: (m) => logs.push(m) });
  const request = (url, headers) => new Promise((resolve) => hook.fn({ url, requestHeaders: headers }, (r) => resolve(r.requestHeaders)));
  return { app, ipcMain, main, sub1, sub2, hook, fetches, ctl, request, logs };
}

test('回登录页的窗口位置：在所在屏幕居中（与原版启动时一致）', () => {
  assert.deepStrictEqual(ds.loginBounds({ x: 0, y: 0, width: 1920, height: 1080 }), { x: 615, y: 305, width: 690, height: 470 });
  assert.deepStrictEqual(ds.loginBounds({ x: 1920, y: 0, width: 1280, height: 800 }), { x: 2215, y: 165, width: 690, height: 470 });
});

test('install：只给我方接口加设备头，并记下最近的 token', async () => {
  const s = setup();
  assert.deepStrictEqual(s.hook.filter, { urls: ['https://lottery.jh8.ai/api/*'] });
  const out = await s.request('https://lottery.jh8.ai/api/user/isExpire', { token: 'T1' });
  assert.strictEqual(out['X-Device-Id'], 'DEVICE0123456789');
  assert.strictEqual(out['X-Device-Name'], 'PC%20(Mac)');
  assert.strictEqual(s.ctl.lastToken, 'T1');
  await s.request('https://lottery.jh8.ai/api/auth/logout', { token: 'OTHER' });
  assert.strictEqual(s.ctl.lastToken, 'T1');                          // 注销请求本身不改记录
});

test('关闭软件：所有窗口关闭时注销本会话（带 token 与设备码），退出等注销完成', async () => {
  const s = setup();
  await s.request('https://lottery.jh8.ai/api/x', { token: 'T1' });
  s.app.quit();                                                       // Windows：原版 window-all-closed 里先 quit
  assert.strictEqual(s.app.prevented, 1);
  s.app.emit('window-all-closed');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(s.fetches.length, 1);
  const [url, init] = s.fetches[0];
  assert.strictEqual(url, 'https://lottery.jh8.ai/api/auth/logout');
  assert.strictEqual(init.method, 'POST');
  assert.strictEqual(init.headers.token, 'T1');
  assert.strictEqual(init.headers['X-Device-Id'], 'DEVICE0123456789');
  assert.strictEqual(s.app.quits, 2);                                 // 注销后再次 quit，这次不再拦
  assert.strictEqual(s.app.prevented, 1);
});

test('Mac：关掉全部窗口即注销；之后 Cmd+Q 不再重复注销；没登录过不注销', async () => {
  const s = setup();
  s.app.emit('before-quit', { preventDefault() { throw new Error('不应拦截'); } });   // 没有 token
  await s.request('https://lottery.jh8.ai/api/x', { token: 'T1' });
  s.app.emit('window-all-closed');
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(s.fetches.length, 1);
  s.app.emit('before-quit', { preventDefault() { throw new Error('不应拦截'); } });
  s.app.emit('window-all-closed');
  assert.strictEqual(s.fetches.length, 1);
  await s.request('https://lottery.jh8.ai/api/x', { token: 'T2' });  // 重新登录后再关闭：注销新会话
  s.app.emit('window-all-closed');
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(s.fetches.length, 2);
  assert.strictEqual(s.fetches[1][1].headers.token, 'T2');
});

test('注销失败（断网）也照常退出', async () => {
  const s = setup({ fetchImpl: () => Promise.reject(new Error('offline')) });
  await s.request('https://lottery.jh8.ai/api/x', { token: 'T1' });
  s.app.quit();
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(s.app.quits, 2);
  assert.ok(s.logs.some((m) => m.includes('注销失败')));
});

test('被挤下线：关掉主窗口以外的窗口，主窗口弹提示；确定后回登录页（登录窗大小、居中、去掉路由）', async () => {
  const s = setup();
  await s.request('https://lottery.jh8.ai/api/x', { token: 'T1' });
  s.ipcMain.emit('dsKicked', {}, { code: 10021, msg: '该账号已在其他设备登录，您已被强制下线，请重新登录' });
  assert.strictEqual(s.sub1.closed, 1);
  assert.strictEqual(s.sub2.closed, 1);
  assert.strictEqual(s.main.closed, 0);
  assert.deepStrictEqual(s.main.sent, [['dsKicked', { code: 10021, msg: '该账号已在其他设备登录，您已被强制下线，请重新登录' }]]);
  s.ipcMain.emit('dsKicked', {}, { code: 10021, msg: 'again' });     // 多个窗口 / 心跳同时发现：只处理一次
  assert.strictEqual(s.main.sent.length, 1);
  s.ipcMain.emit('dsBackToLogin', {});
  assert.deepStrictEqual(s.main.size, [690, 470]);
  assert.strictEqual(s.main.centered, 1);
  assert.strictEqual(s.main.loaded, 'app://./index.html');
  assert.strictEqual(s.main.unmax, true);
  // 会话已在服务端作废：之后关闭软件不再注销
  s.app.emit('window-all-closed');
  assert.strictEqual(s.fetches.length, 0);
  s.ipcMain.emit('dsKicked', {}, { code: 10020, msg: 'x' });          // 回到登录页后再次下线可以再处理
  assert.strictEqual(s.main.sent.length, 2);
});

// ---- 渲染进程 session-guard ----
function guardSetup({ token = 'TOK', responses = [] } = {}) {
  const sent = [];
  const handlers = {};
  const ipc = { send: (...a) => sent.push(a), on: (ch, fn) => { handlers[ch] = fn; } };
  const store = { token, userInfo: '{}', product: 'p', dsPoints: '5', other: 'keep' };
  const storage = { getItem: (k) => (k in store ? store[k] : null), removeItem: (k) => { delete store[k]; } };
  const fetches = [];
  const fetchImpl = (url, init) => {
    fetches.push([url, init]);
    const r = responses.shift();
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve({ json: () => Promise.resolve(r) });
  };
  const timers = { ids: [], set(fn, ms) { this.ids.push([fn, ms]); return this.ids.length; }, clear(id) { this.cleared = id; } };
  const g = guard.create({ ipc, fetch: fetchImpl, storage, timers });
  return { g, sent, handlers, store, fetches, timers };
}

test('心跳：每 15 秒 POST apiURL/auth/heartbeat（带 token）；会话有效时什么都不做', async () => {
  const s = guardSetup({ responses: [{ code: 0 }] });
  await s.g.start({ apiURL: 'https://lottery.jh8.ai/api' });
  assert.deepStrictEqual(s.timers.ids.map((x) => x[1]), [15000]);
  assert.strictEqual(s.fetches[0][0], 'https://lottery.jh8.ai/api/auth/heartbeat');
  assert.strictEqual(s.fetches[0][1].method, 'POST');
  assert.strictEqual(s.fetches[0][1].headers.token, 'TOK');
  assert.deepStrictEqual(s.sent, []);
  s.g.start({});                                                      // 重复 start 不叠加定时器
  assert.strictEqual(s.timers.ids.length, 1);
  s.g.stop();
  assert.strictEqual(s.g.running, false);
});

test('心跳收到 10021 / 10020 等 → 通知主进程下线（带服务端提示）；断网不算下线', async () => {
  for (const code of [10020, 10021, 10022, 10024, 10025]) {
    const s = guardSetup({ responses: [{ code, msg: 'M' + code }] });
    await s.g.start({ apiURL: 'A' });
    assert.deepStrictEqual(s.sent, [['dsKicked', { code, msg: 'M' + code }]], String(code));
  }
  const off = guardSetup({ responses: [new Error('offline'), { code: 1, msg: 'busy' }] });
  await off.g.start({ apiURL: 'A' });
  await off.g.beat();
  assert.deepStrictEqual(off.sent, []);
});

test('没有 token（未登录）不心跳；心跳期间换了 token 的结果作废', async () => {
  const s = guardSetup({ token: null });
  await s.g.start({ apiURL: 'A' });
  assert.strictEqual(s.fetches.length, 0);
  const t = guardSetup({ responses: [{ code: 10021, msg: 'x' }] });
  const p = t.g.start({ apiURL: 'A' });
  t.store.token = 'NEW';
  await p;
  assert.deepStrictEqual(t.sent, []);
});

test('主窗口收到下线通知：只弹一次，确定后清本地登录信息并请求回登录页，心跳停止', async () => {
  const s = guardSetup({ responses: [{ code: 0 }] });
  await s.g.start({ apiURL: 'A' });
  const shown = [];
  s.g.onKicked({ msg: '该账号已在其他设备登录，您已被强制下线，请重新登录' }, (msg, done) => shown.push([msg, done]));
  s.g.onKicked({ msg: 'again' }, (msg, done) => shown.push([msg, done]));
  assert.strictEqual(shown.length, 1);
  assert.strictEqual(shown[0][0], '该账号已在其他设备登录，您已被强制下线，请重新登录');
  assert.strictEqual(s.g.running, false);
  assert.strictEqual(s.store.token, 'TOK');                          // 点确定前不清
  shown[0][1]();
  for (const k of ['token', 'userInfo', 'product', 'dsPoints']) assert.ok(!(k in s.store), k);
  assert.strictEqual(s.store.other, 'keep');
  assert.deepStrictEqual(s.sent, [['dsBackToLogin']]);
  await s.g.beat();
  assert.strictEqual(s.fetches.length, 1);                            // 弹窗后不再心跳
  assert.strictEqual(typeof s.handlers.dsKicked, 'function');         // 主进程转来的通知走 ipc
});

test('非 Electron（没有 ipc）：kicked 返回 false，交回原版处理', () => {
  const g = guard.create({ ipc: null, fetch: () => Promise.reject(new Error('x')), storage: { getItem: () => null } });
  assert.strictEqual(g.kicked(10021, 'x'), false);
});

test('提示框：用根 Vue 实例的 $alert（不带关闭按钮），确定后回调；没有 Vue 时退回 alert', async () => {
  const done = [];
  const calls = [];
  const env = { document: { getElementById: (id) => (id === 'app' ? { __vue__: { $alert: (...a) => { calls.push(a); return Promise.resolve('confirm'); } } } : null) } };
  guard.showAlert('提示内容', () => done.push('vue'), env);
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(done, ['vue']);
  assert.strictEqual(calls[0][0], '提示内容');
  assert.strictEqual(calls[0][1], '提示');
  assert.strictEqual(calls[0][2].showClose, false);
  const alerts = [];
  guard.showAlert('没有 Vue', () => done.push('plain'), { document: { getElementById: () => null }, alert: (m) => alerts.push(m) });
  assert.deepStrictEqual(alerts, ['没有 Vue']);
  assert.deepStrictEqual(done, ['vue', 'plain']);
});
