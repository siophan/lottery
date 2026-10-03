import time
from app import db
from app.security import verify_password

def mem():
    conn = db.connect(":memory:")
    db.init_db(conn)
    return conn

def test_create_and_get_user_case_insensitive():
    conn = mem()
    u = db.create_user(conn, "abc1234", "pw", None)
    assert u.code == "ABC1234"
    got = db.get_user_by_code(conn, "AbC1234")
    assert got is not None and got.id == u.id
    assert verify_password("pw", got.salt, got.password_hash)

def test_get_missing_user_returns_none():
    assert db.get_user_by_code(mem(), "NOPE") is None

def test_delete_user_also_deletes_sessions():
    conn = mem()
    u = db.create_user(conn, "u1", "pw", None)
    tok = db.create_session(conn, u.id, 3600)
    assert db.get_session(conn, tok) is not None
    assert db.delete_user(conn, "u1") is True
    assert db.get_session(conn, tok) is None

def test_update_user_expiry_status_password():
    conn = mem()
    db.create_user(conn, "u1", "pw", None)
    assert db.update_user(conn, "u1", expires_at=123, status="disabled", password="new") is True
    u = db.get_user_by_code(conn, "u1")
    assert u.expires_at == 123 and u.status == "disabled"
    assert verify_password("new", u.salt, u.password_hash)

def test_session_create_get_and_expiry():
    conn = mem()
    u = db.create_user(conn, "u1", "pw", None)
    tok = db.create_session(conn, u.id, 3600)
    s = db.get_session(conn, tok)
    assert s.user_id == u.id and s.expires_at > int(time.time())
    db.delete_session(conn, tok)
    assert db.get_session(conn, tok) is None

def test_purge_expired_sessions():
    conn = mem()
    u = db.create_user(conn, "u1", "pw", None)
    db.create_session(conn, u.id, -1)   # 已过期
    fresh = db.create_session(conn, u.id, 3600)
    assert db.purge_expired_sessions(conn) == 1
    assert db.get_session(conn, fresh) is not None

def test_list_users():
    conn = mem()
    db.create_user(conn, "u1", "pw", None)
    db.create_user(conn, "u2", "pw", 999)
    codes = sorted(u.code for u in db.list_users(conn))
    assert codes == ["U1", "U2"]

def test_admin_upsert_idempotent_and_lookup():
    from app import db
    conn = db.connect(":memory:"); db.init_db(conn)
    a1 = db.upsert_admin(conn, "root", "pw1")
    assert db.get_admin_by_username(conn, "root").id == a1.id
    assert db.get_admin_by_id(conn, a1.id).username == "root"
    old_hash = db.get_admin_by_username(conn, "root").password_hash
    a2 = db.upsert_admin(conn, "root", "pw2")
    assert a2.id == a1.id                      # 同一行
    assert db.get_admin_by_username(conn, "root").password_hash != old_hash
    assert len(conn.execute("SELECT 1 FROM admins").fetchall()) == 1

def test_admin_session_crud():
    from app import db
    conn = db.connect(":memory:"); db.init_db(conn)
    a = db.upsert_admin(conn, "root", "pw")
    exp = db.create_admin_session(conn, "TOK", a.id, 1000)
    s = db.get_admin_session(conn, "TOK")
    assert s.admin_id == a.id and s.expires_at == exp
    assert db.delete_admin_session(conn, "TOK") is True
    assert db.get_admin_session(conn, "TOK") is None
    assert db.delete_admin_session(conn, "TOK") is False

def test_purge_expired_admin_sessions():
    from app import db
    conn = db.connect(":memory:"); db.init_db(conn)
    a = db.upsert_admin(conn, "root", "pw")
    db.create_admin_session(conn, "OLD", a.id, -10)   # 立即过期
    db.create_admin_session(conn, "NEW", a.id, 1000)
    assert db.purge_expired_admin_sessions(conn) == 1
    assert db.get_admin_session(conn, "OLD") is None
    assert db.get_admin_session(conn, "NEW") is not None
