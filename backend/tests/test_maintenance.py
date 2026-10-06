import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db, maintenance
from app.dayys_session import DataYsSession

DAY = 86400

def mem():
    conn = db.connect(":memory:"); db.init_db(conn)
    return conn

def test_run_maintenance_purges_everything():
    conn = mem()
    now = 10 * 365 * DAY
    u = db.create_user(conn, "U1", "pw", None)
    # 审计：一条超过三年、一条新的
    db.add_audit(conn, "admin", "root", "user.create", "U1", {}, now=now - db.AUDIT_RETENTION_SEC - 1)
    db.add_audit(conn, "admin", "root", "user.create", "U1", {}, now=now)
    # 短信发送记录：一条超 24h、一条新的
    conn.execute("INSERT INTO sms_send_log(phone,sent_at,user_id) VALUES('13800000000',?,?)", (now - DAY - 1, u.id))
    conn.execute("INSERT INTO sms_send_log(phone,sent_at,user_id) VALUES('13800000000',?,?)", (now, u.id))
    # 首登票据：一条过期、一条有效
    conn.execute("INSERT INTO onboard_tickets(token,user_id,created_at,expires_at) VALUES('old',?,1,?)", (u.id, now - 1))
    conn.execute("INSERT INTO onboard_tickets(token,user_id,created_at,expires_at) VALUES('new',?,1,?)", (u.id, now + 1))
    # 会话（真实时间基准）：一条过期、一条有效
    conn.execute("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES('s_old',?,1,1)", (u.id,))
    live = db.create_session(conn, u.id, 3600)
    conn.execute("INSERT INTO admin_sessions(token,admin_id,created_at,expires_at) VALUES('a_old',1,1,1)")
    conn.commit()

    res = maintenance.run_maintenance(conn, now)
    assert res == {"audit_logs": 1, "sms_send_log": 1, "onboard_tickets": 1,
                   "sessions": 1, "admin_sessions": 1}
    assert db.list_audit(conn, 10, 0)[1] == 1
    assert [r["token"] for r in conn.execute("SELECT token FROM onboard_tickets")] == ["new"]
    assert db.get_session(conn, live) is not None

def test_run_maintenance_swallows_exceptions(monkeypatch, capsys):
    conn = mem()
    def boom(*a, **k):
        raise RuntimeError("db locked")
    monkeypatch.setattr(db, "purge_old_audit_logs", boom)
    res = maintenance.run_maintenance(conn, 1000)       # 不抛
    assert "audit_logs" not in res and set(res) == {"sms_send_log", "onboard_tickets", "sessions", "admin_sessions"}
    assert "maintenance audit_logs failed" in capsys.readouterr().out

def test_lifespan_runs_maintenance_at_startup_and_shuts_down_cleanly():
    conn = mem()
    now = 5 * 365 * DAY
    # 启动时就应清掉过期审计（用真实时间，足够老即可）
    db.add_audit(conn, "admin", "root", "user.create", "U1", {}, now=1)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": 0})))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004")
    app = create_app(Settings(admin_key="SECRET", admin_cookie_secure=False),
                     client=client, conn=conn, dayys=dayys)
    with TestClient(app) as tc:
        assert tc.get("/admin/users", headers={"X-Admin-Key": "SECRET"}).status_code == 200
        assert db.list_audit(conn, 10, 0)[1] == 0
        assert app.state.maintenance_task is not None and not app.state.maintenance_task.done()
    assert app.state.maintenance_task.done()

def test_maintenance_loop_keeps_going_after_errors(monkeypatch):
    import asyncio
    calls = []
    def flaky(conn, now):
        calls.append(now)
        if len(calls) == 1:
            raise RuntimeError("boom")
        return {}
    monkeypatch.setattr(maintenance, "run_maintenance", flaky)
    async def go():
        t = asyncio.create_task(maintenance.maintenance_loop(None, interval=0.01))
        await asyncio.sleep(0.15)
        t.cancel()
        try:
            await t
        except asyncio.CancelledError:
            pass
    asyncio.run(go())
    assert len(calls) >= 2
