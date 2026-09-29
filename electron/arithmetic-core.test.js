const { test } = require('node:test');
const assert = require('node:assert');
const { computeArithmetic } = require('./arithmetic-core');

test('computes 排列三 和值=1 into showResult contract', () => {
  const param = JSON.stringify({ type_id: 104, cat: 'p3', play: [{ id: 'plsr3002', arr: [1] }] });
  const r = computeArithmetic(param);
  assert.equal(r.result, 'success');
  const data = JSON.parse(r.data);
  const nums = JSON.parse(data.Result);
  assert.deepEqual(nums, ['001', '010', '100']);
});

test('supports multiple pl3 conditions (AND)', () => {
  const param = JSON.stringify({ play: [{ id: 'plsr3002', arr: [1] }, { id: 'plsr3004', arr: [1] }] });
  const r = computeArithmetic(param);
  assert.equal(r.result, 'success');
  assert.deepEqual(JSON.parse(JSON.parse(r.data).Result), ['001', '010', '100']);
});

test('fails on unsupported condition id', () => {
  assert.equal(computeArithmetic(JSON.stringify({ play: [{ id: 'unknown999' }] })).result, 'fail');
});

test('fails on invalid json', () => {
  assert.equal(computeArithmetic('{bad').result, 'fail');
});

test('fails on empty or missing play', () => {
  assert.equal(computeArithmetic(JSON.stringify({ play: [] })).result, 'fail');
  assert.equal(computeArithmetic(JSON.stringify({})).result, 'fail');
});
