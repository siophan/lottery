# 文案编辑（发财猫需求第 1 条）：数据层 + 富文本清洗。表结构在 db.init_db 中统一创建。
# 正文是后台富文本编辑器产出的 HTML，客户端直接 innerHTML 渲染，入库前必须按白名单清洗。
import html
import re
import sqlite3
from html.parser import HTMLParser
from . import db
from .db_agents import BizError, begin_write

CATEGORIES = {                    # 顺序即后台下拉顺序
    "rules": "彩种规则",
    "data": "数据说明",
    "biz": "招商文案",
    "notice": "系统公告",
    "tip": "页面提示",
}
KEY_RE = re.compile(r"[a-z0-9][a-z0-9._-]{0,63}")
TITLE_MAX = 50
CONTENT_MAX = 100_000             # 清洗前的原始长度上限
KEYS_MAX = 50                     # 客户端单次按 key 读取的上限

# 预置文案：各只在首次升级时写入一次（settings 里记 text_seeded:<key>），之后管理员改动或删除都不会被补回。
# 内容须与客户端补丁里的默认值一致（scripts/patch-ds-client.js 的 STATEMENT_DEFAULT），读不到后台时客户端显示的就是它
_STATEMENT_PARAS = [
    "很多人觉得区块链技术晦涩难懂，但这项技术其实已经落地在不少生活场景之中，哈希值就是构成这套体系的关键要素之一。",
    "哈希算法能够把长短不一的数据内容，转换成一串长度固定的字符，这套转换机制依靠哈希函数完成。无论原始输入的数据体量大小，经过运算后都会输出固定长度的哈希串。在区块链体系内，哈希常用来完成信息存证与校验工作。当比对得出两份哈希结果一致，就代表原始数据没有遭到篡改。",
    "除此之外，哈希算法也是区块链达成去中心化特性的重要基础。传统中心化系统里，全部数据的存放与管控，都交由单一中心机构负责。区块链网络则完全不同，网络里每一个节点设备都会保存一份完整账本副本，针对账本里每一笔交易运算哈希值，以此达成分布式的数据存储与管理模式。",
    "哈希值同时还能够保障交易的匿名特性。区块链网络里的交易可以做到隐私保护、安全可查，原理就是每一笔交易信息都会由哈希串替代展示。这种机制可以守护使用者的个人隐私，让每一笔交易更加可靠安全。",
    "综合来看，哈希在区块链体系里承担着不可或缺的作用。一方面能够校验数据有没有被改动，保障数据完整；另一方面支撑去中心化架构，同时实现交易匿名。以上特性，共同赋予区块链出色的安全能力与可信度。",
    "伴随区块链技术持续迭代升级，哈希相关技术未来会拓展到更多行业场景落地使用。",
    "发财猫软件提取哈希运算结果末尾5位数字，作为体彩排列五的模拟开奖号码，同时可供给排列三玩法，用来开展数据模拟推演练习。",
    "开发主体：发财猫技术团队",
]
DEFAULT_TEXTS = [  # (key, category, title, content)
    ("pl3sim.statement", "data", "发财猫软件 · 数据说明",
     "".join(f"<p>{p}</p>" for p in _STATEMENT_PARAS)
     + "<p><strong>法律声明</strong></p><p>严禁任何组织、个人利用本组模拟数据开展各类违法活动，一旦违规，相关主体将承担对应的法律责任！</p>"),
]
SEED_ACTOR = "系统"

def seed_defaults(conn, now: int) -> None:
    for key, category, title, content in DEFAULT_TEXTS:
        flag = f"text_seeded:{key}"
        if conn.execute("SELECT 1 FROM settings WHERE key=?", (flag,)).fetchone():
            continue
        conn.execute("INSERT OR IGNORE INTO site_texts(category,key,title,content,updated_at,updated_by,created_at)"
                     " VALUES(?,?,?,?,?,?,?)", (category, key, title, content, now, SEED_ACTOR, now))
        conn.execute("INSERT INTO settings(key,value) VALUES(?,?)", (flag, "1"))
    conn.commit()

