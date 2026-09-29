// 浏览器运行垫片：原前端为 Electron 构建，依赖 preload 注入的 window.electron.ipcRenderer。
// 浏览器里无 Electron 主进程，这里提供 no-op mock，避免启动崩溃。
// 前端对 IPC 仅用 send(单向通知主进程) 与 on(监听)，数据获取走 HTTP，故 no-op 不影响核心业务。
// 窗口控制(最小化/最大化/置顶/关闭)、打开子视图等原生能力在浏览器下无效（预期内）。
(function () {
  if (window.electron && window.electron.ipcRenderer) return;
  var noop = function () {};
  window.electron = {
    ipcRenderer: {
      send: noop,
      on: noop,
      once: noop,
      removeListener: noop,
      removeAllListeners: noop,
      invoke: function () { return Promise.resolve(); },
    },
  };
})();
