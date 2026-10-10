// 复制出来的 K 线窗口（编号 "<K线窗口编号>_copy…"）也要收到工作台发给 K 线窗口的消息（开奖刷新 lodDate 等）。
// 原版主进程的 getsub 只按编号发给一个窗口；以前由源 K 线窗口转发，源窗口一关副本就收不到。
// 这里在主进程包装 newPage / getsub：记下 newPage 新建的窗口编号，发给 "xxx_kline" 的消息同时发给所有 "xxx_kline_copy…" 窗口。
const KLINE_SUFFIX = '_kline';
const COPY_MARK = '_copy';

function createCopyRelay(getAllWindows) {
  const windows = new Map(); // 窗口编号 → BrowserWindow

  // 原版建窗是同步的：调用前后对比窗口列表，新出现的那个窗口记到 args.id 名下（同编号已存在时原版只显示，不新建）
  function wrapNewPage(listener) {
    return (event, args) => {
      const before = new Set(getAllWindows());
      const result = listener(event, args);
      if (args && args.id != null) {
        const added = getAllWindows().filter((w) => !before.has(w));
        if (added.length === 1) windows.set(String(args.id), added[0]);
      }
      return result;
    };
  }

  function wrapGetsub(listener) {
    return (event, args) => {
      const result = listener(event, args);
      const id = args && args.id != null ? String(args.id) : '';
      if (id.endsWith(KLINE_SUFFIX)) {
        const prefix = id + COPY_MARK;
        for (const [key, w] of windows) {
          if (w.isDestroyed()) {
            windows.delete(key);
          } else if (key.startsWith(prefix)) {
            w.webContents.send(args.func, args.data);
          }
        }
      }
      return result;
    };
  }

  return { wrapNewPage, wrapGetsub };
}

module.exports = { createCopyRelay };
