# 需求回复第 12 条：代理自身账号同样按天扣分（与账号统一的扣分机制）。
# 资格激活、未回收、余额 > 0 的代理每满 24 小时扣 1 分；Worker 停机错过周期按重新起算、不追扣；
# 暂停 / 取消 / 回收或余额为 0 期间停扣，恢复后从恢复后的第一轮重新起算 24 小时。
import pytest
from app import db, db_agents, db_points, points_worker
from tests.agent_helpers import build_app, mk_agent_raw, set_agent_status_raw
from tests.points_helpers import DAY, NOW, activated_user, agent_points, ledger, set_agent_points_raw

run = points_worker.run_charge_cycle

def charge_cols(conn, agent_id):
    r = conn.execute("SELECT charge_anchor_at, next_charge_at FROM agents WHERE id=?", (agent_id,)).fetchone()
    return r["charge_anchor_at"], r["next_charge_at"]

def agent_with(conn, name, points, **kw):
    a = mk_agent_raw(conn, name, **kw)
    if points:
        set_agent_points_raw(conn, a, points)
    return a

def test_migration_adds_charge_columns_to_agents():
    conn, _ = build_app()
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(agents)")}
    assert {"charge_anchor_at", "next_charge_at"} <= cols
    db.init_db(conn)                                                # 再跑一次不报错
    assert db_agents.get_agent(conn, agent_with(conn, "A", 0)).points == 0

def test_active_agent_with_points_is_charged_one_point_every_24h():
    conn, _ = build_app()
    a = agent_with(conn, "A", 3)
    res = run(conn, NOW)
    assert (res["started"], res["charged"]) == (1, 0)               # 第一轮只起算，不扣
    assert charge_cols(conn, a) == (NOW, NOW + DAY)
    assert run(conn, NOW + DAY - 1)["charged"] == 0
    assert run(conn, NOW + DAY)["charged"] == 1
    assert run(conn, NOW + DAY + 60)["charged"] == 0                # 同一周期不重复扣
    assert agent_points(conn, a) == 2 and charge_cols(conn, a) == (NOW, NOW + 2 * DAY)
    [row] = ledger(conn, kind="charge")
    assert (row["holder_type"], row["holder_id"], row["delta"], row["balance_after"], row["cycle_key"],
            row["actor_type"], row["actor"]) == ("agent", str(a), -1, 2, NOW + DAY, "system", "system")

def test_late_but_under_24h_still_charges_on_schedule():
    conn, _ = build_app()
    a = agent_with(conn, "A", 3)
    run(conn, NOW)
    assert run(conn, NOW + 2 * DAY - 1)["charged"] == 1
    assert charge_cols(conn, a)[1] == NOW + 2 * DAY                 # 周期不漂移

def test_worker_down_24h_or_more_restarts_cycle_without_charging():
    conn, _ = build_app()
    a = agent_with(conn, "A", 3)
    run(conn, NOW)
    res = run(conn, NOW + 2 * DAY)                                  # 逾期正好 24h（Worker 停机）
    assert (res["reset"], res["charged"]) == (1, 0)
    assert agent_points(conn, a) == 3 and charge_cols(conn, a) == (NOW + 2 * DAY, NOW + 3 * DAY)

def test_charge_to_zero_stops_in_the_same_round_and_never_accumulates():
    conn, _ = build_app()
    a = agent_with(conn, "A", 1)
    run(conn, NOW)
    assert run(conn, NOW + DAY)["suspended"] == 1
    assert agent_points(conn, a) == 0 and charge_cols(conn, a) == (NOW, None)
    assert run(conn, NOW + 5 * DAY) == {"stopped": 0, "started": 0, "reset": 0, "charged": 0, "suspended": 0}

def test_zero_balance_agents_never_start_until_points_arrive():
    conn, _ = build_app()
    a = agent_with(conn, "A", 0)
    assert run(conn, NOW)["started"] == 0
    db_points.staff_adjust(conn, "agent", a, "grant", 2, None, actor_type="admin", actor="root", now=NOW + 5)
    assert run(conn, NOW + 10)["started"] == 1
    assert charge_cols(conn, a) == (NOW + 10, NOW + 10 + DAY)
    run(conn, NOW + 10 + DAY)
    assert agent_points(conn, a) == 1

