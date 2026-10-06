import sqlite3
import pytest
from app import db
import manage
from tests.agent_helpers import (H, audit, build_app, key_client, login_client, mk_admin,
                                 mk_agent_raw, set_agent_status_raw)

LEGACY_ADMINS = """
CREATE TABLE admins(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
"""

A_ERA_USERS = """
CREATE TABLE users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  first_activated_at INTEGER,
  activated_at INTEGER,
  phone TEXT,
  onboarded_at INTEGER
)
"""

def _cols(conn, table):
    return {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}

# ---------------- 迁移 ----------------

def test_migration_existing_admins_become_admin_role():
    conn = db.connect(":memory:")
    conn.execute(LEGACY_ADMINS)
    conn.execute("INSERT INTO admins(username,password_hash,salt,created_at) VALUES('root','h','s',1)")
    conn.commit()
    db.init_db(conn)
    assert "role" in _cols(conn, "admins")
    assert db.get_admin_by_username(conn, "root").role == "admin"
    db.init_db(conn)                                     # 幂等
    assert db.get_admin_by_username(conn, "root").role == "admin"

def test_migration_from_a_era_keeps_pending_users_pending():
    # A 之后的库：users 已有 A 的 4 列，只缺 B 的 3 列 → 只加列，绝不回填为已激活
    conn = db.connect(":memory:")
    conn.execute(A_ERA_USERS)
    conn.execute("INSERT INTO users(code,password_hash,salt,status,created_at) VALUES('P1','h','s','active',5)")
    conn.commit()
    db.init_db(conn)
    assert {"agent_id", "activated_by_agent_id", "agent_chain_json"} <= _cols(conn, "users")
    u = db.get_user_by_code(conn, "P1")
    assert u.first_activated_at is None and u.onboarded_at is None
    assert u.agent_id is None and u.activated_by_agent_id is None and u.agent_chain_json is None

def test_init_db_creates_b_tables():
    conn = db.connect(":memory:"); db.init_db(conn)
    names = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"agents", "agent_name_reservations", "segment_ops", "admin_grants"} <= names
    assert {"recycled_at", "name_key", "parent_agent_id"} <= _cols(conn, "agents")

# ---------------- 唯一最高权限者 ----------------

def test_set_super_demotes_previous_atomically_and_audits():
    conn, _ = build_app()
    mk_admin(conn, "a1"); mk_admin(conn, "a2")
    assert db.set_super(conn, "a1") == "ok"
    assert db.get_admin_by_username(conn, "a1").role == "super"
    assert db.set_super(conn, "a2") == "ok"
    assert db.get_admin_by_username(conn, "a1").role == "admin"
    assert db.get_admin_by_username(conn, "a2").role == "super"
    assert conn.execute("SELECT COUNT(*) FROM admins WHERE role='super'").fetchone()[0] == 1
    e = audit(conn, "admin.set_super")[0]
    assert e["actor_type"] == "system" and e["actor"] == "manage.py"
    assert e["target"] == "a2" and e["detail"] == {"previous": "a1"}

def test_set_super_rejects_unknown_and_agent():
    conn, _ = build_app()
    mk_agent_raw(conn, "ag1")
    assert db.set_super(conn, "nobody") == "not_found"
    assert db.set_super(conn, "ag1") == "is_agent"
    assert conn.execute("SELECT COUNT(*) FROM admins WHERE role='super'").fetchone()[0] == 0

def test_second_super_blocked_by_unique_index():
    conn, _ = build_app()
    mk_admin(conn, "a1", role="super")
    a2 = mk_admin(conn, "a2")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE admins SET role='super' WHERE id=?", (a2,))
    conn.rollback()

def test_manage_set_super(capsys):
    conn, _ = build_app()
    mk_admin(conn, "root")
    assert manage.main(["set-super", "root"], conn=conn) == 0
    assert "super set: root" in capsys.readouterr().out
    assert db.get_admin_by_username(conn, "root").role == "super"
    assert manage.main(["set-super", "ghost"], conn=conn) == 1
    assert "not found" in capsys.readouterr().out

# ---------------- 角色守卫 ----------------

STAFF_ENDPOINTS = [
    ("POST", "/admin/users"), ("GET", "/admin/audit-logs"), ("GET", "/admin/data-sources"),
    ("POST", "/admin/users/U1/reset-password"), ("DELETE", "/admin/users/U1"),
]

def test_agent_forbidden_on_staff_endpoints():
    conn, app = build_app()
    db.create_user(conn, "U1", "pw", None)
    mk_agent_raw(conn, "ag1")
    tc = login_client(app, "ag1")
    for method, path in STAFF_ENDPOINTS:
        r = tc.request(method, path)
        assert r.status_code == 403 and r.json() == {"error": "forbidden"}, path
    assert db.get_user_by_code(conn, "U1") is not None

def test_admin_cookie_and_key_pass_staff_guard():
    conn, app = build_app()
    mk_admin(conn, "adm")
    assert login_client(app, "adm").get("/admin/users").status_code == 200
    assert key_client(app).get("/admin/data-sources").status_code == 200

# ---------------- 登录与 /me ----------------

def test_me_reports_role_grants_and_agent():
    conn, app = build_app()
    mk_admin(conn, "boss", role="super")
    me = login_client(app, "boss").get("/admin/me").json()
    assert me == {"username": "boss", "role": "super", "grants": [], "agent": None}
    aid = mk_agent_raw(conn, "ag1", tier="junior", region="vip")
    me = login_client(app, "ag1").get("/admin/me").json()
    assert me["role"] == "agent" and me["agent"]["id"] == aid
    assert me["agent"]["tier"] == "junior" and me["agent"]["region"] == "vip"
    assert "admin_id" not in me["agent"] and "name_key" not in me["agent"]

@pytest.mark.parametrize("status,msg", [("paused", "代理资格已暂停，无法登录"),
                                        ("cancelled", "代理资格已取消，无法登录")])
def test_inactive_agent_cannot_login(status, msg):
    conn, app = build_app()
    mk_agent_raw(conn, "ag1", status=status)
    from fastapi.testclient import TestClient
    r = TestClient(app).post("/admin/login", json={"username": "ag1", "password": "pw"})
    assert r.status_code == 403 and r.json() == {"ok": False, "error": msg}
    # 密码错误仍是笼统的 401，不暴露资格状态
    r = TestClient(app).post("/admin/login", json={"username": "ag1", "password": "bad"})
    assert r.status_code == 401 and r.json() == {"ok": False}

def test_existing_agent_session_rejected_after_pause():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag1")
    tc = login_client(app, "ag1")
    assert tc.get("/admin/me").status_code == 200
    set_agent_status_raw(conn, aid, "paused")
    assert tc.get("/admin/me").status_code == 401
    set_agent_status_raw(conn, aid, "active")           # 恢复后未过期会话重新可用
    assert tc.get("/admin/me").status_code == 200

def test_key_actor_type_admin_and_agent_cookie_falls_back_to_key():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag1")
    tc = login_client(app, "ag1")
    set_agent_status_raw(conn, aid, "paused")
    # 失效的代理 cookie + 正确运维密钥：按运维密钥（最高权限者）放行
    assert tc.get("/admin/users", headers=H).status_code == 200
