// 文案编辑（发财猫需求第 1 条）的客户端读取：后台「文案编辑」按标识（key）维护的富文本，页面按 key 读取后替换原文案。
// 纯 DOM 实现，不依赖 Vue（页面是编译后的产物）。由 index.html 先于业务脚本加载，挂到 window.dsTexts；
// 具体页面接入时由 scripts/patch-ds-client.js 的补丁层调用 fill / load。
// 后端 GET {apiURL}/texts?keys=a,b 不需要登录、不缓存（no-store），后台保存后下一次读取即为最新内容；
// 正文已由后端按白名单清洗，可直接作为 innerHTML。读取失败或 key 不存在时一律保留页面原文案。
(function (root, factory) {
  var api = factory();
  // Electron nodeIntegration 同时暴露 module 和 window，必须两边都赋值
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.dsTexts = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var KEYS_MAX = 50; // 与后端 db_texts.KEYS_MAX 一致

  function url(apiURL, keys) {
    return String(apiURL || '').replace(/\/+$/, '') + '/texts?keys=' + keys.map(encodeURIComponent).join(',');
  }

  // keys: string[] → Promise<{ [key]: { title, content, category, updated_at } }>；失败时兑现为 {}
  function load(apiURL, keys, fetchImpl) {
    var f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    var ks = (keys || []).filter(function (k) { return typeof k === 'string' && k; }).slice(0, KEYS_MAX);
    if (!f || ks.length === 0) return Promise.resolve({});
    return Promise.resolve()
      .then(function () { return f(url(apiURL, ks), { cache: 'no-store' }); })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d.code == 0 && d.data && typeof d.data === 'object' ? d.data : {}; })
      .catch(function () { return {}; });
  }

  // 把 el 的内容换成 key 对应的正文；没有该文案时不动（保留原文案）。兑现为是否替换
  function fill(el, apiURL, key, fetchImpl) {
    return load(apiURL, [key], fetchImpl).then(function (data) {
      var t = data[key];
      if (!el || !t || typeof t.content !== 'string') return false;
      el.innerHTML = t.content;
      return true;
    });
  }

  return { load: load, fill: fill, url: url, KEYS_MAX: KEYS_MAX };
});
