#!/usr/bin/env node
// 多数据源客户端补丁：给哈希 / 11选5 / 运动会三个工作台 chunk 注入「服务端下发数据源」逻辑。
// 页面源码位于 webpack 的 eval('...') 字符串内，锚点与替换文本都按该字符串的引号规则编码后再替换。
// 分层：每层有自己的 MARK，已含该 MARK 的层跳过，其余层按顺序叠加（后续层的锚点可以落在前面层注入的代码上）。
// 幂等：所有层都已打过的文件原样返回；任一锚点命中次数与预期不符则抛错、不写盘。
const fs = require('fs');
const path = require('path');

const MARK = '/* ds-patch v1 */';
const DS = 'window.dsSources';
// app 入口 chunk：topRows 的第三方（requestUrl）分支返回体归一化，与上面三个 chunk 的补丁互不影响
const APP_MARK = '/* ds-patch norm v1 */';
const APP_CHUNK = 'app.9ba1133b.js';
const API = '__webpack_require__("f121")["apiURL"]';   // src/config/index.js
const CHUNKS = [
  'chunk-b7e0f68a.59391aa2.js', // 哈希
  'chunk-50732e0a.702f76ce.js', // 11选5
  'chunk-60235acf.b3ce76aa.js', // 运动会
];

// 插在 switchCode 之前的新方法（methods 对象内，4 空格缩进）
const METHODS = [
  `${MARK}`,
  `    dsLoad(first) {`,
  `      const hadNone = ${DS}.persistable(this.options).length === 0;`,
  `      return ${DS}.fetchServer(${API}, this.catId, localStorage.getItem("token")).then(items => {`,
  `        this.options = ${DS}.merge(items, this.options, ${API});`,
  `        if (first && hadNone && items.length > 0) {`,
  `          const o = this.options[0];`,
  `          this.codeId = o.value;`,
  `          this.codeName = o.label;`,
  `          this.requestUrl = o.requestUrl;`,
  `          this.num = '';`,
  `          this.showOpenNum();`,
  `        }`,
  `      });`,
  `    },`,
  `    dsInit() {`,
  `      this.dsLoad(true);`,
  `      this.dsTimer = setInterval(() => this.dsLoad(false), 60000);`,
  `    },`,
  `    `,
].join('\n');

const REPLACEMENTS = [
  { // created(): 本地选项加载完后拉服务端列表
    find: 'this.showOpenNum();\n    this.dataRefreh();\n    this.conditionList',
    repl: 'this.showOpenNum();\n    this.dataRefreh();\n    this.dsInit();\n    this.conditionList',
    count: 1,
  },
  { // 新方法
    find: 'switchCode(index) {',
    repl: METHODS + 'switchCode(index) {',
    count: 1,
  },
  { // 同彩种不同源也要能切换
    find: 'if (this.options[index].value != this.codeId) {',
    repl: `if (${DS}.optKey(this.options[index]) != ${DS}.optKey({ value: this.codeId, requestUrl: this.requestUrl })) {`,
    count: 1,
  },
  { // 切换后强制刷新：两源同期号时原逻辑会判为「无需刷新」
    find: 'this.requestUrl = this.options[index].requestUrl;',
    repl: "this.requestUrl = this.options[index].requestUrl;\n        this.num = '';",
    count: 1,
  },
  { // 只持久化用户自己添加的源
    find: 'JSON.stringify(this.options)',
    repl: `JSON.stringify(${DS}.persistable(this.options))`,
    count: 2,
  },
  { // 服务端下发的源不显示删除按钮
    find: "return [scope.row.value != '11001'",
    repl: "return [!scope.row.server && scope.row.value != '11001'",
    count: 1,
  },
  { // 下拉项前加状态圆点
    find: '[_vm._v(_vm._s(item.label))])]);',
    repl: `[item.server ? _c('span', { style: { color: ${DS}.dotColor(item), marginRight: '6px' } }, [_vm._v("●")]) : _vm._e(), _vm._v(_vm._s(item.label))])]);`,
    count: 1,
  },
  { // 页面销毁时停掉列表刷新
    find: 'destroyed() {\n    // 在页面销毁后，清除计时器\n    this.clear();',
    repl: 'destroyed() {\n    // 在页面销毁后，清除计时器\n    this.clear();\n    clearInterval(this.dsTimer);',
    count: 1,
  },
];

