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
