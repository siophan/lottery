// electron/boot-original.js
// 方案 A：直接复用原版 Electron 主进程 client/background.js（自带 app:// 协议、
// 全部 IPC、多窗口、临时数据、文件读写、darwin 分支）。本引导脚本只做两件事：
//   1) 起本地转发代理，监听原版前端硬编码的 8000 端口（apiURL=http://127.0.0.1:8000/api）；
//   2) 加载原版主进程。
// 之所以还需要代理：原版 shipped bundle 的 apiURL 就是 127.0.0.1:8000，
// 说明原 Windows 版同样依赖一个本地代理把 /api/* 转发到上游 soft-api.data-ys.com。
const path = require('path');
const { ipcMain, dialog, BrowserWindow } = require('electron');
const { startServer, UPSTREAM_DEFAULT } = require('./server');
const { guardNewPage, BLOCKED_MSG } = require('./page-guard');

// 原生插件 shim：必须在 require 原版主进程之前挂到 global。
// background.js 里的 a(131)("*.node") 已被改写为 global.__ys_native("*.node")。
global.__ys_native = require('./native-shim');

// Mac 版不做自动更新（dmg 分发）。原版 background.js 的 checkForUpdate 处理器会
// 在 exe 同级目录 mkdir 一个 "<app> update" 目录——Windows 安装目录可写、Mac 上
// 应用跑在只读 dmg 或 /Applications 里必然失败，于是弹出“应用更新出现错误”。
// 这里在 require 原版主进程之前拦截该频道的注册，替换为“安静地回复无需更新”：
// 不建目录、不请求 /renew、不弹窗。前端监听的 updateMsg({process:0}) 即“无需更新”。
const _ipcOn = ipcMain.on.bind(ipcMain);
ipcMain.on = function (channel, listener) {
  if (channel === 'checkForUpdate') {
    return _ipcOn(channel, () => {
      try {
        if (global.mainwindow && !global.mainwindow.isDestroyed()) {
          global.mainwindow.webContents.send('updateMsg', { process: 0 });
        }
      } catch (e) {
        console.error('[update-stub] 通知前端失败:', (e && e.message) || e);
      }
      console.log('[update-stub] checkForUpdate 已拦截 -> 无需更新 (mac)');
    });
  }
  if (channel === 'newPage') {
    // 续费页、订单列表页（上游下单入口）不建窗，提示功能暂不可用；见 page-guard.js
    return _ipcOn(channel, guardNewPage(listener, (event) => {
      // 「到期请续费」对话框会先 subclose 当前窗口再请求续费页，发送方可能已销毁
      let parent = null;
      try { parent = BrowserWindow.fromWebContents(event.sender); } catch (e) { parent = null; }
      if (parent && parent.isDestroyed()) parent = null;
      const opts = { type: 'info', title: '提示', message: BLOCKED_MSG, buttons: ['确定'] };
      (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts)).catch(() => {});
    }));
  }
  return _ipcOn(channel, listener);
};

const PROXY_PORT = 8000; // 必须与前端 apiURL 里的端口一致
const CLIENT_DIR = path.join(__dirname, '..', 'client');

startServer({ port: PROXY_PORT, clientDir: CLIENT_DIR, upstream: UPSTREAM_DEFAULT })
  .then(({ port }) => console.log(`[proxy] listening on 127.0.0.1:${port} -> ${UPSTREAM_DEFAULT}`))
  .catch((e) => console.error('[proxy] 启动失败:', (e && e.message) || e));

// 加载原版主进程（其 __dirname 为 client/，app:// / renderer.js / images 路径均正确）
require('../client/background.js');
