// electron/device-session.js
// 单设备登录（主进程侧）：
//   1) 本机设备码：Windows 读系统 MachineGuid、Mac 读 IOPlatformUUID（都取不到时在用户数据目录生成一个并保存），
//      加盐做 SHA-256 取前 32 位十六进制，不把原始硬件码发出去；
//   2) 给发往我方接口的每个请求加 X-Device-Id / X-Device-Name（所有窗口、iframe、fetch、推送长连接都经过这里），
//      并记下请求里最近一次的登录 token，供退出时注销；
//   3) 被挤下线（渲染进程发 dsKicked）：先关掉主窗口以外的所有窗口，再让主窗口弹提示；
//      用户点确定后（dsBackToLogin）主窗口恢复登录窗大小并回到登录页；
//   4) 关闭软件：所有窗口关闭 / 退出前向服务端注销本会话（最多等 1.5 秒），账号可立即在其他电脑登录。
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const API_PATTERNS = ['https://lottery.jh8.ai/api/*'];   // 与前端 apiURL 一致（client/js/app.*.js 的 f121 模块）
const LOGOUT_URL = 'https://lottery.jh8.ai/api/auth/logout';
const LOGIN_SIZE = { width: 690, height: 470 };         // 原版登录窗大小（background.js 建窗、登录页 changeWindowSize）
const LOGOUT_TIMEOUT = 1500;

function parseMachineGuid(out) {
  const m = /MachineGuid\s+REG_SZ\s+([0-9A-Fa-f-]{16,})/.exec(String(out || ''));
  return m ? m[1].toLowerCase() : null;
}

function parsePlatformUuid(out) {
  const m = /"IOPlatformUUID"\s*=\s*"([0-9A-Fa-f-]{16,})"/.exec(String(out || ''));
  return m ? m[1].toLowerCase() : null;
}

function hashDevice(raw) {
  return crypto.createHash('sha256').update('ys-device:' + raw).digest('hex').slice(0, 32);
}

function run(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return '';
  }
}

// 硬件特征码原文；取不到返回 null
function readHardwareId(platform = process.platform, exec = run) {
  if (platform === 'win32') {
    const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
    const key = 'HKLM\\SOFTWARE\\Microsoft\\Cryptography';
    // 32 位客户端跑在 64 位系统上：/reg:64 读 64 位注册表视图（MachineGuid 只在那里）；32 位系统不认就退回不带
    return parseMachineGuid(exec(reg, ['query', key, '/v', 'MachineGuid', '/reg:64']))
      || parseMachineGuid(exec(reg, ['query', key, '/v', 'MachineGuid']));
  }
  if (platform === 'darwin') {
    return parsePlatformUuid(exec('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']));
  }
  try {
    const id = fs.readFileSync('/etc/machine-id', 'utf8').trim();
    return id.length >= 16 ? id : null;
  } catch (e) {
    return null;
  }
}

// 硬件码取不到时的兜底：用户数据目录里的随机码（重装系统 / 清数据后会变）
function fallbackId(dir) {
  const file = path.join(dir, 'device-id');
  try {
    const v = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{32}$/.test(v)) return v;
  } catch (e) { /* 没有就新建 */ }
  const v = crypto.randomBytes(16).toString('hex');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, v);
  } catch (e) { /* 写不了也照常用本次的 */ }
  return v;
}

function computeDeviceId({ platform, exec, userDataDir } = {}) {
  const raw = readHardwareId(platform, exec);
  return hashDevice(raw ? 'hw:' + raw : 'rnd:' + fallbackId(userDataDir || os.tmpdir()));
}

function deviceName(platform = process.platform, hostname = os.hostname()) {
  const sys = { win32: 'Windows', darwin: 'Mac', linux: 'Linux' }[platform] || platform;
  const host = String(hostname || '').split('.')[0].slice(0, 48);     // 只取计算机名，去掉域名后缀
  return encodeURIComponent(`${host} (${sys})`);
}

// 登录窗位置：与原版启动时一样在所在屏幕居中
function loginBounds(display) {
  const d = display || { x: 0, y: 0, width: LOGIN_SIZE.width, height: LOGIN_SIZE.height };
  return {
    x: Math.round(d.x + (d.width - LOGIN_SIZE.width) / 2),
    y: Math.round(d.y + (d.height - LOGIN_SIZE.height) / 2),
    width: LOGIN_SIZE.width,
    height: LOGIN_SIZE.height,
  };
}

