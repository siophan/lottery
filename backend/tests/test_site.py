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
    return TestClient(app)

def test_landing_page_served():
    tc = build()
    r = tc.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "/download/ys-win.exe" in r.text
    assert "/download/ys-mac.dmg" in r.text

def test_download_dir_mounted():
    tc = build()
    r = tc.get("/download/README.txt")
    assert r.status_code == 200
