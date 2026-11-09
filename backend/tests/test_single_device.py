# 单设备登录：同一账号同一时间只在一台电脑上有效；新设备登录挤掉旧设备，旧设备之后的请求收到 10021。
import time, httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db, gate
from app.dayys_session import DataYsSession
from tests.points_helpers import set_points_raw
from tests.agent_helpers import mk_agent_raw, login_client

PC_A = "deviceaaaaaaaaaaaaaaaaaaaaaaaaaa"
PC_B = "devicebbbbbbbbbbbbbbbbbbbbbbbbbb"
H = {"X-Admin-Key": "SECRET"}


def upstream_ok(req):
    return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {"vip": 1}}})


def build(**settings):
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(upstream_ok))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(admin_key="SECRET", admin_cookie_secure=False, **settings),
                     client=client, conn=conn, dayys=dayys)
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    return conn, app


def pc(app, device=PC_A, name=None):
    headers = {"X-Device-Id": device}
    if name is not None:
        headers["X-Device-Name"] = name
    return TestClient(app, headers=headers)


def login(tc, code="USER01"):
    body = tc.post("/api/auth/login", json={"username": code, "password": "pw"}).json()
    assert body["code"] == 0, body
    return body["data"]["token"]


def beat(tc, tok):
    return tc.post("/api/auth/heartbeat", headers={"token": tok}).json()


def test_second_device_login_kicks_first():
    conn, app = build()
    a, b = pc(app, PC_A), pc(app, PC_B)
    tok_a = login(a)
    assert beat(a, tok_a)["code"] == 0
    tok_b = login(b)                                    # 电脑 B 登录成功
    assert beat(b, tok_b)["code"] == 0
    kicked = beat(a, tok_a)                             # 电脑 A 下一次心跳即被挤下线
    assert kicked == {"code": 10021, "msg": "该账号已在其他设备登录，您已被强制下线，请重新登录"}
    # 被踢的旧设备所有业务请求都被拦截（查看 / 计算 / 保存方案都走这些接口）
    assert a.get("/api/user/profile", headers={"token": tok_a}).json()["code"] == 10021
    assert a.post("/api/lotteryNumber/topRows", headers={"token": tok_a}, json={}).json()["code"] == 10021
    assert a.get("/api/ds/sources", headers={"token": tok_a}).json()["code"] == 10021


def test_kicked_device_can_log_in_again_and_kick_back():
    conn, app = build()
    a, b = pc(app, PC_A), pc(app, PC_B)
    tok_a = login(a)
    tok_b = login(b)
    tok_a2 = login(a)                                   # A 重新登录：挤掉 B
    assert beat(a, tok_a2)["code"] == 0
    assert beat(b, tok_b)["code"] == 10021
    assert beat(a, tok_a)["code"] == 10021


def test_logout_frees_account_for_other_device():
    conn, app = build()
    a, b = pc(app, PC_A), pc(app, PC_B)
    tok_a = login(a)
    assert a.post("/api/auth/logout", headers={"token": tok_a}).json()["code"] == 0
    assert db.get_session(conn, tok_a) is None          # 服务端已清除本设备登录状态
    assert beat(a, tok_a)["code"] == 10020
    tok_b = login(b)
    assert beat(b, tok_b)["code"] == 0


def test_logout_only_by_own_device():
    conn, app = build()
    a, b = pc(app, PC_A), pc(app, PC_B)
    tok_a = login(a)
    assert b.post("/api/auth/logout", headers={"token": tok_a}).json()["code"] == 0   # 无效操作也回成功
    assert db.get_session(conn, tok_a) is not None
    assert pc(app).post("/api/auth/logout").json()["code"] == 0                        # 没带 token


def test_token_from_other_device_rejected():
    conn, app = build()
    tok_a = login(pc(app, PC_A))
    assert beat(pc(app, PC_B), tok_a) == {"code": 10020, "msg": "登录已失效，请重新登录"}
    assert beat(TestClient(app, headers={"X-Device-Id": ""}), tok_a)["code"] == 10020


def test_old_client_without_device_cannot_log_in():
    conn, app = build()
    old = TestClient(app, headers={"X-Device-Id": ""})
    body = old.post("/api/auth/login", json={"username": "USER01", "password": "pw"}).json()
    assert body == {"code": 1, "msg": "当前软件版本过旧，请下载安装最新版本后再登录"}
    bad = TestClient(app, headers={"X-Device-Id": "short"})
    assert bad.post("/api/auth/login", json={"username": "USER01", "password": "pw"}).json()["code"] == 1
    assert conn.execute("SELECT COUNT(*) c FROM sessions").fetchone()["c"] == 0


def test_idle_session_expires_and_is_purged():
    conn, app = build(session_idle_ttl=600)
    a = pc(app)
    tok = login(a)
    conn.execute("UPDATE sessions SET last_seen_at=? WHERE token=?", (int(time.time()) - 601, tok))
    conn.commit()
    assert beat(a, tok) == {"code": 10020, "msg": "登录已超时，请重新登录"}
    assert db.get_session(conn, tok) is None
    # 维护任务按空闲时限清理：崩溃 / 断网后不再心跳的会话
    tok2 = login(a)
    conn.execute("UPDATE sessions SET last_seen_at=? WHERE token=?", (int(time.time()) - 601, tok2))
    conn.commit()
    assert db.purge_expired_sessions(conn, 600) == 1


