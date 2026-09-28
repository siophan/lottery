// 排列三 直选过滤引擎 (JS 重写样板)
// 数字彩 code=104。直选号池：000-999 共 1000 注，每注为 [百, 十, 个] 三位。
// 入参沿用原 app 的 play[] 结构：{ id, arr, reaction, tolerant }
//   arr:      用户在该条件里"选中"的取值集合
//   reaction: 1=反选(反集)——特征值 *不在* arr 中才通过；0/缺省=正选
//   tolerant: 容错(语义待用真程序核对，见 README)。本样板按"单条件二值"处理，
//             即 tolerant 仅在多条件聚合层生效，这里先不改变单条件判定。
// 已实现且语义确定的条件：
//   plsr3002 和值 (三位之和, 0-27)
//   plsr3004 跨度 (max-min, 0-9)
//   plsr3001 胆码 (选中的胆码数字里，至少"开出"K 个出现在号码中)

const POOL = (() => {
  const p = [];
  for (let i = 0; i < 1000; i++) p.push([Math.floor(i/100), Math.floor(i/10)%10, i%10]);
  return p;
})();

const sum  = d => d[0] + d[1] + d[2];
const span = d => Math.max(...d) - Math.min(...d);
const sorted = d => [...d].sort((a, b) => a - b);         // 升序 [最小,中,最大]

// 组选形态：豹子(AAA)/组三(AAB)/组六(ABC)
function form(d) {
  const u = new Set(d).size;
  return u === 1 ? '豹子' : u === 2 ? '组三' : '组六';
}
// 顺子：三位互不相同且相邻(不回绕)，如 123、789；890/901 不算
function isStraight(d) {
  const s = sorted(d);
  return s[1] === s[0] + 1 && s[2] === s[1] + 1;
}

// 单条件判定：号码 d 是否满足条件 cond
function match(d, cond) {
  const arr = (cond.arr || []).map(Number);
  const inSet = v => arr.includes(v);
  let ok;
  switch (cond.id) {
    case 'plsr3002': ok = inSet(sum(d));  break;                 // 和值
    case 'plsr3004': ok = inSet(span(d)); break;                 // 跨度
    case 'plsr3001': {                                           // 胆码：至少开出 kai 个
      const kai = Number(cond.kai != null ? cond.kai : 1);
      const hit = new Set(d).size && arr.filter(x => d.includes(x)).length;
      ok = hit >= kai;
      break;
    }
    case 'plsr3025': {                                           // 定位(百/十/个)：每位 ∈ 对应集合(空=不限)
      const pos = cond.pos || [[], [], []];
      ok = d.every((v, i) => !pos[i] || pos[i].length === 0 || pos[i].map(Number).includes(v));
      break;
    }
    case 'plsr3023': {                                           // 最小/中/最大数：排序后各位 ∈ 对应集合(空=不限)
      const s = sorted(d);
      const sets = [cond.min, cond.mid, cond.max];
      ok = s.every((v, i) => !sets[i] || sets[i].length === 0 || sets[i].map(Number).includes(v));
      break;
    }
    case 'plsr3009': {                                           // 各位差值：三个独立子选择器
      // d1=|百-十|, d2=|百-个|, d3=|十-个|，各自 ∈ 对应集合(空=不限)
      const ds = [Math.abs(d[0]-d[1]), Math.abs(d[0]-d[2]), Math.abs(d[1]-d[2])];
      const sets = [cond.d1, cond.d2, cond.d3];
      ok = ds.every((v, i) => !sets[i] || sets[i].length === 0 || sets[i].map(Number).includes(v));
      break;
    }
    case 'plsr3015': {                                           // 组选形态：arr 选中 豹子/组三/组六/顺子
      const sel = cond.arr || [];
      ok = sel.includes(form(d)) || (sel.includes('顺子') && isStraight(d));
      break;
    }
    default: throw new Error('未实现的条件: ' + cond.id);
  }
  return cond.reaction ? !ok : ok;
}

// 过滤：号池依次通过所有 play 条件 (AND)。返回通过的号码字符串数组。
function filter(play, pool = POOL) {
  return pool
    .filter(d => play.every(c => match(d, c)))
    .map(d => d.join(''));
}

module.exports = { POOL, sum, span, sorted, form, isStraight, match, filter };
