# 子项目 B（角色 / 代理 / 号段）测试共用的造数据与客户端工具。
import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

H = {"X-Admin-Key": "SECRET"}

def build_app():
    """返回 (conn, app)。需要多个登录身份时，每个身份各开一个 TestClient（各自的 cookie）。"""
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": 0})))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004")
    app = create_app(Settings(admin_key="SECRET", admin_cookie_secure=False),
                     client=client, conn=conn, dayys=dayys)
    return conn, app

def key_client(app) -> TestClient:
    return TestClient(app, headers=H)

def login_client(app, username: str, password: str = "pw", *, top_up: bool = True) -> TestClient:
    """后台登录。积分为 0 的代理不能登录（需求回复第 12 条），与积分无关的测试只是要一个能登录的代理：
    top_up=True 时把 0 分代理直接设为 1 分（不写流水）再登录；已有余额的不动。"""
    if top_up:
        conn = app.state.db_conn
        conn.execute("UPDATE agents SET points=1 WHERE points=0 AND admin_id IN"
                     " (SELECT id FROM admins WHERE username=? AND role='agent')", (username,))
        conn.commit()
    tc = TestClient(app)
    r = tc.post("/admin/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return tc

def mk_admin(conn, username: str, password: str = "pw", role: str = "admin") -> int:
    a = db.upsert_admin(conn, username, password)
    conn.execute("UPDATE admins SET role=? WHERE id=?", (role, a.id))
    conn.commit()
    return a.id

def mk_agent_raw(conn, name: str, password: str = "pw", *, tier: str = "senior",
                 parent: int | None = None, status: str = "active", region: str = "city") -> int:
    """绕过业务校验直接落库一个代理（仅测试造数据用），返回 agent_id。"""
    admin_id = mk_admin(conn, name, password, role="agent")
    cur = conn.execute(
        "INSERT INTO agents(admin_id,name,name_key,region,tier,parent_agent_id,status,created_at)"
        " VALUES(?,?,?,?,?,?,?,0)",
        (admin_id, name, name.strip().casefold(), region, tier, parent, status))
    conn.commit()
    return cur.lastrowid

def set_agent_status_raw(conn, agent_id: int, status: str) -> None:
    conn.execute("UPDATE agents SET status=? WHERE id=?", (status, agent_id))
    conn.commit()

def audit(conn, action: str) -> list[dict]:
    rows, _ = db.list_audit(conn, 200, 0)
    return [r for r in rows if r["action"] == action]
