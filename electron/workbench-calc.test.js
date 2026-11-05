// 工作台算号调度（工单「多条件卡方案切换计算延迟」）：client/workbench-calc.js + scripts/patch-workbench-calc.js
//   - 连点「启用 / 容错」只在停手后算一次
//   - 只认最新一次请求：先发的结果晚到时丢弃，不盖掉界面上的新结果
//   - 按完整请求参数缓存：切回算过的方案不再发请求；参数（条件卡 / 开奖号）变了重新算
//   - 算号超过一定时间才显示「计算中」，不拦截点击
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const wbCalc = require('../client/workbench-calc.js');
const { patchWorkbench, IPC_CHUNKS, HTTP_CHUNKS, WB_MARK } = require('../scripts/patch-workbench-calc.js');

const DIR = path.join(__dirname, '..', 'client', 'js');

// ---- workbench-calc.js 本身 ----

test('debounce：连续触发只在停手 DELAY 毫秒后执行最后一次', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const vmThis = {};
  const calls = [];
  wbCalc.debounce(vmThis, () => calls.push(1));
  t.mock.timers.tick(wbCalc.DELAY - 1);
  wbCalc.debounce(vmThis, () => calls.push(2));
  t.mock.timers.tick(wbCalc.DELAY - 1);
  wbCalc.debounce(vmThis, () => calls.push(3));
  assert.deepStrictEqual(calls, []);
  t.mock.timers.tick(wbCalc.DELAY);
  assert.deepStrictEqual(calls, [3]);
});

test('debounce：各工作台实例互不影响', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = {}, b = {};
  const calls = [];
  wbCalc.debounce(a, () => calls.push('a'));
  wbCalc.debounce(b, () => calls.push('b'));
  t.mock.timers.tick(wbCalc.DELAY);
  assert.deepStrictEqual(calls.sort(), ['a', 'b']);
});

test('begin / end：先发的请求晚到时不渲染；成功结果按参数缓存，再次 begin 直接命中', () => {
  const vmThis = {};
  const a = wbCalc.begin(vmThis, 'A');
  const b = wbCalc.begin(vmThis, 'B');
  assert.strictEqual(a.cached, undefined);
  assert.strictEqual(wbCalc.end(vmThis, b.token, 'rb'), true);
  assert.strictEqual(wbCalc.end(vmThis, a.token, 'ra'), false);   // 过期：不渲染，但结果照样缓存
  assert.strictEqual(wbCalc.begin(vmThis, 'A').cached, 'ra');
  assert.strictEqual(wbCalc.begin(vmThis, 'B').cached, 'rb');
});

test('begin 命中缓存也会作废还在路上的旧请求', () => {
  const vmThis = {};
  const a0 = wbCalc.begin(vmThis, 'A');
  wbCalc.end(vmThis, a0.token, 'ra');
  const b = wbCalc.begin(vmThis, 'B');            // B 发出去还没回来
  assert.strictEqual(wbCalc.begin(vmThis, 'A').cached, 'ra');   // 用户切回 A
  assert.strictEqual(wbCalc.end(vmThis, b.token, 'rb'), false); // B 晚到，不能盖掉 A
});

test('失败不缓存；缓存超过 MAX 时淘汰最久没用的', () => {
  const vmThis = {};
  const f = wbCalc.begin(vmThis, 'F');
  assert.strictEqual(wbCalc.end(vmThis, f.token, undefined), true);
  assert.strictEqual(wbCalc.begin(vmThis, 'F').cached, undefined);
  for (let i = 0; i < wbCalc.MAX; i++) wbCalc.end(vmThis, wbCalc.begin(vmThis, 'k' + i).token, i);
  assert.strictEqual(wbCalc.begin(vmThis, 'k0').cached, 0);      // 用过一次，变成最新
  wbCalc.end(vmThis, wbCalc.begin(vmThis, 'new').token, 'n');   // 挤掉最久没用的 k1
  assert.strictEqual(wbCalc.begin(vmThis, 'k1').cached, undefined);
  assert.strictEqual(wbCalc.begin(vmThis, 'k0').cached, 0);
  assert.strictEqual(wbCalc.begin(vmThis, 'new').cached, 'n');
});

