import pytest
from fastapi.testclient import TestClient
from app import db, db_agents
from app.db_agents import BizError, NAME_RESERVE_SEC
from tests.agent_helpers import (audit, build_app, key_client, login_client, mk_admin,
                                 mk_agent_raw)

NOW = 1_800_000_000

def new_agent(conn, name, *, tier="general", parent=None, region="city", now=NOW):
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
    assert e["target"] == "华东一号" and e["detail"] == {"region": "province", "tier": "general",
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
               tier="general", parent_agent_id=None, actor_type="admin", actor="r", now=NOW).msg == "地区标签无效"
    assert biz(db_agents.create_agent, conn, name="a", password="Passw0rd!", region="city",
               tier="boss", parent_agent_id=None, actor_type="admin", actor="r", now=NOW).msg == "级别无效"
    assert biz(db_agents.create_agent, conn, name="a", password="short", region="city",
               tier="general", parent_agent_id=None, actor_type="admin", actor="r", now=NOW).msg == "密码长度需为 8–64 位"
    assert conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM admins").fetchone()[0] == 0

# ---------------- 上级与级别 ----------------

def test_parent_rules():
    conn, _ = build_app()
    top = new_agent(conn, "top")
    prov = new_agent(conn, "pv", tier="province", parent=top.id)
    city = new_agent(conn, "ct", tier="city", parent=prov.id)
    assert new_agent(conn, "ct2", tier="city", parent=top.id).parent_agent_id == top.id   # 可跨级挂靠
    assert biz(new_agent, conn, "x1", parent=999).msg == "上级代理不存在"
    for parent, tier in [(city.id, "city"), (prov.id, "province"), (top.id, "general"), (prov.id, "general")]:
        assert biz(new_agent, conn, "x2", tier=tier, parent=parent).msg == "上级的级别必须高于本代理"
    status(conn, top.id, "paused")
    assert biz(new_agent, conn, "x3", tier="city", parent=top.id).msg == "上级代理资格不是激活状态"

def test_parent_cannot_be_self_or_descendant():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    b = new_agent(conn, "b", tier="province", parent=a.id)
    c = new_agent(conn, "c", tier="city", parent=b.id)
    upd = lambda aid, pid: db_agents.update_agent(conn, aid, actor_type="admin", actor="r",
                                                 now=NOW, parent_agent_id=pid)
    assert biz(upd, a.id, a.id).msg == "上级不能是自己"
    assert biz(upd, a.id, c.id).msg == "上级的级别必须高于本代理"   # 下级级别必然更低，按级别先拦下
    assert upd(c.id, a.id).parent_agent_id == a.id          # 合法改挂（跨级）
    assert upd(c.id, None).parent_agent_id is None          # 解除上级

def test_parent_cycle_blocked_on_dirty_data():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "a", tier="city")                # 绕过校验造出「市代下面挂总代」的脏数据
    b = mk_agent_raw(conn, "b", tier="general", parent=a)
    e = biz(db_agents.update_agent, conn, a, actor_type="admin", actor="r", now=NOW, parent_agent_id=b)
    assert e.msg == "不能把自己的下级设为上级"

def test_tier_change_respects_children_and_parent():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    b = new_agent(conn, "b", tier="province", parent=a.id)
    upd = lambda aid, **k: db_agents.update_agent(conn, aid, actor_type="admin", actor="r", now=NOW, **k)
    e = biz(upd, a.id, tier="province")
    assert e.msg == "该代理有同级或更高级别的下级，不能改为省代" and e.status == 409
    assert biz(upd, b.id, tier="general").msg == "上级的级别必须高于本代理"
    assert upd(b.id, tier="city").tier == "city"           # 降级：上级仍高于本代理
    assert upd(a.id, tier="province").tier == "province"   # 下级已是市代，可降为省代
    assert biz(upd, a.id, tier="city").msg == "该代理有同级或更高级别的下级，不能改为市代"
    assert upd(b.id, tier="province", parent_agent_id=None).tier == "province"   # 同时解除上级再升级
    assert audit(conn, "agent.update")[0]["detail"] == {"tier": {"from": "city", "to": "province"},
                                                        "parent_agent_id": {"from": a.id, "to": None}}

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
                                        "tier": "general"})
    assert r.status_code == 200 and r.json()["agent"]["name"] == "top"
    top = r.json()["agent"]["id"]
    r = tc.post("/admin/agents", json={"name": "kid", "password": "Passw0rd!", "region": "vip",
                                        "tier": "city", "parent_agent_id": top})
    kid = r.json()["agent"]["id"]
    r = tc.post("/admin/agents", json={"name": "TOP", "password": "Passw0rd!", "region": "city",
                                        "tier": "general"})
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
    mk_agent_raw(conn, "kid", tier="city", parent=me)
    mk_agent_raw(conn, "other")
    tc = login_client(app, "me")
    assert [a["name"] for a in tc.get("/admin/agents").json()["agents"]] == ["kid"]
    r = tc.post("/admin/agents", json={"name": "z", "password": "Passw0rd!", "region": "city",
                                        "tier": "general"})
    assert r.status_code == 403 and r.json()["error"] == "只能开通低于自身级别的代理"
    assert tc.patch(f"/admin/agents/{me}", json={"region": "vip"}).status_code == 403
    assert tc.post(f"/admin/agents/{me}/status", json={"status": "paused", "reason": "x"}).status_code == 403
    assert TestClient(app).get("/admin/agents").status_code == 403

