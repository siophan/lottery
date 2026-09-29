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
