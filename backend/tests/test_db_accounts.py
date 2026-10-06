import sqlite3
from app import db
from app.security import verify_password

def mem():
    conn = db.connect(":memory:")
    db.init_db(conn)
    return conn

LEGACY_USERS = """
CREATE TABLE users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
)
"""

def _cols(conn):
    return {r["name"] for r in conn.execute("PRAGMA table_info(users)")}

# ---------------- 迁移 ----------------

def test_migration_adds_columns_and_backfills_legacy_rows():
    conn = db.connect(":memory:")
    conn.execute(LEGACY_USERS)
    conn.execute("INSERT INTO users(code,password_hash,salt,expires_at,status,created_at)"
                 " VALUES('OLD1','h','s',NULL,'active',1000)")
    conn.commit()
    db.init_db(conn)
    assert {"first_activated_at", "activated_at", "phone", "onboarded_at"} <= _cols(conn)
    u = db.get_user_by_code(conn, "OLD1")
    assert u.first_activated_at == 1000
    assert u.activated_at == 1000
    assert u.onboarded_at == 1000
    assert u.phone is None

def test_migration_is_idempotent_and_does_not_rebackfill():
    conn = db.connect(":memory:")
    conn.execute(LEGACY_USERS)
    conn.execute("INSERT INTO users(code,password_hash,salt,expires_at,status,created_at)"
                 " VALUES('OLD1','h','s',NULL,'active',1000)")
    conn.commit()
    db.init_db(conn)
    conn.execute("UPDATE users SET onboarded_at=NULL, first_activated_at=NULL, activated_at=NULL")
    conn.commit()
    db.init_db(conn)
    u = db.get_user_by_code(conn, "OLD1")
    assert u.onboarded_at is None
    assert u.first_activated_at is None
    assert u.activated_at is None

def test_init_db_creates_new_tables():
    conn = mem()
    names = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"onboard_tickets", "sms_codes", "sms_send_log", "audit_logs"} <= names

def test_migration_is_atomic_when_backfill_fails():
    conn = db.connect(":memory:")
    conn.execute(LEGACY_USERS)
    conn.execute("INSERT INTO users(code,password_hash,salt,expires_at,status,created_at)"
                 " VALUES('OLD1','h','s',NULL,'active',1000)")
    conn.execute("CREATE TRIGGER boom BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT,'boom'); END")
    conn.commit()
    try:
        db.init_db(conn)
        assert False, "应当抛异常"
    except sqlite3.DatabaseError:
        pass
    # 回滚后列不应残留，否则下次启动不会再回填
    assert "onboarded_at" not in _cols(conn)
    conn.execute("DROP TRIGGER boom")
    conn.commit()
    db.init_db(conn)
    assert db.get_user_by_code(conn, "OLD1").onboarded_at == 1000

# ---------------- create_user ----------------

def test_create_user_default_is_active_and_onboarded():
    conn = mem()
    u = db.create_user(conn, "a1", "pw", None)
    assert u.first_activated_at == u.activated_at == u.onboarded_at == u.created_at
    assert u.phone is None
    got = db.get_user_by_code(conn, "a1")
    assert got.first_activated_at == u.created_at and got.onboarded_at == u.created_at
    assert verify_password("pw", got.salt, got.password_hash)

def test_create_user_pending():
    conn = mem()
    u = db.create_user(conn, "p1", "ignored", None, pending=True)
    assert u.first_activated_at is None and u.activated_at is None and u.onboarded_at is None
    got = db.get_user_by_code(conn, "p1")
    assert got.first_activated_at is None and got.activated_at is None and got.onboarded_at is None
    assert got.status == "active"
    assert not verify_password("ignored", got.salt, got.password_hash)
    assert verify_password(db.INITIAL_PASSWORD, got.salt, got.password_hash)   # 预置初始密码

# ---------------- activate / reset ----------------

def test_activate_user_results():
    conn = mem()
    db.create_user(conn, "p1", "x", None, pending=True)
    assert db.activate_user(conn, "p1", 5000) == "ok"
    u = db.get_user_by_code(conn, "p1")
    assert u.first_activated_at == 5000 and u.activated_at == 5000
    assert u.status == "active" and u.onboarded_at is None
    assert verify_password("123456", u.salt, u.password_hash)
    assert db.activate_user(conn, "p1", 6000) == "already"
    assert db.get_user_by_code(conn, "p1").first_activated_at == 5000
    assert db.activate_user(conn, "nope", 6000) == "not_found"

