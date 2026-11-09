// 单设备登录（渲染进程侧）：
//   - 首页（主窗口 /index）每 15 秒向服务端心跳一次（POST apiURL/auth/heartbeat，带 token；设备码由主进程统一加在请求头上）。
//     账号在其他电脑登录、被后台强制下线、会话超时等，心跳收到 10020/10021/10022/10024/10025 即触发下线；
//     电脑从休眠中恢复 / 网络恢复 / 窗口重新显示时立刻补一次心跳；
//   - 下线：任何窗口的请求拦截器（app chunk 的 kick v3 补丁）或心跳发现会话失效 → kicked(code, msg) 通知主进程；
//     主进程先关掉主窗口以外的所有窗口，再让主窗口弹提示（只弹一次）。点确定后清掉本地登录信息，主窗口回到登录页。
// 浏览器里挂到 window.dsSession（index.html 先于业务脚本加载），Node 测试里 require。
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.dsSession = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
  var INTERVAL = 15000;
  var KICK_CODES = [10020, 10021, 10022, 10024, 10025];
  var LOCAL_KEYS = ['token', 'product', 'userInfo', 'dsPoints'];

  function ipc() {
    try {
      if (typeof root.require === 'function') return root.require('electron').ipcRenderer;
    } catch (e) { /* 非 Electron 环境 */ }
    return null;
  }

  function create(opts) {
    var o = opts || {};
    var ipcR = o.ipc !== undefined ? o.ipc : ipc();
    var fetchImpl = o.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var storage = o.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var timers = o.timers || { set: setInterval.bind(root), clear: clearInterval.bind(root) };
    var timer = null;
    var apiURL = '';
    var shown = false;
    var inFlight = false;

    function token() {
      try { return storage ? storage.getItem('token') : null; } catch (e) { return null; }
    }

    // 通知主进程下线；没有 ipc（非 Electron）时返回 false，调用方走原来的处理
    function kicked(code, msg) {
      if (!ipcR) return false;
      ipcR.send('dsKicked', { code: code, msg: msg || '登录已失效，请重新登录' });
      return true;
    }

    function beat() {
      var tok = token();
      if (!apiURL || !fetchImpl || !tok || inFlight || shown) return Promise.resolve(null);
      inFlight = true;
      return Promise.resolve()
        .then(function () {
          return fetchImpl(apiURL + '/auth/heartbeat', {
            method: 'POST', headers: { 'Content-Type': 'application/json', token: tok }, body: '{}',
          });
        })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          // 心跳期间重新登录换了 token：这次结果作废
          if (res && KICK_CODES.indexOf(Number(res.code)) >= 0 && token() === tok) kicked(Number(res.code), res.msg);
          return res;
        })
        .catch(function () { return null; })     // 断网 / 服务暂时不可用：不算下线，下次再试
        .then(function (res) { inFlight = false; return res; });
    }

    function start(cfg) {
      apiURL = (cfg && cfg.apiURL) || apiURL;
      if (timer === null) timer = timers.set(beat, INTERVAL);
      return beat();
    }

    function stop() {
      if (timer !== null) timers.clear(timer);
      timer = null;
    }

    // 主窗口收到主进程转来的下线通知：弹一次提示，确定后清本地登录信息、回登录页
    function onKicked(info, alertImpl) {
      if (shown) return;
      shown = true;
      stop();
      var msg = (info && info.msg) || '登录已失效，请重新登录';
      var done = function () {
        LOCAL_KEYS.forEach(function (k) { try { storage && storage.removeItem(k); } catch (e) { /* 忽略 */ } });
        if (ipcR) ipcR.send('dsBackToLogin');
      };
      (alertImpl || showAlert)(msg, done);
    }

    if (ipcR && typeof ipcR.on === 'function') {
      ipcR.on('dsKicked', function (e, info) { onKicked(info); });
    }

    return { start: start, stop: stop, beat: beat, kicked: kicked, onKicked: onKicked,
      get running() { return timer !== null; } };
  }

  // 用 element-ui 的 $alert（根 Vue 实例上有），取不到就退回 window.alert
  function showAlert(msg, done, env) {
    var r = env || root;
    var vm = null;
    try {
      var el = r.document && r.document.getElementById('app');
      vm = el && el.__vue__;
    } catch (e) { vm = null; }
    if (vm && typeof vm.$alert === 'function') {
      Promise.resolve(vm.$alert(msg, '提示', {
        confirmButtonText: '确定', showClose: false, customClass: 'msgbox', closeOnHashChange: false,
      })).then(done, done);
      return;
    }
    try { r.alert(msg); } catch (e) { /* 忽略 */ }
    done();
  }

  var api = { create: create, showAlert: showAlert, INTERVAL: INTERVAL, KICK_CODES: KICK_CODES };
  if (typeof window !== 'undefined') {
    var shared = create();
    api.start = shared.start;
    api.stop = shared.stop;
    api.beat = shared.beat;
    api.kicked = shared.kicked;
    // 休眠恢复 / 网络恢复 / 窗口重新显示：立刻补一次心跳，不等下一个 15 秒
    window.addEventListener('online', function () { if (shared.running) shared.beat(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && shared.running) shared.beat();
    });
  }
  return api;
});
