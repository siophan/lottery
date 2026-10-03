import gzip, httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

def build(handler):
    conn = db.connect(":memory:"); db.init_db(conn)
    def router(req):
        if req.url.path.endswith("/auth/login"):
            return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {}}})
        return handler(req)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(router))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    u = db.create_user(conn, "U1", "pw", None)
    return db.create_session(conn, u.id, 3600), TestClient(app)

def test_get_forwarded_with_status_and_body():
    def handler(req):
        assert str(req.url) == "https://up.example/api/user/info"
        return httpx.Response(201, json={"ok": True})
    tok, tc = build(handler)
    r = tc.get("/api/user/info", headers={"token": tok})
    assert r.status_code == 201 and r.json() == {"ok": True}

def test_post_body_forwarded_with_swapped_token():
    def handler(req):
        assert req.method == "POST"
        assert req.content == b'{"a":1}'
        assert req.headers.get("token") == "DYTOK"        # token 已换成 data-ys 的
        return httpx.Response(200, json={"code": 0})
    tok, tc = build(handler)
    r = tc.post("/api/user/updateInfo", content=b'{"a":1}',
                headers={"token": tok, "content-type": "application/json"})
    assert r.status_code == 200

def test_gzip_upstream_response_decoded_and_content_encoding_dropped():
    def handler(req):
        return httpx.Response(200,
            headers={"content-encoding": "gzip", "content-type": "application/json"},
            content=gzip.compress(b'{"ok":true}'))
    tok, tc = build(handler)
    r = tc.get("/api/user/info", headers={"token": tok})
    assert r.content == b'{"ok":true}'
    assert "content-encoding" not in {k.lower() for k in r.headers}
