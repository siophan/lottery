import asyncio
import httpx
import pytest
from fastapi.testclient import TestClient
from app import db, db_points, points_worker
from app.config import Settings
from app.dayys_session import DataYsSession
from app.main import create_app
from tests.agent_helpers import audit, build_app, key_client, login_client, mk_agent_raw
from tests.points_helpers import DAY, NOW, activated_user, ledger, points_of, set_points_raw

run = points_worker.run_charge_cycle

def user(conn, code):
    return db.get_user_by_code(conn, code)

def enable_trial(conn, points=7):
    db_points.set_trial_settings(conn, True, points, actor_type="admin", actor="root", now=NOW)

# ---------------- 首次激活：计费起点与体验赠送 ----------------

def test_activation_sets_charge_anchor_without_trial_by_default():
    conn, _ = build_app()
    db.create_user(conn, "P1", "pw", None, pending=True)
    assert db.activate_user(conn, "P1", NOW) == "ok"
    u = user(conn, "P1")
    assert (u.points, u.charge_anchor_at, u.next_charge_at, u.trial_granted_at) == (0, NOW, NOW + DAY, None)
    assert ledger(conn) == [] and audit(conn, "points.trial") == []

def test_activation_grants_trial_once_when_enabled():
    conn, _ = build_app()
    enable_trial(conn, 9)
    db.create_user(conn, "P1", "pw", None, pending=True)
    assert db.activate_user(conn, "P1", NOW) == "ok"
    u = user(conn, "P1")
    assert (u.points, u.trial_granted_at) == (9, NOW)
    [row] = ledger(conn)
    assert (row["kind"], row["delta"], row["actor_type"], row["actor"]) == ("trial", 9, "system", "system")
    [e] = audit(conn, "points.trial")
    assert (e["target"], e["detail"]) == ("P1", {"amount": 9})
    assert audit(conn, "points.resumed") == []                     # 体验赠送不算「恢复」
    assert db.activate_user(conn, "P1", NOW + 1) == "already"
    assert user(conn, "P1").points == 9

def test_trial_adds_to_precharged_balance_and_never_repeats():
    conn, _ = build_app()
    enable_trial(conn, 7)
    db.create_user(conn, "P1", "pw", None, pending=True)
    set_points_raw(conn, "P1", 5)                                   # 激活前预充
    conn.execute("UPDATE users SET trial_granted_at=1 WHERE code='P1'"); conn.commit()   # 已送过
    db.activate_user(conn, "P1", NOW)
    assert user(conn, "P1").points == 5
    db.create_user(conn, "P2", "pw", None, pending=True)
    set_points_raw(conn, "P2", 5)
    db.activate_user(conn, "P2", NOW)
    assert user(conn, "P2").points == 12

def test_trial_disabled_later_does_not_backfill():
    conn, _ = build_app()
    db.create_user(conn, "P1", "pw", None, pending=True)
    db.activate_user(conn, "P1", NOW)                               # 关闭时激活
    enable_trial(conn)                                              # 之后开启：不补发
    assert user(conn, "P1").points == 0 and run(conn, NOW + 10)["stopped"] == 1

def test_failed_activation_rolls_back_trial():
    conn, _ = build_app()
    enable_trial(conn)
    a = mk_agent_raw(conn, "A")
    db.create_user(conn, "P1", "pw", None, pending=True)
    conn.execute("UPDATE users SET agent_id=? WHERE code='P1'", (a,)); conn.commit()
    assert db.activate_user(conn, "P1", NOW, by_agent_id=a + 1) == "not_found"
    assert user(conn, "P1").points == 0 and ledger(conn) == []

# ---------------- 扣减 Worker ----------------

