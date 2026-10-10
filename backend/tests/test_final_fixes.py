# 子项目 B 终审修复：审计检索、后台登录限流、超大 id、代理登录大小写、代理视图脱敏等。
from fastapi.testclient import TestClient
from app import db, db_segments
from app.throttle import LOCKED_MSG
import manage
from tests.agent_helpers import (build_app, key_client, login_client, mk_admin, mk_agent_raw,
                                 set_agent_status_raw)

NOW = 1_800_000_000
BIG = 2 ** 70
def assign(conn, agent_id, start, end):
    return db_segments.assign_segment(conn, agent_id, start, end, actor_type="admin", actor="root",
                                      now=NOW)

def login(tc, user, pw="bad", **headers):
    return tc.post("/admin/login", json={"username": user, "password": pw}, headers=headers)

# ---------------- I1 审计检索 ----------------

def test_audit_search_finds_agent_name_and_lowercase_account_code():
    conn, app = build_app()
    tc = key_client(app)
    r = tc.post("/admin/agents", json={"name": "Alice", "password": "Passw0rd!", "region": "city",
                                       "tier": "senior"})
    assert r.status_code == 200, r.text
    tc.post("/admin/users", json={"code": "u1"})
    rows = tc.get("/admin/audit-logs", params={"target": "Alice"}).json()["logs"]
    assert [x["action"] for x in rows] == ["agent.create"]
    assert tc.get("/admin/audit-logs", params={"target": " u1 "}).json()["total"] == 1
    assert tc.get("/admin/audit-logs", params={"target": "U1"}).json()["total"] == 1

# ---------------- I2 后台登录限流 ----------------

def test_admin_login_locks_after_five_failures_even_with_right_password():
    conn, app = build_app()
    mk_agent_raw(conn, "ag1", "pw")
    tc = TestClient(app)
    for _ in range(5):
        assert login(tc, "ag1").status_code == 401
    r = login(tc, "ag1", "pw")
    assert r.status_code == 429 and r.json() == {"ok": False, "error": LOCKED_MSG}
    assert login(tc, "AG1", "pw").status_code == 429          # 用户名规范化后计数

def test_admin_login_skips_password_verify_when_locked(monkeypatch):
    conn, app = build_app()
    mk_agent_raw(conn, "ag1", "pw")
    tc = TestClient(app)
    for _ in range(5):
        login(tc, "ag1")
    from app import admin_auth
    calls = []
    async def fake_auth(*a):
        calls.append(a)
    monkeypatch.setattr(admin_auth, "authenticate", fake_auth)
    assert login(tc, "ag1", "pw").status_code == 429
    assert calls == []

def test_admin_login_success_clears_counter_and_namespace_is_separate():
    conn, app = build_app()
    mk_agent_raw(conn, "ag1", "pw")
    tc = TestClient(app)
    for _ in range(4):
        login(tc, "ag1")
    assert login(tc, "ag1", "pw").status_code == 200       # 成功清零
    for _ in range(4):
        login(tc, "ag1")
    assert login(tc, "ag1", "pw").status_code == 200
    # 客户端账号编号与后台用户名互不锁定
    th = app.state.login_throttle
    for _ in range(5):
        login(tc, "ag1")
    assert th.locked("AG1", "x") is False
    assert th.locked("admin:ag1", "x") is True

def test_admin_login_ip_lock_and_rejected_agent_does_not_count():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag1", "pw", status="paused")
    tc = TestClient(app)
    for _ in range(6):
        assert login(tc, "ag1", "pw").status_code == 403    # 密码正确但被拒：不计失败
    set_agent_status_raw(conn, aid, "active")
    assert login(tc, "ag1", "pw").status_code == 200
    for i in range(30):
        login(tc, f"nobody{i}")
    assert login(tc, "ag1", "pw").status_code == 429       # 同 IP 累计 30 次

# ---------------- M1 超大 id ----------------

def test_oversized_ids_return_not_found_or_400_not_500():
    conn, app = build_app()
    tc = key_client(app)
    top = mk_agent_raw(conn, "top")
    adm = mk_admin(conn, "adm")
    st = {"status": "paused", "reason": "x"}
    assert tc.patch(f"/admin/agents/{BIG}", json={"region": "city"}).status_code == 404
    assert tc.post(f"/admin/agents/{BIG}/status", json=st).status_code == 404
    assert tc.post(f"/admin/agents/{BIG}/password", json={"password": "Passw0rd!"}).status_code == 404
    assert tc.post(f"/admin/agents/{BIG}/rename", json={"name": "zz"}).status_code == 404
    assert tc.post(f"/admin/agents/{BIG}/recycle").status_code == 404
    assert tc.post("/admin/segments/assign", json={"agent_id": BIG, "start": 1000000,
                                                   "end": 1000001}).status_code == 404
    assert tc.post("/admin/agents", json={"name": "k", "password": "Passw0rd!", "region": "city",
                                          "tier": "junior", "parent_agent_id": BIG}).status_code == 400
    assert tc.patch(f"/admin/agents/{top}", json={"parent_agent_id": BIG}).status_code == 400
    assert tc.post(f"/admin/admins/{BIG}/password", json={"password": "Passw0rd!"}).status_code == 404
    assert tc.delete(f"/admin/admins/{BIG}").status_code == 404
    assert tc.post("/admin/grants", json={"admin_id": BIG, "grant": "agent.rename"}).status_code == 404
    assert tc.delete(f"/admin/grants/{BIG}/agent.rename").status_code == 404
    assert adm  # 正常 id 不受影响
    assign(conn, top, 1_000_000, 1_000_002)
    atc = login_client(app, "top")
    r = atc.post("/admin/segments/transfer", json={"to_agent_id": BIG, "start": 1000000, "end": 1000001})
    assert r.status_code == 400

