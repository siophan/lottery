# 文案编辑（发财猫需求第 1 条）：后台管理文案，客户端按 key 读取最新内容。
import json
import pathlib
import shutil
import subprocess
import pytest
from fastapi.testclient import TestClient
from app import db, db_texts
from app.db_agents import BizError
from tests.agent_helpers import audit, build_app, key_client, login_client, mk_admin, mk_agent_raw

SEEDED = sorted(t[0] for t in db_texts.DEFAULT_TEXTS)     # 预置文案的 key

def _keys(tc):
    return [x["key"] for x in tc.get("/admin/texts").json()["texts"] if x["key"] not in SEEDED]

def _new(tc, **kw):
    body = {"category": "rules", "key": "demo.rules", "title": "排列三规则", "content": "<p>玩法说明</p>"}
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
    ('<table width="100%" border="0" cellpadding="3" cellspacing="1" bgcolor="#B0D0E7"><tbody><tr>'
     '<td rowspan="2" colspan="2" align="center" bgcolor="#fff">x</td></tr></tbody></table>',
     '<table width="100%" border="0" cellpadding="3" cellspacing="1" bgcolor="#B0D0E7"><tbody><tr>'
     '<td rowspan="2" colspan="2" align="center" bgcolor="#fff">x</td></tr></tbody></table>'),
    ('<table onclick="x()" width="expression(1)" background="x.png"><tr><th align="justify" bgcolor="red"'
     ' colspan="999">t</th></tr></table>', "<table><tr><th>t</th></tr></table>"),
    ('<p width="10" bgcolor="#000">x</p>', "<p>x</p>"),                 # 表格属性只在表格标签上保留
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
    assert (t["category"], t["key"], t["title"], t["content"]) == ("rules", "demo.rules", "排列三规则", "<p>玩法</p>")
    assert t["updated_by"] == "admin-key" and isinstance(t["updated_at"], int)
    assert _keys(tc) == ["demo.rules"]
    r = tc.put(f"/admin/texts/{t['id']}", json={"title": "排列三玩法", "content": "<p>新</p>", "category": "data"})
    assert r.status_code == 200 and r.json()["text"]["content"] == "<p>新</p>"
    assert r.json()["text"]["category"] == "data" and r.json()["text"]["key"] == "demo.rules"
    assert tc.delete(f"/admin/texts/{t['id']}").json() == {"ok": True}
    assert _keys(tc) == []                                         # 只剩预置文案
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
    r = pub.get("/api/texts?keys=demo.rules,notice.home,missing")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    d = r.json()
    assert d["code"] == 0 and set(d["data"]) == {"demo.rules", "notice.home"}
    assert d["data"]["demo.rules"]["content"] == "<p>玩法说明</p>"
    tc.put(f"/admin/texts/{tid}", json={"content": "<p>改了</p>"})
    assert pub.get("/api/texts?keys=demo.rules").json()["data"]["demo.rules"]["content"] == "<p>改了</p>"

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

# ---------------- 预置文案 ----------------

def test_seed_statement_once_and_never_restored():
    conn, app = build_app()
    tc = key_client(app)
    t = next(x for x in tc.get("/admin/texts").json()["texts"] if x["key"] == "pl3sim.statement")
    assert (t["category"], t["title"], t["updated_by"]) == ("data", "发财猫软件 · 数据说明", db_texts.SEED_ACTOR)
    assert "开发主体：发财猫技术团队" in t["content"] and db_texts.sanitize_html(t["content"]) == t["content"]
    assert TestClient(app).get("/api/texts?keys=pl3sim.statement").json()["data"]["pl3sim.statement"]["content"] == t["content"]
    tc.put(f"/admin/texts/{t['id']}", json={"content": "<p>改过</p>"})
    db.init_db(conn)                                            # 重启不覆盖管理员改动
    assert db_texts.get_text(conn, t["id"])["content"] == "<p>改过</p>"
    tc.delete(f"/admin/texts/{t['id']}")
    db.init_db(conn)                                            # 删除后重启也不补回
    assert db_texts.texts_by_keys(conn, ["pl3sim.statement"]) == []

def test_seed_rules_for_four_workbenches():
    conn, app = build_app()
    got = {t["key"]: t for t in key_client(app).get("/admin/texts").json()["texts"]}
    assert set(got) == {"pl3sim.statement", "fc3d.rules", "pl3.rules", "dlt.rules", "ssq.rules"}
    for key, title, sample in [("fc3d.rules", "“3D”电脑福利彩票游戏规则", "第二十五条 本规则自批准销售之日起执行。"),
                               ("pl3.rules", "“排列3”电脑体育彩票游戏规则", "第二十三条 本规则自批准之日起执行。"),
                               ("dlt.rules", "全国体育彩票“超级大乐透”玩法介绍", "第三十二条 本规则自批准之日起执行。"),
                               ("ssq.rules", "“双色球”游戏规则", "<td width=\"10%\" rowspan=\"2\"")]:
        t = got[key]
        assert (t["category"], t["title"], t["updated_by"]) == ("rules", title, db_texts.SEED_ACTOR), key
        assert sample in t["content"] and t["content"].startswith("<h3>第一章"), key
        assert db_texts.sanitize_html(t["content"]) == t["content"], key       # 后台保存一次不会改坏内容

def test_seed_matches_client_default():
    node = shutil.which("node")
    if not node:
        pytest.skip("node 不可用")
    script = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "patch-ds-client.js"
    js = (f"const m = require({json.dumps(str(script))});"
          "const out = { 'pl3sim.statement': m.STATEMENT_DEFAULT };"
          "for (const p of Object.values(m.RULES_PAGES)) out[p.key] = m.rulesDefault(p.key);"
          "console.log(JSON.stringify(out))")
    client = json.loads(subprocess.run([node, "-e", js], capture_output=True, text=True, check=True).stdout)
    assert client == {key: {"title": title, "content": content} for key, _, title, content in db_texts.DEFAULT_TEXTS}
