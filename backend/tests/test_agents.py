import pytest
from fastapi.testclient import TestClient
from app import db, db_agents
from app.db_agents import BizError, NAME_RESERVE_SEC
from tests.agent_helpers import (audit, build_app, key_client, login_client, mk_admin,
                                 mk_agent_raw)

NOW = 1_800_000_000

def new_agent(conn, name, *, tier="senior", parent=None, region="city", now=NOW):
    return db_agents.create_agent(conn, name=name, password="Passw0rd!", region=region, tier=tier,
                                  parent_agent_id=parent, actor_type="admin", actor="root", now=now)

def status(conn, agent_id, to, reason="测试", now=NOW):
    return db_agents.set_agent_status(conn, agent_id, to, reason, actor_type="admin",
                                      actor="root", now=now)

def biz(fn, *a, **k) -> BizError:
    with pytest.raises(BizError) as ei:
        fn(*a, **k)
    return ei.value

# ---------------- 新建与名称 ----------------

def test_create_agent_creates_login_identity_and_audits():
    conn, app = build_app()
    a = new_agent(conn, "  华东一号 ", region="province")
    assert a.name == "华东一号" and a.name_key == "华东一号" and a.status == "active"
    adm = db.get_admin_by_id(conn, a.admin_id)
    assert adm.username == "华东一号" and adm.role == "agent"
    e = audit(conn, "agent.create")[0]
    assert e["target"] == "华东一号" and e["detail"] == {"region": "province", "tier": "senior",
                                                       "parent_agent_id": None}
    assert login_client(app, "华东一号", "Passw0rd!").get("/admin/me").json()["role"] == "agent"

@pytest.mark.parametrize("bad,msg", [("", "名称需为 1–20 个字符"), ("   ", "名称需为 1–20 个字符"),
                                     ("x" * 21, "名称需为 1–20 个字符"), (5, "名称需为 1–20 个字符"),
                                     ("a#b", "名称不能包含 #")])
def test_name_format(bad, msg):
    conn, _ = build_app()
    assert biz(new_agent, conn, bad).msg == msg

def test_name_unique_case_insensitive_and_vs_staff_usernames():
    conn, _ = build_app()
    new_agent(conn, "Alpha")
    e = biz(new_agent, conn, " alpha ")
    assert e.msg == "该名称已被使用" and e.status == 409
    mk_admin(conn, "Boss")
    assert biz(new_agent, conn, "BOSS").msg == "该名称已被使用"

def test_create_validates_region_tier_password():
    conn, _ = build_app()
    assert biz(db_agents.create_agent, conn, name="a", password="Passw0rd!", region="mars",
               tier="senior", parent_agent_id=None, actor_type="admin", actor="r", now=NOW).msg == "地区标签无效"
    assert biz(db_agents.create_agent, conn, name="a", password="Passw0rd!", region="city",
               tier="boss", parent_agent_id=None, actor_type="admin", actor="r", now=NOW).msg == "级别无效"
    assert biz(db_agents.create_agent, conn, name="a", password="short", region="city",
               tier="senior", parent_agent_id=None, actor_type="admin", actor="r", now=NOW).msg == "密码长度需为 8–64 位"
    assert conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM admins").fetchone()[0] == 0

# ---------------- 上级与级别 ----------------

def test_parent_rules():
    conn, _ = build_app()
    top = new_agent(conn, "top")
    junior = new_agent(conn, "jr", tier="junior", parent=top.id)
    assert biz(new_agent, conn, "x1", parent=999).msg == "上级代理不存在"
    assert biz(new_agent, conn, "x2", parent=junior.id).msg == "上级必须是高级代理"
    status(conn, top.id, "paused")
    assert biz(new_agent, conn, "x3", parent=top.id).msg == "上级代理资格不是激活状态"

def test_parent_cannot_be_self_or_descendant():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    b = new_agent(conn, "b", parent=a.id)
    c = new_agent(conn, "c", parent=b.id)
    upd = lambda aid, pid: db_agents.update_agent(conn, aid, actor_type="admin", actor="r",
                                                 now=NOW, parent_agent_id=pid)
    assert biz(upd, a.id, a.id).msg == "上级不能是自己"
    assert biz(upd, a.id, c.id).msg == "不能把自己的下级设为上级"
    assert biz(upd, a.id, b.id).msg == "不能把自己的下级设为上级"
    assert upd(c.id, a.id).parent_agent_id == a.id          # 合法改挂
    assert upd(c.id, None).parent_agent_id is None          # 解除上级