def test_paused_agent_login_blocked_end_to_end():
    conn, app = build_app()
    tc = key_client(app)
    aid = tc.post("/admin/agents", json={"name": "ag", "password": "Passw0rd!", "region": "city",
                                          "tier": "city"}).json()["agent"]["id"]
    agent_tc = login_client(app, "ag", "Passw0rd!")
    tc.post(f"/admin/agents/{aid}/status", json={"status": "paused", "reason": "x"})
    assert agent_tc.get("/admin/agents").status_code == 403          # 已有会话被逐请求拒绝
    r = TestClient(app).post("/admin/login", json={"username": "ag", "password": "Passw0rd!"})
    assert r.status_code == 403 and r.json()["error"] == "代理资格已暂停，无法登录"

# ---------------- 代理开通下级代理（发财猫需求第 2 条） ----------------

def test_general_agent_creates_child_with_own_region_and_audit():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me", region="province")
    tc = login_client(app, "me")
    r = tc.post("/admin/agents", json={"name": "kid", "password": "Passw0rd!"})
    assert r.status_code == 200, r.text
    a = r.json()["agent"]
    # 不传级别：低一级（总代 → 省代）
    assert (a["tier"], a["parent_agent_id"], a["region"], a["status"]) == ("province", me, "province", "active")
    # 新代理用自己的账号密码登录后台（0 积分时 login_client 先补 1 分）
    assert login_client(app, "kid", "Passw0rd!").get("/admin/me").json()["agent"]["id"] == a["id"]
    r = tc.post("/admin/agents", json={"name": "kid2", "password": "Passw0rd!", "tier": "city"})
    assert r.status_code == 200 and r.json()["agent"]["tier"] == "city"      # 总代也可直接开市代
    assert [x["name"] for x in tc.get("/admin/agents").json()["agents"]] == ["kid", "kid2"]
    logs = audit(conn, "agent.create")
    assert len(logs) == 2 and logs[0]["actor_type"] == "agent" and logs[0]["actor"] == "me"

def test_province_agent_creates_city_only():
    conn, app = build_app()
    boss = mk_agent_raw(conn, "boss")
    me = mk_agent_raw(conn, "me", tier="province", parent=boss)
    tc = login_client(app, "me")
    for tier in ("province", "general", "boss"):
        r = tc.post("/admin/agents", json={"name": "kid", "password": "Passw0rd!", "tier": tier})
        assert r.status_code == 403 and r.json()["error"] == "只能开通低于自身级别的代理", tier
    r = tc.post("/admin/agents", json={"name": "kid", "password": "Passw0rd!"})
    assert r.status_code == 200 and (r.json()["agent"]["tier"], r.json()["agent"]["parent_agent_id"]) == ("city", me)

def test_agent_create_rejects_tier_parent_region_beyond_own():
    """级别只能低于本人、上级只能是自己；地区标签沿用本人（传了别的值按越权拒绝）。"""
    conn, app = build_app()
    me = mk_agent_raw(conn, "me", region="city")
    other = mk_agent_raw(conn, "other")
    tc = login_client(app, "me")
    base = {"name": "kid", "password": "Passw0rd!"}
    for extra in ({"tier": "general"}, {"parent_agent_id": other}, {"parent_agent_id": None},
                  {"region": "vip"}):
        r = tc.post("/admin/agents", json={**base, **extra})
        assert r.status_code == 403 and r.json()["error"] == "只能开通低于自身级别的代理", extra
    ok = tc.post("/admin/agents", json={**base, "tier": "city", "parent_agent_id": me, "region": "city"})
    assert ok.status_code == 200, ok.text
    assert audit(conn, "agent.create")[0]["actor"] == "me"

def test_city_agent_cannot_create_agents():
    conn, app = build_app()
    boss = mk_agent_raw(conn, "boss")
    mk_agent_raw(conn, "jr", tier="city", parent=boss)
    r = login_client(app, "jr").post("/admin/agents", json={"name": "kid", "password": "Passw0rd!"})
    assert r.status_code == 403 and r.json()["error"] == "市代不能开通下级代理"
    assert audit(conn, "agent.create") == []

def test_agent_create_still_validates_name_and_password():
    conn, app = build_app()
    mk_agent_raw(conn, "me")
    mk_admin(conn, "staffer")
    tc = login_client(app, "me")
    assert tc.post("/admin/agents", json={"name": "Staffer", "password": "Passw0rd!"}).status_code == 409
    r = tc.post("/admin/agents", json={"name": "kid", "password": "1"})
    assert r.status_code == 400 and r.json()["ok"] is False

