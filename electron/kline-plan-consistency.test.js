// K线六屏：各屏显示的方案、画出来的图和「提交」用的号码保持一致（review 修复）：
//   - 自定义方案读方案文件的回复按请求顺序回来，只画该屏最新一次画图请求的结果，晚到的旧结果丢弃
//   - 任一屏删除方案 / 分组后，正显示被删方案的屏重画（换成同组下一个方案，或清空后置灰提交）
//   - 没有保存过方案（读不到分组文件）时点「关联」照常按固定方案画；正显示自定义方案的屏清空并重画
//   - 分组 / 方案名按文字读写，含 & ' 等字符的老名称也能显示、删除、切换
const test = require('node:test');
const assert = require('node:assert');

const { load, start } = require('./kline-page-harness');

const cfg = (collection) => ({ result: true, context: JSON.stringify(collection) });
const draws = (t) => t.calls.filter((c) => c[0] === 'draw');
const redraws = (t) => t.calls.filter((c) => c[0] === 'loadingData').map((c) => c[1]);
const shown = (t, n) => [t.frames[n].els.zdyfa3.textContent, t.frames[n].els.zdyfa4.textContent];

// 6 个屏都首次加载分组（没有屏位记录：各屏选第一个分组 / 第一个方案）
function opened(collection) {
  const t = load();
  start(t);
  for (let n = 1; n <= 6; n++) t.emit('initGroup_' + n, cfg(collection));
  t.calls.length = 0;
  return t;
}
const custom = (t, n, on = true) => { t.frames[n].els.zdyfa = Object.assign(t.frames[n].els.zdyfa || {}, { checked: on }); };

// ---------------- 晚到的方案文件 ----------------
test('同一屏连续两次读方案文件：只按最新一次画图，先回来的旧结果丢弃', () => {
  const t = opened({ G: ['P1', 'P2'] });
  const w = t.frames[1].contentWindow;
  w.kSubmit.seq = 1;
  t.self.getPlan('G', 'P1', [{ expect: '1' }], 1, 1);
  w.kSubmit.seq = 2;
  t.self.getPlan('G', 'P2', [{ expect: '2' }], 1, 2);
  t.emit('loadPlan_1', { result: true, context: JSON.stringify('01-02') });
  t.emit('loadPlan_1', { result: true, context: JSON.stringify('03-04') });
  assert.deepStrictEqual(draws(t), [['draw', 1, '03-04']]);
});

test('读失败的回复也按顺序对上，不会让后面的结果错位', () => {
  const t = opened({ G: ['P1', 'P2'] });
  const w = t.frames[2].contentWindow;
  w.kSubmit.seq = 5;
  t.self.getPlan('G', 'P1', [], 2, 5);
  t.self.getPlan('G', 'P2', [], 2, 5);
  t.emit('loadPlan_2', { result: false });
  t.emit('loadPlan_2', { result: true, context: JSON.stringify({ numbers: '05-06' }) });
  assert.deepStrictEqual(draws(t), [['draw', 2, '05-06']]);
});

test('各屏的请求互不影响', () => {
  const t = opened({ G: ['P1'] });
  t.frames[1].contentWindow.kSubmit.seq = 1;
  t.frames[3].contentWindow.kSubmit.seq = 7;
  t.self.getPlan('G', 'P1', [], 1, 1);
  t.self.getPlan('G', 'P1', [], 3, 7);
  t.emit('loadPlan_3', { result: true, context: JSON.stringify('01') });
  t.emit('loadPlan_1', { result: true, context: JSON.stringify('02') });
  assert.deepStrictEqual(draws(t), [['draw', 3, '01'], ['draw', 1, '02']]);
});

// ---------------- 删除方案 / 分组后 ----------------
test('删掉某屏正显示的自定义方案：该屏换成同组下一个方案并重画；其余屏不重画', () => {
  const t = opened({ G: ['P1', 'P2'] });
  [1, 2, 3].forEach((n) => custom(t, n));
  t.frames[3].els.zdyfa4.textContent = 'P2';             // 3 号屏看的是 P2
  for (let n = 1; n <= 6; n++) t.emit('initGroup_' + n, cfg({ G: ['P2'] }));
  assert.deepStrictEqual(redraws(t), [1, 2], '只有显示 P1 的自定义屏重画；4–6 号屏是固定方案，只更新下拉');
  assert.deepStrictEqual(shown(t, 1), ['G', 'P2']);
  assert.deepStrictEqual(shown(t, 4), ['G', 'P2']);
});