test('queue / dequeue：按发送顺序认领回复；没有排队的回复返回 null', () => {
  const vmThis = {};
  const a = wbCalc.begin(vmThis, 'A').token;
  const b = wbCalc.begin(vmThis, 'B').token;
  wbCalc.queue(vmThis, a);
  wbCalc.queue(vmThis, b);
  assert.strictEqual(wbCalc.dequeue(vmThis), a);
  assert.strictEqual(wbCalc.dequeue(vmThis), b);
  assert.strictEqual(wbCalc.dequeue(vmThis), null);
});

test('状态挂在不可枚举属性上（Vue 不观察、JSON 不带出）', () => {
  const vmThis = {};
  wbCalc.begin(vmThis, 'A');
  assert.deepStrictEqual(Object.keys(vmThis), []);
});

test('计算中提示：超过 SHOW_AFTER 毫秒才显示，结束即隐藏，不拦截点击', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const appended = [];
  const doc = {
    body: { appendChild: (el) => appended.push(el) },
    createElement: () => ({ style: {} }),
  };
  const ctx = vm.createContext({ setTimeout, clearTimeout, document: doc, module: { exports: {} } });
  new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'client', 'workbench-calc.js'), 'utf8')).runInContext(ctx);
  const calc = ctx.module.exports;
  const vmThis = {};

  // 很快就回来：不闪一下
  calc.end(vmThis, calc.begin(vmThis, 'fast').token, 1);
  t.mock.timers.tick(calc.SHOW_AFTER);
  assert.strictEqual(appended.length, 0);

  const slow = calc.begin(vmThis, 'slow');
  t.mock.timers.tick(calc.SHOW_AFTER - 1);
  assert.strictEqual(appended.length, 0);
  t.mock.timers.tick(1);
  assert.strictEqual(appended.length, 1);
  const el = appended[0];
  assert.strictEqual(el.textContent, calc.TEXT);
  assert.match(el.style.cssText, /pointer-events:none/);
  assert.notStrictEqual(el.style.display, 'none');
  calc.end(vmThis, slow.token, 2);
  assert.strictEqual(el.style.display, 'none');

  // 命中缓存：不显示
  calc.begin(vmThis, 'slow');
  t.mock.timers.tick(calc.SHOW_AFTER);
  assert.strictEqual(el.style.display, 'none');
});

// ---- 8 个工作台 chunk 的补丁 ----

function evalSources(raw) {
  const captured = [];
  const window = { webpackJsonp: [] };
  const ctx = vm.createContext({ window, eval: (s) => { captured.push(s); } });
  new vm.Script(raw).runInContext(ctx);
  const req = Object.assign(() => ({}), { r() {}, d() {}, n: () => () => ({}) });
  for (const fn of Object.values(window.webpackJsonp[0][1])) {
    try { fn.call({}, { exports: {} }, {}, req); } catch (e) { /* 只关心 eval 源码 */ }
  }
  return captured;
}
function anyStub() {
  const f = function () { return anyStub(); };
  return new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      return anyStub();
    },
    apply() { return anyStub(); },
    construct() { return anyStub(); },
  });
}
function loadComponent(src, { modules = {}, window = {} } = {}) {
  const fn = new vm.Script('(function(module, __webpack_exports__, __webpack_require__, window){' + src + '\n})')
    .runInNewContext({ console, setTimeout, clearTimeout, document: anyStub(), localStorage: anyStub() });
  const exp = {};
  const all = Object.assign({ '2877': { a: (o) => ({ exports: o, options: o }) } }, modules);
  const req = Object.assign((id) => (id in all ? all[id] : anyStub()), {
    r() {}, d(e, n, g) { Object.defineProperty(e, n, { get: g, enumerable: true }); },
    n: (m) => { const g = () => m; g.a = m; return g; },
  });
  fn({ exports: exp }, exp, req, window);
  return exp.default;
}
const pageSource = (name) => evalSources(fs.readFileSync(path.join(DIR, name), 'utf8'))
  .find((s) => /src\/views\/.*type=script/.test(s) && s.includes('saveConditionUtils: {'));
const tick = () => new Promise((r) => setImmediate(r));