def test_charges_one_point_every_24h_from_activation():
    conn, _ = build_app()
    enable_trial(conn, 3)
    db.create_user(conn, "P1", "pw", None, pending=True)
    db.activate_user(conn, "P1", NOW)
    assert run(conn, NOW + DAY - 1)["charged"] == 0
    assert run(conn, NOW + DAY)["charged"] == 1
    assert run(conn, NOW + DAY + 60)["charged"] == 0                # 同一周期不重复扣
    u = user(conn, "P1")
    assert (u.points, u.next_charge_at) == (2, NOW + 2 * DAY)
    row = ledger(conn, kind="charge")[0]
    assert (row["delta"], row["cycle_key"], row["balance_after"], row["actor_type"]) == (-1, NOW + DAY, 2, "system")

def test_late_but_under_24h_still_charges_on_schedule():
    conn, _ = build_app()
    enable_trial(conn, 3)
    db.create_user(conn, "P1", "pw", None, pending=True)
    db.activate_user(conn, "P1", NOW)
    assert run(conn, NOW + 2 * DAY - 1)["charged"] == 1             # 逾期 24h-1 秒
    assert user(conn, "P1").next_charge_at == NOW + 2 * DAY          # 周期不漂移

def test_overdue_24h_or_more_resets_without_charging():
    conn, _ = build_app()
    enable_trial(conn, 3)
    db.create_user(conn, "P1", "pw", None, pending=True)
    db.activate_user(conn, "P1", NOW)
    res = run(conn, NOW + 2 * DAY)                                  # 逾期正好 24h（Worker 停机）
    assert (res["reset"], res["charged"]) == (1, 0)
    u = user(conn, "P1")
    assert (u.points, u.charge_anchor_at, u.next_charge_at) == (3, NOW + 2 * DAY, NOW + 3 * DAY)

def test_charge_to_zero_suspends_then_stops():
    conn, _ = build_app()
    enable_trial(conn, 1)
    db.create_user(conn, "P1", "pw", None, pending=True)
    db.activate_user(conn, "P1", NOW)
    assert run(conn, NOW + DAY)["suspended"] == 1
    [e] = audit(conn, "points.suspended")
    assert (e["actor_type"], e["target"]) == ("system", "P1")
    assert run(conn, NOW + DAY + 60)["stopped"] == 1
    assert user(conn, "P1").next_charge_at is None
    assert run(conn, NOW + 5 * DAY) == {"stopped": 0, "started": 0, "reset": 0, "charged": 0, "suspended": 0}
    assert points_of(conn, "P1") == 0                               # 不累计、不追扣

def test_recharge_resumes_billing_from_the_next_round():
    conn, _ = build_app()
    activated_user(conn, "U1")                                      # 存量：余额 0、不计费
    assert run(conn, NOW)["started"] == 0
    db_points.staff_adjust(conn, "user", "U1", "grant", 2, None, actor_type="admin", actor="root", now=NOW + 5)
    assert [e["target"] for e in audit(conn, "points.resumed")] == ["U1"]
    assert run(conn, NOW + 10)["started"] == 1
    u = user(conn, "U1")
    assert (u.charge_anchor_at, u.next_charge_at) == (NOW + 10, NOW + 10 + DAY)
    run(conn, NOW + 10 + DAY)
    assert points_of(conn, "U1") == 1

@pytest.mark.parametrize("change", [
    "UPDATE users SET status='disabled' WHERE code='U1'",
    "UPDATE users SET status='banned' WHERE code='U1'",
    f"UPDATE users SET expires_at={NOW + 100} WHERE code='U1'",
])
def test_paused_banned_or_expired_accounts_stop_and_resume_from_scratch(change):
    conn, _ = build_app()
    activated_user(conn, "U1", 5)
    run(conn, NOW)                                                  # started
    conn.execute(change); conn.commit()
    assert run(conn, NOW + 101)["stopped"] == 1
    assert run(conn, NOW + 3 * DAY)["charged"] == 0                 # 停扣期间不累计
    conn.execute("UPDATE users SET status='active', expires_at=NULL WHERE code='U1'"); conn.commit()
    assert run(conn, NOW + 3 * DAY + 5)["started"] == 1
    assert user(conn, "U1").next_charge_at == NOW + 4 * DAY + 5 and points_of(conn, "U1") == 5