# ---------------- M4 / M7 代理登录 ----------------

def test_agent_login_blocked_unless_status_active(monkeypatch):
    from app import admin_auth
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag1", "pw")
    admin = db.get_admin_by_username(conn, "ag1")
    conn.execute("UPDATE agents SET status='weird' WHERE id=?", (aid,))
    conn.commit()
    assert admin_auth.agent_login_problem(conn, admin) == "代理资格无效，无法登录"
    conn.execute("UPDATE agents SET status='active' WHERE id=?", (aid,))
    conn.commit()
    assert admin_auth.agent_login_problem(conn, admin) is None

def test_agent_login_username_is_case_insensitive():
    conn, app = build_app()
    mk_agent_raw(conn, "Alice", "pw")
    tc = TestClient(app)
    assert login(tc, "alice", "pw").status_code == 200
    assert tc.get("/admin/me").json()["username"] == "Alice"
    assert login(TestClient(app), " ALICE ", "pw").status_code == 200
    assert login(TestClient(app), "alice", "bad").status_code == 401

def test_staff_login_remains_case_sensitive():
    conn, app = build_app()
    mk_admin(conn, "Root", "pw")
    assert login(TestClient(app), "root", "pw").status_code == 401

# ---------------- M5 吸收无归属待激活号 ----------------

def test_assign_absorbing_unowned_pending_resets_expiry_but_keeps_status():
    # 有效期随分配清空；暂停 / 封禁属于后台使用控制，分配不顺带解除
    conn, app = build_app()
    a = mk_agent_raw(conn, "ag")
    db.create_user(conn, "Z1000001", "x", 12345, pending=True)
    conn.execute("UPDATE users SET status='disabled' WHERE code='Z1000001'")
    conn.commit()
    assign(conn, a, 1_000_000, 1_000_002)
    for code, status in (("Z1000000", "active"), ("Z1000001", "disabled"), ("Z1000002", "active")):
        u = db.get_user_by_code(conn, code)
        assert (u.agent_id, u.status, u.expires_at) == (a, status, None), code

# ---------------- M6 manage.py admin-set ----------------

def test_admin_set_refuses_agent_username(capsys):
    conn, app = build_app()
    mk_agent_raw(conn, "ag1", "pw")
    assert manage.main(["admin-set", "ag1", "newpass"], conn=conn) != 0
    assert "代理账号" in capsys.readouterr().out
    from app.security import verify_password
    adm = db.get_admin_by_username(conn, "ag1")
    assert adm.role == "agent" and verify_password("pw", adm.salt, adm.password_hash)

def test_admin_set_new_admin_enforces_shared_namespace(capsys):
    conn, app = build_app()
    mk_agent_raw(conn, "Alice", "pw")
    assert manage.main(["admin-set", "alice", "newpass"], conn=conn) != 0
    assert db.get_admin_by_username(conn, "alice") is None
    mk_admin(conn, "Root", "pw")
    assert manage.main(["admin-set", "root", "newpass"], conn=conn) != 0   # 与现有管理员仅大小写不同
    assert manage.main(["admin-set", "Root", "newpass2"], conn=conn) == 0  # 同名重置密码仍可
    assert manage.main(["admin-set", "fresh", "newpass"], conn=conn) == 0
    assert db.get_admin_by_username(conn, "fresh").role == "admin"

# ---------------- M8 代理视图脱敏 ----------------

def test_agent_view_omits_internal_staff_info():
    conn, app = build_app()
    top = mk_agent_raw(conn, "top")
    kid = mk_agent_raw(conn, "kid", tier="junior", parent=top)
    assign(conn, top, 1_000_000, 1_000_004)
    atc = login_client(app, "top")
    r = atc.post("/admin/segments/transfer", json={"to_agent_id": kid, "start": 1000000, "end": 1000001})
    assert r.status_code == 200, r.text
    key_client(app).post(f"/admin/agents/{kid}/status", json={"status": "paused", "reason": "内部原因"})
    rows = atc.get("/admin/agents").json()["agents"]
    assert [r["id"] for r in rows] == [kid]
    assert "status_reason" not in rows[0] and "status_by" not in rows[0]
    assert rows[0]["status"] == "paused"
    staff_rows = key_client(app).get("/admin/agents").json()["agents"]
    assert next(r for r in staff_rows if r["id"] == kid)["status_reason"] == "内部原因"
    ops = atc.get("/admin/segment-ops").json()["ops"]
    by_op = {o["op"]: o for o in ops}
    assert by_op["assign"]["actor"] == "后台"            # 不暴露后台人员用户名
    assert by_op["transfer"]["actor"] == "top"
    staff_ops = key_client(app).get("/admin/segment-ops").json()["ops"]
    assert {o["op"]: o for o in staff_ops}["assign"]["actor"] == "root"