function enc(s, q) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').split(q).join('\\' + q);
}

const REQ = 'Object(_utils_request__WEBPACK_IMPORTED_MODULE_0__[/* default */ "a"])';
const APP_REPLACEMENTS = [
  { // 仅 requestUrl 分支套用归一化，后端分支原样返回
    find: `    method = "GET";\n  }\n  return ${REQ}({\n    url: url,\n    method: method,\n    data: params\n  });\n}`,
    repl: `    method = "GET";\n  }\n  ${APP_MARK}\n  const dsReq = ${REQ}({\n    url: url,\n    method: method,\n    data: params\n  });\n` +
      `  if (requestUrl != null && requestUrl != "") {\n` +
      `    return dsReq.then(res => ${DS} ? ${DS}.normalizeDraws(res, params.code) : res);\n  }\n` +
      `  return dsReq;\n}`,
    count: 1,
  },
];

// ---- 后续补丁层（叠加在 v1 / norm v1 之上，各自独立 MARK）----

// 服务端列表拉取失败（fetchServer 返回 null）时保留现有下拉项与选中项
const KEEP_MARK = '/* ds-patch keep v1 */';
const KEEP_REPLACEMENTS = [
  {
    find: `.then(items => {\n        this.options = ${DS}.merge(items, this.options, ${API});`,
    repl: `.then(items => {\n        ${KEEP_MARK}\n        if (!Array.isArray(items)) return;\n        this.options = ${DS}.merge(items, this.options, ${API});`,
    count: 1,
  },
];

// 刷新后若当前选中的服务端源已被后台停用/删除（新列表里没有它），像首次加载那样切到 options[0]；
// 判定见 dsSources.needsReselect（本地源、空列表都不切）
const RESELECT_MARK = '/* ds-patch reselect v1 */';
const RESELECT_REPLACEMENTS = [
  {
    find: '        if (first && hadNone && items.length > 0) {',
    repl: `        ${RESELECT_MARK}\n        if ((first && hadNone && items.length > 0) || ` +
      `(!first && ${DS}.needsReselect(this.options, this.codeId, this.requestUrl))) {`,
    count: 1,
  },
];

// showOpenNum：请求发出时记下 codeId/requestUrl，响应回来时若已切换数据源则丢弃（防旧源响应覆盖新源）。
// 三个 chunk 的 topRows 调用缩进不同（哈希、运动会在 if/else 块内），按文件名取各自的缩进，锚点仍需精确命中 1 次
const RACE_MARK = '/* ds-patch race v1 */';
const RACE_INDENT = {
  'chunk-b7e0f68a.59391aa2.js': 8, // 哈希：if (this.requestUrl != null) { 内
  'chunk-50732e0a.702f76ce.js': 6, // 11选5：方法体顶层
  'chunk-60235acf.b3ce76aa.js': 8, // 运动会：qitwId 为空的 else 分支内
};
function raceReplacements(name) {
  if (!(name in RACE_INDENT)) throw new Error(`未知 chunk：${name}（race 层需要按文件名确定锚点缩进）`);
  const i = ' '.repeat(RACE_INDENT[name]);
  const call = `${i}Object(softNum["t" /* topRows */])({\n${i}  code: this.codeId,\n${i}  rows: 2,\n` +
    `${i}  requestUrl: this.requestUrl\n${i}}).then(res => {\n`;
  const body = `${i}  if (res.code == 0 && res.data.length > 0) {`;
  return [{
    find: call + body,
    repl: `${i}${RACE_MARK}\n${i}const dsReqCode = this.codeId, dsReqUrl = this.requestUrl;\n` + call +
      `${i}  if (dsReqCode !== this.codeId || dsReqUrl !== this.requestUrl) return;\n` + body,
    count: 1,
  }];
}

// 走势图：openTrend 把当前数据源 requestUrl 一并传给走势页（trendData 对象字面量每个 chunk 仅 1 处）
const TREND_MARK = '/* ds-patch trend v1 */';
const TREND_REPLACEMENTS = [
  {
    find: 'let trendData = {\n        play_id: this.typeId,\n        code: this.codeId,\n        chart_id: id,\n' +
      '        pid: pid,\n        cat: this.catId\n      };',
    repl: 'let trendData = {\n        play_id: this.typeId,\n        code: this.codeId,\n        chart_id: id,\n' +
      `        pid: pid,\n        cat: this.catId,\n        ${TREND_MARK}\n        requestUrl: this.requestUrl\n      };`,
    count: 1,
  },
];

