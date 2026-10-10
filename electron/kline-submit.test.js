// K线页「提交」按钮状态（第 011 章 7「加载中禁用重复提交；无方案时提交按钮置灰」）：
//   - 当前方案的号码画完之前（加载中 / 同步失败）按钮置灰，避免把上一个方案的号码提交到工作台
//   - 没选方案（自定义没有分组 / 方案，固定方案没有号码）时置灰
//   - 点一次后短时间内不再响应，避免连点生成重复的条件卡
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KDIR = path.join(__dirname, '..', 'client', 'kline');
const read = (p) => fs.readFileSync(path.join(KDIR, p), 'utf8');

function page({ custom = false, group = '', plan = '', fixed = '512', stored = { 512: '["01 02"]' } } = {}) {
  const els = {
    tijiao: { disabled: false },
    zdyfa3: { innerHTML: group }, zdyfa4: { innerHTML: plan },
    tjfa3: { value: fixed },
  };
  const timers = [];
  const ctx = {
    document: { getElementById: (id) => els[id] || null },
    k: { planMode: () => (custom ? '1' : '2') },
    localStorage: { getItem: (key) => (key in stored ? stored[key] : null) },
    setTimeout: (f, ms) => timers.push([f, ms]),
  };
  vm.runInNewContext(read('js/k_submit.js'), ctx);
  return { kSubmit: ctx.kSubmit, els, timers, ctx };
}

test('页面刚打开、方案还没画完时提交置灰', () => {
  const p = page();
  assert.strictEqual(p.els.tijiao.disabled, true);
});

test('固定方案画完后可提交；重新加载时先置灰，画完再恢复', () => {
  const p = page();
  p.kSubmit.ready();
  assert.strictEqual(p.els.tijiao.disabled, false);
  p.kSubmit.loading();
  assert.strictEqual(p.els.tijiao.disabled, true);
  p.kSubmit.ready();
  assert.strictEqual(p.els.tijiao.disabled, false);
});

test('同步失败（只开始加载、没画完）时一直置灰', () => {
  const p = page();
  p.kSubmit.ready();
  p.kSubmit.loading();
  assert.strictEqual(p.els.tijiao.disabled, true);
  assert.strictEqual(p.kSubmit.begin(), false);
});

test('自定义方案：选了分组和方案才可提交', () => {
  const empty = page({ custom: true, group: '组A', plan: '' });
  empty.kSubmit.ready();
  assert.strictEqual(empty.els.tijiao.disabled, true);
  const ok = page({ custom: true, group: '组A', plan: '方案1' });
  ok.kSubmit.ready();
  assert.strictEqual(ok.els.tijiao.disabled, false);
});

test('固定方案没有选中或本机没有号码时置灰', () => {
  const none = page({ fixed: '' });
  none.kSubmit.ready();
  assert.strictEqual(none.els.tijiao.disabled, true);
  const missing = page({ fixed: '513' });
  missing.kSubmit.ready();
  assert.strictEqual(missing.els.tijiao.disabled, true);
});

test('点一次提交后锁定一秒，期间再点不响应；时间到恢复', () => {
  const p = page();
  p.kSubmit.ready();
  assert.strictEqual(p.kSubmit.begin(), true);
  assert.strictEqual(p.els.tijiao.disabled, true);
  assert.strictEqual(p.kSubmit.begin(), false);
  assert.strictEqual(p.timers.length, 1);
  assert.strictEqual(p.timers[0][1], 1000);
  p.timers[0][0]();
  assert.strictEqual(p.els.tijiao.disabled, false);
  assert.strictEqual(p.kSubmit.begin(), true);
});

test('锁定期间切换了方案：时间到后按新方案是否画完决定', () => {
  const p = page();
  p.kSubmit.ready();
  p.kSubmit.begin();
  p.kSubmit.loading();
  p.timers[0][0]();
  assert.strictEqual(p.els.tijiao.disabled, true);
  p.kSubmit.ready();
  assert.strictEqual(p.els.tijiao.disabled, false);
});

// ---------------- 页面接线 ----------------
test('k_2.html 在 k_2main.js 之前加载 k_submit.js', () => {
  const html = read('k2/k_2.html');
  const i = html.indexOf('../js/k_submit.js');
  assert.ok(i > html.indexOf('k.js"') && i < html.indexOf('k_2main.js'));
});

test('loadingData 开始画图时置灰，getyesAndno 拿到方案号码后恢复，tj 先过 kSubmit.begin', () => {
  const main = read('k2/k_2main.js');
  const start = main.indexOf('function loadingData(');
  const body = main.slice(start, main.indexOf('\nfunction onBack(', start));
  assert.ok(body.includes('kSubmit.loading();'));
  const tj = main.slice(main.indexOf('function tj('), main.indexOf('function pinjietj('));
  assert.match(tj, /if \(!kSubmit\.begin\(\)\) return false;/);
  assert.ok(tj.indexOf('kSubmit.begin') > tj.indexOf('原智能数据不能提交'), '先提示原智能数据不能提交');
  const util = read('js/k_Util.js');
  const g = util.slice(util.indexOf('getyesAndno :'));
  assert.ok(g.indexOf('kSubmit.ready()') > g.indexOf('zdyfa_plan = opengudingarr;'));
});
