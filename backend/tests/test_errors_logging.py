import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

def test_upstream_timeout_returns_502():
    def handler(req):
        raise httpx.ConnectTimeout("boom", request=req)
    s = Settings(upstream="https://up.example/api")
    client = httpx.AsyncClient(base_url=s.upstream, transport=httpx.MockTransport(handler))
    tc = TestClient(create_app(settings=s, client=client))
    r = tc.get("/api/user/info")
    assert r.status_code == 502
    assert r.json()["error"] == "upstream_unreachable"