// reselect 切走时同 switchCode 一样关闭子窗口：走势/遗漏/K线窗口打开时绑定了旧 requestUrl，
// 主进程按 id 复用窗口只 show()，不关会一直停在已停用的源上。首次自动选择不关。
// 子窗口 id 与各 chunk 自己的 switchCode 一致：哈希、11选5 用 typeId，运动会用 pageId
const CLOSE_MARK = '/* ds-patch close v1 */';
const CLOSE_CHILD_ID = {
  'chunk-b7e0f68a.59391aa2.js': 'typeId',
  'chunk-50732e0a.702f76ce.js': 'typeId',
  'chunk-60235acf.b3ce76aa.js': 'pageId',
};
const SWITCH_BODY = '          const o = this.options[0];\n          this.codeId = o.value;\n          this.codeName = o.label;\n' +
  "          this.requestUrl = o.requestUrl;\n          this.num = '';\n          this.showOpenNum();\n";
function closeReplacements(name) {
  if (!(name in CLOSE_CHILD_ID)) throw new Error(`未知 chunk：${name}（close 层需要按文件名确定子窗口 id）`);
  return [{
    find: `        if ((first && hadNone && items.length > 0) || ` +
      `(!first && ${DS}.needsReselect(this.options, this.codeId, this.requestUrl))) {\n` + SWITCH_BODY + '        }',
    repl: `        ${CLOSE_MARK}\n        const dsPick = first && hadNone && items.length > 0;\n` +
      `        if (dsPick || (!first && ${DS}.needsReselect(this.options, this.codeId, this.requestUrl))) {\n` + SWITCH_BODY +
      `          if (!dsPick) {\n            ipcRenderer.send('closeChildWindow', {\n              id: this.${CLOSE_CHILD_ID[name]}\n` +
      '            });\n          }\n        }',
    count: 1,
  }];
}

// 首次自动选择不再依赖 first 参数，改由组件标记 dsAutoPicked 控制：首次拉取失败时，之后某次成功的
// dsLoad(false) 仍会补做（前提仍是没有本地源、且当前未选中任何源 requestUrl == null），且只做一次。
// reselect（!first && needsReselect）语义不变
const AUTOPICK_MARK = '/* ds-patch autopick v1 */';
const AUTOPICK_REPLACEMENTS = [
  {
    find: '        const dsPick = first && hadNone && items.length > 0;',
    repl: `        ${AUTOPICK_MARK}\n` +
      '        const dsPick = !this.dsAutoPicked && hadNone && this.requestUrl == null && items.length > 0;',
    count: 1,
  },
  {
    find: "          this.showOpenNum();\n          if (!dsPick) {\n            ipcRenderer.send('closeChildWindow', {",
    repl: "          this.showOpenNum();\n          if (dsPick) this.dsAutoPicked = true;\n" +
      "          if (!dsPick) {\n            ipcRenderer.send('closeChildWindow', {",
    count: 1,
  },
];

// 自动选择机会由「首次成功拉取」用掉（无论这次是否选中）；拉取失败（null）在 keep v1 处已提前 return，不算。
// 否则首次成功时没选（有本地源 / 服务端列表为空），之后某次轮询会把停在内置源上的用户突然切走
const AUTOPICK_ONCE_MARK = '/* ds-patch autopick-once v1 */';
const AUTOPICK_ONCE_REPLACEMENTS = [
  {
    find: '        const dsPick = !this.dsAutoPicked && hadNone && this.requestUrl == null && items.length > 0;',
    repl: '        const dsPick = !this.dsAutoPicked && hadNone && this.requestUrl == null && items.length > 0;\n' +
      `        ${AUTOPICK_ONCE_MARK}\n        this.dsAutoPicked = true;`,
    count: 1,
  },
];

// 运动会 showOpenNum 的尾数分支（qitwId 非空，走 mantissaTopRows）同样丢弃切换彩种后的旧响应。
// 只有运动会 chunk 有这个分支（only），后端接口不看 requestUrl，所以只比对 codeId
const RACE_MANTISSA_MARK = '/* ds-patch race-mantissa v1 */';
const MANTISSA_CALL = '        Object(softNum["j" /* mantissaTopRows */])({\n          code: this.codeId,\n          rows: 1,\n' +
  '          mantissa: this.qitwId\n        }).then(res => {\n';
