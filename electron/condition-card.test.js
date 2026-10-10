// 条件卡（conditionListComp.vue）按来源区分按钮（需求回复第 4 条）：
//   K线方案卡（exterior.style == 3）：容错、启用、删除；容错个数读全局设置
//   自选条件卡（exterior.style == 1）：启用、修改、删除；无容错
// 以及工作台算号时只有 K线卡带容错标记，自选卡的旧 tolerant 值不再生效。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', 'client', 'js');
const COMP_CHUNK = 'chunk-213546c3.fe5d553d.js';
const WORKBENCH_CHUNKS = [
  'chunk-287f091b.0e840345.js', 'chunk-4cfcd98b.22429ba7.js', 'chunk-60235acf.b3ce76aa.js',
  'chunk-777dc0ae.6fe13884.js', 'chunk-b7e0f68a.59391aa2.js', 'chunk-50732e0a.702f76ce.js',
  'chunk-654b0783.e43d7763.js', 'chunk-7831875d.a4667623.js',
];

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

function loadCardComponent() {
  const src = evalSources(fs.readFileSync(path.join(DIR, COMP_CHUNK), 'utf8'))
    .find((s) => s.includes('src/components/conditionListComp.vue?vue&type=template'));
  const fn = new vm.Script('(function(module, __webpack_exports__, __webpack_require__){' + src + '\n})')
    .runInNewContext({});
  const exp = {};
  const normalizer = { a: (o, render) => ({ exports: Object.assign({}, o, { render }) }) };
  const req = Object.assign((id) => (id === '2877' ? normalizer : {}), {
    r() {}, d(e, n, g) { Object.defineProperty(e, n, { get: g, enumerable: true }); },
  });
  fn({ exports: exp }, exp, req);
  return exp.a;
}

// 用假的渲染上下文执行 render，得到 {tag, data, children} 树
function renderCards(list, parent = {}) {
  const comp = loadCardComponent();
  const vmThis = {
    saveConditionList: list,
    $parent: parent,
    _v: (t) => ({ text: String(t) }),
    _s: (x) => String(x),
    _l: (arr, f) => arr.map(f),
    _e: () => null,
  };
  vmThis._self = { _c: (tag, data, children) => ({ tag, data: Array.isArray(data) ? {} : data || {}, children: Array.isArray(data) ? data : children || [] }) };
  for (const [k, f] of Object.entries(comp.methods)) vmThis[k] = f.bind(vmThis);
  return comp.render.call(vmThis).children;
}

const texts = (node) => (!node ? [] : node.text !== undefined ? [node.text] : (node.children || []).flatMap(texts));
const nodes = (node) => (!node || node.text !== undefined ? [] : [node, ...(node.children || []).flatMap(nodes)]);
// 某个按钮文字所在的可点击 span（文字在子节点里时取其父 span）
function labelSpan(card, label) {
  return nodes(card).find((n) => (n.children || []).some((c) => c && (c.text === label || texts(c).join('') === label)) && n.tag === 'span');
}

const kline = (isUse) => ({ conditionName: 'k', name: { title: 'K线方案', content: '方案20261010' },
  exterior: { style: 3, isUse, showTolerant: 0 }, parameter: { tolerant: 1, reaction: 0 } });
const pick = (extra = {}) => ({ conditionName: 'p', name: { title: '012路个数', content: '1路：1' },
  exterior: Object.assign({ style: 1, showTolerant: 0 }, extra), parameter: { tolerant: 1, reaction: 0 } });

test('K线卡：显示容错、启用、删除，不再显示「使用」', () => {
  const [card] = renderCards([kline(1)]);
  const t = texts(card);
  for (const l of ['容错', '启用', '删除']) assert.ok(t.includes(l), `缺少 ${l}`);
  assert.ok(!t.includes('使用') && !t.includes('修改'));
});

test('自选卡：显示启用、修改、删除，不显示容错', () => {
  const [card] = renderCards([pick()]);
  const t = texts(card);
  for (const l of ['启用', '修改', '删除']) assert.ok(t.includes(l), `缺少 ${l}`);
  assert.ok(!t.includes('容错'));
});

test('自选卡启用勾选：isUse 未设置视为启用（与算号过滤一致），0 为未启用；点击回调工作台', () => {
  const calls = [];
  const parent = { shiYongBtnClick: (item, i) => calls.push(i) };
  const cards = renderCards([pick(), pick({ isUse: 0 }), pick({ isUse: 1 })], parent);
  const icons = cards.map((c) => nodes(c).find((n) => n.tag === 'i' && n.data.staticClass === 'el-icon-check rcyuan'));
  assert.deepStrictEqual(icons.map((i) => i.data.class), ['rcdui', '', 'rcdui']);
  labelSpan(cards[1], '启用').data.on.click();
  assert.deepStrictEqual(calls, [1]);
});

test('工作台算号：只有 K线卡（style 3）带容错标记，自选卡固定为 0', () => {
  const NEW = 'obj.tolerant = item.exterior.style == 3 ? item.parameter.tolerant : 0;';
  for (const f of WORKBENCH_CHUNKS) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    assert.strictEqual(src.split(NEW).length - 1, 1, f);
    assert.ok(!src.includes('obj.tolerant = item.parameter.tolerant;'), f);
  }
});
