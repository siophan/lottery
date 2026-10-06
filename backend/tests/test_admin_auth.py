import asyncio
from app import db, admin_auth
from app.config import Settings

def _conn():
    c = db.connect(":memory:"); db.init_db(c); return c

def test_authenticate_ok_wrong_and_unknown():
    conn = _conn(); db.upsert_admin(conn, "root", "pw")
    auth = lambda u, p: asyncio.run(admin_auth.authenticate(conn, u, p))
    assert auth("root", "pw") is not None
    assert auth("root", "bad") is None
    assert auth("nobody", "pw") is None

def test_issue_and_current_admin():
    conn = _conn(); a = db.upsert_admin(conn, "root", "pw")
    s = Settings(admin_session_ttl=1000)
    tok = admin_auth.issue_session(conn, s, a)
    assert admin_auth.current_admin(conn, tok).username == "root"
    assert admin_auth.current_admin(conn, "bad") is None
    assert admin_auth.current_admin(conn, "") is None
    assert admin_auth.current_admin(conn, None) is None

def test_current_admin_rejects_expired():
    conn = _conn(); a = db.upsert_admin(conn, "root", "pw")
    s = Settings(admin_session_ttl=-5)   # 立即过期
    tok = admin_auth.issue_session(conn, s, a)
    assert admin_auth.current_admin(conn, tok) is None

def test_authenticate_rejects_password_changed_while_hashing(monkeypatch):
    import asyncio
    from app import admin_auth, security
    conn = db.connect(":memory:"); db.init_db(conn)
    db.upsert_admin(conn, "boss", "oldpw1")
    real = admin_auth.run_in_threadpool
    async def racing(fn, *a, **kw):
        h, salt = security.hash_password("newpw1")
        conn.execute("UPDATE admins SET password_hash=?, salt=? WHERE username='boss'", (h, salt)); conn.commit()
        return await real(fn, *a, **kw)
    monkeypatch.setattr(admin_auth, "run_in_threadpool", racing)
    assert asyncio.run(admin_auth.authenticate(conn, "boss", "oldpw1")) is None