const RACE_MANTISSA_REPLACEMENTS = [
  {
    find: '      if (this.qitwId != null) {\n' + MANTISSA_CALL + '          if (res.code == 0 && res.data.length > 0) {',
    repl: `      if (this.qitwId != null) {\n        ${RACE_MANTISSA_MARK}\n        const dsReqCode = this.codeId;\n` + MANTISSA_CALL +
      '          if (dsReqCode !== this.codeId) return;\n          if (res.code == 0 && res.data.length > 0) {',
    count: 1,
  },
];

// 工作台 chunk 的补丁层（顺序即叠加顺序）。only：仅对列出的 chunk 生效。replacements 可以是按 chunk 文件名生成锚点的函数
const CHUNK_LAYERS = [
  { mark: MARK, replacements: REPLACEMENTS },
  { mark: KEEP_MARK, replacements: KEEP_REPLACEMENTS },
  { mark: RESELECT_MARK, replacements: RESELECT_REPLACEMENTS },
  { mark: RACE_MARK, replacements: raceReplacements },
  { mark: TREND_MARK, replacements: TREND_REPLACEMENTS },
  { mark: CLOSE_MARK, replacements: closeReplacements },
  { mark: AUTOPICK_MARK, replacements: AUTOPICK_REPLACEMENTS },
  { mark: RACE_MANTISSA_MARK, replacements: RACE_MANTISSA_REPLACEMENTS, only: ['chunk-60235acf.b3ce76aa.js'] },
  { mark: AUTOPICK_ONCE_MARK, replacements: AUTOPICK_ONCE_REPLACEMENTS },
];

// 走势页 chunk（src/views/trend/trend.vue）：给外部走势 iframe 的 window.topRows 在「非 dm / 非 code_id」分支里
// 优先按工作台传来的 requestUrl 取数（app chunk 的 topRows 已归一化第三方字段）；哈希只保留前 3 位（同 600x 分支）。
// 没有 requestUrl 时落回原逻辑（600x 走后端，其余读 store；自定义彩种无 store 项会抛错，有了 requestUrl 就不再走到那里）
const TREND_CHUNK = 'chunk-525406bb.807b7b4e.js';
const TREND_SRC_FIND = '      } else {\n        if (res.code == 6001 || res.code == 6002 || res.code == 6003) {\n' +
  '          Object(softNum["t" /* topRows */])({\n            code: res.code,\n            rows: res.rows\n          }).then(res => {';
const TREND_SRC_REPLACEMENTS = [
  {
    find: TREND_SRC_FIND,
    repl: [
      `      } else {`,
      `        ${TREND_MARK}`,
      `        if (this.data.requestUrl) {`,
      `          const dsHash = this.data.cat == "hash";`,
      `          Object(softNum["t" /* topRows */])({`,
      `            code: res.code,`,
      `            rows: res.rows,`,
      `            requestUrl: this.data.requestUrl`,
      `          }).then(res2 => {`,
      `            if (res2 && res2.code == 0 && Array.isArray(res2.data) && res2.data.length > 0) {`,
      `              this.htmlCallback(res2.data.map(item => {`,
      `                if (!dsHash || !item || typeof item.opennumber != "string") return item;`,
      `                return Object.assign({}, item, { opennumber: item.opennumber.split(",").slice(0, 3).join(",") });`,
      `              }));`,
      `            }`,
      `          });`,
      `          return;`,
      `        }`,
    ].join('\n') + TREND_SRC_FIND.slice('      } else {'.length),
    count: 1,
  },
];
// 上面新加的按数据源取数分支补 .catch：网络错误不应成为未处理的 Promise 拒绝（失败时同样不回调）
const TREND_CATCH_MARK = '/* ds-patch trend-catch v1 */';
const TREND_CATCH_REPLACEMENTS = [
  {
    find: '              }));\n            }\n          });\n          return;\n        }',
    repl: `              }));\n            }\n          }).catch(() => {});\n          ${TREND_CATCH_MARK}\n          return;\n        }`,
    count: 1,
  },
];
const TREND_LAYERS = [
  { mark: TREND_MARK, replacements: TREND_SRC_REPLACEMENTS },
  { mark: TREND_CATCH_MARK, replacements: TREND_CATCH_REPLACEMENTS },
];

