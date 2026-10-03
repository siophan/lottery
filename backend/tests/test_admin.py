import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": 0})))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004")
    app = create_app(Settings(admin_key="SECRET", admin_cookie_secure=False), client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app)

H = {"X-Admin-Key": "SECRET"}

def test_requires_admin_key():
    _, tc = build()
    assert tc.get("/admin/users").status_code == 403
    assert tc.get("/admin/users", headers={"X-Admin-Key": "wrong"}).status_code == 403

def test_create_list_delete_user():
    conn, tc = build()
    r = tc.post("/admin/users", headers=H, json={"code": "u1", "password": "pw", "expires_at": 999})
    assert r.json()["ok"] is True and r.json()["code"] == "U1"
    lst = tc.get("/admin/users", headers=H).json()["users"]
    assert any(u["code"] == "U1" and u["expires_at"] == 999 for u in lst)
    assert "password_hash" not in lst[0]
    assert tc.request("DELETE", "/admin/users/u1", headers=H).json()["ok"] is True
    assert all(u["code"] != "U1" for u in tc.get("/admin/users", headers=H).json()["users"])

def test_patch_user():
    conn, tc = build()
    tc.post("/admin/users", headers=H, json={"code": "u1", "password": "pw"})
    r = tc.patch("/admin/users/u1", headers=H, json={"expires_at": 555, "status": "disabled"})
    assert r.json()["ok"] is True
    u = db.get_user_by_code(conn, "u1")
    assert u.expires_at == 555 and u.status == "disabled"

def test_patch_missing_user_returns_false():
    _, tc = build()
    assert tc.patch("/admin/users/nope", headers=H, json={"status": "disabled"}).json()["ok"] is False

def test_admin_login_me_logout_cookie_flow():
    conn, tc = build()
    db.upsert_admin(conn, "root", "pw")
    assert tc.get("/admin/me").status_code == 401
    assert tc.post("/admin/login", json={"username": "root", "password": "bad"}).status_code == 401
    r = tc.post("/admin/login", json={"username": "root", "password": "pw"})
    assert r.status_code == 200 and r.json()["ok"] is True
    me = tc.get("/admin/me")
    assert me.status_code == 200 and me.json()["username"] == "root"
    assert tc.post("/admin/logout").json()["ok"] is True
    assert tc.get("/admin/me").status_code == 401

def test_users_auth_accepts_cookie_or_key():
    conn, tc = build()
    db.upsert_admin(conn, "root", "pw")
    assert tc.get("/admin/users").status_code == 403                               # 两者皆无
    assert tc.get("/admin/users", headers={"X-Admin-Key": "SECRET"}).status_code == 200  # key 路径
    tc.post("/admin/login", json={"username": "root", "password": "pw"})
    assert tc.get("/admin/users").status_code == 200                               # cookie 路径
