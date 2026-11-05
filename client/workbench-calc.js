// 工作台算号调度（工单「多条件卡方案切换计算延迟」）：工作台每点一次「启用 / 容错」都会整套重算，
// 算号要么走上游接口（11选5 / 哈希 / 运动会），要么走主进程原生引擎（3D / 排列3 / 排列5 / 双色球 / 大乐透）。
//   - 防抖：连续点卡只在停手 DELAY 毫秒后算一次
//   - 只认最新一次：后发的请求先回来时，先发的结果到了直接丢掉，不会把旧号码盖到界面上
//   - 结果缓存：按完整请求参数（含条件卡、容错、反集、页码与最近开奖号）缓存，切回算过的方案立即出结果；
//     改了条件卡参数或开了新一期，参数不同，自然重新算
//   - 计算中提示：算号超过 SHOW_AFTER 毫秒才显示，不遮挡、不锁界面
// 浏览器里挂到 window.wbCalc（index.html 先于业务脚本加载），Node 测试里 require。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.wbCalc = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var DELAY = 150;
  var MAX = 30;            // 每个工作台最多缓存的结果数（最久没用的先淘汰）
  var SHOW_AFTER = 200;
  var TEXT = '计算中…';

  // 每个工作台组件实例一份状态，挂成不可枚举属性，Vue 不会去观察它
  function state(vm) {
    if (!vm.__wbCalc) {
      Object.defineProperty(vm, '__wbCalc', {
        value: { timer: null, seq: 0, cache: new Map(), pending: [], busy: false },
        enumerable: false,
      });
    }
    return vm.__wbCalc;
  }

  function debounce(vm, fn) {
    var s = state(vm);
    clearTimeout(s.timer);
    s.timer = setTimeout(function () {
      s.timer = null;
      fn();
    }, DELAY);
  }

  // 开始一次算号：作废还在路上的旧请求。命中缓存时返回 cached，调用方直接拿它渲染、不再发请求
  function begin(vm, key) {
    var s = state(vm);
    var token = { seq: ++s.seq, key: key };
    if (s.cache.has(key)) {
      var v = s.cache.get(key);
      s.cache.delete(key);
      s.cache.set(key, v);
      setBusy(vm, false);
      return { token: token, cached: v };
    }
    setBusy(vm, true);
    return { token: token };
  }

  // 请求回来：value 为成功结果（失败传 undefined，不缓存）。返回 true 表示这是最新一次请求，应该渲染
  function end(vm, token, value) {
    var s = state(vm);
    if (value !== undefined && value !== null) {
      s.cache.delete(token.key);
      s.cache.set(token.key, value);
      while (s.cache.size > MAX) s.cache.delete(s.cache.keys().next().value);
    }
    var current = token.seq === s.seq;
    if (current) setBusy(vm, false);
    return current;
  }

  // 主进程原生引擎按发送顺序逐个回复、回复里不带请求标识：发送时排队，回复时按顺序认领
  function queue(vm, token) {
    state(vm).pending.push(token);
  }

  function dequeue(vm) {
    return state(vm).pending.shift() || null;
  }

  // 「计算中」提示：页面右上角一个不拦截点击的小浮层；同一窗口任一工作台在算就显示
  var busyCount = 0;
  var showTimer = null;
  var el = null;

  function setBusy(vm, on) {
    var s = state(vm);
    if (s.busy === on) return;
    s.busy = on;
    busyCount += on ? 1 : -1;
    if (typeof document === 'undefined') return;
    if (busyCount > 0) {
      if (!showTimer && !(el && el.style.display !== 'none')) {
        showTimer = setTimeout(function () {
          showTimer = null;
          if (busyCount > 0) show(true);
        }, SHOW_AFTER);
      }
    } else {
      clearTimeout(showTimer);
      showTimer = null;
      show(false);
    }
  }

  function show(on) {
    if (!el) {
      if (!on || !document.body) return;
      el = document.createElement('div');
      el.className = 'wb-calc-busy';
      el.textContent = TEXT;
      el.style.cssText = 'position:fixed;top:12px;right:16px;z-index:3000;pointer-events:none;'
        + 'padding:6px 14px;border-radius:14px;font-size:13px;line-height:18px;'
        + 'color:#fff;background:rgba(0,0,0,0.7);';
      document.body.appendChild(el);
    }
    el.style.display = on ? '' : 'none';
  }

  return { debounce: debounce, begin: begin, end: end, queue: queue, dequeue: dequeue,
           DELAY: DELAY, MAX: MAX, SHOW_AFTER: SHOW_AFTER, TEXT: TEXT };
});