// app chunk 的 request 工具（src/utils/request.js）：拦截器原本给所有请求都带 token/fromId，包括第三方 requestUrl；
// 改为只给自家接口（相对地址，或以 apiURL 为前缀且前缀后紧跟 / ? # 或结尾）带。响应拦截器的 10020/10021/10022
// 踢下线逻辑也只对自家接口生效，第三方返回同样的 code 时原样 resolve
const AUTH_MARK = '/* ds-patch auth v1 */';
const CFG = '_config__WEBPACK_IMPORTED_MODULE_2__';
const AUTH_REPLACEMENTS = [
  {
    find: '// request拦截器\nservice.interceptors.request.use(config => {\n  if (localStorage.getItem("token")) {',
    repl: [
      AUTH_MARK,
      `function dsOwnApi(url) {`,
      `  if (typeof url !== "string") return true;`,
      `  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && url.indexOf("//") !== 0) return true;`,
      `  const api = String(${CFG}["apiURL"] || "");`,
      `  if (!api || url.indexOf(api) !== 0) return false;`,
      `  const next = url.charAt(api.length);`,
      `  return next === "" || next === "/" || next === "?" || next === "#" || api.charAt(api.length - 1) === "/";`,
      `}`,
      `// request拦截器`,
      `service.interceptors.request.use(config => {`,
      `  const dsOwn = dsOwnApi(config.url);`,
      `  if (dsOwn && localStorage.getItem("token")) {`,
    ].join('\n'),
    count: 1,
  },
  {
    find: `  config.headers["fromId"] = ${CFG}["fromId"];\n  return config;`,
    repl: `  if (dsOwn) {\n    config.headers["fromId"] = ${CFG}["fromId"];\n  }\n  return config;`,
    count: 1,
  },
  {
    find: '    if (res.code == 10021 || res.code == 10020 || res.code == 10022) {',
    repl: '    if ((res.code == 10021 || res.code == 10020 || res.code == 10022) && dsOwnApi(response.config && response.config.url)) {',
    count: 1,
  },
];

// 响应拦截器的踢下线分支（auth v1 之后）把 10024（账号封禁）也纳入：gate 对使用中被封禁的账号返回 10024，
// 原逻辑只认 10020/10021/10022，客户端不会退出。同时修正确认回调里 userInfo 为空（JSON.parse(null)）时取 username 抛错。
// 登录接口（路径以 /auth/login 结尾）本身返回的 1002x 不走踢下线分支，原样 resolve，由登录页 login() 提示 res.msg
// （否则封禁/到期账号登录时会弹窗并直接退出程序，看不到「账号已封禁，无法登录」）
const KICK_MARK = '/* ds-patch kick v1 */';
const KICK_REPLACEMENTS = [
  {
    find: '    if ((res.code == 10021 || res.code == 10020 || res.code == 10022) && dsOwnApi(response.config && response.config.url)) {',
    repl: [
      `    ${KICK_MARK}`,
      `    const dsUrl = response.config && response.config.url;`,
      `    const dsLogin = typeof dsUrl === "string" && /\\/auth\\/login$/.test(dsUrl.split(/[?#]/)[0]);`,
      `    if ((res.code == 10021 || res.code == 10020 || res.code == 10022 || res.code == 10024) && !dsLogin && dsOwnApi(dsUrl)) {`,
    ].join('\n'),
    count: 1,
  },
  {
    find: '      } else if (res.code == 10022) {\n        massege = "软件已到期！";\n      }',
    repl: '      } else if (res.code == 10022) {\n        massege = "软件已到期！";\n      } else if (res.code == 10024) {\n        massege = "账号已封禁！";\n      }',
    count: 1,
  },
  {
    find: 'ipcRenderer.send("close", userInfo.username);',
    repl: 'ipcRenderer.send("close", userInfo && userInfo.username);',
    count: 1,
  },
];

