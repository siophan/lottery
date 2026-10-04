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

  function fetchServer(apiURL, cat, token, fetchImpl) {
    var f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) return Promise.resolve([]);
    var headers = {};
    if (token) headers.token = token;
    return Promise.resolve()
      .then(function () { return f(apiURL + '/ds/sources?cat=' + encodeURIComponent(cat), { headers: headers }); })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d.code === 0 && Array.isArray(d.data) ? d.data : []; })
      .catch(function () { return []; });
  }

  return { optKey: optKey, toOption: toOption, persistable: persistable, merge: merge,
           dotColor: dotColor, fetchServer: fetchServer };
});