# ---------------- 开通时自动生成密码（发财猫需求第 2 条） ----------------

@pytest.mark.parametrize("pw", [None, "", "   "])
def test_create_without_password_generates_one_and_returns_it_once(pw):
    conn, app = build_app()
    body = {"name": "gen", "region": "city", "tier": "city"}
    if pw is not None:
        body["password"] = pw
    r = key_client(app).post("/admin/agents", json=body)
    assert r.status_code == 200, r.text
    gen = r.json()["generated_password"]
    assert 8 <= len(gen) <= 64 and any(c.isalpha() for c in gen) and any(c.isdigit() for c in gen)
    assert login_client(app, "gen", gen).get("/admin/me").json()["agent"]["name"] == "gen"
    # 只出现在本次响应里：列表、审计都不含明文
    assert gen not in key_client(app).get("/admin/agents").text
    assert gen not in str(audit(conn, "agent.create"))

def test_create_with_password_does_not_return_generated():
    conn, app = build_app()
    r = key_client(app).post("/admin/agents", json={"name": "a", "password": "Passw0rd!",
                                                     "region": "city", "tier": "city"})
    assert r.status_code == 200 and "generated_password" not in r.json()

def test_agent_created_child_can_get_generated_password():
    conn, app = build_app()
    mk_agent_raw(conn, "me")
    r = login_client(app, "me").post("/admin/agents", json={"name": "kid"})
    assert r.status_code == 200, r.text
    assert login_client(app, "kid", r.json()["generated_password"]).get("/admin/me").status_code == 200

def test_generated_passwords_differ():
    from app.routes.admin_agents import generate_password
    pws = {generate_password() for _ in range(50)}
    assert len(pws) == 50

# ---------------- 代理查看本人名下的开通记录 ----------------

def test_agent_creation_logs_cover_own_children_only_and_hide_staff_names():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me")
    mk_agent_raw(conn, "other")
    key = key_client(app)
    key.post("/admin/agents", json={"name": "byStaff", "password": "Passw0rd!", "region": "city",
                                    "tier": "city", "parent_agent_id": me})
    key.post("/admin/agents", json={"name": "notMine", "password": "Passw0rd!", "region": "city",
                                    "tier": "city", "parent_agent_id": None})
    tc = login_client(app, "me")
    tc.post("/admin/agents", json={"name": "byMe", "password": "Passw0rd!"})
    other = login_client(app, "other")
    other.post("/admin/agents", json={"name": "theirs", "password": "Passw0rd!"})
    r = tc.get("/admin/agents/creation-logs")
    assert r.status_code == 200, r.text
    logs = r.json()["logs"]
    assert [(x["name"], x["actor_type"], x["actor"]) for x in logs] == [
        ("byMe", "agent", "me"), ("byStaff", "admin", "后台")]
    assert all(isinstance(x["created_at"], int) for x in logs) and r.json()["total"] == 2
    assert other.get("/admin/agents/creation-logs").json()["total"] == 1

def test_agent_creation_logs_paging_and_role():
    conn, app = build_app()
    mk_agent_raw(conn, "me")
    tc = login_client(app, "me")
    for i in range(3):
        tc.post("/admin/agents", json={"name": f"k{i}", "password": "Passw0rd!"})
    r = tc.get("/admin/agents/creation-logs?limit=2&offset=2").json()
    assert r["total"] == 3 and [x["name"] for x in r["logs"]] == ["k0"]
    assert tc.get("/admin/agents/creation-logs?limit=x").status_code == 400
    assert key_client(app).get("/admin/agents/creation-logs").status_code == 403   # 后台人员看操作日志
    assert TestClient(app).get("/admin/agents/creation-logs").status_code == 403

# ---------------- 级别迁移：高级 / 低级 → 总代 / 省代 / 市代 ----------------

def test_migrate_old_tiers():
    conn, _ = build_app()
    top = mk_agent_raw(conn, "top", tier="senior")
    mid = mk_agent_raw(conn, "mid", tier="senior", parent=top)      # 高级挂高级（旧规则允许）
    jr = mk_agent_raw(conn, "jr", tier="junior", parent=mid)
    solo = mk_agent_raw(conn, "solo", tier="junior")
    db.init_db(conn)
    tiers = {a: db_agents.get_agent(conn, a).tier for a in (top, mid, jr, solo)}
    assert tiers == {top: "general", mid: "province", jr: "city", solo: "city"}
    logs = audit(conn, "agent.update")
    assert len(logs) == 4 and {l["actor_type"] for l in logs} == {"system"}
    assert {l["target"]: l["detail"]["tier"]["to"] for l in logs} == {"top": "general", "mid": "province",
                                                                     "jr": "city", "solo": "city"}
    db.init_db(conn)                                                # 再次启动不重复迁移
    assert len(audit(conn, "agent.update")) == 4
