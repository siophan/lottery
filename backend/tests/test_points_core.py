import sqlite3
import pytest
from app import db, db_agents, db_points, maintenance
from app.db_agents import BizError, begin_write
from tests.agent_helpers import audit, build_app, mk_agent_raw
from tests.points_helpers import NOW, activated_user, agent_points, ledger, points_of

B_ERA_USERS = """
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
  onboarded_at INTEGER,
  agent_id INTEGER,
  activated_by_agent_id INTEGER,
  agent_chain_json TEXT
)
"""

def _cols(conn, table):
    return {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}

# ---------------- 迁移 ----------------

def test_fresh_db_has_points_schema():
    conn = db.connect(":memory:"); db.init_db(conn)
    assert {"points", "charge_anchor_at", "next_charge_at", "trial_granted_at"} <= _cols(conn, "users")
    assert "points" in _cols(conn, "agents")
    assert {"holder_type", "holder_id", "delta", "balance_before", "balance_after", "kind",
            "counterparty_type", "counterparty_id", "actor_type", "actor", "reason", "batch_id",
            "cycle_key", "created_at"} <= _cols(conn, "points_ledger")
    assert {"key", "value"} <= _cols(conn, "settings")

def test_migration_keeps_existing_accounts_at_zero_without_billing(tmp_path):
    path = str(tmp_path / "b.db")
    conn = sqlite3.connect(path)
    conn.execute(B_ERA_USERS)
    conn.execute("INSERT INTO users(code,password_hash,salt,status,created_at,first_activated_at,"
                 "activated_at,onboarded_at) VALUES('OLD1','h','s','active',1,1,1,1)")
    conn.execute("INSERT INTO users(code,password_hash,salt,status,created_at) VALUES('1000000','h','s','active',2)")
    conn.commit(); conn.close()
    conn = db.connect(path); db.init_db(conn); db.init_db(conn)        # 幂等
    for code, activated in (("OLD1", 1), ("1000000", None)):
        u = db.get_user_by_code(conn, code)
        assert (u.points, u.charge_anchor_at, u.next_charge_at, u.trial_granted_at) == (0, None, None, None)
        assert u.first_activated_at == activated          # 不得被 _migrate_users 式回填
    assert conn.execute("SELECT COUNT(*) FROM points_ledger").fetchone()[0] == 0

def test_balances_can_never_go_negative_at_db_level():
    conn = db.connect(":memory:"); db.init_db(conn)
    db.create_user(conn, "U1", "pw", None)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE users SET points=-1 WHERE code='U1'")
    conn.rollback()
    aid = mk_agent_raw(conn, "ag")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE agents SET points=-1 WHERE id=?", (aid,))
    conn.rollback()

def test_agent_dataclass_and_dict_carry_points():
    conn = db.connect(":memory:"); db.init_db(conn)
    aid = mk_agent_raw(conn, "ag")
    conn.execute("UPDATE agents SET points=12 WHERE id=?", (aid,)); conn.commit()
    assert db_agents.get_agent(conn, aid).points == 12
    assert db_agents.agent_to_dict(db_agents.get_agent(conn, aid))["points"] == 12

# ---------------- 余额与流水原语 ----------------

def _apply(conn, *a, **k):
    begin_write(conn)
    try:
        res = db_points.apply_delta_nocommit(conn, *a, **k)
        conn.commit()
        return res
    except Exception:
        conn.rollback()
        raise

def test_apply_delta_updates_balance_and_writes_one_ledger_row():
    conn, _ = build_app()
    activated_user(conn, "u1")
    assert _apply(conn, "user", "u1", 5, "grant", actor_type="admin", actor="root", now=NOW,
                  reason="首充") == (0, 5)
    assert points_of(conn, "U1") == 5
    [row] = ledger(conn)
    assert {k: row[k] for k in ("holder_type", "holder_id", "delta", "balance_before", "balance_after",
                                "kind", "actor_type", "actor", "reason", "created_at")} == {
        "holder_type": "user", "holder_id": "U1", "delta": 5, "balance_before": 0, "balance_after": 5,
        "kind": "grant", "actor_type": "admin", "actor": "root", "reason": "首充", "created_at": NOW}

def test_apply_delta_for_agent_uses_agent_id_string():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag")
    _apply(conn, "agent", str(aid), 3, "grant", actor_type="admin", actor="root", now=NOW,
           counterparty_type="user", counterparty_id="U9")
    assert agent_points(conn, aid) == 3
    row = ledger(conn)[0]
    assert (row["holder_id"], row["counterparty_type"], row["counterparty_id"]) == (str(aid), "user", "U9")

