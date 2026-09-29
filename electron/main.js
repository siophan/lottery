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