def test_senior_to_junior_blocked_while_has_children():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    b = new_agent(conn, "b", parent=a.id)
    e = biz(db_agents.update_agent, conn, a.id, actor_type="admin", actor="r", now=NOW, tier="junior")
    assert e.msg == "该代理仍有下级，不能改为低级代理" and e.status == 409
    db_agents.update_agent(conn, b.id, actor_type="admin", actor="r", now=NOW, parent_agent_id=None)
    assert db_agents.update_agent(conn, a.id, actor_type="admin", actor="r", now=NOW,
                                  tier="junior").tier == "junior"

def test_update_audits_only_changes():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    db_agents.update_agent(conn, a.id, actor_type="admin", actor="r", now=NOW, region="city")
    assert audit(conn, "agent.update") == []
    db_agents.update_agent(conn, a.id, actor_type="admin", actor="r", now=NOW, region="vip")
    assert audit(conn, "agent.update")[0]["detail"] == {"region": {"from": "city", "to": "vip"}}

# ---------------- 资格状态 ----------------

def test_status_requires_reason_and_valid_transition():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    assert biz(status, conn, a.id, "paused", reason="  ").msg == "请填写变更原因"
    assert biz(status, conn, a.id, "paused", reason="x" * 201).msg == "变更原因不能超过200字"
    assert biz(status, conn, a.id, "frozen").msg == "资格状态无效"
    assert biz(status, conn, a.id, "active").msg == "资格状态未变化"
    status(conn, a.id, "cancelled")
    assert biz(status, conn, a.id, "paused").msg == "已取消的代理只能恢复为激活"

def test_status_change_records_who_when_why_and_audits():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    a = db_agents.set_agent_status(conn, a.id, "paused", " 违规 ", actor_type="admin",
                                   actor="boss", now=NOW + 5)
    assert (a.status, a.status_by, a.status_at, a.status_reason) == ("paused", "boss", NOW + 5, "违规")
    assert audit(conn, "agent.status")[0]["detail"] == {"from": "active", "to": "paused",
                                                        "reason": "违规"}

def test_cancel_reserves_name_for_one_year_then_releases():
    conn, app = build_app()
    a = new_agent(conn, "alpha")
    status(conn, a.id, "cancelled", now=NOW)
    r = conn.execute("SELECT * FROM agent_name_reservations WHERE name_key='alpha'").fetchone()
    assert r["agent_id"] == a.id and r["reserved_until"] == NOW + NAME_RESERVE_SEC
    assert biz(new_agent, conn, "ALPHA", now=NOW + NAME_RESERVE_SEC - 1).msg == "该名称已被使用"
    b = new_agent(conn, "ALPHA", now=NOW + NAME_RESERVE_SEC + 1)          # 保留期已过：可被他人使用
    assert b.name == "ALPHA"
    old = db_agents.get_agent(conn, a.id)
    assert old.name_key is None and db.get_admin_by_id(conn, old.admin_id).username == f"alpha#{a.id}"
    e = biz(status, conn, a.id, "active", now=NOW + NAME_RESERVE_SEC + 2)
    assert e.msg == "该代理的名称已被他人使用，不能恢复"

def test_restore_before_recycle_keeps_name_and_drops_reservation():
    conn, _ = build_app()
    a = new_agent(conn, "alpha")
    status(conn, a.id, "cancelled")
    assert status(conn, a.id, "active").status == "active"
    assert conn.execute("SELECT COUNT(*) FROM agent_name_reservations").fetchone()[0] == 0
    assert biz(new_agent, conn, "alpha").msg == "该名称已被使用"     # 名称仍归本人

def test_restore_blocked_after_recycle():
    conn, _ = build_app()
    a = new_agent(conn, "alpha")
    status(conn, a.id, "cancelled")
    conn.execute("UPDATE agents SET recycled_at=? WHERE id=?", (NOW, a.id)); conn.commit()
    assert biz(status, conn, a.id, "active").msg == "该代理已回收，不能恢复"