def test_reset_user_password_results_and_clears_sessions():
    conn = mem()
    u = db.create_user(conn, "r1", "oldpw", None)
    tok = db.create_session(conn, u.id, 3600)
    assert db.reset_user_password(conn, "r1") == "ok"
    got = db.get_user_by_code(conn, "r1")
    assert verify_password("123456", got.salt, got.password_hash)
    assert got.onboarded_at is None
    assert db.get_session(conn, tok) is None
    assert db.reset_user_password(conn, "nope") == "not_found"
    db.create_user(conn, "p1", "x", None, pending=True)
    assert db.reset_user_password(conn, "p1") == "pending"

def test_delete_user_sessions():
    conn = mem()
    u = db.create_user(conn, "s1", "pw", None)
    other = db.create_user(conn, "s2", "pw", None)
    t1 = db.create_session(conn, u.id, 3600)
    t2 = db.create_session(conn, other.id, 3600)
    db.delete_user_sessions(conn, u.id)
    assert db.get_session(conn, t1) is None
    assert db.get_session(conn, t2) is not None

# ---------------- onboard 票据 ----------------

def test_onboard_ticket_valid_and_expired(monkeypatch):
    conn = mem()
    u = db.create_user(conn, "t1", "pw", None)
    monkeypatch.setattr(db.time, "time", lambda: 1000)
    tok = db.create_onboard_ticket(conn, u.id, 900)
    assert db.get_onboard_ticket_user(conn, tok, 1000).id == u.id
    assert db.get_onboard_ticket_user(conn, tok, 1900).id == u.id
    assert db.get_onboard_ticket_user(conn, tok, 1901) is None
    assert db.get_onboard_ticket_user(conn, "bogus", 1000) is None

def test_complete_onboarding_updates_and_clears_sessions_and_tickets():
    conn = mem()
    u = db.create_user(conn, "c1", "pw", None)
    sess = db.create_session(conn, u.id, 3600)
    ticket = db.create_onboard_ticket(conn, u.id, 900)
    other = db.create_user(conn, "c2", "pw", None)
    other_ticket = db.create_onboard_ticket(conn, other.id, 900)
    db.complete_onboarding(conn, u.id, "Newpass123", "13812341234", 7000)
    got = db.get_user_by_code(conn, "c1")
    assert verify_password("Newpass123", got.salt, got.password_hash)
    assert got.phone == "13812341234" and got.onboarded_at == 7000
    assert db.get_session(conn, sess) is None
    assert db.get_onboard_ticket_user(conn, ticket, 0) is None
    assert db.get_onboard_ticket_user(conn, other_ticket, 0) is not None

# ---------------- 短信验证码 ----------------

def test_sms_code_ok_deletes_code():
    conn = mem()
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, 1000)
    assert db.check_sms_code(conn, "13800000000", "onboard", "123456", 1100) == "ok"
    assert db.check_sms_code(conn, "13800000000", "onboard", "123456", 1100) == "missing"

def test_sms_code_not_stored_in_plaintext():
    conn = mem()
    db.save_sms_code(conn, "13800000000", "onboard", "654321", 300, 1000)
    r = conn.execute("SELECT * FROM sms_codes").fetchone()
    assert "654321" not in (r["code_hash"], r["salt"])
    assert r["sent_at"] == 1000 and r["expires_at"] == 1300 and r["attempts"] == 0

def test_sms_code_missing_and_expired():
    conn = mem()
    assert db.check_sms_code(conn, "13800000000", "onboard", "123456", 1000) == "missing"
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, 1000)
    assert db.check_sms_code(conn, "13800000000", "onboard", "123456", 1300) == "ok"
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, 1000)
    assert db.check_sms_code(conn, "13800000000", "onboard", "123456", 1301) == "expired"

def test_sms_code_wrong_then_too_many_deletes_code():
    conn = mem()
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, 1000)
    for _ in range(4):
        assert db.check_sms_code(conn, "13800000000", "onboard", "000000", 1001) == "wrong"
    assert db.check_sms_code(conn, "13800000000", "onboard", "000000", 1001) == "too_many"
    # 码已作废，即使输入正确也是 missing
    assert db.check_sms_code(conn, "13800000000", "onboard", "123456", 1001) == "missing"

