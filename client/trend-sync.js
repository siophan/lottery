// 走势图取开奖数据：与 K 线同一套选源规则（client/kline/js/k_sync.js send）——
// 尾数 → mantissaTopRows；选了数据源（requestUrl）→ GET 该地址；否则 topRows。
// 原先 3D / 排列 / 双色球 / 大乐透的走势图读工作台本地缓存（num_xxx，5 分钟同步一次），哈希 / 运动会 / 11选5
// 的走势页是 chart.data-ys.com 的外部页面、写死从区块链统计取数，不管工作台选的是哪个源，同一期会和 K 线对不上。
// 取回的列表先校验（期号重复 / 乱序 / 号码格式不对的行剔除并记日志），再按期号和上一次的结果比对，
// 同一期号码变了也记日志。日志统一以 [trend-data] 开头，打在走势窗口的控制台。
// 走势窗口（index.html 先于业务脚本加载）挂到 window.trendSync，走势页 iframe 同源，经 window.parent.trendSync 调用；
// Node 测试里 require。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.trendSync = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var NUMBER_RE = /^\d+(,\d+)*$/;
  var KEEP = 300;           // 比对用：每个来源记住最近这么多期

  // 地址栏参数缺省时会是 "undefined" / "null" 字样
  function given(v, nullText) {
    return v !== undefined && v !== null && v !== '' && v !== 'undefined' && !(nullText && v === 'null');
  }

  // src：{api, code, rows, mantissa, requestUrl} → {method, url, body}
  function pick(src) {
    if (given(src.mantissa, true)) {
      return { method: 'POST', url: src.api + '/lotteryNumber/mantissaTopRows',
        body: { code: src.code, rows: src.rows, mantissa: src.mantissa } };
    }
    if (given(src.requestUrl, true)) {
      return { method: 'GET', url: src.requestUrl + '?code=' + encodeURIComponent(src.code) + '&rows=' + src.rows };
    }
    return { method: 'POST', url: src.api + '/lotteryNumber/topRows', body: { code: src.code, rows: src.rows } };
  }

  // 只给自家接口带 token（与 ds-sources.js serverHeaders 同一原则），第三方地址一律不带
  function headersFor(req, api, token) {
    var h = {};
    if (req.body) h['Content-Type'] = 'application/json';
    var own = typeof api === 'string' && api !== '' && req.url.indexOf(api + '/') === 0;
    if (token && own) h.token = token;
    return h;
  }

  function cmpExpect(a, b) {
    if (/^\d+$/.test(a) && /^\d+$/.test(b) && a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // 校验期号与号码：缺字段 / 号码不是「数字,数字…」的行剔除；同一期号出现多次只留第一条；
  // 统一按期号从新到旧排。返回 {rows, problems}，problems 为空表示原列表完全合格
  function check(list) {
    var problems = [];
    var seen = {};
    var rows = [];
    (Array.isArray(list) ? list : []).forEach(function (item, i) {
      var expect = item && item.expect != null ? String(item.expect).trim() : '';
      var num = item && typeof item.opennumber === 'string' ? item.opennumber.replace(/\s+/g, '') : '';
      if (!expect || !NUMBER_RE.test(num)) {
        problems.push('第 ' + (i + 1) + ' 行期号或号码无效：' + expect + ' / ' + (item && item.opennumber));
        return;
      }
      if (seen[expect]) {
        problems.push('期号重复：' + expect);
        return;
      }
      seen[expect] = true;
      rows.push(item);
    });
    var sorted = rows.slice().sort(function (a, b) { return cmpExpect(String(b.expect).trim(), String(a.expect).trim()); });
    if (sorted.some(function (r, i) { return r !== rows[i]; })) problems.push('期号顺序错乱，已按期号重排');
    return { rows: sorted, problems: problems };
  }

  function sourceKey(src) {
    if (given(src.requestUrl, true)) return String(src.requestUrl).split(/[?#]/)[0] + '|' + src.code;
    return (given(src.mantissa, true) ? 'mantissa:' + src.mantissa : 'topRows') + '|' + src.code;
  }

  // 比对日志：同一来源同一期号，这次和之前取到的号码不一样就记下来。memo 是 {sourceKey: {expect: opennumber}}
  function compare(memo, key, rows) {
    var known = memo[key] || {};
    var changed = [];
    rows.forEach(function (r) {
      var e = String(r.expect).trim();
      if (known[e] !== undefined && known[e] !== r.opennumber) changed.push(e + '：' + known[e] + ' → ' + r.opennumber);
    });
    var next = {};
    var n = 0;
    rows.forEach(function (r) { if (n < KEEP) { next[String(r.expect).trim()] = r.opennumber; n++; } });
    Object.keys(known).forEach(function (e) { if (n < KEEP && next[e] === undefined) { next[e] = known[e]; n++; } });
    memo[key] = next;
    return changed;
  }

  function create(opts) {
    var o = opts || {};
    var fetchImpl = o.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    var log = o.log || (typeof console !== 'undefined' ? console : { info: function () {}, warn: function () {} });
    var normalize = o.normalize || (typeof window !== 'undefined' && window.dsSources ? window.dsSources.normalizeDraws : null);
    var memo = {};

    // 返回 Promise<rows>（已校验、从新到旧）；网络错误 / 接口报错 / 没有列表时 reject
    function load(src) {
      if (!fetchImpl) return Promise.reject(new Error('fetch 不可用'));
      var req = pick(src);
      var token = typeof o.token === 'function' ? o.token() : o.token;
      var init = { method: req.method, headers: headersFor(req, src.api, token) };
      if (req.body) init.body = JSON.stringify(req.body);
      return Promise.resolve()
        .then(function () { return fetchImpl(req.url, init); })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (normalize && given(src.requestUrl, true)) res = normalize(res, src.code);
          if (!res || res.code != 0 || !Array.isArray(res.data)) {
            throw new Error('接口返回 code=' + (res && res.code) + ' ' + ((res && res.msg) || ''));
          }
          var c = check(res.data);
          var key = sourceKey(src);
          if (c.problems.length) log.warn('[trend-data] 校验 ' + key + '：' + c.problems.join('；'));
          var changed = compare(memo, key, c.rows);
          if (changed.length) log.warn('[trend-data] 号码不一致 ' + key + '：' + changed.join('；'));
          var top = c.rows[0];
          log.info('[trend-data] ' + key + ' rows=' + c.rows.length + (top ? ' 最新 ' + top.expect + ' ' + top.opennumber : ''));
          return c.rows;
        });
    }

    return { load: load };
  }

  var shared = null;
  // 浏览器里共用一个实例（比对记忆跨多次取数保留）：token 每次现读 localStorage
  function load(src) {
    if (!shared) {
      shared = create({ token: function () {
        try { return localStorage.getItem('token'); } catch (e) { return null; }
      } });
    }
    return shared.load(src);
  }

  return { pick: pick, headersFor: headersFor, check: check, compare: compare, sourceKey: sourceKey, create: create, load: load };
});
