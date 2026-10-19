// 开奖推送客户端（K线即时刷新）：K线窗口开一条到服务端 /api/draws/stream 的长连接（SSE），新一期一入库就收到，
// 不必等工作台 7 秒轮询。用 fetch 读流而不是 EventSource，因为要带 token 请求头（token 不进地址栏 / 日志）。
// 连上后收到 ready 事件才算推送可用；中途断开按 1s→2s→…→30s 退避重连，45 秒没有任何数据（含心跳）视为断开。
// 登录失效（10020 / 10022 / 10024 等）不再重连。工作台轮询照常保留，推送不可用时 K 线仍按原方式刷新。
// 浏览器里挂到 window.drawFeed（index.html 先于业务脚本加载），Node 测试里 require。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.drawFeed = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var RETRY_MIN = 1000;
  var RETRY_MAX = 30000;
  var IDLE_MS = 45000;        // 服务端每 15 秒一次心跳
  var STOP_CODES = [10020, 10021, 10022, 10023, 10024];   // 未登录 / 登录失效 / 停用 / 封禁：重连也没用

  function given(v) {
    return v !== undefined && v !== null && v !== '' && v !== 'null' && v !== 'undefined';
  }

  // K线窗口的 code / mantissa / requestUrl → 订阅地址。requestUrl 指向自家数据源（apiURL/ds/<key>/draw-result）
  // 时订阅该数据源；指向第三方地址时没有推送，返回 null（只靠轮询）
  function streamUrl(apiURL, o) {
    if (!apiURL || !o || !given(o.code)) return null;
    var q = 'code=' + encodeURIComponent(o.code);
    if (given(o.requestUrl)) {
      var u = String(o.requestUrl).split(/[?#]/)[0];
      var prefix = apiURL + '/ds/';
      var m = /^([^\/]+)\/draw-result$/.exec(u.indexOf(prefix) === 0 ? u.slice(prefix.length) : '');
      if (!m) return null;
      var source;
      try { source = decodeURIComponent(m[1]); } catch (e) { return null; }
      q += '&source=' + encodeURIComponent(source);
    } else if (given(o.mantissa)) {
      q += '&mantissa=' + encodeURIComponent(o.mantissa);
    }
    return apiURL + '/draws/stream?' + q;
  }

  // SSE 文本解析：每次喂一段文本，凑齐一个事件（空行结尾）就回调 onEvent(name, data)；注释行（: 开头）忽略
  function createParser(onEvent) {
    var buf = '';
    return function (chunk) {
      buf += String(chunk).replace(/\r\n?/g, '\n');
      var i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        var block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        var name = 'message', data = [], has = false;
        block.split('\n').forEach(function (line) {
          if (!line || line.charAt(0) === ':') return;
          var p = line.indexOf(':');
          var field = p < 0 ? line : line.slice(0, p);
          var value = p < 0 ? '' : line.slice(p + 1).replace(/^ /, '');
          if (field === 'event') name = value;
          else if (field === 'data') { data.push(value); has = true; }
        });
        if (has) onEvent(name, data.join('\n'));
      }
    };
  }

  // opts：{url, token()（每次连接时取，换号后用新的）, onReady(), onDraws(msg), onStop(), fetch, setTimeout, clearTimeout}
  // 返回 {close(), live()}
  function subscribe(opts) {
    var f = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    var later = opts.setTimeout || setTimeout;
    var cancel = opts.clearTimeout || clearTimeout;
    var closed = false, isLive = false, delay = RETRY_MIN;
    var ctrl = null, retryTimer = null, idleTimer = null;

    function stop() {
      closed = true;
      isLive = false;
      if (retryTimer) cancel(retryTimer);
      if (idleTimer) cancel(idleTimer);
      retryTimer = idleTimer = null;
      if (ctrl) { try { ctrl.abort(); } catch (e) {} }
    }

    function retry() {
      isLive = false;
      if (idleTimer) { cancel(idleTimer); idleTimer = null; }
      if (ctrl) { try { ctrl.abort(); } catch (e) {} ctrl = null; }
      if (closed || retryTimer) return;
      retryTimer = later(function () { retryTimer = null; connect(); }, delay);
      delay = Math.min(delay * 2, RETRY_MAX);
    }

    function touch() {
      if (idleTimer) cancel(idleTimer);
      idleTimer = later(function () { idleTimer = null; retry(); }, IDLE_MS);
    }

    function connect() {
      if (closed || !f) return;
      var token = opts.token ? opts.token() : null;
      if (!token) { stop(); if (opts.onStop) opts.onStop(); return; }
      ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var mine = ctrl;
      var parse = createParser(function (name, data) {
        if (name === 'ready') {
          isLive = true;
          delay = RETRY_MIN;
          if (opts.onReady) opts.onReady();
        } else if (name === 'draws') {
          var msg;
          try { msg = JSON.parse(data); } catch (e) { return; }
          if (opts.onDraws) opts.onDraws(msg);
        }
      });
      Promise.resolve()
        .then(function () {
          return f(opts.url, { headers: { token: token, Accept: 'text/event-stream' }, signal: mine ? mine.signal : undefined, cache: 'no-store' });
        })
        .then(function (r) {
          if (closed || mine !== ctrl) return;
          var type = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
          if (type.indexOf('text/event-stream') < 0 || !r.body || !r.body.getReader) {
            // 错误返回是 JSON：登录类错误不再重连，其余（参数 / 连接过多 / 服务端异常）稍后再试
            return r.json().then(function (d) {
              if (d && STOP_CODES.indexOf(d.code) >= 0) { stop(); if (opts.onStop) opts.onStop(); return; }
              delay = RETRY_MAX;
              retry();
            }, function () { retry(); });
          }
          var reader = r.body.getReader();
          var decoder = new TextDecoder();
          touch();
          var pump = function () {
            return reader.read().then(function (res) {
              if (closed || mine !== ctrl) { try { reader.cancel(); } catch (e) {} return; }
              if (res.done) { retry(); return; }
              touch();
              parse(decoder.decode(res.value, { stream: true }));
              return pump();
            });
          };
          return pump();
        })
        .catch(function () {
          if (!closed && mine === ctrl) retry();
        });
    }

    connect();
    return {
      close: stop,
      live: function () { return isLive; }
    };
  }

  return { streamUrl: streamUrl, createParser: createParser, subscribe: subscribe };
});
