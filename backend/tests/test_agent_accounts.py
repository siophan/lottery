import json
from app import db, db_agents, db_segments
from tests.agent_helpers import (audit, build_app, key_client, login_client, mk_agent_raw)

NOW = 1_800_000_000

def assign(conn, agent_id, start, end):
    db_segments.assign_segment(conn, agent_id, start, end, actor_type="admin", actor="root", now=NOW)

def users(tc, **params):
    r = tc.get("/admin/users", params=params)
    assert r.status_code == 200, r.text
    return {u["code"]: u for u in r.json()["users"]}

# ---------------- 列表：归属代理、编号状态、筛选 ----------------

def test_users_list_agent_fields_and_number_status():
    conn, app = build_app()
    live = mk_agent_raw(conn, "live")
    gone = mk_agent_raw(conn, "gone")
    assign(conn, live, 1_000_000, 1_000_001)
    assign(conn, gone, 1_000_002, 1_000_002)
    db.activate_user(conn, "1000001", NOW)
    db_agents.set_agent_status(conn, gone, "cancelled", "退出", actor_type="admin", actor="r", now=NOW)
    db.create_user(conn, "OLD1", "pw", None)                          # 存量已激活
    db.create_user(conn, "1000003", "x", None, pending=True)          # 无归属待激活
    us = users(key_client(app))
    assert (us["1000000"]["agent_name"], us["1000000"]["number_status"]) == ("live", "pending")
    assert us["1000000"]["agent_id"] == live
    assert us["1000001"]["number_status"] == "activated"
    assert (us["1000002"]["agent_name"], us["1000002"]["number_status"]) == ("gone", "to_recycle")
    assert (us["OLD1"]["agent_id"], us["OLD1"]["number_status"]) == (None, "activated")
    assert us["1000003"]["number_status"] == "unassigned"

def test_staff_filter_by_agent():
    conn, app = build_app()
    a1 = mk_agent_raw(conn, "a1"); a2 = mk_agent_raw(conn, "a2")
    assign(conn, a1, 1_000_000, 1_000_001)
    assign(conn, a2, 1_000_002, 1_000_002)
    tc = key_client(app)
    assert set(users(tc, agent_id=a1)) == {"1000000", "1000001"}
    assert tc.get("/admin/users", params={"agent_id": "abc"}).status_code == 400
    assert tc.get("/admin/users", params={"agent_id": str(2 ** 63)}).status_code == 400

def test_agent_reads_only_own_accounts():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me"); other = mk_agent_raw(conn, "other")
    assign(conn, me, 1_000_000, 1_000_001)
    assign(conn, other, 1_000_002, 1_000_002)
    db.create_user(conn, "OLD1", "pw", None)
    tc = login_client(app, "me")
    assert set(users(tc)) == {"1000000", "1000001"}
    assert set(users(tc, agent_id=other)) == {"1000000", "1000001"}       # 传别人的 id 也只看自己

# ---------------- 代理激活本人名下账号 ----------------

def test_agent_activates_own_account_and_records_chain():
    conn, app = build_app()
    a = mk_agent_raw(conn, "a")
    b = mk_agent_raw(conn, "b", parent=a)
    c = mk_agent_raw(conn, "c", parent=b)
    d = mk_agent_raw(conn, "d", tier="junior", parent=c)
    assign(conn, d, 1_000_000, 1_000_000)
    tc = login_client(app, "d")
    r = tc.post("/admin/users/1000000/activate")
    assert r.status_code == 200 and r.json() == {"ok": True}
    u = db.get_user_by_code(conn, "1000000")
    assert u.first_activated_at is not None and u.activated_by_agent_id == d
    assert json.loads(u.agent_chain_json) == [d, c, b]                   # 最多三层
    e = audit(conn, "user.activate")[0]
    assert e["actor_type"] == "agent" and e["actor"] == "d" and e["target"] == "1000000"
    r = tc.post("/admin/users/1000000/activate")
    assert r.status_code == 409 and r.json()["error"] == "账号已激活"

def test_agent_cannot_activate_others_or_legacy():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me"); other = mk_agent_raw(conn, "other")
    assign(conn, other, 1_000_000, 1_000_000)
    db.create_user(conn, "P1", "x", None, pending=True)
    tc = login_client(app, "me")
    for code in ("1000000", "P1", "NOPE"):
        r = tc.post(f"/admin/users/{code}/activate")
        assert r.status_code == 404 and r.json() == {"ok": False, "error": "账号不存在"}
    assert db.get_user_by_code(conn, "1000000").first_activated_at is None
    assert audit(conn, "user.activate") == []

def test_staff_activation_of_agent_account_records_chain_without_agent_actor():
    conn, app = build_app()
    top = mk_agent_raw(conn, "top")
    kid = mk_agent_raw(conn, "kid", tier="junior", parent=top)
    assign(conn, kid, 1_000_000, 1_000_000)
    assert key_client(app).post("/admin/users/1000000/activate").status_code == 200
    u = db.get_user_by_code(conn, "1000000")
    assert u.activated_by_agent_id is None and json.loads(u.agent_chain_json) == [kid, top]
    db.create_user(conn, "P1", "x", None, pending=True)
    assert key_client(app).post("/admin/users/P1/activate").status_code == 200
    assert db.get_user_by_code(conn, "P1").agent_chain_json is None

def test_agent_other_account_ops_forbidden():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me")
    assign(conn, me, 1_000_000, 1_000_000)
    tc = login_client(app, "me")
    assert tc.post("/admin/users", json={"code": "X1"}).status_code == 403
    assert tc.patch("/admin/users/1000000", json={"status": "banned"}).status_code == 403
    assert tc.post("/admin/users/1000000/reset-password").status_code == 403
    assert tc.delete("/admin/users/1000000").status_code == 403
    assert db.get_user_by_code(conn, "1000000").status == "active"
