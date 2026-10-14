// 一次性工具：从未打 rules 补丁的工作台 chunk 里取出左侧「游戏规则」的原文，转成 HTML，写入
// backend/app/text_defaults.json（后端首次升级时预置到「文案编辑」，客户端补丁也用它做读不到后台时的默认文案）。
// 规则区由 Vue 编译后的 render 代码生成：这里把那段 children 数组代码放进假的 _c / _v / _m 里执行，拼出等价 HTML。
// 用法：node scripts/extract-rules-texts.js（chunk 已打过 rules 补丁时会报错退出，原文只能从备份里取）
const fs = require('fs');
const path = require('path');
const { enc, RULES_PAGES, RULES_MARK } = require('./patch-ds-client');

const TABLE_ATTRS = ['width', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'align', 'rowspan', 'colspan'];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrEsc = (s) => esc(String(s)).replace(/"/g, '&quot;');

function render(code, staticTitles) {
  const vnode = (tag, data, children) => {
    if (Array.isArray(data) || typeof data === 'string') [data, children] = [{}, data];
    data = data || {};
    for (const k of Object.keys(data)) {
      if (!['attrs', 'staticClass'].includes(k)) throw new Error(`规则区出现未处理的 ${k}`);
    }
    const attrs = Object.entries(data.attrs || {}).map(([k, v]) => {
      if (!TABLE_ATTRS.includes(k)) throw new Error(`规则区出现未处理的属性 ${k}`);
      return ` ${k}="${attrEsc(v)}"`;
    }).join('');
    const kids = [].concat(children || []).join('');
    return tag === 'br' ? '<br>' : `<${tag}${attrs}>${kids}</${tag}>`;
  };
  const vm = {
    _v: (t) => esc(String(t).trim()),
    _m: (n) => {
      if (!(n in staticTitles)) throw new Error(`未知的静态节点 _m(${n})`);
      return `<h2><strong>${esc(staticTitles[n])}</strong></h2>`;
    },
  };
  return new Function('_vm', '_c', `return ${code};`)(vm, vnode);
}

function extract(raw, page) {
  const [start, end] = page.between.map((s) => enc(s, "'"));
  const i = raw.indexOf(start);
  const j = raw.indexOf(end);
  if (raw.includes(enc(RULES_MARK, "'"))) throw new Error('该 chunk 已打过 rules 补丁');
  if (i < 0 || j < i) throw new Error('找不到规则区');
  const code = new Function(`return '${raw.slice(i, j + end.length)}';`)();   // 还原 eval('...') 里的转义
  const [h2, ...rest] = render(code, page.staticTitles || {});
  const title = /^<h2><strong>(.*)<\/strong><\/h2>$/.exec(h2);
  if (!title) throw new Error('规则区第一项不是标题');
  return { title: title[1], content: rest.join('') };
}

if (require.main === module) {
  const out = path.join(__dirname, '..', 'backend', 'app', 'text_defaults.json');
  const dir = path.join(__dirname, '..', 'client', 'js');
  const defaults = [];
  for (const [name, page] of Object.entries(RULES_PAGES)) {
    const t = extract(fs.readFileSync(path.join(dir, name), 'utf8'), page);
    defaults.push({ key: page.key, category: 'rules', title: t.title, content: t.content });
    console.log(`${page.key}: ${t.title}（${t.content.length} 字符）`);
  }
  fs.writeFileSync(out, JSON.stringify(defaults, null, 1) + '\n');
  console.log(`写入 ${out}`);
}

module.exports = { render, extract };