function headerValue(headers, name) {
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name);
  return k === undefined ? undefined : headers[k];
}

// 给请求头加设备码；返回请求里带的 token（没有为 null）
function stampHeaders(headers, id, name) {
  for (const k of Object.keys(headers)) {
    const lk = k.toLowerCase();
    if (lk === 'x-device-id' || lk === 'x-device-name') delete headers[k];
  }
  headers['X-Device-Id'] = id;
  headers['X-Device-Name'] = name;
  const tok = headerValue(headers, 'token');
  return tok && tok !== 'null' && tok !== 'undefined' ? String(tok) : null;
}

function mainWindowOf(BrowserWindow) {
  const w = global.mainwindow;
  if (w && !w.isDestroyed()) return w;
  return null;
}

// 主窗口当前地址去掉 #/路由 → 回到登录页（路由 /）
function loginUrlOf(url) {
  return String(url || '').split('#')[0];
}

function install({ app, session, ipcMain, BrowserWindow, net, screen, deviceId, name, log = console.log }) {
  const id = deviceId;
  const nm = name || deviceName();
  let lastToken = null;
  let loggedOut = null;          // 已注销的 token（之后看到新 token 才再次注销）
  let pending = null;
  let kicking = false;

  session.webRequest.onBeforeSendHeaders({ urls: module.exports.API_PATTERNS.slice() }, (details, callback) => {
    const headers = Object.assign({}, details.requestHeaders);
    const tok = stampHeaders(headers, id, nm);
    if (tok && !/\/auth\/logout(?:[?#]|$)/.test(details.url)) lastToken = tok;
    callback({ requestHeaders: headers });
  });

  function logout() {
    if (pending) return pending;
    const tok = lastToken;
    if (!tok || tok === loggedOut) return Promise.resolve();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LOGOUT_TIMEOUT);
    pending = Promise.resolve()
      .then(() => net.fetch(LOGOUT_URL, {
        method: 'POST',
        headers: { token: tok, 'X-Device-Id': id, 'X-Device-Name': nm, 'Content-Type': 'application/json' },
        body: '{}',
        signal: ac.signal,
      }))
      .then(() => log('[device-session] 已注销本机会话'))
      .catch((e) => log('[device-session] 注销失败: ' + ((e && e.message) || e)))
      .finally(() => {
        clearTimeout(timer);
        loggedOut = tok;
        pending = null;
      });
    return pending;
  }

  // 原版 background.js：Windows 上所有窗口关闭即退出；Mac 上不退出（点 Dock 图标重新建窗），都要先注销
  app.on('window-all-closed', () => { logout(); });
  let quitting = false;
  app.on('before-quit', (e) => {
    if (quitting) return;
    if (!pending && (!lastToken || lastToken === loggedOut)) return;
    e.preventDefault();
    quitting = true;
    logout().then(() => app.quit());
  });

  ipcMain.on('dsKicked', (event, info) => {
    if (kicking) return;
    const main = mainWindowOf(BrowserWindow);
    if (!main) return;
    kicking = true;
    lastToken = null;                       // 会话已在服务端作废，退出时不必再注销
    for (const w of BrowserWindow.getAllWindows()) {
      if (w !== main && !w.isDestroyed()) w.close();
    }
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
    main.webContents.send('dsKicked', { code: info && info.code, msg: info && info.msg });
  });

  ipcMain.on('dsBackToLogin', () => {
    kicking = false;
    const main = mainWindowOf(BrowserWindow);
    if (!main) return;
    if (main.isMaximized()) main.unmaximize();
    let display = null;
    try { display = screen ? screen.getDisplayMatching(main.getBounds()).bounds : null; } catch (e) { display = null; }
    if (display) main.setBounds(loginBounds(display));
    else { main.setSize(LOGIN_SIZE.width, LOGIN_SIZE.height); main.center(); }
    main.loadURL(loginUrlOf(main.webContents.getURL()));
  });

  return { logout, get lastToken() { return lastToken; }, get kicking() { return kicking; } };
}

module.exports = {
  API_PATTERNS, LOGOUT_URL, LOGIN_SIZE, parseMachineGuid, parsePlatformUuid, hashDevice, readHardwareId,
  fallbackId, computeDeviceId, deviceName, loginBounds, stampHeaders, loginUrlOf, install,
};
