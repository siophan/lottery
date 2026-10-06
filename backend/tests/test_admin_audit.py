import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession
from app.security import verify_password

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": 0})))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004")
    app = create_app(Settings(admin_key="SECRET", admin_cookie_secure=False), client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app)

H = {"X-Admin-Key": "SECRET"}

def logs(tc, **params):
    return tc.get("/admin/audit-logs", headers=H, params=params).json()

def mk_active(conn, code="U1"):
    """已激活 + 已完成首登的账号（走 db 层，不产生审计）。"""
    u = db.create_user(conn, code, "pw", None)
    return u

# ---------------- 鉴权 ----------------

def test_new_endpoints_require_admin():
    conn, tc = build()
    mk_active(conn)
    assert tc.post("/admin/users", json={"code": "x"}).status_code == 403
    assert tc.post("/admin/users/U1/activate").status_code == 403
    assert tc.post("/admin/users/U1/reset-password").status_code == 403
    assert tc.patch("/admin/users/U1", json={"status": "banned"}).status_code == 403
    assert tc.delete("/admin/users/U1").status_code == 403
    assert tc.get("/admin/audit-logs").status_code == 403
    assert db.get_user_by_code(conn, "U1").status == "active"

# ---------------- 创建 ----------------

def test_create_pending_user_and_audit():
    conn, tc = build()
    r = tc.post("/admin/users", headers=H, json={"code": " a1 ", "expires_at": 123})
    assert r.status_code == 200 and r.json() == {"ok": True, "code": "A1"}
    u = db.get_user_by_code(conn, "A1")
    assert u.first_activated_at is None and u.activated_at is None and u.onboarded_at is None
    assert u.expires_at == 123
    assert verify_password(db.INITIAL_PASSWORD, u.salt, u.password_hash)
    lg = logs(tc)
    assert lg["total"] == 1
    e = lg["logs"][0]
    assert e["action"] == "user.create" and e["target"] == "A1"
    assert e["actor_type"] == "admin" and e["actor"] == "admin-key"
    assert e["detail"] == {"expires_at": 123}

PASSWORD_ERR = {"ok": False, "error": "不支持设置密码，请使用激活或重置密码"}

def test_create_rejects_password_and_validates_code():
    conn, tc = build()
    for pw in ("Abcd1234", None, ""):
        r = tc.post("/admin/users", headers=H, json={"code": "a1", "password": pw})
        assert r.status_code == 400 and r.json() == PASSWORD_ERR
    assert db.get_user_by_code(conn, "A1") is None
    assert logs(tc)["total"] == 0
    for body in ({}, {"code": ""}, {"code": "  "}, {"code": 5}):
        assert tc.post("/admin/users", headers=H, json=body).status_code == 400

def test_create_duplicate_is_409_and_not_audited():
    conn, tc = build()
    tc.post("/admin/users", headers=H, json={"code": "a1"})
    r = tc.post("/admin/users", headers=H, json={"code": "A1"})
    assert r.status_code == 409 and r.json() == {"ok": False, "error": "账号已存在"}
    assert logs(tc)["total"] == 1

def test_create_rejects_bad_expires_at():
    _, tc = build()
    r = tc.post("/admin/users", headers=H, json={"code": "a1", "expires_at": "soon"})
    assert r.status_code == 400

# ---------------- 激活 ----------------

def test_activate_pending_user():
    conn, tc = build()
    tc.post("/admin/users", headers=H, json={"code": "a1"})
    r = tc.post("/admin/users/a1/activate", headers=H)
    assert r.status_code == 200 and r.json() == {"ok": True}
    u = db.get_user_by_code(conn, "A1")
    assert u.first_activated_at is not None and u.activated_at == u.first_activated_at
    assert u.status == "active" and u.onboarded_at is None
    e = logs(tc)["logs"][0]
    assert e["action"] == "user.activate" and e["target"] == "A1" and e["actor"] == "admin-key"

