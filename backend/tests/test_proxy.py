import gzip
import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

def make_client(handler):
    s = Settings(upstream="https://up.example/api")
    client = httpx.AsyncClient(base_url=s.upstream, transport=httpx.MockTransport(handler))
    return TestClient(create_app(settings=s, client=client))

def test_get_forwarded_with_status_and_body():
    def handler(req):
        assert str(req.url) == "https://up.example/api/user/info"
        return httpx.Response(201, json={"ok": True})
    tc = make_client(handler)
    r = tc.get("/api/user/info")
    assert r.status_code == 201
    assert r.json() == {"ok": True}

def test_post_body_and_token_forwarded():
    def handler(req):
        assert req.method == "POST"
        assert req.content == b'{"a":1}'
        assert req.headers.get("token") == "TT"
        return httpx.Response(200, json={"code": 0})
    tc = make_client(handler)
    r = tc.post("/api/auth/login", content=b'{"a":1}',
                headers={"token": "TT", "content-type": "application/json"})
    assert r.status_code == 200

def test_gzip_upstream_response_decoded_and_content_encoding_header_dropped():
    def handler(req):
        body = gzip.compress(b'{"ok":true}')
        return httpx.Response(
            200,
            headers={"content-encoding": "gzip", "content-type": "application/json"},
            content=body,
        )
    tc = make_client(handler)
    r = tc.get("/api/user/info")
    assert r.status_code == 200
    assert r.content == b'{"ok":true}'
    assert "content-encoding" not in {k.lower() for k in r.headers}
