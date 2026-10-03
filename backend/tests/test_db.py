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
