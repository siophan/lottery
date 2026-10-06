import time, httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

def build(handler, dayys_token_seq=("DYTOK",)):
    conn = db.connect(":memory:"); db.init_db(conn)
    seq = list(dayys_token_seq); state = {"i": 0}
    def login_handler(req):
        # data-ys 登录：按序列发 token
        i = min(state["i"], len(seq) - 1); state["i"] += 1
        return httpx.Response(200, json={"code": 0, "data": {"token": seq[i], "userInfo": {}}})
    def router(req):
        if req.url.path.endswith("/auth/login"):
            return login_handler(req)
        return handler(req)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(router))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app)

def _session_for(conn, code="U1", expires_at=None):
    u = db.create_user(conn, code, "pw", expires_at)
    return db.create_session(conn, u.id, 3600)

def test_proxy_swaps_our_token_for_dayys_token():
    seen = {}
    def handler(req):
        seen["token"] = req.headers.get("token")
        return httpx.Response(200, json={"code": 0, "data": "ok"})
    conn, tc = build(handler)
    tok = _session_for(conn)
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.status_code == 200
    assert seen["token"] == "DYTOK"      # 上游收到的是 data-ys token
    assert seen["token"] != tok          # 不是客户端的我方 token

def test_proxy_rejects_missing_or_bad_token():
    conn, tc = build(lambda req: httpx.Response(200, json={"code": 0}))
    r = tc.post("/api/lotteryNumber/topRows", json={})
    assert r.json()["code"] == 10020
    r2 = tc.post("/api/lotteryNumber/topRows", headers={"token": "garbage"}, json={})
    assert r2.json()["code"] == 10020

def test_proxy_rejects_expired_user():
    conn, tc = build(lambda req: httpx.Response(200, json={"code": 0}))
    tok = _session_for(conn, expires_at=int(time.time()) - 10)
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.json()["code"] == 10022

def test_version_passes_through_without_auth():
    def handler(req):
        assert req.url.path.endswith("/version")
        return httpx.Response(200, json={"code": 0, "data": {"v": "1"}})
    conn, tc = build(handler)
    r = tc.get("/api/version")               # 无 token 也放行
    assert r.status_code == 200 and r.json()["data"]["v"] == "1"

def test_relogin_and_retry_once_on_invalid_code():
    calls = {"n": 0}
    tokens = []
    def handler(req):   # 业务接口：第一次报 10020，重登后第二次成功
        calls["n"] += 1
        tokens.append(req.headers.get("token"))
        if calls["n"] == 1:
            return httpx.Response(200, json={"code": 10020, "msg": "未登录"})
        return httpx.Response(200, json={"code": 0, "data": "ok"})
    conn, tc = build(handler, dayys_token_seq=("DYTOK1", "DYTOK2"))
    tok = _session_for(conn)
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.json()["code"] == 0        # 重试后成功，客户端无感
    assert calls["n"] == 2              # 业务接口被打了两次
    assert tokens == ["DYTOK1", "DYTOK2"]   # 第二次用的是 invalidate()+重登后的新 token

def test_retry_happens_at_most_once():
    calls = {"n": 0}
    def handler(req):   # 业务接口永远报 10020
        calls["n"] += 1
        return httpx.Response(200, json={"code": 10020, "msg": "未登录"})
    conn, tc = build(handler, dayys_token_seq=("DYTOK1", "DYTOK2", "DYTOK3"))
    tok = _session_for(conn)
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert calls["n"] == 2              # 恰好重试一次，不是 3+
    assert r.json()["code"] == 10020    # 把第二次的 10020 原样返回给客户端

def test_client_fromid_replaced_not_duplicated():
    seen = {}
    def handler(req):
        seen["fromid"] = req.headers.get_list("fromId")
        return httpx.Response(200, json={"code": 0})
    conn, tc = build(handler)
    tok = _session_for(conn)
    tc.post("/api/lotteryNumber/topRows",
            headers={"token": tok, "fromId": "CLIENT"}, json={})
    assert seen["fromid"] == [Settings(session_ttl=3600).from_id]   # 只有一个，且是我方配置值

# ---------------- 账号生命周期：旧会话不能绕过 ----------------

def test_proxy_rejects_session_of_banned_user_10024():
    conn, tc = build(lambda req: httpx.Response(200, json={"code": 0, "data": "ok"}))
    tok = _session_for(conn)
    db.update_user(conn, "U1", status="banned")
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.json() == {"code": 10024, "msg": "账号已封禁，无法登录"}

def test_proxy_rejects_session_of_disabled_user():
    conn, tc = build(lambda req: httpx.Response(200, json={"code": 0, "data": "ok"}))
    tok = _session_for(conn)
    db.update_user(conn, "U1", status="disabled")
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.json()["code"] == 10022

def test_proxy_rejects_session_of_not_onboarded_user():
    conn, tc = build(lambda req: httpx.Response(200, json={"code": 0, "data": "ok"}))
    tok = _session_for(conn)
    conn.execute("UPDATE users SET onboarded_at=NULL WHERE code='U1'"); conn.commit()
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.json()["code"] == 10022

def test_proxy_rejects_session_of_pending_user():
    conn, tc = build(lambda req: httpx.Response(200, json={"code": 0, "data": "ok"}))
    tok = _session_for(conn)
    conn.execute("UPDATE users SET first_activated_at=NULL WHERE code='U1'"); conn.commit()
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.json()["code"] == 10022

def test_proxy_session_of_deleted_user_rejected():
    conn, tc = build(lambda req: httpx.Response(200, json={"code": 0, "data": "ok"}))
    tok = _session_for(conn)
    conn.execute("DELETE FROM users WHERE code='U1'"); conn.commit()
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.json()["code"] == 10022

def test_onboard_ticket_is_not_a_session_token_10020():
    # 首登票据只能用于改密/发短信：当作 token 访问代理与多数据源接口一律 10020，不触达上游
    seen = []
    def handler(req):
        seen.append(req)
        return httpx.Response(200, json={"code": 0, "data": "ok"})
    conn, tc = build(handler)
    u = db.create_user(conn, "U1", "123456", None)
    conn.execute("UPDATE users SET onboarded_at=NULL WHERE id=?", (u.id,)); conn.commit()
    ticket = db.create_onboard_ticket(conn, u.id, 900)
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": ticket}, json={})
    assert r.json()["code"] == 10020
    r = tc.get("/api/ds/sources?cat=hash", headers={"token": ticket})
    assert r.json()["code"] == 10020
    assert seen == []
