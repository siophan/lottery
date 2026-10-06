from fastapi.testclient import TestClient
from app import db, db_agents, db_staff
from app.db_agents import NAME_RESERVE_SEC
from tests.agent_helpers import audit, build_app, key_client, login_client, mk_admin, mk_agent_raw

NOW = 1_800_000_000

# ---------------- 改名 ----------------

def test_super_and_key_can_rename_and_old_name_reserved():
    conn, app = build_app()
    mk_admin(conn, "boss", role="super")
    aid = mk_agent_raw(conn, "alpha")
    r = login_client(app, "boss").post(f"/admin/agents/{aid}/rename", json={"name": "beta"})
    assert r.status_code == 200 and r.json()["agent"]["name"] == "beta"
    assert db.get_admin_by_id(conn, db_agents.get_agent(conn, aid).admin_id).username == "beta"
    login_client(app, "beta")                                  # 登录名随之改变
    e = audit(conn, "agent.rename")[0]
    assert e["actor"] == "boss" and e["detail"] == {"from": "alpha", "to": "beta"}
    tc = key_client(app)
    r = tc.post("/admin/agents", json={"name": "Alpha", "password": "Passw0rd!", "region": "city",
                                        "tier": "junior"})
    assert r.status_code == 409 and r.json()["error"] == "该名称已被使用"
    assert tc.post(f"/admin/agents/{aid}/rename", json={"name": "ALPHA"}).status_code == 200   # 本人改回旧名
    assert conn.execute("SELECT name_key FROM agent_name_reservations").fetchall()[0]["name_key"] == "beta"

def test_case_only_rename_writes_no_reservation():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "alpha")
    assert key_client(app).post(f"/admin/agents/{aid}/rename", json={"name": "Alpha"}).status_code == 200
    assert conn.execute("SELECT COUNT(*) FROM agent_name_reservations").fetchone()[0] == 0
    r = key_client(app).post(f"/admin/agents/{aid}/rename", json={"name": "Alpha"})
    assert r.status_code == 409 and r.json()["error"] == "名称未变化"

def test_rename_reservation_expires_after_one_year():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "alpha")
    db_agents.rename_agent(conn, aid, "beta", actor_type="admin", actor="r", now=NOW)
    other = mk_agent_raw(conn, "other")
    import pytest
    with pytest.raises(db_agents.BizError):
        db_agents.rename_agent(conn, other, "alpha", actor_type="admin", actor="r",
                               now=NOW + NAME_RESERVE_SEC - 1)
    assert db_agents.rename_agent(conn, other, "alpha", actor_type="admin", actor="r",
                                  now=NOW + NAME_RESERVE_SEC + 1).name == "alpha"

def test_cancelled_agent_cannot_be_renamed():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "alpha", status="cancelled")
    r = key_client(app).post(f"/admin/agents/{aid}/rename", json={"name": "beta"})
    assert r.status_code == 409 and r.json()["error"] == "已取消资格的代理不能改名"

def test_admin_needs_grant_to_rename_and_revoke_takes_effect():
    conn, app = build_app()
    adm = mk_admin(conn, "adm")
    aid = mk_agent_raw(conn, "alpha")
    tc = login_client(app, "adm")
    r = tc.post(f"/admin/agents/{aid}/rename", json={"name": "beta"})
    assert r.status_code == 403 and r.json() == {"error": "forbidden"}
    key = key_client(app)
    assert key.post("/admin/grants", json={"admin_id": adm, "grant": "agent.rename"}).json() == {"ok": True}
    assert tc.get("/admin/me").json()["grants"] == ["agent.rename"]
    assert tc.post(f"/admin/agents/{aid}/rename", json={"name": "beta"}).status_code == 200
    assert key.delete(f"/admin/grants/{adm}/agent.rename").json() == {"ok": True}
    assert tc.post(f"/admin/agents/{aid}/rename", json={"name": "gamma"}).status_code == 403
    assert [e["action"] for e in audit(conn, "grant.add") + audit(conn, "grant.revoke")] == [
        "grant.add", "grant.revoke"]

def test_agent_cannot_rename():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "alpha")
    assert login_client(app, "alpha").post(f"/admin/agents/{aid}/rename",
                                           json={"name": "beta"}).status_code == 403

