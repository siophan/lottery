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
