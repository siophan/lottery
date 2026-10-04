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

// 工作台 chunk 的补丁层（顺序即叠加顺序）。replacements 可以是按 chunk 文件名生成锚点的函数
const CHUNK_LAYERS = [
  { mark: MARK, replacements: REPLACEMENTS },
  { mark: KEEP_MARK, replacements: KEEP_REPLACEMENTS },
  { mark: RESELECT_MARK, replacements: RESELECT_REPLACEMENTS },
  { mark: RACE_MARK, replacements: raceReplacements },
  { mark: TREND_MARK, replacements: TREND_REPLACEMENTS },
  { mark: CLOSE_MARK, replacements: closeReplacements },
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
const TREND_LAYERS = [{ mark: TREND_MARK, replacements: TREND_SRC_REPLACEMENTS }];

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

const APP_LAYERS = [
  { locator: 'function topRows(params)', layers: [{ mark: APP_MARK, replacements: APP_REPLACEMENTS }] },
  { locator: 'service.interceptors.request.use(config => {', layers: [{ mark: AUTH_MARK, replacements: AUTH_REPLACEMENTS }] },
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

function patchTrend(raw) {
  return applyLayers(raw, 'topRows(res, callback) {', TREND_LAYERS);
}

// name：chunk 文件名（CHUNKS 之一），部分层的锚点因 chunk 而异
function patchChunk(raw, name) {
  return applyLayers(raw, 'switchCode(index) {', CHUNK_LAYERS, name);
}

module.exports = { patchChunk, CHUNKS, MARK, enc, patchApp, APP_CHUNK, APP_MARK, KEEP_MARK, RESELECT_MARK, RACE_MARK, TREND_MARK, AUTH_MARK, CLOSE_MARK, CHUNK_LAYERS, APP_LAYERS,
  patchTrend, TREND_CHUNK, TREND_LAYERS };

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