def test_sms_code_wrong_then_right_still_ok():
    conn = mem()
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, 1000)
    assert db.check_sms_code(conn, "13800000000", "onboard", "000000", 1001) == "wrong"
    assert db.check_sms_code(conn, "13800000000", "onboard", "123456", 1002) == "ok"

def test_save_sms_code_overwrites_old_and_resets_attempts():
    conn = mem()
    db.save_sms_code(conn, "13800000000", "onboard", "111111", 300, 1000)
    db.check_sms_code(conn, "13800000000", "onboard", "000000", 1001)
    db.save_sms_code(conn, "13800000000", "onboard", "222222", 300, 1100)
    assert conn.execute("SELECT COUNT(*) FROM sms_codes").fetchone()[0] == 1
    assert db.check_sms_code(conn, "13800000000", "onboard", "111111", 1101) == "wrong"
    assert db.check_sms_code(conn, "13800000000", "onboard", "222222", 1101) == "ok"

def test_last_sent_at_comes_from_send_log_and_survives_code_deletion():
    conn = mem()
    assert db.last_sms_sent_at(conn, "13800000000") is None
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, 1000)
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, 1200)
    assert db.last_sms_sent_at(conn, "13800000000") == 1200
    assert db.last_sms_sent_at(conn, "13900000000") is None
    db.delete_sms_code(conn, "13800000000", "onboard")
    assert db.last_sms_sent_at(conn, "13800000000") == 1200      # 删码不影响冷却依据

def test_count_sms_sent_by_user_since():
    conn = mem()
    db.save_sms_code(conn, "13800000000", "onboard", "1", 300, 100, user_id=7)
    db.save_sms_code(conn, "13900000000", "onboard", "1", 300, 200, user_id=7)
    db.save_sms_code(conn, "13900000000", "onboard", "1", 300, 300, user_id=8)
    db.save_sms_code(conn, "13700000000", "onboard", "1", 300, 400)          # 无 user_id
    assert db.count_sms_sent_by_user_since(conn, 7, 0) == 2
    assert db.count_sms_sent_by_user_since(conn, 7, 150) == 1
    assert db.count_sms_sent_by_user_since(conn, 8, 0) == 1
    assert db.count_sms_sent_by_user_since(conn, 9, 0) == 0

def test_sms_send_log_user_id_migration_is_idempotent():
    conn = db.connect(":memory:")
    conn.execute("CREATE TABLE sms_send_log(phone TEXT NOT NULL, sent_at INTEGER NOT NULL)")
    conn.execute("INSERT INTO sms_send_log VALUES('13800000000', 5)")
    conn.commit()
    db.init_db(conn)
    db.init_db(conn)
    assert "user_id" in {r["name"] for r in conn.execute("PRAGMA table_info(sms_send_log)")}
    assert conn.execute("SELECT user_id FROM sms_send_log").fetchone()["user_id"] is None
    db.save_sms_code(conn, "13800000000", "onboard", "1", 300, 10, user_id=3)
    assert db.count_sms_sent_by_user_since(conn, 3, 0) == 1

def test_count_sms_sent_since():
    conn = mem()
    for t in (100, 200, 300):
        db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, t)
    db.save_sms_code(conn, "13900000000", "onboard", "123456", 300, 250)
    assert db.count_sms_sent_since(conn, "13800000000", 0) == 3
    assert db.count_sms_sent_since(conn, "13800000000", 200) == 2
    assert db.count_sms_sent_since(conn, "13800000000", 301) == 0
    assert db.count_sms_sent_since(conn, "13900000000", 0) == 1

# ---------------- 审计 ----------------