def test_activate_twice_is_409():
    conn, tc = build()
    tc.post("/admin/users", headers=H, json={"code": "a1"})
    tc.post("/admin/users/a1/activate", headers=H)
    r = tc.post("/admin/users/a1/activate", headers=H)
    assert r.status_code == 409 and r.json() == {"ok": False, "error": "账号已激活"}
    assert [l["action"] for l in logs(tc)["logs"]].count("user.activate") == 1

def test_activate_missing_is_404():
    _, tc = build()
    r = tc.post("/admin/users/nope/activate", headers=H)
    assert r.status_code == 404 and r.json() == {"ok": False, "error": "账号不存在"}

# ---------------- PATCH ----------------

def test_patch_status_validation():
    conn, tc = build()
    mk_active(conn)
    for bad in ("frozen", "", None, 1, ["active"]):
        r = tc.patch("/admin/users/U1", headers=H, json={"status": bad})
        assert r.status_code == 400 and r.json() == {"ok": False, "error": "状态取值无效"}
    assert db.get_user_by_code(conn, "U1").status == "active"
    assert logs(tc)["total"] == 0

def test_patch_status_audits_from_to_and_keeps_sessions():
    conn, tc = build()
    u = mk_active(conn)
    tok = db.create_session(conn, u.id, 3600)
    r = tc.patch("/admin/users/U1", headers=H, json={"status": "banned"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert db.get_user_by_code(conn, "U1").status == "banned"
    # 会话保留：客户端下一次请求由 gate 按状态拒绝并拿到 10024，被踢下线时能看到「已封禁」
    assert db.get_session(conn, tok) is not None
    assert tc.get("/api/user/info", headers={"token": tok}).json() == {
        "code": 10024, "msg": "账号已封禁，无法登录"}
    e = logs(tc)["logs"][0]
    assert e["action"] == "user.status" and e["target"] == "U1"
    assert e["detail"] == {"from": "active", "to": "banned"}

def test_patch_disable_keeps_sessions_and_gate_returns_10022():
    conn, tc = build()
    u = mk_active(conn)
    tok = db.create_session(conn, u.id, 3600)
    tc.patch("/admin/users/U1", headers=H, json={"status": "disabled"})
    assert db.get_session(conn, tok) is not None
    assert tc.get("/api/user/info", headers={"token": tok}).json() == {
        "code": 10022, "msg": "账号已停用或已到期"}
    tc.patch("/admin/users/U1", headers=H, json={"status": "active"})     # 恢复不动会话
    assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 1
    assert [l["detail"] for l in logs(tc)["logs"]] == [
        {"from": "disabled", "to": "active"}, {"from": "active", "to": "disabled"}]

def test_patch_same_status_not_audited():
    conn, tc = build()
    mk_active(conn)
    assert tc.patch("/admin/users/U1", headers=H, json={"status": "active"}).json()["ok"] is True
    assert logs(tc)["total"] == 0

def test_patch_expires_audited_only_on_change():
    conn, tc = build()
    mk_active(conn)
    tc.patch("/admin/users/U1", headers=H, json={"expires_at": 500})
    tc.patch("/admin/users/U1", headers=H, json={"expires_at": 500})      # 未变化
    tc.patch("/admin/users/U1", headers=H, json={"expires_at": None})
    lg = logs(tc)["logs"]
    assert [(l["action"], l["detail"]) for l in lg] == [
        ("user.expires", {"from": 500, "to": None}),
        ("user.expires", {"from": None, "to": 500}),
    ]
    assert db.get_user_by_code(conn, "U1").expires_at is None

def test_patch_rejects_bad_expires_at():
    conn, tc = build()
    mk_active(conn)
    for bad in ("x", True, 1.5):
        assert tc.patch("/admin/users/U1", headers=H, json={"expires_at": bad}).status_code == 400

def test_patch_rejects_password_without_partial_changes():
    conn, tc = build()
    mk_active(conn)
    before = db.get_user_by_code(conn, "U1")
    r = tc.patch("/admin/users/U1", headers=H, json={"password": "Hacked123", "expires_at": 77})
    assert r.status_code == 400 and r.json() == PASSWORD_ERR
    after = db.get_user_by_code(conn, "U1")
    assert after.password_hash == before.password_hash and after.salt == before.salt
    assert after.expires_at is None
    assert logs(tc)["total"] == 0

def test_patch_missing_user_is_404():
    _, tc = build()
    r = tc.patch("/admin/users/nope", headers=H, json={"status": "disabled"})
    assert r.status_code == 404 and r.json() == {"ok": False, "error": "账号不存在"}

# ---------------- 重置密码 ----------------

def test_reset_password_active_user():
    conn, tc = build()
    u = mk_active(conn)
    db.complete_onboarding(conn, u.id, "Newpass123", "13812341234", 100)
    db.create_session(conn, u.id, 3600)
    r = tc.post("/admin/users/U1/reset-password", headers=H)
    assert r.status_code == 200 and r.json() == {"ok": True}
    after = db.get_user_by_code(conn, "U1")
    assert verify_password(db.INITIAL_PASSWORD, after.salt, after.password_hash)
    assert after.onboarded_at is None
    assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    e = logs(tc)["logs"][0]
    assert e["action"] == "user.reset_password" and e["target"] == "U1"

def test_reset_password_pending_is_409():
    conn, tc = build()
    tc.post("/admin/users", headers=H, json={"code": "a1"})
    r = tc.post("/admin/users/a1/reset-password", headers=H)
    assert r.status_code == 409 and r.json() == {"ok": False, "error": "账号未激活"}
    assert [l["action"] for l in logs(tc)["logs"]] == ["user.create"]

def test_reset_password_missing_is_404():
    _, tc = build()
    r = tc.post("/admin/users/nope/reset-password", headers=H)
    assert r.status_code == 404 and r.json() == {"ok": False, "error": "账号不存在"}

# ---------------- 删除 ----------------

def test_delete_audited_and_missing_is_404():
    conn, tc = build()
    mk_active(conn)
    assert tc.delete("/admin/users/U1", headers=H).json() == {"ok": True}
    e = logs(tc)["logs"][0]
    assert e["action"] == "user.delete" and e["target"] == "U1"
    r = tc.delete("/admin/users/U1", headers=H)
    assert r.status_code == 404 and r.json() == {"ok": False, "error": "账号不存在"}
    assert logs(tc)["total"] == 1

# ---------------- 列表字段 ----------------

def test_list_users_new_fields_mask_phone():
    conn, tc = build()
    tc.post("/admin/users", headers=H, json={"code": "p1"})                  # 待激活
    u = mk_active(conn, "A1")
    db.complete_onboarding(conn, u.id, "Newpass123", "13812341234", 100)
    users = {x["code"]: x for x in tc.get("/admin/users", headers=H).json()["users"]}
    p = users["P1"]
    assert p["activated"] is False and p["first_activated_at"] is None
    assert p["phone"] is None and p["onboarded"] is False
    a = users["A1"]
    assert a["activated"] is True and a["first_activated_at"] == u.first_activated_at
    assert a["phone"] == "138****1234" and a["onboarded"] is True
    assert set(a) == {"code", "status", "expires_at", "created_at", "activated",
                      "first_activated_at", "phone", "onboarded",
                      "agent_id", "agent_name", "number_status", "points", "nickname"}
    assert "13812341234" not in tc.get("/admin/users", headers=H).text

# ---------------- 审计列表 ----------------

def _seed_logs(conn, n):
    for i in range(n):
        db.add_audit(conn, "admin", "root", "user.create", "A1" if i % 2 == 0 else "B1", {"i": i}, now=1000 + i)

def test_audit_logs_pagination_and_order():
    conn, tc = build()
    _seed_logs(conn, 5)
    lg = logs(tc)
    assert lg["total"] == 5 and [l["detail"]["i"] for l in lg["logs"]] == [4, 3, 2, 1, 0]
    assert set(lg["logs"][0]) == {"id", "actor_type", "actor", "action", "target", "detail", "created_at"}
    lg = logs(tc, limit=2, offset=1)
    assert lg["total"] == 5 and [l["detail"]["i"] for l in lg["logs"]] == [3, 2]

def test_audit_logs_target_filter_uppercased():
    conn, tc = build()
    _seed_logs(conn, 5)
    lg = logs(tc, target="a1")
    assert lg["total"] == 3 and all(l["target"] == "A1" for l in lg["logs"])

def test_audit_logs_limit_clamped():
    conn, tc = build()
    _seed_logs(conn, 3)
    assert len(logs(tc, limit=0)["logs"]) == 1          # 下限 1
    assert len(logs(tc, limit=-5)["logs"]) == 1
    assert len(logs(tc, limit=100000)["logs"]) == 3     # 上限 200，不报错
    # 默认 50
    _seed_logs(conn, 60)
    assert len(logs(tc)["logs"]) == 50
    assert len(logs(tc, limit=100000)["logs"]) == 63

def test_audit_logs_offset_out_of_range_400_and_limit_huge_clamped():
    conn, tc = build()
    _seed_logs(conn, 3)
    for off in ("-4", str(2 ** 62 + 1), "99999999999999999999"):
        assert tc.get("/admin/audit-logs", headers=H, params={"offset": off}).status_code == 400
    assert tc.get("/admin/audit-logs", headers=H, params={"offset": str(2 ** 62)}).status_code == 200
    assert len(logs(tc, limit="99999999999999999999")["logs"]) == 3

def test_expires_at_out_of_range_400():
    conn, tc = build()
    mk_active(conn)
    for bad in (99999999999999999999, -1, 2 ** 62):
        assert tc.post("/admin/users", headers=H, json={"code": "n1", "expires_at": bad}).status_code == 400
        r = tc.patch("/admin/users/U1", headers=H, json={"expires_at": bad})
        assert r.status_code == 400 and r.json() == {"ok": False, "error": "到期时间无效"}
    assert db.get_user_by_code(conn, "N1") is None
    assert tc.patch("/admin/users/U1", headers=H, json={"expires_at": 0}).status_code == 200

def test_patch_is_atomic_when_audit_insert_fails(monkeypatch):
    import json as _json
    import pytest
    conn, tc = build()
    u = mk_active(conn)
    db.create_session(conn, u.id, 3600)
    real = _json.dumps
    def boom(obj, *a, **k):
        if isinstance(obj, dict) and "from" in obj:      # 仅让审计 detail 序列化失败
            raise RuntimeError("audit boom")
        return real(obj, *a, **k)
    monkeypatch.setattr(db.json, "dumps", boom)
    with pytest.raises(RuntimeError):
        tc.patch("/admin/users/U1", headers=H, json={"status": "banned", "expires_at": 5})
    monkeypatch.undo()
    after = db.get_user_by_code(conn, "U1")
    assert after.status == "active" and after.expires_at is None      # 状态/到期均回滚
    assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 1   # 会话未被删
    assert logs(tc)["total"] == 0

def test_audit_logs_non_integer_params_400():
    _, tc = build()
    for params in ({"limit": "abc"}, {"offset": "x"}, {"limit": "1.5"}):
        assert tc.get("/admin/audit-logs", headers=H, params=params).status_code == 400

# ---------------- 操作者 ----------------

def test_actor_is_admin_username_for_cookie_login():
    conn, tc = build()
    db.upsert_admin(conn, "root", "pw")
    tc.post("/admin/login", json={"username": "root", "password": "pw"})
    tc.post("/admin/users", json={"code": "c1"})                 # 仅 cookie
    e = tc.get("/admin/audit-logs").json()["logs"][0]
    assert e["actor_type"] == "admin" and e["actor"] == "root"

def test_actor_key_when_no_cookie():
    conn, tc = build()
    tc.post("/admin/users", headers=H, json={"code": "c1"})
    e = logs(tc)["logs"][0]
    assert e["actor_type"] == "admin" and e["actor"] == "admin-key"