# ---------------- 路由 ----------------

def test_routes_create_patch_status_password_and_list():
    conn, app = build_app()
    tc = key_client(app)
    r = tc.post("/admin/agents", json={"name": "top", "password": "Passw0rd!", "region": "city",
                                        "tier": "senior"})
    assert r.status_code == 200 and r.json()["agent"]["name"] == "top"
    top = r.json()["agent"]["id"]
    r = tc.post("/admin/agents", json={"name": "kid", "password": "Passw0rd!", "region": "vip",
                                        "tier": "junior", "parent_agent_id": top})
    kid = r.json()["agent"]["id"]
    r = tc.post("/admin/agents", json={"name": "TOP", "password": "Passw0rd!", "region": "city",
                                        "tier": "senior"})
    assert r.status_code == 409 and r.json() == {"ok": False, "error": "该名称已被使用"}
    assert tc.patch(f"/admin/agents/{kid}", json={"region": "province"}).json()["agent"]["region"] == "province"
    r = tc.patch(f"/admin/agents/{kid}", json={"name": "x"})
    assert r.status_code == 400 and r.json()["error"] == "改名请使用「改名」功能"
    r = tc.patch(f"/admin/agents/{kid}", json={"parent_agent_id": True})
    assert r.status_code == 400
    assert tc.patch("/admin/agents/999", json={"region": "vip"}).status_code == 404
    r = tc.post(f"/admin/agents/{kid}/status", json={"status": "paused"})
    assert r.status_code == 400 and r.json()["error"] == "请填写变更原因"
    assert tc.post(f"/admin/agents/{kid}/status",
                   json={"status": "paused", "reason": "x"}).json()["agent"]["status"] == "paused"
    assert tc.post(f"/admin/agents/{top}/password", json={"password": "NewPassw0rd"}).json() == {"ok": True}
    login_client(app, "top", "NewPassw0rd")
    agents = {a["name"]: a for a in tc.get("/admin/agents").json()["agents"]}
    assert agents["kid"]["parent_name"] == "top" and agents["top"]["children"] == 1
    assert agents["top"]["total"] == 0 and agents["top"]["unactivated"] == 0

def test_list_stats_count_owned_accounts():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag1")
    for code, activated in (("1000001", False), ("1000002", True), ("1000003", True)):
        u = db.create_user(conn, code, "pw", None, pending=not activated)
        conn.execute("UPDATE users SET agent_id=? WHERE id=?", (aid, u.id))
    conn.commit()
    a = key_client(app).get("/admin/agents").json()["agents"][0]
    assert (a["total"], a["activated"], a["unactivated"]) == (3, 2, 1)

def test_agent_sees_only_direct_children_and_cannot_mutate():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me")
    mk_agent_raw(conn, "kid", tier="junior", parent=me)
    mk_agent_raw(conn, "other")
    tc = login_client(app, "me")
    assert [a["name"] for a in tc.get("/admin/agents").json()["agents"]] == ["kid"]
    r = tc.post("/admin/agents", json={"name": "z", "password": "Passw0rd!", "region": "city",
                                        "tier": "senior"})
    assert r.status_code == 403 and r.json() == {"error": "forbidden"}
    assert tc.patch(f"/admin/agents/{me}", json={"region": "vip"}).status_code == 403
    assert tc.post(f"/admin/agents/{me}/status", json={"status": "paused", "reason": "x"}).status_code == 403
    assert TestClient(app).get("/admin/agents").status_code == 403

def test_paused_agent_login_blocked_end_to_end():
    conn, app = build_app()
    tc = key_client(app)
    aid = tc.post("/admin/agents", json={"name": "ag", "password": "Passw0rd!", "region": "city",
                                          "tier": "junior"}).json()["agent"]["id"]
    agent_tc = login_client(app, "ag", "Passw0rd!")
    tc.post(f"/admin/agents/{aid}/status", json={"status": "paused", "reason": "x"})
    assert agent_tc.get("/admin/agents").status_code == 403          # 已有会话被逐请求拒绝
    r = TestClient(app).post("/admin/login", json={"username": "ag", "password": "Passw0rd!"})
    assert r.status_code == 403 and r.json()["error"] == "代理资格已暂停，无法登录"
