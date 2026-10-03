from app import db, admin_auth
from app.config import Settings

def _conn():
    c = db.connect(":memory:"); db.init_db(c); return c

def test_authenticate_ok_wrong_and_unknown():
    conn = _conn(); db.upsert_admin(conn, "root", "pw")
    assert admin_auth.authenticate(conn, "root", "pw") is not None
    assert admin_auth.authenticate(conn, "root", "bad") is None
    assert admin_auth.authenticate(conn, "nobody", "pw") is None

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
