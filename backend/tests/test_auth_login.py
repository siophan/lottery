import time, httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

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

def test_login_success_returns_our_token_and_dayys_userinfo():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    r = tc.post("/api/auth/login", json={"username": "user01", "password": "pw",
                                         "device": "pc", "deviceId": "x"})
    body = r.json()
    assert body["code"] == 0
    assert body["data"]["userInfo"] == {"vip": 1}
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
    assert r.json() == {"code": 10023, "msg": "账号未激活，请联系有激活权限的人员激活"}

def test_login_pending_user_10023_regardless_of_password():
    # 待激活账号密码是随机值，任何输入都应得到 10023（否则该码不可达）
    conn, tc = build()
    db.create_user(conn, "USER01", "x", None, pending=True)
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "bad"})
    assert r.json()["code"] == 10023

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
    assert tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"}).json()["code"] == 0
