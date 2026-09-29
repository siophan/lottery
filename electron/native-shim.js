// electron/native-shim.js
// 原版依赖两个 Windows 原生插件（通过 bindings 加载）：
//   - arithmetic.node → IArithmetic：算号引擎（loadArithetic / jsWorking / jsCodeProxyTrend）
//   - process.node    → IProcess：Windows 上拉起外部进程（startProcess）
// mac 上这两个 .node 二进制不存在，原生 require 返回 null，导致主进程加载即崩。
// 这里用 JS stub 顶替，让 app 能启动、登录、导航；算号的真实计算后续接入 src/engine。
//
// background.js 里的 a(131)("xxx.node") 已被改写为 global.__ys_native("xxx.node")，
// boot-original.js 在 require 原版主进程前把本模块挂到 global.__ys_native。

// 算号：真实计算依赖原生库，暂未在 mac 侧实现（既定"算号后续补"范围）。
// 返回空字符串，保证主进程不崩、算号请求不会让前端崩溃。
class IArithmetic {
  loadArithetic() { return ''; }
  jsWorking() { return ''; }
  jsCodeProxyTrend() { return ''; }
}

// 拉起外部进程：mac 版本地代理由 boot-original.js 内嵌启动，无需外部进程。
class IProcess {
  startProcess() { return ''; }
}

const TABLE = {
  'arithmetic.node': { IArithmetic },
  'process.node': { IProcess },
};

module.exports = function loadNative(name) {
  if (Object.prototype.hasOwnProperty.call(TABLE, name)) return TABLE[name];
  return null;
};
