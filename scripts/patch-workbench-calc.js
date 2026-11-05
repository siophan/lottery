#!/usr/bin/env node
// 工作台算号调度补丁（工单「多条件卡方案切换计算延迟」）：给 8 个工作台 chunk 的 serviceAi 接上 window.wbCalc
// （client/workbench-calc.js）：连点防抖、只认最新一次请求、按完整请求参数缓存结果、计算中提示。
//   - IPC 组（3D / 排列3 / 排列5 / 双色球 / 大乐透）：主进程原生引擎按发送顺序回复，发送时排队、回复时认领
//   - 接口组（11选5 / 哈希 / 运动会）：上游接口回来的顺序不定，按序号丢弃过期结果
// 锚点编码、幂等与命中次数校验复用 patch-ds-client.js 的 applyLayers。
const fs = require('fs');
const path = require('path');
const { applyLayers } = require('./patch-ds-client.js');

const WB_MARK = '/* wb-calc v1 */';
const WB = 'window.wbCalc';
const IPC_CHUNKS = [
  'chunk-654b0783.e43d7763.js', // 3D
  'chunk-4cfcd98b.22429ba7.js', // 排列3
  'chunk-777dc0ae.6fe13884.js', // 排列5
  'chunk-287f091b.0e840345.js', // 双色球
  'chunk-7831875d.a4667623.js', // 大乐透
];
const HTTP_CHUNKS = [
  'chunk-50732e0a.702f76ce.js', // 11选5
  'chunk-b7e0f68a.59391aa2.js', // 哈希
  'chunk-60235acf.b3ce76aa.js', // 运动会
];
// 3D / 排列3 的 serviceAi 不分页（没有 chuanPage 参数）
const NO_PAGE = new Set(['chunk-654b0783.e43d7763.js', 'chunk-4cfcd98b.22429ba7.js']);

// serviceAi 原方法改名 serviceAiNow，原名换成防抖入口（watch / 翻页 / 容错个数等所有调用方都经过它）
function head(name) {
  const p = NO_PAGE.has(name) || HTTP_CHUNKS.includes(name) ? '' : 'chuanPage';
  return {
    find: `    //接口算号\n    serviceAi(${p}) {`,
    repl: [
      `    //接口算号 ${WB_MARK}：连点只在停手后算一次`,
      `    serviceAi(${p}) {`,
      `      ${WB}.debounce(this, () => this.serviceAiNow(${p}));`,
      `    },`,
      `    serviceAiNow(${p}) {`,
    ].join('\n'),
    count: 1,
  };
}

const IPC_REPLACEMENTS = (name) => [
  head(name),
  { // 命中缓存直接渲染；否则排队后发给主进程
    find: `      ipcRenderer.send('arithmetic', arg);`,
    repl: [
      `      const wb = ${WB}.begin(this, arg.parameter);`,
      `      if (wb.cached !== undefined) {`,
      `        this.serviceAiCallBack(wb.cached);`,
      `        return;`,
      `      }`,
      `      ${WB}.queue(this, wb.token);`,
      `      ipcRenderer.send('arithmetic', arg);`,
    ].join('\n'),
    count: 1,
  },
  { // 回复按发送顺序认领：成功结果入缓存；已被后发请求取代的不渲染
    find: `    ipcRenderer.on('serviceAiCallBack', (event, arg) => {\n      this.serviceAiCallBack(arg);\n    });`,
    repl: [
      `    ipcRenderer.on('serviceAiCallBack', (event, arg) => {`,
      `      const wbToken = ${WB}.dequeue(this);`,
      `      if (wbToken && !${WB}.end(this, wbToken, arg && arg.result == 'success' ? arg : undefined)) return;`,
      `      this.serviceAiCallBack(arg);`,
      `    });`,
    ].join('\n'),
    count: 1,
  },
];

const HTTP_REPLACEMENTS = (name) => [
  head(name),
  {
    find: [
      `      Object(softNum["s" /* serviceAi */])(requestBody).then(res => {`,
      `        loading.close();`,
      `        if (res.code == 0) {`,
      `          this.serviceAiCallBack(res.data);`,
      `        } else if (res.code == 3002 || res.code == 3001) {`,
      `          this.$message.error(res.msg);`,
      `        }`,
      `      }).catch(() => {`,
      `        loading.close();`,
      `      });`,
    ].join('\n'),
    repl: [
      `      const wb = ${WB}.begin(this, JSON.stringify(requestBody));`,
      `      if (wb.cached !== undefined) {`,
      `        this.serviceAiCallBack(wb.cached);`,
      `        return;`,
      `      }`,
      `      Object(softNum["s" /* serviceAi */])(requestBody).then(res => {`,
      `        loading.close();`,
      `        if (!${WB}.end(this, wb.token, res.code == 0 ? res.data : undefined)) return;`,
      `        if (res.code == 0) {`,
      `          this.serviceAiCallBack(res.data);`,
      `        } else if (res.code == 3002 || res.code == 3001) {`,
      `          this.$message.error(res.msg);`,
      `        }`,
      `      }).catch(() => {`,
      `        loading.close();`,
      `        ${WB}.end(this, wb.token);`,
      `      });`,
    ].join('\n'),
    count: 1,
  },
];

function patchWorkbench(raw, name) {
  const replacements = IPC_CHUNKS.includes(name) ? IPC_REPLACEMENTS(name) : HTTP_REPLACEMENTS(name);
  return applyLayers(raw, 'saveConditionUtils: {', [{ mark: WB_MARK, replacements }], name);
}

module.exports = { patchWorkbench, IPC_CHUNKS, HTTP_CHUNKS, WB_MARK };

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'client', 'js');
  for (const name of [...IPC_CHUNKS, ...HTTP_CHUNKS]) {
    const file = path.join(dir, name);
    const raw = fs.readFileSync(file, 'utf8');
    const out = patchWorkbench(raw, name);
    if (out === raw) {
      console.log(`skip    ${name}（已打过补丁）`);
    } else {
      fs.writeFileSync(file, out);
      console.log(`patched ${name}`);
    }
  }
}
