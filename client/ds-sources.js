// 多数据源 helper：把服务端下发的「数据源 × 彩种」并入工作台下拉框。
// 浏览器里挂到 window.dsSources（由 index.html 先于业务脚本加载），Node 测试里 require。
(function (root, factory) {
  var api = factory();
  // Electron nodeIntegration 同时暴露 module 和 window，必须两边都赋值
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.dsSources = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var COLORS = { ok: '#19be6b', error: '#ed4014' };
  var UNKNOWN = '#c5c8ce';

  // 同一彩种编码可能来自多个源，切换判断必须带上 requestUrl
  function optKey(o) {
    return String(o && o.value) + '|' + ((o && o.requestUrl) || '');
  }

  function toOption(item, apiURL) {
    return {
      value: String(item.code),
      label: item.name + ' · ' + item.sourceName,
      requestUrl: apiURL + '/ds/' + item.source + '/draw-result',
      server: true,
      status: item.status,
    };
  }

  // 只有用户自己添加的源写回 localStorage
  function persistable(options) {
    return (options || []).filter(function (o) { return !o.server; });
  }

  function merge(items, options, apiURL) {
    return (items || []).map(function (it) { return toOption(it, apiURL); }).concat(persistable(options));
  }

  function dotColor(o) {
    return COLORS[o && o.status] || UNKNOWN;
  }

  // 成功时返回服务端列表（可能是 []，表示服务端确实没有源）；任何失败（无 fetch、网络错误、
  // 非 JSON、code != 0、data 非数组）都返回 null，调用方据此保留现有下拉项，避免一次抖动清空服务端源
  function fetchServer(apiURL, cat, token, fetchImpl) {
    var f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) return Promise.resolve(null);
    var headers = {};
    if (token) headers.token = token;
    return Promise.resolve()
      .then(function () { return f(apiURL + '/ds/sources?cat=' + encodeURIComponent(cat), { headers: headers }); })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d.code === 0 && Array.isArray(d.data) ? d.data : null; })
      .catch(function () { return null; });
  }

  // 全球统计等源返回 issue/drawResult/drawTime，客户端统一按区块链统计的
  // expect/opennumber/openTime/lottoId 读取；这里把前者补齐成后者（纯函数、幂等、不改入参）
  function normalizeDraws(res, code) {
    if (!res || typeof res !== 'object' || res.code != 0 || !Array.isArray(res.data)) return res;
    var out = {};
    Object.keys(res).forEach(function (k) { out[k] = res[k]; });
    out.data = res.data.map(function (item) {
      if (!item || typeof item !== 'object') return item;
      var n = {};
      Object.keys(item).forEach(function (k) { n[k] = item[k]; });
      var hasCode = code !== null && code !== undefined && code !== '';
      var pairs = [
        ['expect', item.expect !== undefined && item.expect !== null ? item.expect : item.issue],
        ['opennumber', item.opennumber !== undefined && item.opennumber !== null ? item.opennumber : item.drawResult],
        ['openTime', item.openTime !== undefined && item.openTime !== null ? item.openTime : item.drawTime],
        ['lottoId', item.lottoId !== undefined && item.lottoId !== null ? item.lottoId : (hasCode ? code : undefined)],
      ];
      pairs.forEach(function (p) { if (p[1] !== undefined) n[p[0]] = p[1]; });
      return n;
    });
    return out;
  }

  // 静态页（遗漏查询 / K线）直接 $.ajax 请求 requestUrl，需要自己带 token。
  // 只对自家数据源接口 /api/ds/<key>/draw-result 返回 token，绝不发给第三方域名
  var SERVER_RE = /\/api\/ds\/[^\/?#]+\/draw-result$/;
  function serverHeaders(url) {
    // 只匹配 path 部分（去掉 query/hash），避免第三方地址把该路径塞进 query 骗取 token
    if (typeof url !== 'string' || !SERVER_RE.test(url.split(/[?#]/)[0])) return {};
    try {
      var token = typeof localStorage !== 'undefined' && localStorage ? localStorage.getItem('token') : null;
      return token ? { token: token } : {};
    } catch (e) {
      return {};
    }
  }

  return { optKey: optKey, toOption: toOption, persistable: persistable, merge: merge,
           dotColor: dotColor, fetchServer: fetchServer, normalizeDraws: normalizeDraws,
           serverHeaders: serverHeaders };
});