def test_apply_delta_rejects_overdraft_and_writes_nothing():
    conn, _ = build_app()
    activated_user(conn, "U1", 2)
    with pytest.raises(BizError) as ei:
        _apply(conn, "user", "U1", -3, "revoke", actor_type="admin", actor="root", now=NOW)
    assert (ei.value.status, ei.value.msg) == (409, "积分余额不足")
    assert points_of(conn, "U1") == 2 and ledger(conn) == []

def test_apply_delta_missing_holder_is_404():
    conn, _ = build_app()
    with pytest.raises(BizError) as ei:
        _apply(conn, "user", "NOPE", 1, "grant", actor_type="admin", actor="root", now=NOW)
    assert (ei.value.status, ei.value.msg) == (404, "账号不存在")
    with pytest.raises(BizError) as ei:
        _apply(conn, "agent", str(2 ** 63), 1, "grant", actor_type="admin", actor="root", now=NOW)
    assert (ei.value.status, ei.value.msg) == (404, "代理不存在")

def test_charge_cycle_key_is_unique_per_account():
    conn, _ = build_app()
    activated_user(conn, "U1", 5)
    _apply(conn, "user", "U1", -1, "charge", actor_type="system", actor="system", now=NOW, cycle_key=NOW)
    with pytest.raises(sqlite3.IntegrityError):
        _apply(conn, "user", "U1", -1, "charge", actor_type="system", actor="system", now=NOW, cycle_key=NOW)
    assert points_of(conn, "U1") == 4            # 整个事务回滚，余额不变

def test_transition_audits_only_for_activated_accounts():
    conn, _ = build_app()
    activated_user(conn, "U1")
    db.create_user(conn, "P1", "pw", None, pending=True)
    begin_write(conn)
    db_points.note_user_transition_nocommit(conn, "u1", 0, 3, actor_type="admin", actor="root", now=NOW)
    db_points.note_user_transition_nocommit(conn, "U1", 3, 0, actor_type="system", actor="system", now=NOW)
    db_points.note_user_transition_nocommit(conn, "U1", 3, 2, actor_type="system", actor="system", now=NOW)
    db_points.note_user_transition_nocommit(conn, "P1", 0, 3, actor_type="admin", actor="root", now=NOW)
    conn.commit()
    assert [(e["target"], e["detail"]) for e in audit(conn, "points.resumed")] == [("U1", {"balance": 3})]
    assert [(e["target"], e["actor_type"]) for e in audit(conn, "points.suspended")] == [("U1", "system")]

def test_purge_old_ledger_keeps_three_years():
    conn, _ = build_app()
    activated_user(conn, "U1")
    _apply(conn, "user", "U1", 1, "grant", actor_type="admin", actor="root", now=1)
    _apply(conn, "user", "U1", 1, "grant", actor_type="admin", actor="root", now=NOW)
    assert db_points.purge_old_ledger(conn, NOW) == 1
    assert [r["created_at"] for r in ledger(conn)] == [NOW]
    assert maintenance.run_maintenance(conn, NOW)["points_ledger"] == 0

# ---------------- 体验期设置 ----------------

def test_trial_settings_default_off_7():
    conn, _ = build_app()
    assert db_points.get_trial_settings(conn) == {"trial_enabled": False, "trial_points": 7}

def test_set_trial_settings_persists_and_audits_changes_only():
    conn, _ = build_app()
    assert db_points.set_trial_settings(conn, True, 10, actor_type="admin", actor="root", now=NOW) == {
        "trial_enabled": True, "trial_points": 10}
    assert db_points.get_trial_settings(conn) == {"trial_enabled": True, "trial_points": 10}
    db_points.set_trial_settings(conn, True, 10, actor_type="admin", actor="root", now=NOW)   # 无变化
    [e] = audit(conn, "settings.trial")
    assert e["detail"] == {"from": {"trial_enabled": False, "trial_points": 7},
                           "to": {"trial_enabled": True, "trial_points": 10}}

@pytest.mark.parametrize("enabled,points,msg", [
    ("yes", 7, "体验期开关取值无效"),
    (True, 0, "体验赠送分数需为 1–100 的整数"),
    (True, 101, "体验赠送分数需为 1–100 的整数"),
    (True, True, "体验赠送分数需为 1–100 的整数"),
    (True, "7", "体验赠送分数需为 1–100 的整数"),
])
def test_set_trial_settings_validates(enabled, points, msg):
    conn, _ = build_app()
    with pytest.raises(BizError) as ei:
        db_points.set_trial_settings(conn, enabled, points, actor_type="admin", actor="root", now=NOW)
    assert ei.value.msg == msg
    assert db_points.get_trial_settings(conn) == {"trial_enabled": False, "trial_points": 7}
