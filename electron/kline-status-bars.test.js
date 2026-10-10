// 布林通道红蓝状态柱（第 011 章 2.x / 3.1）：
//   每期一根状态柱，命中红色、未命中蓝色；两种柱各自固定高度，红:蓝 = 2:1；
//   无上下影线，柱高不随赔率 / 遗漏值等数值变化；不使用开盘 / 收盘 / 最高 / 最低（不再是 candlestick）；
//   响应式缩放，不裁切最后一根柱
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { ROOT } = require('./kline-page-harness');

function runKline() {
  const src = fs.readFileSync(path.join(ROOT, 'kline', 'js', 'k_line.js'), 'utf8');
  const ctx = {
    localStorage: { getItem: () => null },
    k: { themeChart: (o) => o },
    ktitle: '组三', macdList: [], difList: [], deaList: [], kList: [], dList: [], jList: [], zgValue: [], sgValue: [], xgValue: [],
  };
  vm.runInNewContext(src, ctx);
  return ctx;
}

// k_2main / tpk_line 交给 k_line 的每期数据：去掉序号后 [起点, 终点, 起点, 终点, …]
// 命中时终点 = 起点 + 平均遗漏，未命中时终点 = 起点 - 1
function rows(results, bc) {
  let hm = 0;
  return results.map((r) => {
    const from = hm;
    hm = r === 'y' ? hm + bc : hm - 1;
    return [from, hm, from, hm, from, hm, from, hm, from, hm];
  });
}

function draw(ctx, results, bc = 3) {
  const datas = rows(results, bc);
  return ctx.k_line({ times: datas.map((_, i) => i + 1), datas }, [], [], '0%', 'no');
}

// echarts 自定义系列的 api / params 替身：x 按类目序号每格 10px，y 每单位 5px
function fakeApi(item, gridHeight = 400) {
  return {
    params: { coordSys: { x: 0, y: 0, width: 1000, height: gridHeight } },
    api: {
      value: (i) => item[i],
      coord: ([x, y]) => [x * 10 + 5, 200 - y * 5],
      size: ([dx]) => [dx * 10, 0],
    },
  };
}

function render(series, item, gridHeight) {
  const { params, api } = fakeApi(item, gridHeight);
  return series.renderItem(params, api);
}

test('主图不再画 candlestick，改为「状态柱」自定义系列', () => {
  const ctx = runKline();
  const option = draw(ctx, ['y', 'n']);
  assert.ok(!option.series.some((s) => s.type === 'candlestick'), '还在画金融 K 线');
  const bars = option.series[0];
  assert.deepStrictEqual([bars.name, bars.type], ['状态柱', 'custom']);
  assert.strictEqual(typeof bars.renderItem, 'function');
  // 布林通道上 / 中 / 下轨线照旧
  assert.deepStrictEqual(Array.from(option.series.slice(1, 4), (s) => s.name), ['中轨', '上轨', '下轨']);
});

test('每期一根柱：记录期序号、柱在通道里的位置和是否命中，不带开盘 / 收盘 / 最高 / 最低', () => {
  const ctx = runKline();
  const data = draw(ctx, ['y', 'n', 'n', 'y'], 3).series[0].data;
  // 位置取该期走势的中点：0→3、3→2、2→1、1→4
  assert.deepStrictEqual(Array.from(data, (d) => Array.from(d)), [[0, 1.5, 1], [1, 2.5, 0], [2, 1.5, 0], [3, 2.5, 1]]);
});

test('平均遗漏为 0 时命中仍判为红柱', () => {
  const ctx = runKline();
  const data = draw(ctx, ['y', 'n'], 0).series[0].data;
  assert.deepStrictEqual(Array.from(data, (d) => d[2]), [1, 0]);
});

test('红柱红色、蓝柱蓝色，红柱高度是蓝柱的 2 倍，只画一个矩形（无上下影线）', () => {
  const ctx = runKline();
  const bars = draw(ctx, ['y', 'n']).series[0];
  const red = render(bars, [0, 1.5, 1]);
  const blue = render(bars, [1, 2.5, 0]);
  for (const el of [red, blue]) {
    assert.strictEqual(el.type, 'rect');
    assert.ok(!el.children, '不能带影线等附加图形');
  }
  assert.strictEqual(red.style.fill, ctx.STATUS_BAR_COLORS.hit);
  assert.strictEqual(blue.style.fill, ctx.STATUS_BAR_COLORS.miss);
  assert.strictEqual(red.shape.height, blue.shape.height * 2);
  assert.ok(blue.shape.height > 0);
});

test('柱高固定：不随平均遗漏、通道位置变化；柱子以该期位置为中心', () => {
  const ctx = runKline();
  const a = draw(ctx, ['y', 'n'], 3).series[0];
  const b = draw(ctx, ['y', 'n'], 40).series[0];
  const h = (s, item) => render(s, item).shape.height;
  assert.strictEqual(h(a, [0, 1.5, 1]), h(b, [0, 20, 1]));
  assert.strictEqual(h(a, [1, -9, 0]), h(a, [1, 30, 0]));
  const el = render(a, [3, 2, 1]);
  assert.strictEqual(el.shape.y + el.shape.height / 2, 200 - 2 * 5);
  assert.strictEqual(el.shape.x + el.shape.width / 2, 3 * 10 + 5);
  assert.ok(el.shape.width > 0 && el.shape.width < 10, '柱宽要在一格之内');
});

test('响应式：柱高随图表区域高度等比缩放，比例保持 2:1', () => {
  const ctx = runKline();
  const bars = draw(ctx, ['y', 'n']).series[0];
  const small = render(bars, [0, 1, 0], 100).shape.height;
  const big = render(bars, [0, 1, 0], 400).shape.height;
  assert.ok(big > small);
  assert.strictEqual(render(bars, [0, 1, 1], 100).shape.height, small * 2);
});

test('首尾两根柱不被裁切：横轴类目两侧留白', () => {
  const ctx = runKline();
  const option = draw(ctx, ['y', 'n']);
  for (const x of option.xAxis) assert.strictEqual(x.boundaryGap, true);
});

test('状态柱颜色不随背景主题变化', () => {
  const page = fs.readFileSync(path.join(ROOT, 'kline', 'k2', 'k.js'), 'utf8');
  const i = page.indexOf('themeChart');
  assert.ok(!/series/.test(page.slice(i, page.indexOf('applyTheme', i))), '主题不能改系列颜色');
});

test('K 线页加载带自定义系列的完整 echarts（K 线目录自带的精简版没有 custom）', () => {
  const html = fs.readFileSync(path.join(ROOT, 'kline', 'k2', 'k_2.html'), 'utf8');
  const m = /<script src="([^"]*echarts\.min\.js)"><\/script>/.exec(html);
  assert.ok(m, '没有加载 echarts');
  const lib = fs.readFileSync(path.join(ROOT, 'kline', 'k2', m[1]), 'utf8');
  assert.ok(lib.includes('"series.custom"'), m[1] + ' 不支持自定义系列');
});
