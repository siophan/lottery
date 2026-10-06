const { test } = require('node:test');
const assert = require('node:assert');
const { isBlockedPage, guardNewPage, BLOCKED_MSG, GUARDED_CHANNELS } = require('./page-guard');

test('blocks the renewal and order-list windows however the path is written', () => {
  for (const p of ['#/person/fee', '#/person/fee?type=p3', '/#/person/fee', 'app://./index.html#/person/fee',
    '#/person/orderList', '#/person/orderlist/', '#//person//orderList?x=1', '/person/fee']) {
    assert.equal(isBlockedPage(p), true, p);
  }
  for (const p of ['#/person/userInfo', '#/person/feeback', '#/person/myPlanList', '#/jc/football/plan', '', null, undefined, 42]) {
    assert.equal(isBlockedPage(p), false, String(p));
  }
});

test('guardNewPage notifies instead of opening blocked pages and passes the rest through', () => {
  const opened = [];
  const notified = [];
  const h = guardNewPage((e, a) => opened.push(a.id), (e) => notified.push(e));
  h('ev1', { path: '#/person/fee?type=p3', id: 'fee' });
  h('ev2', { path: '#/person/orderList', id: 'orderList' });
  h('ev3', { path: '#/person/userInfo', id: 'userInfo' });
  h('ev4', { id: 'nopath' });
  assert.deepEqual(opened, ['userInfo', 'nopath']);
  assert.deepEqual(notified, ['ev1', 'ev2']);
  assert.equal(BLOCKED_MSG, '该功能暂不可用');
});

test('every window-opening channel of the original main process is guarded', () => {
  assert.deepEqual(GUARDED_CHANNELS, ['newPage', 'openCalculator']);
});
