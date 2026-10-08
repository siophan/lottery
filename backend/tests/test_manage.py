import time, calendar
from app import db, db_points
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

def test_recharge_arrears_only_tops_up_usable_zero_balance_accounts(capsys):
    from tests.points_helpers import ledger, points_of, set_points_raw
    conn = mem()
    for c in ("A1", "A2", "OFF", "OLD", "RICH"):
        db.create_user(conn, c, "pw", None)
    db.create_user(conn, "PEND", "x", None, pending=True)
    db.update_user(conn, "OFF", status="disabled")
    db.update_user(conn, "OLD", expires_at=int(time.time()) - 10)
    set_points_raw(conn, "RICH", 5)
    assert manage.main(["recharge-arrears", "30", "--dry-run"], conn=conn) == 0
    assert "accounts to recharge: 2" in capsys.readouterr().out
    assert points_of(conn, "A1") == 0
    assert manage.main(["recharge-arrears", "30"], conn=conn) == 0
    assert [points_of(conn, c) for c in ("A1", "A2", "OFF", "OLD", "RICH", "PEND")] == [30, 30, 0, 0, 5, 0]
    rows = ledger(conn, kind="grant")
    assert {(r["holder_id"], r["actor"], r["reason"]) for r in rows} == {
        ("A1", "manage.py", "积分上线初始充值"), ("A2", "manage.py", "积分上线初始充值")}
    assert manage.main(["recharge-arrears", "30"], conn=conn) == 0      # 重跑：已无欠费账号
    assert "accounts to recharge: 0" in capsys.readouterr().out.splitlines()[-1]

def test_recharge_arrears_rejects_bad_amount(capsys):
    conn = mem()
    assert manage.main(["recharge-arrears", "0", "--dry-run"], conn=conn) == 1     # 先校验分数，再选账号
    assert "积分数量需为 1–100000 的整数" in capsys.readouterr().out

def test_recharge_arrears_skips_accounts_that_ever_had_points(capsys):
    # 只补「从未有过积分流水」的老账号：上线后再跑，不能给用完积分的号、拿过体验的号白送
    conn = mem()
    now = int(time.time())
    for c in ("A1", "SPENT"):
        db.create_user(conn, c, "pw", None)
    db_points.staff_adjust(conn, "user", "SPENT", "grant", 5, None, actor_type="admin", actor="root", now=now)
    db_points.staff_adjust(conn, "user", "SPENT", "revoke", 5, "测试", actor_type="admin", actor="root", now=now)
    db_points.set_trial_settings(conn, True, 7, actor_type="admin", actor="root", now=now)
    db.create_user(conn, "TRIAL", "x", None, pending=True)
    assert db.activate_user(conn, "TRIAL", now) == "ok"
    db_points.staff_adjust(conn, "user", "TRIAL", "revoke", 7, "测试", actor_type="admin", actor="root", now=now)
    assert manage.main(["recharge-arrears", "30"], conn=conn) == 0
    assert "accounts to recharge: 1" in capsys.readouterr().out
    from tests.points_helpers import points_of
    assert [points_of(conn, c) for c in ("A1", "SPENT", "TRIAL")] == [30, 0, 0]

def test_recharge_arrears_skips_legacy_blank_codes(capsys):
    # 旧版本可能遗留编号为空的账号：批量充值会整批拒绝空编号，初始充值跳过它们
    conn = mem()
    db.create_user(conn, "A1", "pw", None)
    conn.execute("INSERT INTO users(code, password_hash, salt, status, created_at, first_activated_at, onboarded_at)"
                 " VALUES ('', 'h', 's', 'active', 1, 1, 1)"); conn.commit()
    assert manage.main(["recharge-arrears", "30"], conn=conn) == 0
    assert "accounts to recharge: 1" in capsys.readouterr().out
    from tests.points_helpers import points_of
    assert points_of(conn, "A1") == 30