const DRAWS = [{ opennumber: '1,2,3' }, { opennumber: '4,5,6' }];
const card = (id, isUse = 1) => ({ conditionName: id, exterior: { style: 1, isUse },
  parameter: { type: 1, id, reaction: 0, tolerant: 0, arr: [{ ulid: '0', value: '1' }] } });

// 假的组件实例：用到的字段给真值，其余（$loading / $message 等）给万能桩；created() 里注册的 IPC 监听被收集起来
function harness(name) {
  const sent = [];
  const listeners = {};
  const http = [];
  const ipcRenderer = { send: (ch, arg) => sent.push([ch, arg]), on: (ch, f) => { listeners[ch] = f; } };
  const comp = loadComponent(pageSource(name), {
    modules: {
      f121: { fromId: 'F', apiURL: 'https://x/api' },
      b456: { s: (body) => new Promise((resolve, reject) => http.push({ body, resolve, reject })) },
    },
    window: { electron: { ipcRenderer }, wbCalc },
  });
  const target = {
    reactionSelect: false, rongcuo: [0, 1, 2, 3, 4].map((v) => ({ isSel: false, value: v })),
    typeId: 'T', codeId: 'C', catId: 'cat', page: 0, pageSize: 10000, strGroup: 0, num: { lottoId: 'C' },
    $store: { getters: { num_C: JSON.stringify(DRAWS) } }, numList: DRAWS,
    saveConditionUtils: [card('a')], result: [], codeCount: 0,
  };
  // 只有 Vue 自带的 $xxx（$loading / $message …）给万能桩；其他没给的字段是 undefined（wbCalc 的状态要能挂上去）。
  // 跑 created() 收集 IPC 监听时切到宽松模式：方法空跑、Vuex getter 一律 ''、写入另存，不碰上面准备好的字段
  let creating = true;
  const scratch = {};
  const emptyStore = { getters: new Proxy({}, { get: () => '' }) };
  const vmThis = new Proxy(target, {
    get(o, k) {
      if (creating) {
        if (k in scratch) return scratch[k];
        if (typeof k === 'string' && comp.methods[k]) return () => anyStub();
        return k === '$store' ? emptyStore : anyStub();
      }
      if (k in o) return o[k];
      if (typeof k !== 'string') return undefined;
      if (comp.methods[k]) return comp.methods[k].bind(vmThis);
      return k.startsWith('$') ? anyStub() : undefined;
    },
    set(o, k, v) {
      (creating ? scratch : o)[k] = v;
      return true;
    },
  });
  try { comp.created.call(vmThis); } catch (e) { /* 接口组的 created 会解析空的 Vuex 值；它们不需要 IPC 监听 */ }
  creating = false;
  return { comp, vmThis, target, sent: () => sent.filter((s) => s[0] === 'arithmetic'), listeners, http };
}
const ipcReply = (nums) => ({ result: 'success', data: JSON.stringify({ Result: JSON.stringify(nums), Total: nums.length, Page: 0 }) });

for (const name of [...IPC_CHUNKS, ...HTTP_CHUNKS]) {
  test(`${name}: 已打补丁且再次运行不变（幂等），模块源码语法有效`, () => {
    const raw = fs.readFileSync(path.join(DIR, name), 'utf8');
    assert.ok(raw.includes(WB_MARK));
    assert.strictEqual(patchWorkbench(raw, name), raw);
    for (const s of evalSources(raw)) new vm.Script(s);
  });

  test(`${name}: 连点几次只算一次（防抖）`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const h = harness(name);
    for (let i = 0; i < 3; i++) h.comp.methods.serviceAi.call(h.vmThis);
    const count = () => h.sent().length + h.http.length;
    assert.strictEqual(count(), 0);
    t.mock.timers.tick(wbCalc.DELAY);
    assert.strictEqual(count(), 1);
  });
}