test('删掉的是组里最后一个方案 / 整个分组：该屏清空选择并重画（重画时提交保持置灰）', () => {
  const t = opened({ G: ['P1'], H: ['Q1'] });
  custom(t, 1);
  t.emit('initGroup_1', cfg({ G: [], H: ['Q1'] }));
  assert.deepStrictEqual(shown(t, 1), ['G', '']);
  assert.deepStrictEqual(redraws(t), [1]);
  t.calls.length = 0;
  t.emit('initGroup_1', cfg({ H: ['Q1'] }));
  assert.deepStrictEqual(shown(t, 1), ['H', 'Q1'], '分组没了就选第一个分组');
  assert.deepStrictEqual(redraws(t), [1]);
});

test('「关联」到保存方案的屏也算自定义：方案被删后重画', () => {
  const t = opened({ G: ['P1', 'P2'] });
  t.frames[5].contentWindow.k.linked = true;
  t.emit('initGroup_5', cfg({ G: ['P2'] }));
  assert.deepStrictEqual(redraws(t), [5]);
});

test('分组列表没变（如搜索前刷新、别的屏删了不相干的方案）时不重画', () => {
  const t = opened({ G: ['P1', 'P2'], H: ['Q1'] });
  custom(t, 1);
  t.emit('initGroup_1', cfg({ G: ['P1', 'P2'] }));
  assert.deepStrictEqual(redraws(t), []);
  assert.deepStrictEqual(shown(t, 1), ['G', 'P1']);
});

// ---------------- 读不到分组文件 ----------------
test('从没保存过方案时点「关联」：按固定方案重画，不会一直空白', () => {
  const t = load();
  start(t);
  t.self.linkPlan(2);
  t.emit('klineScreensRelink', { result: false });
  t.emit('initGroup_2', { result: false });
  assert.deepStrictEqual(t.calls.filter((c) => c[0] === 'useLinked'), [['useLinked', 2, false]]);
});

test('打开时读不到分组文件：不报错，不重画', () => {
  const t = load();
  start(t);
  assert.doesNotThrow(() => t.emit('initGroup_1', { result: false }));
  assert.deepStrictEqual(t.calls.filter((c) => c[0] !== 'applyTheme' && c[0] !== 'resize'), []);
});

test('分组都被删光（分组文件读不到）后：正显示自定义方案的屏清空选择并重画', () => {
  const t = opened({ G: ['P1'] });
  custom(t, 1);
  t.emit('initGroup_1', { result: false });
  t.emit('initGroup_2', { result: false });
  assert.deepStrictEqual(shown(t, 1), ['', '']);
  assert.deepStrictEqual(redraws(t), [1]);
});

// ---------------- 名称按文字读写 ----------------
test('含 & 和单引号的老名称：下拉显示原名，删除按钮不把名称拼进脚本', () => {
  const t = opened({ G0: ['a'], 'A&B': ["x'y", 'p2'] });
  assert.ok(t.self.pickPlan('A&B', "x'y", 1));
  assert.deepStrictEqual(shown(t, 1), ['A&B', "x'y"]);
  const groups = t.frames[1].els.zdyfa1.innerHTML;
  const plans = t.frames[1].els.zdyfa2.innerHTML;
  assert.ok(groups.includes('>A&amp;B</div>'));
  assert.ok(plans.includes('>x&#39;y</div>'));
  assert.ok(!/delete(Zu|Fa)Btn\('/.test(groups + plans), '删除按钮从相邻的名称元素取名');
  assert.match(groups, /k\.deleteZuBtn\(this\.previousSibling\.textContent\)/);
  assert.match(plans, /k\.deleteFaBtn\(this\.previousSibling\.textContent\)/);
});

test('别的屏刷新分组列表时，选着 & 分组的屏保持原选择', () => {
  const t = opened({ G0: ['a'], 'A&B': ["x'y", 'p2'] });
  t.self.pickPlan('A&B', 'p2', 1);
  custom(t, 1);
  t.calls.length = 0;
  t.emit('initGroup_1', cfg({ G0: ['a'], 'A&B': ["x'y", 'p2'] }));
  assert.deepStrictEqual(shown(t, 1), ['A&B', 'p2']);
  assert.deepStrictEqual(redraws(t), []);
});

test('复制窗口记下的分组 / 方案是原名', () => {
  const t = opened({ G0: ['a'], 'A&B': ["x'y"] });
  t.self.pickPlan('A&B', "x'y", 1);
  custom(t, 1);
  t.frames[1].contentWindow.document.getElementById('tjfa3').value = '9';
  const s = t.self.captureState().screens[1];
  assert.deepStrictEqual([s.group, s.plan], ['A&B', "x'y"]);
});
