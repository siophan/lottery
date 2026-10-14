# 文案编辑（发财猫需求第 1 条）：后台管理文案，客户端按 key 读取最新内容。
import pytest
from fastapi.testclient import TestClient
from app import db_texts
from app.db_agents import BizError
from tests.agent_helpers import audit, build_app, key_client, login_client, mk_admin, mk_agent_raw

def _new(tc, **kw):
    body = {"category": "rules", "key": "pl3.rules", "title": "排列三规则", "content": "<p>玩法说明</p>"}
    body.update(kw)
    return tc.post("/admin/texts", json=body)

# ---------------- HTML 清洗 ----------------

@pytest.mark.parametrize("raw, clean", [
    ("<p>你好<b>世界</b></p>", "<p>你好<b>世界</b></p>"),
    ('<p style="color: #c00; text-align:center">x</p>', '<p style="color: #c00; text-align: center">x</p>'),
    ('<span style="position:fixed;color:red">x</span>', '<span style="color: red">x</span>'),
    ("<script>alert(1)</script><p>ok</p>", "<p>ok</p>"),
    ('<style>p{}</style><p onclick="x()">ok</p>', "<p>ok</p>"),
    ('<a href="javascript:alert(1)">x</a>', "<a>x</a>"),
    ('<a href="https://ex.com/?a=1&b=2" target="_blank">x</a>',
     '<a href="https://ex.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>'),
    ("<img src=x onerror=alert(1)>", ""),
    ("<iframe src='x'></iframe>t", "t"),
    ("a < b & c", "a &lt; b &amp; c"),
    ("<p>未闭合<b>粗", "<p>未闭合<b>粗</b></p>"),
    ('<span style="color: rgb(192, 0, 0); font-weight: bold; font-family: Arial">x</span>',
     '<span style="color: rgb(192, 0, 0); font-weight: bold">x</span>'),
    ('<span style="background-color: rgba(0, 0, 0, 0.5); text-decoration: underline line-through">x</span>',
     '<span style="background-color: rgba(0, 0, 0, 0.5); text-decoration: underline line-through">x</span>'),
    ('<span style="font-size: x-large">x</span>', '<span style="font-size: x-large">x</span>'),
    ('<span style="color: rgb(1,2,3) url(x)">x</span>', "<span>x</span>"),
    ('<span style="color: expression(alert(1))">x</span>', "<span>x</span>"),
    ('<span style="background-color:url(x)">x</span>', "<span>x</span>"),
    ("<P>大写</P><BR>", "<p>大写</p><br>"),
    ("<ul><li>一</li><li>二</li></ul>", "<ul><li>一</li><li>二</li></ul>"),
    ("<div><h3>标题</h3>&nbsp;&copy;</div>", "<div><h3>标题</h3>\xa0©</div>"),
    ("<!-- 注释 --><p>x</p>", "<p>x</p>"),
])
def test_sanitize_html(raw, clean):
    assert db_texts.sanitize_html(raw) == clean

# ---------------- 后台增改删查 ----------------

def test_staff_create_list_update_delete_with_audit():
    conn, app = build_app()
    tc = key_client(app)
    r = _new(tc, content='<p>玩法<script>x</script></p>')
    assert r.status_code == 200, r.text
    t = r.json()["text"]
    assert (t["category"], t["key"], t["title"], t["content"]) == ("rules", "pl3.rules", "排列三规则", "<p>玩法</p>")
    assert t["updated_by"] == "admin-key" and isinstance(t["updated_at"], int)
    assert [x["key"] for x in tc.get("/admin/texts").json()["texts"]] == ["pl3.rules"]
    r = tc.put(f"/admin/texts/{t['id']}", json={"title": "排列三玩法", "content": "<p>新</p>", "category": "data"})
    assert r.status_code == 200 and r.json()["text"]["content"] == "<p>新</p>"
    assert r.json()["text"]["category"] == "data" and r.json()["text"]["key"] == "pl3.rules"
    assert tc.delete(f"/admin/texts/{t['id']}").json() == {"ok": True}
    assert tc.get("/admin/texts").json()["texts"] == []
    assert [len(audit(conn, a)) for a in ("text.create", "text.update", "text.delete")] == [1, 1, 1]
    assert "<p>新</p>" not in str(audit(conn, "text.update"))      # 审计只记元信息，不复制正文