// 积分（子项目 C）：自家接口返回 10025（无积分）同样踢下线，提示与后端文案一致。登录接口本身的 10025 不踢
// （kick v1 的 dsLogin 判断），由登录页 login() 的错误分支提示 res.msg
const KICK2_MARK = '/* ds-patch kick v2 */';
const POINTS_EMPTY_MSG = '无积分，无权操作，请充值积分后自动恢复使用！';
const KICK2_REPLACEMENTS = [
  {
    find: '    if ((res.code == 10021 || res.code == 10020 || res.code == 10022 || res.code == 10024) && !dsLogin && dsOwnApi(dsUrl)) {',
    repl: `    ${KICK2_MARK}\n` +
      '    if ((res.code == 10021 || res.code == 10020 || res.code == 10022 || res.code == 10024 || res.code == 10025) && !dsLogin && dsOwnApi(dsUrl)) {',
    count: 1,
  },
  {
    find: '      } else if (res.code == 10024) {\n        massege = "账号已封禁！";\n      }',
    repl: '      } else if (res.code == 10024) {\n        massege = "账号已封禁！";\n      } else if (res.code == 10025) {\n' +
      `        massege = "${POINTS_EMPTY_MSG}";\n      }`,
    count: 1,
  },
];

// 用户信息区（子项目 D）：登录成功时把 data.points 存入 localStorage.dsPoints（首页先显示、再向后台刷新）；
// 首页 index.vue（在 app chunk 里）在 .card 之后（#content 之前）加挂载点 ref="dsProfile"（不放进 opacity .74 的 .card；
// 必须排在 .card 里 -webkit-app-region: drag 条之后，no-drag 区域才会覆盖它，点头像/昵称不会拖动窗口），
// mounted 时交给 window.dsProfile（client/user-profile.js）渲染，activated 时刷新，destroyed 时卸载。
// 请求用首页同一个 axios 实例（b775），令牌注入与 10025 等拦截由它统一处理。
const PROFILE_MARK = '/* ds-patch profile v1 */';
const PROFILE_LOGIN_REPLACEMENTS = [
  {
    find: '              localStorage.setItem("token", res.data.token);\n' +
      '              localStorage.setItem("userInfo", JSON.stringify(res.data.userInfo));',
    repl: [
      '              localStorage.setItem("token", res.data.token);',
      '              localStorage.setItem("userInfo", JSON.stringify(res.data.userInfo));',
      `              ${PROFILE_MARK}`,
      '              localStorage.setItem("dsPoints", res.data && typeof res.data.points == "number" ? String(res.data.points) : "");',
    ].join('\n'),
    count: 1,
  },
];
const INDEX_LOCATOR = 'var indexvue_type_template_id_d79680f8_scoped_true_render';
const PROFILE_APP_REPLACEMENTS = [
  {
    find: `_vm.username))])])]), _c('div', {\n    staticStyle: {\n      "margin-top": "43px"\n    },\n    attrs: {\n      "id": "content"\n    }`,
    repl: `_vm.username))])])]), _c('div', {\n    ref: "dsProfile"\n  }), _c('div', {\n    staticStyle: {\n      "margin-top": "43px"\n    },\n    attrs: {\n      "id": "content"\n    }`,
    count: 1,
  },
  {
    find: '    this.shiming();\n  },\n  methods: {\n    aaa() {',
    repl: [
      '    this.shiming();',
      `    ${PROFILE_MARK}`,
      '    if (window.dsProfile && this.$refs.dsProfile) {',
      '      this.dsProfileCtl = window.dsProfile.mount(this.$refs.dsProfile, {',
      '        request: __webpack_require__("b775")["a"],',
      '        apiURL: __webpack_require__("f121")["apiURL"],',
      '        points: localStorage.getItem("dsPoints")',
      '      });',
      '    }',
      '  },',
      '  activated() {',
      '    if (this.dsProfileCtl) this.dsProfileCtl.refresh(localStorage.getItem("dsPoints"));',
      '  },',
      '  methods: {',
      '    aaa() {',
    ].join('\n'),
    count: 1,
  },
  {
    find: '  destroyed() {\n    clearInterval(this.intervalID2);\n    clearInterval(this.intervalID3);\n  }\n});',
    repl: [
      '  destroyed() {',
      '    clearInterval(this.intervalID2);',
      '    clearInterval(this.intervalID3);',
      '    if (this.dsProfileCtl) this.dsProfileCtl.destroy();',
      '  }',
      '});',
    ].join('\n'),
    count: 1,
  },
];

const APP_LAYERS = [
  { locator: 'function topRows(params)', layers: [{ mark: APP_MARK, replacements: APP_REPLACEMENTS }] },
  {
    locator: 'service.interceptors.request.use(config => {',
    layers: [
      { mark: AUTH_MARK, replacements: AUTH_REPLACEMENTS },
      { mark: KICK_MARK, replacements: KICK_REPLACEMENTS },
      { mark: KICK2_MARK, replacements: KICK2_REPLACEMENTS },
    ],
  },
  { locator: INDEX_LOCATOR, layers: [{ mark: PROFILE_MARK, replacements: PROFILE_APP_REPLACEMENTS }] },
];

