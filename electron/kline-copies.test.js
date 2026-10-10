const { test } = require('node:test');
const assert = require('node:assert');
const { createCopyRelay } = require('./kline-copies');

// 假窗口：记录收到的消息，可手动销毁
function fakeWindow(name) {
  const got = [];
  let destroyed = false;
  return {
    name, got,
    destroy() { destroyed = true; },
    isDestroyed: () => destroyed,
    webContents: { send: (ch, data) => got.push([ch, data]) },
  };
}

// 模拟原版主进程：newPage 同步新建窗口（同编号已存在时只显示不新建），getsub 只发给编号完全相同的窗口
function fakeMain() {
  const all = [];
  const byId = {};
  return {
    all, byId,
    getAllWindows: () => all.filter((w) => !w.isDestroyed()),
    newPage: (event, args) => {
      if (byId[args.id] && !byId[args.id].isDestroyed()) return;
      const w = fakeWindow(args.id);
      byId[args.id] = w;
      all.push(w);
    },
    getsub: (event, args) => {
      const w = byId[args.id];
      if (w && !w.isDestroyed()) w.webContents.send(args.func, args.data);
    },
  };
}

function setup() {
  const main = fakeMain();
  const relay = createCopyRelay(main.getAllWindows);
  const newPage = relay.wrapNewPage(main.newPage);
  const getsub = relay.wrapGetsub(main.getsub);
  return { main, newPage, getsub };
}

test('发给 K 线窗口的消息同时转给它复制出来的窗口（包括副本的副本）', () => {
  const { main, newPage, getsub } = setup();
  newPage({}, { pid: '1105r5', id: '1105r5_kline' });
  newPage({}, { pid: '1105r5', id: '1105r5_kline_copy1' });
  newPage({}, { pid: '1105r5', id: '1105r5_kline_copy1_copy2' });
  newPage({}, { pid: '3dr3', id: '3dr3_kline_copy3' });   // 别的工作台的副本
  getsub({}, { id: '1105r5_kline', func: 'lodDate', data: '' });
  const got = (id) => main.byId[id].got;
  assert.deepStrictEqual(got('1105r5_kline'), [['lodDate', '']]);
  assert.deepStrictEqual(got('1105r5_kline_copy1'), [['lodDate', '']]);
  assert.deepStrictEqual(got('1105r5_kline_copy1_copy2'), [['lodDate', '']]);
  assert.deepStrictEqual(got('3dr3_kline_copy3'), []);
});

test('源 K 线窗口关掉后，副本照样收到开奖刷新', () => {
  const { main, newPage, getsub } = setup();
  newPage({}, { pid: '1105r5', id: '1105r5_kline' });
  newPage({}, { pid: '1105r5', id: '1105r5_kline_copy1' });
  main.byId['1105r5_kline'].destroy();
  getsub({}, { id: '1105r5_kline', func: 'lodDate', data: '' });
  assert.deepStrictEqual(main.byId['1105r5_kline_copy1'].got, [['lodDate', '']]);
});

test('已关闭的副本不再发送；同编号重新打开后发给新窗口', () => {
  const { main, newPage, getsub } = setup();
  newPage({}, { pid: '1105r5', id: '1105r5_kline_copy1' });
  const old = main.byId['1105r5_kline_copy1'];
  old.destroy();
  getsub({}, { id: '1105r5_kline', func: 'lodDate', data: '' });
  assert.deepStrictEqual(old.got, []);
  newPage({}, { pid: '1105r5', id: '1105r5_kline_copy1' });
  getsub({}, { id: '1105r5_kline', func: 'lodDate', data: '' });
  assert.deepStrictEqual(main.byId['1105r5_kline_copy1'].got, [['lodDate', '']]);
});

test('只转发给 K 线窗口的消息；发给工作台等其他窗口的不扩散', () => {
  const { main, newPage, getsub } = setup();
  newPage({}, { pid: 'root', id: '1105r5' });
  newPage({}, { pid: '1105r5', id: '1105r5_copy9' });
  getsub({}, { id: '1105r5', func: 'zongHeShuJuCallBack', data: 'x' });
  assert.deepStrictEqual(main.byId['1105r5'].got, [['zongHeShuJuCallBack', 'x']]);
  assert.deepStrictEqual(main.byId['1105r5_copy9'].got, []);
});

test('同编号窗口已存在时（只显示不新建）不改记录；参数缺失时原样交给原处理', () => {
  const { main, newPage, getsub } = setup();
  newPage({}, { pid: '1105r5', id: '1105r5_kline_copy1' });
  newPage({}, { pid: '1105r5', id: '1105r5_kline_copy1' });
  assert.strictEqual(main.all.length, 1);
  getsub({}, { id: '1105r5_kline', func: 'lodDate', data: '' });
  assert.strictEqual(main.byId['1105r5_kline_copy1'].got.length, 1);
  const bare = createCopyRelay(() => []);
  assert.doesNotThrow(() => { bare.wrapNewPage(() => {})({}, undefined); bare.wrapGetsub(() => {})({}, undefined); bare.wrapGetsub(() => {})({}, {}); });
});

test('包装后的监听器把原监听器的返回值原样带回', () => {
  const relay = createCopyRelay(() => []);
  assert.strictEqual(relay.wrapNewPage(() => 7)({}, { id: 'a' }), 7);
  assert.strictEqual(relay.wrapGetsub(() => 8)({}, { id: 'a_kline' }), 8);
});

test('主进程入口用它包装 newPage 和 getsub', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'boot-original.js'), 'utf8');
  assert.ok(src.includes("createCopyRelay(() => BrowserWindow.getAllWindows())"));
  assert.ok(src.includes("if (channel === 'newPage') listener = copyRelay.wrapNewPage(listener);"));
  assert.ok(src.includes("if (channel === 'getsub') listener = copyRelay.wrapGetsub(listener);"));
  // 包装要在建窗拦截之前，被拦截的页面不建窗、也不会被记录
  assert.ok(src.indexOf('copyRelay.wrapNewPage') < src.indexOf('GUARDED_CHANNELS.includes(channel)'));
});
