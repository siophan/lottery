import time, calendar
from app import db
import manage

def mem():
    conn = db.connect(":memory:"); db.init_db(conn); return conn

def test_add_and_list(capsys):
    conn = mem()
    assert manage.main(["add", "u1", "pw"], conn=conn) == 0
    assert db.get_user_by_code(conn, "u1") is not None
    manage.main(["list"], conn=conn)
    assert "U1" in capsys.readouterr().out

def test_add_with_expiry_parses_date():
    conn = mem()
    manage.main(["add", "u1", "pw", "--expires", "2030-01-01"], conn=conn)
    u = db.get_user_by_code(conn, "u1")
    assert u.expires_at == calendar.timegm(time.strptime("2030-01-01", "%Y-%m-%d"))

def test_set_expiry_never_clears():
    conn = mem()
    manage.main(["add", "u1", "pw", "--expires", "2030-01-01"], conn=conn)
    manage.main(["set-expiry", "u1", "never"], conn=conn)
    assert db.get_user_by_code(conn, "u1").expires_at is None

def test_disable_enable():
    conn = mem()
    manage.main(["add", "u1", "pw"], conn=conn)
    manage.main(["disable", "u1"], conn=conn)
    assert db.get_user_by_code(conn, "u1").status == "disabled"
    manage.main(["enable", "u1"], conn=conn)
    assert db.get_user_by_code(conn, "u1").status == "active"

def test_del():
    conn = mem()
    manage.main(["add", "u1", "pw"], conn=conn)
    manage.main(["del", "u1"], conn=conn)
    assert db.get_user_by_code(conn, "u1") is None

def test_admin_set_creates_and_resets():
    conn = mem()
    assert manage.main(["admin-set", "root", "pw1"], conn=conn) == 0
    a = db.get_admin_by_username(conn, "root")
    assert a is not None
    h1 = a.password_hash
    manage.main(["admin-set", "root", "pw2"], conn=conn)
    assert db.get_admin_by_username(conn, "root").password_hash != h1
    assert len(conn.execute("SELECT 1 FROM admins").fetchall()) == 1
