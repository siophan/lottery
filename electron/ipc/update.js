// electron/ipc/update.js
// Mac 版不做自动更新，占位吞掉相关 IPC。
function register(ipcMain) {
  ipcMain.on('checkForUpdate', () => { console.log('[ipc] checkForUpdate: Mac 版不自动更新'); });
  ipcMain.on('runInstaller', () => { console.log('[ipc] runInstaller: 忽略'); });
}

module.exports = { register };