@pytest.mark.parametrize("status", ["paused", "cancelled"])
def test_paused_or_cancelled_agents_stop_and_restart_from_scratch(status):
    conn, _ = build_app()
    a = agent_with(conn, "A", 5)
    run(conn, NOW)
    set_agent_status_raw(conn, a, status)
    assert run(conn, NOW + 100)["stopped"] == 1
    assert run(conn, NOW + 3 * DAY)["charged"] == 0                 # 停扣期间不累计
    set_agent_status_raw(conn, a, "active")
    assert run(conn, NOW + 3 * DAY + 5)["started"] == 1
    assert charge_cols(conn, a)[1] == NOW + 4 * DAY + 5 and agent_points(conn, a) == 5

def test_recycled_agents_are_not_charged():
    conn, _ = build_app()
    a = agent_with(conn, "A", 5)
    conn.execute("UPDATE agents SET recycled_at=1 WHERE id=?", (a,)); conn.commit()
    assert run(conn, NOW)["started"] == 0

def test_status_change_stops_billing_immediately_so_quick_resume_restarts_cycle():
    conn, _ = build_app()
    a = agent_with(conn, "A", 5)
    run(conn, NOW)                                                  # 下次 NOW+DAY
    db_agents.set_agent_status(conn, a, "paused", "核查", actor_type="admin", actor="root", now=NOW + 100)
    assert charge_cols(conn, a) == (NOW, None)                      # 事务内即停扣，保留 anchor
    db_agents.set_agent_status(conn, a, "active", "恢复", actor_type="admin", actor="root", now=NOW + 200)
    assert run(conn, NOW + 300)["started"] == 1
    assert run(conn, NOW + DAY + 10)["charged"] == 0                # 旧周期不再生效
    assert agent_points(conn, a) == 5

def test_spending_down_to_zero_stops_billing_in_the_same_transaction():
    conn, _ = build_app()
    a = agent_with(conn, "A", 2)
    activated_user(conn, "U1")
    conn.execute("UPDATE users SET agent_id=? WHERE code='U1'", (a,)); conn.commit()
    run(conn, NOW)
    db_points.recharge_user(conn, a, "U1", 2, actor="A", now=NOW + 100)
    assert agent_points(conn, a) == 0 and charge_cols(conn, a) == (NOW, None)
    db_points.staff_adjust(conn, "agent", a, "grant", 3, None, actor_type="admin", actor="root", now=NOW + 200)
    assert charge_cols(conn, a)[1] is None                          # 恢复后等 Worker 重新起算
    run(conn, NOW + 300)
    assert charge_cols(conn, a) == (NOW + 300, NOW + 300 + DAY)
    run(conn, NOW + DAY + 10)                                       # 旧周期不再生效
    assert agent_points(conn, a) == 3

@pytest.mark.parametrize("how", ["revoke", "transfer", "batch"])
def test_every_way_of_reaching_zero_stops_billing(how):
    conn, _ = build_app()
    a = agent_with(conn, "A", 2)
    child = mk_agent_raw(conn, "B", tier="junior", parent=a)
    activated_user(conn, "U1")
    conn.execute("UPDATE users SET agent_id=? WHERE code='U1'", (a,)); conn.commit()
    run(conn, NOW)
    if how == "revoke":
        db_points.staff_adjust(conn, "agent", a, "revoke", 2, "扣回", actor_type="admin", actor="root", now=NOW + 1)
    elif how == "transfer":
        db_points.transfer_to_agent(conn, a, child, 2, actor="A", now=NOW + 1)
    else:
        db_points.batch_recharge(conn, ["U1"], 2, None, actor_type="agent", actor="A", agent_id=a, now=NOW + 1)
    assert charge_cols(conn, a)[1] is None

def test_existing_charge_row_for_the_cycle_only_advances():
    conn, _ = build_app()
    a = agent_with(conn, "A", 5)
    conn.execute("UPDATE agents SET charge_anchor_at=?, next_charge_at=? WHERE id=?", (NOW - DAY, NOW, a))
    conn.execute("INSERT INTO points_ledger(holder_type,holder_id,delta,balance_before,balance_after,kind,"
                 "actor_type,actor,cycle_key,created_at) VALUES('agent',?,-1,6,5,'charge','system','system',?,?)",
                 (str(a), NOW, NOW))
    conn.commit()
    assert run(conn, NOW + 1)["charged"] == 0 and agent_points(conn, a) == 5
    assert charge_cols(conn, a)[1] == NOW + DAY

def test_users_and_agents_are_charged_in_the_same_round():
    conn, _ = build_app()
    a = agent_with(conn, "A", 2)
    activated_user(conn, "U1", 2)
    assert run(conn, NOW)["started"] == 2
    assert run(conn, NOW + DAY)["charged"] == 2
    assert agent_points(conn, a) == 1
    assert conn.execute("SELECT points FROM users WHERE code='U1'").fetchone()["points"] == 1

