import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

def build(handler):
    conn = db.connect(":memory:"); db.init_db(conn)
    def router(req):
        if req.url.path.endswith("/auth/login"):
            return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOKEN12345", "userInfo": {}}})
        return handler(req)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(router))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    u = db.create_user(conn, "U1", "pw", None)
    return db.create_session(conn, u.id, 3600), TestClient(app)

def test_upstream_timeout_returns_502():
    def handler(req):
        raise httpx.ConnectTimeout("boom", request=req)
    tok, tc = build(handler)
    r = tc.get("/api/user/info", headers={"token": tok})
    assert r.status_code == 502 and r.json()["error"] == "upstream_unreachable"

def test_request_logged_with_masked_token(capsys):
    def handler(req):
        return httpx.Response(200, json={"code": 0})
    tok, tc = build(handler)
    tc.get("/api/user/info", headers={"token": tok})
    out = capsys.readouterr().out
    assert "/api/user/info -> 200" in out
    assert "DYTOKEN12345" not in out      # data-ys token 不明文
    assert tok not in out                  # 我方 token 不明文