def test_validation():
    conn, app = build_app()
    tc = key_client(app)
    for bad, msg in [({"category": "x"}, "分类无效"), ({"key": "A B"}, "标识"), ({"key": ""}, "标识"),
                     ({"title": " "}, "标题"), ({"title": "t" * 51}, "标题"),
                     ({"content": "x" * (db_texts.CONTENT_MAX + 1)}, "正文"), ({"content": 1}, "正文")]:
        r = _new(tc, **bad)
        assert r.status_code == 400 and msg in r.json()["error"], bad
    assert _new(tc).status_code == 200
    r = _new(tc)
    assert r.status_code == 409 and r.json()["error"] == "标识已存在"
    assert tc.put("/admin/texts/999", json={"title": "x"}).status_code == 404
    assert tc.delete("/admin/texts/999").status_code == 404
    assert tc.put("/admin/texts/1", json={"key": "other"}).status_code == 400    # 标识创建后不可改

def test_only_staff_can_manage():
    conn, app = build_app()
    mk_admin(conn, "boss", "pw")
    mk_agent_raw(conn, "ag")
    assert _new(login_client(app, "boss")).status_code == 200
    ag = login_client(app, "ag")
    assert ag.get("/admin/texts").status_code == 403
    assert _new(ag, key="x").status_code == 403
    assert TestClient(app).get("/admin/texts").status_code == 403

# ---------------- 客户端读取 ----------------

def test_client_reads_latest_by_keys_without_login():
    conn, app = build_app()
    tc = key_client(app)
    tid = _new(tc).json()["text"]["id"]
    _new(tc, key="notice.home", category="notice", title="公告", content="<p>维护</p>")
    pub = TestClient(app)
    r = pub.get("/api/texts?keys=pl3.rules,notice.home,missing")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    d = r.json()
    assert d["code"] == 0 and set(d["data"]) == {"pl3.rules", "notice.home"}
    assert d["data"]["pl3.rules"]["content"] == "<p>玩法说明</p>"
    tc.put(f"/admin/texts/{tid}", json={"content": "<p>改了</p>"})
    assert pub.get("/api/texts?keys=pl3.rules").json()["data"]["pl3.rules"]["content"] == "<p>改了</p>"

def test_client_reads_by_category_and_limits():
    conn, app = build_app()
    tc = key_client(app)
    _new(tc)
    _new(tc, key="notice.a", category="notice")
    pub = TestClient(app)
    assert set(pub.get("/api/texts?category=notice").json()["data"]) == {"notice.a"}
    assert pub.get("/api/texts").json() == {"code": 1, "msg": "缺少 keys 或 category"}
    assert pub.get("/api/texts?category=zzz").json()["code"] == 1
    too_many = ",".join(f"k{i}" for i in range(db_texts.KEYS_MAX + 1))
    assert pub.get(f"/api/texts?keys={too_many}").json()["code"] == 1

def test_categories_endpoint():
    conn, app = build_app()
    cats = key_client(app).get("/admin/texts/categories").json()["categories"]
    assert [c["value"] for c in cats] == list(db_texts.CATEGORIES)
    assert {c["label"] for c in cats} >= {"彩种规则", "数据说明", "招商文案", "系统公告"}

def test_db_layer_raises_biz_errors():
    conn, _ = build_app()
    with pytest.raises(BizError):
        db_texts.create_text(conn, category="rules", key="", title="t", content="",
                             actor_type="admin", actor="x", now=1)