# ---------------- HTML 清洗 ----------------

_TAGS = {"p", "br", "b", "strong", "i", "em", "u", "s", "span", "div", "blockquote",
         "h1", "h2", "h3", "h4", "ul", "ol", "li", "a"}
_VOID = {"br"}
_DROP_CONTENT = {"script", "style", "iframe", "object", "embed", "noscript", "template",
                 "textarea", "select", "title", "svg", "math"}
_STYLE_PROPS = {"color", "background-color", "text-align", "font-size", "font-weight",
                "font-style", "text-decoration", "line-height"}
# 样式值：空格分隔的若干记号；rgb() 内部允许空格（浏览器生成的颜色就是 rgb(192, 0, 0)）
_STYLE_TOKEN = r"(?:#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|[a-zA-Z-]+|\d+(?:\.\d+)?(?:px|em|rem|pt|%)?)"
_STYLE_VALUE = re.compile(rf"{_STYLE_TOKEN}(?:\s+{_STYLE_TOKEN})*")
_HREF_OK = re.compile(r"(https?:|mailto:)", re.I)

def _clean_style(value: str) -> str:
    out = []
    for decl in value.split(";"):
        prop, sep, val = decl.partition(":")
        prop, val = prop.strip().lower(), val.strip()
        if not sep or prop not in _STYLE_PROPS or not val or len(val) > 60:
            continue
        if val.lower().startswith(("expression", "url")) or not _STYLE_VALUE.fullmatch(val):
            continue
        out.append(f"{prop}: {val}")
    return "; ".join(out)

class _Cleaner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[str] = []
        self.drop = 0             # 位于需整段丢弃的标签（script 等）内部的深度

    def _attrs(self, tag: str, attrs) -> str:
        parts = []
        for name, value in attrs:
            value = value or ""
            if name == "style":
                style = _clean_style(value)
                if style:
                    parts.append(("style", style))
            elif tag == "a" and name == "href" and _HREF_OK.match(value.strip()):
                parts.append(("href", value.strip()))
            elif tag == "a" and name == "target" and value == "_blank":
                parts.append(("target", "_blank"))
                parts.append(("rel", "noopener noreferrer"))
        return "".join(f' {n}="{html.escape(v, quote=True)}"' for n, v in parts)

    def handle_starttag(self, tag, attrs):
        if tag in _DROP_CONTENT:
            self.drop += 1
            return
        if self.drop or tag not in _TAGS:
            return
        self.out.append(f"<{tag}{self._attrs(tag, attrs)}>")
        if tag not in _VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        if tag not in _DROP_CONTENT and not self.drop and tag in _TAGS:
            self.out.append(f"<{tag}{self._attrs(tag, attrs)}>")
            if tag not in _VOID:
                self.out.append(f"</{tag}>")

    def handle_endtag(self, tag):
        if tag in _DROP_CONTENT:
            self.drop = max(0, self.drop - 1)
            return
        if self.drop or tag not in self.stack:
            return
        while self.stack:                 # 补齐中间未闭合的标签
            t = self.stack.pop()
            self.out.append(f"</{t}>")
            if t == tag:
                break

    def handle_data(self, data):
        if not self.drop:
            self.out.append(html.escape(data, quote=False))

    def result(self) -> str:
        self.close()
        while self.stack:
            self.out.append(f"</{self.stack.pop()}>")
        return "".join(self.out)

def sanitize_html(raw: str) -> str:
    """白名单清洗：只留排版类标签与安全的 style / 链接，其余标签去掉（script 等连内容一起去掉）。"""
    c = _Cleaner()
    c.feed(raw)
    return c.result()

# ---------------- 校验 ----------------

def _check_category(v) -> str:
    if v not in CATEGORIES:
        raise BizError("分类无效")
    return v