def test_audit_add_list_order_filter_total():
    conn = mem()
    db.add_audit(conn, "admin", "root", "user.create", "A1", {"x": 1}, now=100)
    db.add_audit(conn, "admin", "root", "user.status", "B2", {"from": "active", "to": "banned"}, now=200)
    db.add_audit(conn, "user", "A1", "user.onboard", "A1", {"phone": "138****1234"}, now=300)
    rows, total = db.list_audit(conn, 10, 0)
    assert total == 3
    assert [r["action"] for r in rows] == ["user.onboard", "user.status", "user.create"]
    assert set(rows[0]) == {"id", "actor_type", "actor", "action", "target", "detail", "created_at"}
    assert rows[0]["detail"] == {"phone": "138****1234"}
    assert rows[0]["actor_type"] == "user" and rows[0]["created_at"] == 300
    rows, total = db.list_audit(conn, 10, 0, target="A1")
    assert total == 2 and [r["action"] for r in rows] == ["user.onboard", "user.create"]
    rows, total = db.list_audit(conn, 1, 1)
    assert total == 3 and [r["action"] for r in rows] == ["user.status"]

def test_audit_default_now_and_purge_boundary():
    conn = mem()
    db.add_audit(conn, "system", "sys", "x", None, {})
    assert db.list_audit(conn, 10, 0)[0][0]["created_at"] > 0
    conn.execute("DELETE FROM audit_logs")
    now = 10 * db.AUDIT_RETENTION_SEC
    db.add_audit(conn, "admin", "r", "old", "T", {}, now=now - db.AUDIT_RETENTION_SEC - 1)
    db.add_audit(conn, "admin", "r", "edge", "T", {}, now=now - db.AUDIT_RETENTION_SEC)
    db.add_audit(conn, "admin", "r", "new", "T", {}, now=now)
    assert db.purge_old_audit_logs(conn, now) == 1
    rows, total = db.list_audit(conn, 10, 0)
    assert total == 2 and {r["action"] for r in rows} == {"edge", "new"}

def test_constants():
    assert db.INITIAL_PASSWORD == "123456"
    assert db.AUDIT_RETENTION_SEC == 3 * 365 * 86400

# ---------------- mask_phone ----------------

def test_mask_phone():
    assert db.mask_phone("13812341234") == "138****1234"
    assert db.mask_phone(None) is None

def test_reset_user_password_also_clears_onboard_tickets():
    conn = mem()
    u = db.create_user(conn, "r1", "pw", None)
    tk = db.create_onboard_ticket(conn, u.id, 900)
    assert db.reset_user_password(conn, "r1") == "ok"
    assert db.get_onboard_ticket_user(conn, tk, 0) is None

def test_purge_old_sms_send_log():
    conn = mem()
    now = 100000
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, now - 86400 - 1)
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, now - 86400)
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, now)
    assert db.purge_old_sms_send_log(conn, now) == 1
    assert db.count_sms_sent_since(conn, "13800000000", 0) == 2

def test_sms_attempts_increment_is_sql_side():
    conn = mem()
    db.save_sms_code(conn, "13800000000", "onboard", "123456", 300, 1000)
    # 另一连接/并发修改了计数：以数据库值为准，而不是 Python 读到的旧值
    orig = db.check_sms_code
    db.check_sms_code(conn, "13800000000", "onboard", "000000", 1001)
    conn.execute("UPDATE sms_codes SET attempts=3")
    conn.commit()
    assert orig(conn, "13800000000", "onboard", "000000", 1001, max_attempts=5) == "wrong"
    assert conn.execute("SELECT attempts FROM sms_codes").fetchone()[0] == 4
    assert orig(conn, "13800000000", "onboard", "000000", 1001, max_attempts=5) == "too_many"

def test_get_user_by_id():
    conn = db.connect(":memory:"); db.init_db(conn)
    u = db.create_user(conn, "U1", "pw", None)
    assert db.get_user_by_id(conn, u.id).code == "U1"
    assert db.get_user_by_id(conn, 9999) is None

def test_purge_expired_onboard_tickets():
    conn = mem()
    u = db.create_user(conn, "A1", "pw", None)
    now = 10_000
    for tok, exp in (("old", now - 1), ("edge", now), ("new", now + 5)):
        conn.execute("INSERT INTO onboard_tickets(token,user_id,created_at,expires_at) VALUES(?,?,?,?)",
                     (tok, u.id, 1, exp))
    conn.commit()
    assert db.purge_expired_onboard_tickets(conn, now) == 1       # 仅严格过期的被删
    left = {r["token"] for r in conn.execute("SELECT token FROM onboard_tickets")}
    assert left == {"edge", "new"}