for (const name of IPC_CHUNKS) {
  test(`${name}: 结果按参数缓存；先发的回复晚于新请求时不渲染`, () => {
    const h = harness(name);
    const run = () => h.comp.methods.serviceAiNow.call(h.vmThis);
    const reply = h.listeners.serviceAiCallBack;
    assert.ok(reply, '没注册 serviceAiCallBack 监听');

    run();                                         // 方案 A
    h.target.saveConditionUtils = [card('b')];
    run();                                         // 立刻切到方案 B
    assert.strictEqual(h.sent().length, 2);
    reply({}, ipcReply(['A']));                    // A 先回来：已过期，不渲染
    assert.deepStrictEqual([...h.target.result], []);
    reply({}, ipcReply(['B']));
    assert.deepStrictEqual([...h.target.result], ['B']);

    h.target.saveConditionUtils = [card('a')];     // 切回 A：直接用缓存，不再发
    run();
    assert.strictEqual(h.sent().length, 2);
    assert.deepStrictEqual([...h.target.result], ['A']);

    // 开了新一期：参数变了，重新算
    h.target.$store = { getters: { num_C: JSON.stringify([{ opennumber: '7,8,9' }, ...DRAWS]) } };
    run();
    assert.strictEqual(h.sent().length, 3);
  });

  test(`${name}: 失败回复不缓存，下次照常重算；未排队的回复照旧交给页面`, () => {
    const h = harness(name);
    const run = () => h.comp.methods.serviceAiNow.call(h.vmThis);
    run();
    h.listeners.serviceAiCallBack({}, { result: 'fail' });
    run();
    assert.strictEqual(h.sent().length, 2);
    h.listeners.serviceAiCallBack({}, ipcReply(['X']));
    h.listeners.serviceAiCallBack({}, ipcReply(['Y']));   // 没有对应请求：按原逻辑渲染
    assert.deepStrictEqual([...h.target.result], ['Y']);
  });
}

for (const name of HTTP_CHUNKS) {
  test(`${name}: 后发先回时丢弃先发的结果；切回算过的方案不再请求`, async () => {
    const h = harness(name);
    const run = () => h.comp.methods.serviceAiNow.call(h.vmThis);
    run();                                         // 方案 A
    h.target.saveConditionUtils = [card('b')];
    run();                                         // 方案 B
    assert.strictEqual(h.http.length, 2);
    h.http[1].resolve({ code: 0, data: ['B'] });
    await tick();
    assert.deepStrictEqual([...h.target.result], ['B']);
    h.http[0].resolve({ code: 0, data: ['A'] });   // A 晚到：不能盖掉 B
    await tick();
    assert.deepStrictEqual([...h.target.result], ['B']);

    h.target.saveConditionUtils = [card('a')];
    run();
    assert.strictEqual(h.http.length, 2);
    assert.deepStrictEqual([...h.target.result], ['A']);

    h.target.numList = [{ opennumber: '7,8,9' }, ...DRAWS];   // 新一期：重新算
    run();
    assert.strictEqual(h.http.length, 3);
  });

  test(`${name}: 接口报错或网络失败不缓存`, async () => {
    const h = harness(name);
    const run = () => h.comp.methods.serviceAiNow.call(h.vmThis);
    run();
    h.http[0].resolve({ code: 3001, msg: 'x' });
    await tick();
    run();
    h.http[1].reject(new Error('net'));
    await tick();
    run();
    assert.strictEqual(h.http.length, 3);
  });
}

test('锚点不匹配时报错，而不是静默跳过', () => {
  assert.throws(() => patchWorkbench("eval('saveConditionUtils: {')", IPC_CHUNKS[0]), /命中 0 次/);
  assert.throws(() => patchWorkbench("eval('saveConditionUtils: {')", HTTP_CHUNKS[0]), /命中 0 次/);
});

test('index.html 在业务脚本之前加载 workbench-calc.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.html'), 'utf8');
  const i = html.indexOf('<script src=app://./workbench-calc.js></script>');
  assert.ok(i > 0);
  assert.ok(i < html.indexOf('app://./js/app.9ba1133b.js></script>'));
});

test('客户端 apiURL 指向 lottery.jh8.ai（已解析到香港），不再用 lottery-hk.jh8.ai', () => {
  const app = fs.readFileSync(path.join(DIR, 'app.9ba1133b.js'), 'utf8');
  assert.ok(app.includes('apiURL: "https://lottery.jh8.ai/api"'));
  assert.ok(!app.includes('lottery-hk.jh8.ai'));
});