def test_crashed_device_does_not_block_new_login():
    # 电脑 A 异常退出（不注销、不再心跳）：电脑 B 不用等超时，直接登录
    conn, app = build()
    login(pc(app, PC_A))
    tok_b = login(pc(app, PC_B))
    assert beat(pc(app, PC_B), tok_b)["code"] == 0


def test_heartbeat_refreshes_last_seen_at_most_every_30s():
    conn, app = build()
    a = pc(app)
    tok = login(a)
    old = int(time.time()) - 31
    conn.execute("UPDATE sessions SET last_seen_at=? WHERE token=?", (old, tok)); conn.commit()
    beat(a, tok)
    seen = db.get_session(conn, tok).last_seen_at
    assert seen > old
    conn.execute("UPDATE sessions SET last_seen_at=? WHERE token=?", (seen - 5, tok)); conn.commit()
    beat(a, tok)
    assert db.get_session(conn, tok).last_seen_at == seen - 5      # 30 秒内不重复写库


def test_device_headers_not_forwarded_upstream():
    seen = {}

    def upstream(req):
        seen.update({k.lower(): v for k, v in req.headers.items()})
        return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {}}})

    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(upstream))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(), client=client, conn=conn, dayys=dayys)
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    a = pc(app, PC_A, "WIN-PC%20%E5%89%8D%E5%8F%B0")
    tok = login(a)
    seen.clear()
    a.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={"code": 101, "rows": 1})
    assert seen and "x-device-id" not in seen and "x-device-name" not in seen


def test_admin_list_shows_device_and_online_state():
    conn, app = build()
    admin = TestClient(app, headers=H)
    row = next(u for u in admin.get("/admin/users").json()["users"] if u["code"] == "USER01")
    assert row["online"] is False and row["logged_in"] is False and row["device_id"] is None
    login(pc(app, PC_A, "WIN-PC%20%E5%89%8D%E5%8F%B0"))
    row = next(u for u in admin.get("/admin/users").json()["users"] if u["code"] == "USER01")
    assert row["online"] is True and row["logged_in"] is True
    assert row["device_id"] == PC_A and row["device_name"] == "WIN-PC 前台"
    assert row["login_at"] and row["last_seen_at"] and row["login_ip"]
    login(pc(app, PC_B))                                 # 换设备：只显示当前这台
    row = next(u for u in admin.get("/admin/users").json()["users"] if u["code"] == "USER01")
    assert row["device_id"] == PC_B and row["device_name"] is None
    # 会话还在但很久没心跳（休眠 / 断网）：不算在线
    conn.execute("UPDATE sessions SET last_seen_at=? WHERE device_id=?", (int(time.time()) - gate.ONLINE_WINDOW - 5, PC_B))
    conn.commit()
    row = next(u for u in admin.get("/admin/users").json()["users"] if u["code"] == "USER01")
    assert row["online"] is False and row["logged_in"] is True


def test_admin_kick():
    conn, app = build()
    admin = TestClient(app, headers=H)
    a = pc(app)
    tok = login(a)
    assert admin.post("/admin/users/USER01/kick").json() == {"ok": True}
    assert beat(a, tok) == {"code": 10021, "msg": "您已被后台强制下线，请重新登录"}
    r = admin.post("/admin/users/USER01/kick")
    assert r.status_code == 409 and r.json()["error"] == "该账号当前未登录"
    assert admin.post("/admin/users/NOPE/kick").status_code == 404
    rows, _ = db.list_audit(conn, 50, 0)
    assert [r["action"] for r in rows].count("user.kick") == 1
    tok2 = login(a)                                      # 被强制下线后可以重新登录
    assert beat(a, tok2)["code"] == 0


def test_agent_kicks_only_own_members():
    conn, app = build()
    aid = mk_agent_raw(conn, "代理甲")
    other = mk_agent_raw(conn, "代理乙")
    db.create_user(conn, "USER02", "pw", None)
    set_points_raw(conn, "USER02", 10)
    conn.execute("UPDATE users SET agent_id=? WHERE code='USER01'", (aid,))
    conn.execute("UPDATE users SET agent_id=? WHERE code='USER02'", (other,))
    conn.commit()
    login(pc(app), "USER01"); login(pc(app, PC_B), "USER02")
    agent = login_client(app, "代理甲")
    assert agent.post("/admin/users/USER01/kick").json() == {"ok": True}
    assert agent.post("/admin/users/USER02/kick").status_code == 404


def test_migration_adds_columns_and_clears_legacy_sessions_once():
    conn = db.connect(":memory:")
    conn.executescript("CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);"
                       "CREATE TABLE sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,"
                       " created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);"
                       "INSERT INTO sessions VALUES('OLD', 1, 0, 9999999999);")
    db.init_db(conn)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()}
    assert {"device_id", "device_name", "ip", "last_seen_at", "revoked_at", "revoked_reason"} <= cols
    assert db.get_session(conn, "OLD") is None           # 旧版客户端的会话清掉，必须用新版重新登录
    tok = db.create_session(conn, 1, 3600)
    db.init_db(conn)                                     # 再次启动不重复清
    assert db.get_session(conn, tok) is not None