// 登录页 chunk（src/views/login/index.vue）：login() 收到 10030（首次登录需改密并绑定手机）时打开首登弹窗
// window.dsOnboard（client/account-onboard.js）；弹窗脚本未加载或响应缺 onboardToken 时仍走原来的错误提示（res.msg）；
// 登录失败提示从 800ms 延长到 3 秒（10023/10024/10022 等文案较长，800ms 来不及看清；仅 login()）；
// 密码校验规则从 6-12 位放宽到 6-20 位（新密码最长 20 位）。忘记密码的「请输入6-12位新密码」不在本层范围内
const ONBOARD_MARK = '/* ds-patch onboard v1 */';
const LOGIN_CHUNK = 'chunk-4dffb567.9e3cf4c5.js';
const LOGIN_REPLACEMENTS = [
  { // 带上 else 后两行才能与注释掉的 // this.$router.push("/index"); 区分开，命中 1 次
    find: '              this.$router.push("/index");\n            } else {\n              this.$message({\n                message: res.msg,\n                type: \'error\',\n                duration: 800,',
    repl: [
      `              this.$router.push("/index");`,
      `            } else if (res.code == 10030 && res.data && res.data.onboardToken && window.dsOnboard) {`,
      `              ${ONBOARD_MARK}`,
      `              window.dsOnboard.open({`,
      `                apiURL: config_default.a.apiURL,`,
      `                onboardToken: res.data.onboardToken,`,
      `                onDone: msg => {`,
      `                  this.loginForm.password = "";`,
      `                  if (this.jizhumima) localStorage.removeItem("jizhuPassword");`,
      `                  this.$message({`,
      `                    message: msg,`,
      `                    type: 'success',`,
      `                    duration: 3000`,
      `                  });`,
      `                },`,
      `                onExpired: msg => {`,
      `                  this.loginForm.password = "";`,
      `                  this.$message({`,
      `                    message: msg,`,
      `                    type: 'error',`,
      `                    duration: 3000`,
      `                  });`,
      `                },`,
      `                onExit: () => ipcRenderer.send("close")`,
      `              });`,
      `            } else {`,
      `              this.$message({`,
      `                message: res.msg,`,
      `                type: 'error',`,
      `                duration: 3000,`,
    ].join('\n'),
    count: 1,
  },
  {
    find: 'max: 12,\n          message: "请输入6-12位密码"',
    repl: 'max: 20,\n          message: "请输入6-20位密码"',
    count: 1,
  },
];
// 积分（子项目 C）：登录成功且 0 < data.points < 7 时，跳转首页后弹出低积分提醒（可关闭，继续使用）。
// 路由是 hash 模式，MessageBox 默认 closeOnHashChange 会被跳转立即关掉，必须关闭该选项；
// 点右上角关闭时 $alert 的 Promise 会 reject('close')，补 .catch 避免未处理的拒绝
const POINTS_MARK = '/* ds-patch points v1 */';
const LOW_POINTS = 7;
const LOW_POINTS_MSG = '您的积分已不足，请尽快联系客服增加积分！';
const POINTS_REPLACEMENTS = [
  {
    find: '              this.$router.push("/index");\n            } else if (res.code == 10030',
    repl: [
      `              this.$router.push("/index");`,
      `              ${POINTS_MARK}`,
      `              const dsPoints = res.data && res.data.points;`,
      `              if (typeof dsPoints == "number" && dsPoints > 0 && dsPoints < ${LOW_POINTS} && this.$alert) {`,
      `                Promise.resolve(this.$alert("${LOW_POINTS_MSG}", "提示", {`,
      `                  confirmButtonText: "确定",`,
      `                  showClose: true,`,
      `                  closeOnHashChange: false`,
      `                })).catch(() => {});`,
      `              }`,
      `            } else if (res.code == 10030`,
    ].join('\n'),
    count: 1,
  },
];
const LOGIN_LAYERS = [
  { mark: ONBOARD_MARK, replacements: LOGIN_REPLACEMENTS },
  { mark: POINTS_MARK, replacements: POINTS_REPLACEMENTS },
  { mark: PROFILE_MARK, replacements: PROFILE_LOGIN_REPLACEMENTS },
];

