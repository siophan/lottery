// electron/native-shim.js
// 原版依赖两个 Windows 原生插件（通过 bindings 加载）：
//   - arithmetic.node → IArithmetic：算号引擎（loadArithetic / jsWorking / jsCodeProxyTrend）
//   - process.node    → IProcess：Windows 上拉起外部进程（startProcess）
//
// background.js 里的 a(131)("xxx.node") 已被改写为 global.__ys_native("xxx.node")，
// boot-original.js 在 require 原版主进程前把本模块挂到 global.__ys_native。
//
// Windows（ia32）：加载从原版软件提取的真实原生引擎（N-API，ABI 跨 Electron 版本稳定），
//   由 package.json 的 win.extraFiles 放到 exe 同级目录；arithmetic.node 依赖同级的
//   arithmetic.dll（Go 编译，仅依赖系统 DLL），靠 exe 目录的 DLL 搜索路径解析。
//   -> 算号与原版一致。
// mac / 其它平台：Windows 原生二进制无法加载，退回 JS 空桩，保证主进程不崩、
//   登录/浏览可用；算号返回空（Mac 侧暂不支持，需 JS 重写）。
const path = require('path');

// 真实原生插件只在打包后的 Windows 上存在（与 exe 同级）。dev（npm start）下
// process.execPath 指向 node_modules 里的 electron，不含这些文件，自动退桩。
function loadRealWin(name) {
  const dir = path.dirname(process.execPath);
  // require 绝对路径的 .node 即加载原生插件；缓存由 require 负责。
  return require(path.join(dir, name)); // eslint-disable-line import/no-dynamic-require
}

// JS 空桩：真实计算不可用时的降级实现。
class IArithmetic {
  loadArithetic() { return ''; }
  jsWorking() { return ''; }
  jsCodeProxyTrend() { return ''; }
}
class IProcess {
  startProcess() { return ''; }
}
const TABLE = {
  'arithmetic.node': { IArithmetic },
  'process.node': { IProcess },
};

module.exports = function loadNative(name) {
  if (process.platform === 'win32') {
    try {
      const mod = loadRealWin(name);
      if (mod) {
        console.log('[native] loaded real engine:', name);
        return mod;
      }
    } catch (e) {
      console.error('[native] 加载真实引擎失败，退回空桩:', name, (e && e.message) || e);
    }
  }
  if (Object.prototype.hasOwnProperty.call(TABLE, name)) return TABLE[name];
  return null;
};
