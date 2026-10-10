// 新账号编号为「Z + 7 位数字」（8 位，如 Z0000001），老编号仍是 7 位：
// 登录页与忘记密码的「软件编号」输入框及校验都要接受 7–8 位，否则 Z 编号会被截断成 7 位、无法登录。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CHUNK = path.join(__dirname, '..', 'client', 'js', 'chunk-4dffb567.9e3cf4c5.js');

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

const loginSource = () => evalSources(fs.readFileSync(CHUNK, 'utf8')).find((s) => s.includes('请输入软件编号'));

// 取出 render 函数里某个 placeholder 的 el-input 的 attrs 对象字面量并求值
function inputAttrs(src, placeholder) {
  const at = src.indexOf(`"placeholder": "${placeholder}"`);
  assert.ok(at > 0, placeholder);
  const open = src.lastIndexOf('attrs: {', at) + 'attrs: '.length;
  const close = src.indexOf('}', at) + 1;
  return vm.runInNewContext('(' + src.slice(open, close) + ')');
}

test('登录页「软件编号」输入框：最少 7 位、最多 8 位', () => {
  const a = inputAttrs(loginSource(), '请输入软件编号');
  assert.strictEqual(a.minlength, 7);
  assert.strictEqual(a.maxlength, 8);
});

test('忘记密码「软件编号」输入框：最少 7 位、最多 8 位', () => {
  const a = inputAttrs(loginSource(), '软件编号');
  assert.strictEqual(a.minlength, 7);
  assert.strictEqual(a.maxlength, 8);
});

test('登录表单校验：软件编号 7–8 位', () => {
  const src = loginSource();
  const at = src.indexOf('username: [{');
  const rule = vm.runInNewContext('(' + src.slice(src.indexOf('{', at + 'username: ['.length), src.indexOf('}', at) + 1) + ')');
  assert.deepStrictEqual([rule.min, rule.max, rule.message], [7, 8, '请输入7-8位软件编号']);
});