def test_charge_dedupe_index_is_per_holder_type():
    # 账号编号与代理 id 都是字符串：防重复记账的唯一索引要带上 holder_type，避免二者同名时互相挡住
    conn, _ = build_app()
    idx = {r["name"]: r["sql"] for r in conn.execute("SELECT name, sql FROM sqlite_master WHERE type='index'")}
    assert "idx_ledger_charge_cycle" not in idx
    assert "holder_type, holder_id, cycle_key" in idx["idx_ledger_charge_cycle_holder"]
    for t in ("user", "agent"):
        conn.execute("INSERT INTO points_ledger(holder_type,holder_id,delta,balance_before,balance_after,kind,"
                     "actor_type,actor,cycle_key,created_at) VALUES(?,'7',-1,1,0,'charge','system','system',?,?)",
                     (t, NOW, NOW))
    conn.commit()

# ---------------- 余额为 0 自动暂停（与资格暂停一样不能登录后台；充值后自动恢复） ----------------
from fastapi.testclient import TestClient
from app import admin_auth
from tests.agent_helpers import audit, key_client, login_client

ZERO_MSG = admin_auth.AGENT_NO_POINTS_MSG

def test_zero_balance_agent_cannot_login_and_recovers_after_top_up():
    conn, app = build_app()
    a = agent_with(conn, "A", 0)
    r = TestClient(app).post("/admin/login", json={"username": "A", "password": "pw"})
    assert r.status_code == 403 and r.json() == {"ok": False, "error": ZERO_MSG}
    assert "暂停" in ZERO_MSG and "充值" in ZERO_MSG
    r = TestClient(app).post("/admin/login", json={"username": "A", "password": "bad"})
    assert r.status_code == 401 and r.json() == {"ok": False}       # 密码错误不暴露余额状态
    key_client(app).post(f"/admin/agents/{a}/points/grant", json={"amount": 5})
    assert agent_points(conn, a) == 5
    assert login_client(app, "A").get("/admin/me").status_code == 200

def test_existing_session_stops_working_when_balance_reaches_zero():
    conn, app = build_app()
    a = agent_with(conn, "A", 1)
    tc = login_client(app, "A")
    assert tc.get("/admin/me").status_code == 200
    run(conn, NOW)
    run(conn, NOW + DAY)                                            # 扣到 0
    assert tc.get("/admin/me").status_code == 401
    assert tc.get("/admin/users").status_code == 403
    set_agent_points_raw(conn, a, 2)                                # 充值后未过期会话重新可用
    assert tc.get("/admin/me").status_code == 200

def test_agent_spending_its_last_points_is_paused_after_that_request():
    conn, app = build_app()
    a = agent_with(conn, "A", 2)
    activated_user(conn, "U1")
    conn.execute("UPDATE users SET agent_id=? WHERE code='U1'", (a,)); conn.commit()
    tc = login_client(app, "A")
    r = tc.post("/admin/users/U1/points/recharge", json={"amount": 2})
    assert r.status_code == 200 and r.json()["balance"] == 0        # 这次操作本身成功
    assert tc.get("/admin/me").status_code == 401

def test_agent_zero_balance_transitions_are_audited():
    conn, _ = build_app()
    a = agent_with(conn, "A", 1)
    run(conn, NOW)
    run(conn, NOW + DAY)
    [e] = audit(conn, "points.suspended")
    assert (e["actor_type"], e["target"], e["detail"]) == ("system", "A", {"holder_type": "agent"})
    db_points.staff_adjust(conn, "agent", a, "grant", 3, None, actor_type="admin", actor="root", now=NOW + DAY + 5)
    [e] = audit(conn, "points.resumed")
    assert (e["actor"], e["target"], e["detail"]) == ("root", "A", {"holder_type": "agent", "balance": 3})

def test_paused_status_message_wins_over_zero_balance():
    conn, app = build_app()
    agent_with(conn, "A", 0, status="paused")
    r = TestClient(app).post("/admin/login", json={"username": "A", "password": "pw"})
    assert r.json()["error"] == "代理资格已暂停，无法登录"

def test_staff_logins_are_not_affected_by_points():
    conn, app = build_app()
    from tests.agent_helpers import mk_admin
    mk_admin(conn, "boss")
    assert login_client(app, "boss").get("/admin/me").status_code == 200
