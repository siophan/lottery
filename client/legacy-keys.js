// 遗漏页本地数据兼容旧编号：遗漏页（omission / omissionData 等）把数据存在 localStorage，key 为
// userInfo.username + "omitData" / "omissionList" + 玩法。以前 username 是所有账号共用的上游账号编号，现在是本账号编号，
// 旧数据还在本机但新 key 读不到。登录进首页后（scripts/patch-ds-client.js 的 legacy-key 层）跑一次 migrate：
// 把本地这类 key 的前缀发给后端 POST {apiURL}/user/legacy-prefixes，后端只回其中哪些是用过的共用账号编号
// （编号本身不下发，最近用过的排前面），再按这个顺序把这些前缀下的数据复制到本账号编号下（同一个 key 取第一份）。
// 只复制不删除：同一台电脑上的其他账号以前看到的也是这份数据，各自登录时都能取回。本账号 key 已有数据时不覆盖；
// 空串 / "null"（页面「清除」写的值，或升级客户端前旧版本在新编号下写的空值）视为没有数据。
// 每个账号成功跑完一次后记 dsLegacyMigrated:<编号>，之后不再请求（后端每个账号每天限查 3 次）。
// 由 index.html 先于业务脚本加载，挂到 window.dsLegacyKey。
(function (root, factory) {
  var api = factory();
  // Electron nodeIntegration 同时暴露 module 和 window，必须两边都赋值
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.dsLegacyKey = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var WORDS = ['omitData', 'omissionList'];
  var FLAG = 'dsLegacyMigrated:';
  var CANDIDATES_MAX = 50;     // 与后端 userinfo.LEGACY_CANDIDATES_MAX 一致
  var CANDIDATE_LEN_MAX = 64;  // 与后端 userinfo.LEGACY_CANDIDATE_LEN_MAX 一致

  function isEmpty(v) {
    return v === null || v === '' || v === 'null';
  }

  // 本地遗漏数据 key 按前缀分组（不含本账号编号）：{ 前缀: [key, ...] }
  function groups(storage, username) {
    var out = {};
    for (var i = 0; i < storage.length; i++) {
      var k = storage.key(i);
      for (var w = 0; w < WORDS.length; w++) {
        var j = k.indexOf(WORDS[w]);
        if (j > 0) {
          var p = k.slice(0, j);
          if (p !== username && p.length <= CANDIDATE_LEN_MAX) (out[p] = out[p] || []).push(k);
          break;
        }
      }
    }
    return out;
  }

  function url(apiURL) {
    return String(apiURL || '').replace(/\/+$/, '') + '/user/legacy-prefixes';
  }

  // 兑现为复制的条数；未登录、已迁移过、请求失败一律兑现为 0（失败的下次登录再试）
  function migrate(apiURL, token, username, storage, fetchImpl) {
    return Promise.resolve().then(function () {
      var s = storage || localStorage;
      var f = fetchImpl || fetch;
      if (!token || !username || s.getItem(FLAG + username) !== null) return 0;
      var g = groups(s, username);
      var cands = Object.keys(g).slice(0, CANDIDATES_MAX);
      if (cands.length === 0) {
        s.setItem(FLAG + username, '1');
        return 0;
      }
      return f(url(apiURL), {
        method: 'POST',
        headers: { 'content-type': 'application/json', token: token },
        body: JSON.stringify({ candidates: cands }),
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || d.code != 0 || !d.data || !Array.isArray(d.data.matches)) return 0;
        var n = 0;
        d.data.matches.forEach(function (p) {
          (g[p] || []).forEach(function (k) {
            var nk = username + k.slice(p.length);
            var old = s.getItem(k);
            if (!isEmpty(old) && isEmpty(s.getItem(nk))) {
              s.setItem(nk, old);
              n++;
            }
          });
        });
        s.setItem(FLAG + username, '1');
        return n;
      });
    }).catch(function () { return 0; });
  }

  return { migrate: migrate, groups: groups, url: url, FLAG: FLAG };
});
