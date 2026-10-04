#!/usr/bin/env node
// 多数据源客户端补丁：给哈希 / 11选5 / 运动会三个工作台 chunk 注入「服务端下发数据源」逻辑。
// 页面源码位于 webpack 的 eval('...') 字符串内，锚点与替换文本都按该字符串的引号规则编码后再替换。
// 幂等：已含 MARK 的文件原样返回；任一锚点命中次数与预期不符则抛错、不写盘。
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

function patchApp(raw) {
  const p = raw.indexOf('function topRows(params)');
  if (p < 0) throw new Error('找不到 topRows(params)');
  const e = raw.lastIndexOf('eval(', p);
  if (e < 0) throw new Error('找不到 topRows 模块的 eval(');
  const q = raw[e + 5];
  if (raw.includes(enc(APP_MARK, q))) return raw;
  let out = raw;
  for (const r of APP_REPLACEMENTS) {
    const f = enc(r.find, q);
    const n = out.split(f).length - 1;
    if (n !== r.count) throw new Error(`锚点命中 ${n} 次（应为 ${r.count}）：${r.find.slice(0, 60)}`);
    out = out.split(f).join(enc(r.repl, q));
  }
  return out;
}

function patchChunk(raw) {
  const p = raw.indexOf('switchCode(index) {');
  if (p < 0) throw new Error('找不到 switchCode(index)');
  const e = raw.lastIndexOf('eval(', p);
  if (e < 0) throw new Error('找不到页面模块的 eval(');
  const q = raw[e + 5];
  if (raw.includes(enc(MARK, q))) return raw;
  let out = raw;
  for (const r of REPLACEMENTS) {
    const f = enc(r.find, q);
    const n = out.split(f).length - 1;
    if (n !== r.count) throw new Error(`锚点命中 ${n} 次（应为 ${r.count}）：${r.find.slice(0, 60)}`);
    out = out.split(f).join(enc(r.repl, q));
  }
  return out;
}

module.exports = { patchChunk, CHUNKS, MARK, enc, patchApp, APP_CHUNK, APP_MARK };

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'client', 'js');
  for (const name of CHUNKS) {
    const file = path.join(dir, name);
    const raw = fs.readFileSync(file, 'utf8');
    const out = patchChunk(raw);
    if (out === raw) {
      console.log(`skip    ${name}（已打过补丁）`);
    } else {
      fs.writeFileSync(file, out);
      console.log(`patched ${name}`);
    }
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