def _check_key(v) -> str:
    if not isinstance(v, str) or not KEY_RE.fullmatch(v):
        raise BizError("标识只能用小写字母、数字和 . _ -，以字母或数字开头，最多 64 位")
    return v

def _check_title(v) -> str:
    if not isinstance(v, str) or not v.strip() or len(v.strip()) > TITLE_MAX:
        raise BizError(f"标题不能为空，最多 {TITLE_MAX} 个字")
    return v.strip()

def _check_content(v) -> str:
    if not isinstance(v, str) or len(v) > CONTENT_MAX:
        raise BizError(f"正文无效或过长（最多 {CONTENT_MAX} 个字符）")
    return sanitize_html(v)

# ---------------- 增删改查 ----------------

def _row(r: sqlite3.Row) -> dict:
    return {k: r[k] for k in ("id", "category", "key", "title", "content", "updated_at", "updated_by",
                              "created_at")}

def get_text(conn, text_id: int) -> dict | None:
    if not db.valid_id(text_id):
        return None
    r = conn.execute("SELECT * FROM site_texts WHERE id=?", (text_id,)).fetchone()
    return _row(r) if r else None

def list_texts(conn) -> list[dict]:
    return [_row(r) for r in conn.execute("SELECT * FROM site_texts ORDER BY category, key")]

def texts_by_keys(conn, keys: list[str]) -> list[dict]:
    if not keys:
        return []
    marks = ",".join("?" * len(keys))
    return [_row(r) for r in conn.execute(f"SELECT * FROM site_texts WHERE key IN ({marks})", keys)]

def texts_by_category(conn, category: str) -> list[dict]:
    return [_row(r) for r in conn.execute("SELECT * FROM site_texts WHERE category=? ORDER BY key",
                                          (category,))]

def _meta(t: dict) -> dict:
    # 审计只记元信息与正文长度，不复制正文
    return {"category": t["category"], "title": t["title"], "length": len(t["content"])}

def create_text(conn, *, category, key, title, content, actor_type: str, actor: str, now: int) -> dict:
    category, key, title = _check_category(category), _check_key(key), _check_title(title)
    content = _check_content(content)
    begin_write(conn)
    try:
        cur = conn.execute(
            "INSERT INTO site_texts(category,key,title,content,updated_at,updated_by,created_at)"
            " VALUES(?,?,?,?,?,?,?)", (category, key, title, content, now, actor, now))
        t = get_text(conn, cur.lastrowid)
        db._audit_nocommit(conn, actor_type, actor, "text.create", key, _meta(t), now)
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise BizError("标识已存在", 409)
    except Exception:
        conn.rollback()
        raise
    return t

def update_text(conn, text_id: int, changes: dict, *, actor_type: str, actor: str, now: int) -> dict:
    cur = get_text(conn, text_id)
    if cur is None:
        raise BizError("文案不存在", 404)
    if "key" in changes and changes["key"] != cur["key"]:
        raise BizError("标识创建后不能修改（客户端按标识读取）")
    new = dict(cur)
    if "category" in changes:
        new["category"] = _check_category(changes["category"])
    if "title" in changes:
        new["title"] = _check_title(changes["title"])
    if "content" in changes:
        new["content"] = _check_content(changes["content"])
    begin_write(conn)
    try:
        conn.execute("UPDATE site_texts SET category=?, title=?, content=?, updated_at=?, updated_by=?"
                     " WHERE id=?", (new["category"], new["title"], new["content"], now, actor, text_id))
        db._audit_nocommit(conn, actor_type, actor, "text.update", cur["key"], _meta(new), now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return get_text(conn, text_id)

def delete_text(conn, text_id: int, *, actor_type: str, actor: str, now: int) -> None:
    cur = get_text(conn, text_id)
    if cur is None:
        raise BizError("文案不存在", 404)
    begin_write(conn)
    try:
        conn.execute("DELETE FROM site_texts WHERE id=?", (text_id,))
        db._audit_nocommit(conn, actor_type, actor, "text.delete", cur["key"], _meta(cur), now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