# ---------------- 授权管理 ----------------

def test_only_super_manages_grants_and_no_regrant():
    conn, app = build_app()
    a1 = mk_admin(conn, "a1"); a2 = mk_admin(conn, "a2")
    key_client(app).post("/admin/grants", json={"admin_id": a1, "grant": "agent.rename"})
    tc = login_client(app, "a1")                    # 被授权的管理员也不能转授
    r = tc.post("/admin/grants", json={"admin_id": a2, "grant": "agent.rename"})
    assert r.status_code == 403
    assert tc.get("/admin/grants").status_code == 403
    assert not db_staff.has_grant(conn, a2, "agent.rename")

def test_grant_validation():
    conn, app = build_app()
    a1 = mk_admin(conn, "a1")
    boss = mk_admin(conn, "boss", role="super")
    ag = mk_agent_raw(conn, "ag")
    ag_admin = db_agents.get_agent(conn, ag).admin_id
    tc = key_client(app)
    assert tc.post("/admin/grants", json={"admin_id": a1, "grant": "x.y"}).json()["error"] == "授权项无效"
    assert tc.post("/admin/grants", json={"admin_id": boss, "grant": "agent.rename"}).status_code == 409
    assert tc.post("/admin/grants", json={"admin_id": ag_admin, "grant": "agent.rename"}).status_code == 404
    assert tc.post("/admin/grants", json={"admin_id": "1", "grant": "agent.rename"}).status_code == 404
    tc.post("/admin/grants", json={"admin_id": a1, "grant": "agent.rename"})
    r = tc.post("/admin/grants", json={"admin_id": a1, "grant": "agent.rename"})
    assert r.status_code == 409 and r.json()["error"] == "已授权"
    assert tc.delete(f"/admin/grants/{a1}/agent.rename").status_code == 200
    assert tc.delete(f"/admin/grants/{a1}/agent.rename").status_code == 404
    g = tc.get("/admin/grants").json()["grants"][0]
    assert g["username"] == "a1" and g["revoked_at"] is not None and g["granted_by"] == "admin-key"

# ---------------- 管理员账号 ----------------

def test_super_manages_admin_accounts():
    conn, app = build_app()
    mk_admin(conn, "boss", role="super")
    mk_agent_raw(conn, "ag")
    tc = login_client(app, "boss")
    r = tc.post("/admin/admins", json={"username": "ops1", "password": "Passw0rd!"})
    assert r.status_code == 200
    ops1 = r.json()["id"]
    assert db.get_admin_by_id(conn, ops1).role == "admin"
    assert tc.post("/admin/admins", json={"username": "AG", "password": "Passw0rd!"}).status_code == 409
    assert tc.post("/admin/admins", json={"username": "x", "password": "short"}).status_code == 400
    ops_tc = login_client(app, "ops1", "Passw0rd!")
    assert tc.post(f"/admin/admins/{ops1}/password", json={"password": "NewPassw0rd"}).json() == {"ok": True}
    assert ops_tc.get("/admin/me").status_code == 401                 # 重置密码后旧会话失效
    login_client(app, "ops1", "NewPassw0rd")
    admins = tc.get("/admin/admins").json()["admins"]
    assert [(a["username"], a["role"]) for a in admins] == [("boss", "super"), ("ops1", "admin")]
    boss_id = admins[0]["id"]
    assert tc.post(f"/admin/admins/{boss_id}/password", json={"password": "Passw0rd!"}).status_code == 409
    assert tc.delete(f"/admin/admins/{boss_id}").status_code == 409
    assert tc.delete(f"/admin/admins/{ops1}").json() == {"ok": True}
    assert db.get_admin_by_id(conn, ops1) is None
    assert [e["action"] for e in audit(conn, "admin.create") + audit(conn, "admin.password")
            + audit(conn, "admin.delete")] == ["admin.create", "admin.password", "admin.delete"]

def test_admin_cannot_manage_admins():
    conn, app = build_app()
    mk_admin(conn, "adm")
    tc = login_client(app, "adm")
    assert tc.get("/admin/admins").status_code == 403
    assert tc.post("/admin/admins", json={"username": "x", "password": "Passw0rd!"}).status_code == 403
    assert TestClient(app).get("/admin/admins").status_code == 403
