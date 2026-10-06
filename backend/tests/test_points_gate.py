import time
import httpx
from fastapi.testclient import TestClient
from app import db, db_points
from app.config import Settings
from app.dayys_session import DataYsSession
from app.main import create_app
from tests.agent_helpers import build_app, key_client, login_client, mk_agent_raw
from tests.points_helpers import set_agent_points_raw, set_points_raw

EMPTY = {"code": 10025, "msg": "无积分，无权操作，请充值积分后自动恢复使用！"}

def build():
    """返回 (conn, TestClient, calls)：calls["n"] 记录触达上游（data-ys）的次数。"""
    conn = db.connect(":memory:"); db.init_db(conn)
    calls = {"n": 0}
    def upstream(req):
        calls["n"] += 1
        return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {"vip": 1}}})
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(upstream))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app), calls

def login(tc, pw="pw"):
    return tc.post("/api/auth/login", json={"username": "USER01", "password": pw}).json()

# ---------------- 登录 ----------------

def test_login_with_zero_points_returns_10025_without_session_or_upstream():
    conn, tc, calls = build()
    db.create_user(conn, "USER01", "pw", None)
    assert login(tc) == EMPTY
    assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    assert calls["n"] == 0

def test_login_success_returns_balance():
    conn, tc, _ = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 3)
    body = login(tc)
    assert body["code"] == 0 and body["data"]["points"] == 3 and body["data"]["userInfo"] == {"vip": 1}

def test_login_priority_ban_pause_expiry_onboarding_before_points():
    conn, tc, _ = build()
    u = db.create_user(conn, "USER01", "pw", None)                 # 余额 0
    db.update_user(conn, "USER01", status="banned")
    assert login(tc)["code"] == 10024
    db.update_user(conn, "USER01", status="disabled")
    assert login(tc)["code"] == 10022
    db.update_user(conn, "USER01", status="active", expires_at=int(time.time()) - 10)
    assert login(tc)["code"] == 10022
    db.update_user(conn, "USER01", expires_at=None)
    conn.execute("UPDATE users SET onboarded_at=NULL WHERE id=?", (u.id,)); conn.commit()
    assert login(tc)["code"] == 10030                              # 未完成首登优先于无积分
    conn.execute("UPDATE users SET onboarded_at=1 WHERE id=?", (u.id,)); conn.commit()
    assert login(tc) == EMPTY

def test_pending_account_still_10023_even_if_precharged():
    conn, tc, _ = build()
    db.create_user(conn, "USER01", "x", None, pending=True)
    set_points_raw(conn, "USER01", 5)
    assert login(tc, "123456")["code"] == 10023

# ---------------- 业务请求（gate） ----------------

def test_gate_rejects_zero_balance_with_10025_and_recovers_after_recharge():
    conn, tc, calls = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 1)
    tok = login(tc)["data"]["token"]
    n = calls["n"]
    set_points_raw(conn, "USER01", 0)                               # 使用中扣到 0
    assert tc.get("/api/user/info", headers={"token": tok}).json() == EMPTY
    assert tc.get("/api/ds/sources?cat=hash", headers={"token": tok}).json() == EMPTY
    assert calls["n"] == n                                          # 不触达上游
    db_points.staff_adjust(conn, "user", "USER01", "grant", 5, None, actor_type="admin", actor="root",
                           now=int(time.time()))
    assert tc.get("/api/user/info", headers={"token": tok}).json()["code"] == 0   # 会话未删，充值即恢复

def test_gate_priority_ban_and_pause_before_points():
    conn, tc, _ = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 1)
    tok = login(tc)["data"]["token"]
    set_points_raw(conn, "USER01", 0)
    db.update_user(conn, "USER01", status="banned")
    assert tc.get("/api/user/info", headers={"token": tok}).json()["code"] == 10024
    db.update_user(conn, "USER01", status="disabled")
    assert tc.get("/api/user/info", headers={"token": tok}).json()["code"] == 10022

# ---------------- 管理后台：余额列、编号状态、/me ----------------

def test_users_list_shows_points_and_arrears():
    conn, app = build_app()
    db.create_user(conn, "A1", "pw", None)
    db.create_user(conn, "A2", "pw", None)
    set_points_raw(conn, "A2", 4)
    db.create_user(conn, "P1", "pw", None, pending=True)
    set_points_raw(conn, "P1", 2)
    us = {u["code"]: u for u in key_client(app).get("/admin/users").json()["users"]}
    assert (us["A1"]["points"], us["A1"]["number_status"]) == (0, "arrears")
    assert (us["A2"]["points"], us["A2"]["number_status"]) == (4, "activated")
    assert (us["P1"]["points"], us["P1"]["number_status"]) == (2, "unassigned")

def test_agents_list_and_me_show_agent_balance():
    conn, app = build_app()
    a = mk_agent_raw(conn, "A"); b = mk_agent_raw(conn, "B", tier="junior", parent=a)
    set_agent_points_raw(conn, a, 30); set_agent_points_raw(conn, b, 5)
    staff_rows = {x["name"]: x for x in key_client(app).get("/admin/agents").json()["agents"]}
    assert (staff_rows["A"]["points"], staff_rows["B"]["points"]) == (30, 5)
    ag = login_client(app, "A")
    assert ag.get("/admin/me").json()["agent"]["points"] == 30
    assert [x["points"] for x in ag.get("/admin/agents").json()["agents"]] == [5]
