// 子窗口拦截：原版前端用 ipcRenderer.send('newPage', { path: router.resolve(...).href, ... }) 打开子窗口，
// 主进程按 path 建窗。续费页、订单列表页只服务于上游下单（以全体用户共用的上游账号下单 / 积分支付 / 查订单），
// 后端已拦截 order/ 接口；这里在主进程统一拦下这两类窗口，散落在各页面「服务已到期，请续费」对话框里的入口一并失效。
const BLOCKED_PAGES = ['/person/fee', '/person/orderlist'];
const BLOCKED_MSG = '该功能暂不可用';

// path 形如 "#/person/fee?type=p3"、"app://./index.html#/person/orderList"；取 hash 路由部分，去掉查询串后比较
function isBlockedPage(p) {
  if (typeof p !== 'string') return false;
  const hash = p.includes('#') ? p.slice(p.indexOf('#') + 1) : p;
  const route = hash.split(/[?#]/)[0].replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
  return BLOCKED_PAGES.includes(route);
}

// 包装 newPage 监听器：被拦截的页面不建窗，改为调用 notify(event)；其余原样交给原监听器
function guardNewPage(listener, notify) {
  return (event, args) => {
    if (args && isBlockedPage(args.path)) {
      notify(event);
      return;
    }
    return listener(event, args);
  };
}

module.exports = { isBlockedPage, guardNewPage, BLOCKED_MSG };
