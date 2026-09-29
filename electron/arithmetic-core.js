// electron/arithmetic-core.js
// 把前端 arithmetic 的 parameter 映射到本地 JS 算号引擎(pl3)，
// 产出前端 showResult 期望的契约：
//   { result:'success', data: JSON.stringify({ Result: JSON.stringify(<号码数组>) }) }
//   或 { result:'fail', message }
// 当前仅支持"排列三、play 按 pl3 引擎字段给出"的情形；其余优雅 fail。
// 前端各玩法真实 play 字段的接入是后续工作项。
const { filter } = require('../src/engine/pl3');

const PL3_IDS = new Set([
  'plsr3001', 'plsr3002', 'plsr3004', 'plsr3009', 'plsr3015', 'plsr3023', 'plsr3025',
]);

function fail(message) { return { result: 'fail', message }; }

function isPl3Cond(c) {
  return !!c && typeof c === 'object' && PL3_IDS.has(c.id);
}

function computeArithmetic(parameterJson) {
  let p;
  try { p = JSON.parse(parameterJson); } catch { return fail('参数解析失败'); }
  const play = p && Array.isArray(p.play) ? p.play : null;
  if (!play || play.length === 0) return fail('缺少 play 条件');
  if (!play.every(isPl3Cond)) return fail('该玩法/条件暂未支持');
  let nums;
  try { nums = filter(play); } catch (e) { return fail('算号失败: ' + ((e && e.message) || e)); }
  return { result: 'success', data: JSON.stringify({ Result: JSON.stringify(nums) }) };
}

module.exports = { computeArithmetic, PL3_IDS };
