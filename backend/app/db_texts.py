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