// 在 locator 所在模块的 eval 字符串编码下，依次叠加尚未打过的层
function applyLayers(raw, locator, layers, name) {
  const p = raw.indexOf(locator);
  if (p < 0) throw new Error(`找不到 ${locator}`);
  const e = raw.lastIndexOf('eval(', p);
  if (e < 0) throw new Error(`找不到 ${locator} 所在模块的 eval(`);
  const q = raw[e + 5];
  let out = raw;
  for (const layer of layers) {
    if (layer.only && !layer.only.includes(name)) continue;
    const mark = enc(layer.mark, q);
    if (out.includes(mark)) continue;
    const reps = typeof layer.replacements === 'function' ? layer.replacements(name) : layer.replacements;
    for (const r of reps) {
      const f = enc(r.find, q);
      const n = out.split(f).length - 1;
      if (n !== r.count) throw new Error(`锚点命中 ${n} 次（应为 ${r.count}）：${r.find.slice(0, 60)}`);
      out = out.split(f).join(enc(r.repl, q));
    }
    if (!out.includes(mark)) throw new Error(`补丁层 ${layer.mark} 没有写入自己的标记`);
  }
  return out;
}

function patchApp(raw) {
  let out = raw;
  for (const g of APP_LAYERS) out = applyLayers(out, g.locator, g.layers);
  return out;
}

function patchLogin(raw) {
  return applyLayers(raw, 'jizhumimaClick() {', LOGIN_LAYERS);
}

function patchTrend(raw) {
  return applyLayers(raw, 'topRows(res, callback) {', TREND_LAYERS);
}

// name：chunk 文件名（CHUNKS 之一），部分层的锚点因 chunk 而异
function patchChunk(raw, name) {
  return applyLayers(raw, 'switchCode(index) {', CHUNK_LAYERS, name);
}

module.exports = { patchChunk, CHUNKS, MARK, enc, patchApp, APP_CHUNK, APP_MARK, KEEP_MARK, RESELECT_MARK, RACE_MARK, TREND_MARK, AUTH_MARK, CLOSE_MARK, AUTOPICK_MARK, RACE_MANTISSA_MARK, TREND_CATCH_MARK, AUTOPICK_ONCE_MARK, CHUNK_LAYERS, APP_LAYERS,
  patchTrend, TREND_CHUNK, TREND_LAYERS, KICK_MARK, patchLogin, LOGIN_CHUNK, LOGIN_LAYERS, ONBOARD_MARK,
  KICK2_MARK, POINTS_MARK, POINTS_EMPTY_MSG, LOW_POINTS_MSG, PROFILE_MARK, INDEX_LOCATOR };

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'client', 'js');
  for (const name of CHUNKS) {
    const file = path.join(dir, name);
    const raw = fs.readFileSync(file, 'utf8');
    const out = patchChunk(raw, name);
    if (out === raw) {
      console.log(`skip    ${name}（已打过补丁）`);
    } else {
      fs.writeFileSync(file, out);
      console.log(`patched ${name}`);
    }
  }
  const trendFile = path.join(dir, TREND_CHUNK);
  const trendRaw = fs.readFileSync(trendFile, 'utf8');
  const trendOut = patchTrend(trendRaw);
  if (trendOut === trendRaw) {
    console.log(`skip    ${TREND_CHUNK}（已打过补丁）`);
  } else {
    fs.writeFileSync(trendFile, trendOut);
    console.log(`patched ${TREND_CHUNK}`);
  }
  const loginFile = path.join(dir, LOGIN_CHUNK);
  const loginRaw = fs.readFileSync(loginFile, 'utf8');
  const loginOut = patchLogin(loginRaw);
  if (loginOut === loginRaw) {
    console.log(`skip    ${LOGIN_CHUNK}（已打过补丁）`);
  } else {
    fs.writeFileSync(loginFile, loginOut);
    console.log(`patched ${LOGIN_CHUNK}`);
  }
  const appFile = path.join(dir, APP_CHUNK);
  const appRaw = fs.readFileSync(appFile, 'utf8');
  const appOut = patchApp(appRaw);
  if (appOut === appRaw) {
    console.log(`skip    ${APP_CHUNK}（已打过补丁）`);
  } else {
    fs.writeFileSync(appFile, appOut);
    console.log(`patched ${APP_CHUNK}`);
  }
}