def test_pending_accounts_are_never_charged():
    conn, _ = build_app()
    db.create_user(conn, "P1", "pw", None, pending=True)
    set_points_raw(conn, "P1", 5)
    assert run(conn, NOW)["started"] == 0 and points_of(conn, "P1") == 5

def test_existing_charge_row_for_cycle_only_advances():
    conn, _ = build_app()
    activated_user(conn, "U1", 5)
    conn.execute("UPDATE users SET charge_anchor_at=?, next_charge_at=? WHERE code='U1'", (NOW - DAY, NOW))
    conn.execute("INSERT INTO points_ledger(holder_type,holder_id,delta,balance_before,balance_after,kind,"
                 "actor_type,actor,cycle_key,created_at) VALUES('user','U1',-1,6,5,'charge','system','system',?,?)",
                 (NOW, NOW))
    conn.commit()
    res = run(conn, NOW + 1)
    assert res["charged"] == 0 and points_of(conn, "U1") == 5
    assert user(conn, "U1").next_charge_at == NOW + DAY

def test_many_accounts_one_round():
    conn, _ = build_app()
    for i in range(50):
        activated_user(conn, f"U{i}", 2)
    run(conn, NOW)
    assert run(conn, NOW + DAY)["charged"] == 50
    assert conn.execute("SELECT SUM(points) FROM users").fetchone()[0] == 50

# ---------------- 循环与生命周期 ----------------

def test_charge_loop_uses_injected_clock_and_survives_errors(monkeypatch):
    calls, sleeps = [], []
    def flaky(conn, now):
        calls.append(now)
        if len(calls) == 1:
            raise RuntimeError("boom")
        return {}
    monkeypatch.setattr(points_worker, "run_charge_cycle", flaky)
    ticks = iter([100, 160, 220])
    async def fake_sleep(sec):
        sleeps.append(sec)
        if len(sleeps) == 3:
            raise asyncio.CancelledError
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(points_worker.charge_loop(None, clock=lambda: next(ticks), sleep=fake_sleep))
    assert calls == [100, 160, 220] and sleeps == [60, 60, 60]

def test_lifespan_starts_and_stops_charge_task():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": 0})))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004")
    app = create_app(Settings(admin_key="SECRET", admin_cookie_secure=False),
                     client=client, conn=conn, dayys=dayys)
    with TestClient(app):
        assert app.state.charge_task is not None and not app.state.charge_task.done()
    assert app.state.charge_task.done()

# ---------------- 体验期设置接口 ----------------

def test_trial_settings_routes_staff_only():
    conn, app = build_app()
    tc = key_client(app)
    assert tc.get("/admin/settings/trial").json() == {
        "trial_enabled": False, "trial_points": 7, "first_charge_delay_hours": 24, "charge_period_hours": 24}
    r = tc.put("/admin/settings/trial", json={"trial_enabled": True, "trial_points": 5})
    assert r.json() == {"ok": True, "trial_enabled": True, "trial_points": 5,
                        "first_charge_delay_hours": 24, "charge_period_hours": 24}
    r = tc.put("/admin/settings/trial", json={"trial_enabled": True, "trial_points": 0})
    assert (r.status_code, r.json()) == (400, {"ok": False, "error": "体验赠送分数需为 1–100 的整数"})
    [e] = audit(conn, "settings.trial")
    assert (e["actor_type"], e["actor"]) == ("admin", "admin-key")
    mk_agent_raw(conn, "A")
    ag = login_client(app, "A")
    assert ag.get("/admin/settings/trial").status_code == 403
    assert ag.put("/admin/settings/trial", json={"trial_enabled": False, "trial_points": 7}).status_code == 403

def test_activate_route_grants_trial():
    conn, app = build_app()
    enable_trial(conn, 4)
    db.create_user(conn, "P1", "pw", None, pending=True)
    assert key_client(app).post("/admin/users/P1/activate").json() == {"ok": True}
    assert points_of(conn, "P1") == 4
