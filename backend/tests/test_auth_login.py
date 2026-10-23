import time, httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession
from tests.points_helpers import set_points_raw

def upstream_ok(req):
    return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {"vip": 1}}})

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(upstream_ok))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    settings = Settings(session_ttl=3600)
    app = create_app(settings, client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app)

def test_login_success_returns_our_token_and_own_userinfo():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    r = tc.post("/api/auth/login", json={"username": "user01", "password": "pw",
                                         "device": "pc", "deviceId": "x"})
    body = r.json()
    assert body["code"] == 0
    info = body["data"]["userInfo"]
    assert info["vip"] == 1 and info["username"] == "USER01"   # 功能字段沿用上游，身份换成本账号（详见 test_own_userinfo）
    tok = body["data"]["token"]
    assert db.get_session(conn, tok) is not None        # 是我方会话 token
    assert tok != "DYTOK"                                 # 不是 data-ys 的 token

def test_login_wrong_password():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "bad"})
    assert r.json()["code"] == 1

def test_login_unknown_user():
    conn, tc = build()
    r = tc.post("/api/auth/login", json={"username": "NOPE", "password": "x"})
    assert r.json()["code"] == 1

def test_login_expired_user_rejected():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", int(time.time()) - 10)  # 已过期
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"})
    assert r.json()["code"] == 10022

def test_login_disabled_user_rejected():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    db.update_user(conn, "USER01", status="disabled")
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"})
    assert r.json()["code"] == 10022

# ---------------- 账号生命周期：登录分支 ----------------

def build_counting():
    """记录上游调用次数，用于断言「未首登 / 被拒」时不触达上游。"""
    calls = {"n": 0}
    def handler(req):
        calls["n"] += 1
        return upstream_ok(req)
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(handler))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app), calls

def test_login_pending_user_rejected_10023():
    conn, tc = build()
    db.create_user(conn, "USER01", "x", None, pending=True)
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "123456"})
    assert r.json() == {"code": 10023, "msg": "该账号未激活，请联系代理或管理员激活后使用！"}

def test_login_pending_user_wrong_password_is_generic_error():
    # 密码不对仍是通用错误，不能用任意密码探测出待激活账号
    conn, tc = build()
    db.create_user(conn, "USER01", "x", None, pending=True)
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "bad"})
    assert r.json() == {"code": 1, "msg": "账号或密码错误"}
    assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0

def test_login_unknown_user_still_generic_error():
    conn, tc = build()
    assert tc.post("/api/auth/login", json={"username": "NOPE", "password": "123456"}).json()["code"] == 1

def test_login_banned_user_rejected_10024():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    db.update_user(conn, "USER01", status="banned")
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"})
    assert r.json() == {"code": 10024, "msg": "账号已封禁，无法登录"}

def test_login_banned_takes_precedence_over_expired():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", int(time.time()) - 10)
    db.update_user(conn, "USER01", status="banned")
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"})
    assert r.json()["code"] == 10024

def test_login_not_onboarded_returns_ticket_without_session_or_upstream():
    conn, tc, calls = build_counting()
    u = db.create_user(conn, "USER01", "123456", None)
    conn.execute("UPDATE users SET onboarded_at=NULL WHERE id=?", (u.id,)); conn.commit()
    r = tc.post("/api/auth/login", json={"username": "user01", "password": "123456"})
    body = r.json()
    assert body["code"] == 10030
    assert body["msg"] == "首次登录请修改密码并绑定手机号"
    ticket = body["data"]["onboardToken"]
    assert db.get_onboard_ticket_user(conn, ticket, int(time.time())).code == "USER01"
    assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    assert calls["n"] == 0
    assert "token" not in body["data"]

def test_login_ticket_ttl_is_15_minutes():
    conn, tc = build()
    u = db.create_user(conn, "USER01", "123456", None)
    conn.execute("UPDATE users SET onboarded_at=NULL WHERE id=?", (u.id,)); conn.commit()
    tok = tc.post("/api/auth/login", json={"username": "USER01", "password": "123456"}).json()["data"]["onboardToken"]
    r = conn.execute("SELECT created_at, expires_at FROM onboard_tickets WHERE token=?", (tok,)).fetchone()
    assert r["expires_at"] - r["created_at"] == 900

def test_login_onboarded_user_still_succeeds():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    assert tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"}).json()["code"] == 0

# ---------------- 计费从首次登录开始 ----------------

def test_first_successful_login_starts_billing_and_later_logins_keep_it():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 7)
    assert db.get_user_by_code(conn, "USER01").next_charge_at is None
    assert tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"}).json()["code"] == 0
    u = db.get_user_by_code(conn, "USER01")
    assert u.first_login_at is not None
    assert (u.charge_anchor_at, u.next_charge_at) == (u.first_login_at, u.first_login_at + 86400)
    conn.execute("UPDATE users SET next_charge_at=12345 WHERE code='USER01'"); conn.commit()
    assert tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"}).json()["code"] == 0
    u2 = db.get_user_by_code(conn, "USER01")
    assert (u2.first_login_at, u2.next_charge_at) == (u.first_login_at, 12345)

def test_first_login_dialog_does_not_start_billing():
    conn, tc = build()
    db.create_user(conn, "Z0000001", "pw", None, pending=True)
    db.activate_user(conn, "Z0000001", int(time.time()))
    set_points_raw(conn, "Z0000001", 7)
    r = tc.post("/api/auth/login", json={"username": "Z0000001", "password": "123456"}).json()
    assert r["code"] == 10030
    u = db.get_user_by_code(conn, "Z0000001")
    assert (u.first_login_at, u.next_charge_at) == (None, None)
