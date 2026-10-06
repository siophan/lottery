from types import SimpleNamespace
import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession
from tests.points_helpers import set_points_raw
from app.throttle import FailureCounter, LoginThrottle, client_ip, LOCKED_MSG

# ---------------- FailureCounter 纯逻辑 ----------------

class Clock:
    def __init__(self, t=1000.0):
        self.t = t
    def __call__(self):
        return self.t

def test_counter_locks_at_limit_and_unlocks_after_lockout():
    clk = Clock()
    c = FailureCounter(limit=3, window=900, lockout=900, clock=clk)
    for _ in range(2):
        c.hit("A")
    assert not c.locked("A")
    c.hit("A")
    assert c.locked("A")
    clk.t += 899
    assert c.locked("A")
    clk.t += 2
    assert not c.locked("A")
    c.hit("A")                  # 解锁后重新计数
    assert not c.locked("A")

def test_counter_sliding_window_forgets_old_failures():
    clk = Clock()
    c = FailureCounter(limit=3, window=900, lockout=900, clock=clk)
    c.hit("A"); c.hit("A")
    clk.t += 901                # 前两次已滑出窗口
    c.hit("A")
    assert not c.locked("A")
    c.hit("A"); c.hit("A")
    assert c.locked("A")

def test_counter_clear_resets():
    c = FailureCounter(limit=2, window=900, lockout=900, clock=Clock())
    c.hit("A"); c.clear("A"); c.hit("A")
    assert not c.locked("A")

def test_counter_keys_are_independent():
    c = FailureCounter(limit=2, window=900, lockout=900, clock=Clock())
    c.hit("A"); c.hit("A")
    assert c.locked("A") and not c.locked("B")

def test_counter_size_is_capped_dropping_oldest():
    clk = Clock()
    c = FailureCounter(limit=2, window=900, lockout=900, max_keys=3, clock=clk)
    for k in ("A", "B", "C"):
        clk.t += 1
        c.hit(k)
    clk.t += 1
    c.hit("D")
    assert len(c) == 3
    assert "A" not in c and "D" in c

def test_counter_eviction_keeps_locked_keys():
    # 灌满键数不能把仍在锁定期的键挤掉（否则可借此提前解锁）
    clk = Clock()
    c = FailureCounter(limit=2, window=900, lockout=900, max_keys=3, clock=clk)
    c.hit("VICTIM"); c.hit("VICTIM")
    assert c.locked("VICTIM")
    for k in ("A", "B", "C", "D", "E"):
        clk.t += 1
        c.hit(k)
    assert c.locked("VICTIM") and len(c) == 3

def test_counter_prunes_stale_keys():
    clk = Clock()
    c = FailureCounter(limit=5, window=900, lockout=900, clock=clk)
    c.hit("A")
    clk.t += 1000
    c.hit("B")                  # 访问时顺带清掉已过期的 A
    assert "A" not in c and "B" in c

# ---------------- client_ip ----------------

def req(host, **headers):
    return SimpleNamespace(client=SimpleNamespace(host=host) if host else None,
                           headers={k.replace("_", "-"): v for k, v in headers.items()})

def test_client_ip_direct_ignores_forward_headers():
    assert client_ip(req("1.2.3.4", x_real_ip="9.9.9.9", x_forwarded_for="8.8.8.8")) == "1.2.3.4"

def test_client_ip_behind_local_nginx_prefers_x_real_ip():
    assert client_ip(req("127.0.0.1", x_real_ip="9.9.9.9", x_forwarded_for="8.8.8.8")) == "9.9.9.9"
    assert client_ip(req("::1", x_real_ip=" 9.9.9.9 , 7.7.7.7")) == "9.9.9.9"

def test_client_ip_behind_local_nginx_falls_back_to_rightmost_xff():
    # 最左项由客户端自带、可伪造；nginx 追加的最右项才是真实对端
    assert client_ip(req("127.0.0.1", x_forwarded_for="8.8.8.8, 10.0.0.1")) == "10.0.0.1"
    assert client_ip(req("127.0.0.1", x_forwarded_for="10.0.0.1")) == "10.0.0.1"

def test_client_ip_behind_local_nginx_without_headers():
    assert client_ip(req("127.0.0.1")) == "127.0.0.1"
    assert client_ip(req(None)) == ""

# ---------------- /auth/login 接入 ----------------

def upstream_ok(req_):
    return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {"vip": 1}}})

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(upstream_ok))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    clk = Clock()
    app.state.login_throttle = LoginThrottle(clock=clk)
    return conn, TestClient(app), clk

def login(tc, user="USER01", pw="bad", **headers):
    return tc.post("/api/auth/login", json={"username": user, "password": pw}, headers=headers).json()

LOCKED = {"code": 1, "msg": LOCKED_MSG}

def test_locked_msg_text():
    assert LOCKED_MSG == "登录失败次数过多，请15分钟后再试"

def test_five_failures_lock_account_even_with_right_password():
    conn, tc, clk = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    for _ in range(5):
        assert login(tc)["msg"] == "账号或密码错误"
    assert login(tc, pw="pw") == LOCKED
    assert login(tc, user="user01", pw="pw") == LOCKED      # 按大写编号计
    clk.t += 901
    assert login(tc, pw="pw")["code"] == 0

def test_locked_login_skips_password_verify(monkeypatch):
    conn, tc, clk = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    for _ in range(5):
        login(tc)
    from app.routes import auth as auth_mod
    calls = []
    monkeypatch.setattr(auth_mod, "verify_password", lambda *a: calls.append(a) or True)
    assert login(tc, pw="pw") == LOCKED
    assert calls == []

def test_success_clears_account_counter():
    conn, tc, clk = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    for _ in range(4):
        login(tc)
    assert login(tc, pw="pw")["code"] == 0
    for _ in range(4):
        login(tc)
    assert login(tc, pw="pw")["code"] == 0

def test_unknown_user_failures_count_per_code():
    conn, tc, clk = build()
    for _ in range(5):
        assert login(tc, user="NOPE")["msg"] == "账号或密码错误"
    assert login(tc, user="NOPE") == LOCKED
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    assert login(tc, pw="pw")["code"] == 0                  # 其他账号不受影响

def test_ip_locked_after_30_failures_across_accounts():
    conn, tc, clk = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    for i in range(30):
        assert login(tc, user=f"X{i}")["msg"] == "账号或密码错误"
    assert login(tc, pw="pw") == LOCKED
    clk.t += 901
    assert login(tc, pw="pw")["code"] == 0

def test_ip_counter_uses_forwarded_ip_behind_local_proxy():
    conn, tc, clk = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    th = tc.app.state.login_throttle
    # TestClient 的对端地址是 "testclient"，不是本机反代：转发头被忽略
    for i in range(30):
        login(tc, user=f"X{i}", **{"X-Real-IP": "9.9.9.9"})
    assert th.ip.locked("testclient") and not th.ip.locked("9.9.9.9")

def test_rejected_logins_with_right_password_do_not_lock_the_account():
    conn, tc, clk = build()
    db.create_user(conn, "USER01", "x", None, pending=True)
    for _ in range(6):
        assert login(tc, pw="123456")["code"] == 10023
    assert not tc.app.state.login_throttle.code.locked("USER01")

def test_scanning_numbers_with_initial_password_locks_the_ip():
    # 号段编号连续、初始密码公开：密码对但没拿到会话的尝试也计入 IP，扫号 30 次即锁
    conn, tc, clk = build()
    for i in range(20):
        db.create_user(conn, f"P{i}", "x", None, pending=True)          # 10023
    for i in range(10):
        u = db.create_user(conn, f"N{i}", "123456", None)               # 已激活未首登 → 10030
        conn.execute("UPDATE users SET onboarded_at=NULL WHERE id=?", (u.id,)); conn.commit()
    codes = [login(tc, user=f"P{i}", pw="123456")["code"] for i in range(20)]
    codes += [login(tc, user=f"N{i}", pw="123456")["code"] for i in range(10)]
    assert codes == [10023] * 20 + [10030] * 10
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    assert login(tc, pw="pw") == LOCKED
    clk.t += 901
    assert login(tc, pw="pw")["code"] == 0

def test_each_no_session_outcome_counts_against_the_ip():
    conn, tc, clk = build()
    db.create_user(conn, "BAN", "pw", None); db.update_user(conn, "BAN", status="banned")       # 10024
    db.create_user(conn, "OFF", "pw", None); db.update_user(conn, "OFF", status="disabled")     # 10022
    db.create_user(conn, "ZERO", "pw", None)                                                     # 10025
    th = tc.app.state.login_throttle
    for _ in range(10):
        assert [login(tc, user=u, pw="pw")["code"] for u in ("BAN", "OFF", "ZERO")] == [10024, 10022, 10025]
    assert th.ip.locked("testclient")

def test_successful_login_does_not_count_against_the_ip():
    conn, tc, clk = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", 10)
    for _ in range(40):
        assert login(tc, pw="pw")["code"] == 0

def test_malformed_login_bodies_are_plain_failures():
    conn, tc, clk = build()
    for body in ([1, 2], {"username": 5, "password": 6}, {"username": "U", "password": ["x"]}):
        assert tc.post("/api/auth/login", json=body).json() == {"code": 1, "msg": "账号或密码错误"}
    r = tc.post("/api/auth/login", content=b"not json", headers={"content-type": "application/json"})
    assert r.json() == {"code": 1, "msg": "账号或密码错误"}

def test_password_changed_while_hashing_rejects_the_old_password(monkeypatch):
    # 验密（线程池）期间密码被改（后台重置 / 首登完成）：旧密码不能再拿到会话
    from app.routes import auth as auth_routes
    from app.security import hash_password
    conn, tc, _ = build()
    db.create_user(conn, "ZED", "oldpw1", None)
    set_points_raw(conn, "ZED", 10)
    real = auth_routes.run_in_threadpool
    async def racing(fn, *a, **kw):
        h, salt = hash_password("newpw1")
        conn.execute("UPDATE users SET password_hash=?, salt=? WHERE code='ZED'", (h, salt)); conn.commit()
        return await real(fn, *a, **kw)
    monkeypatch.setattr(auth_routes, "run_in_threadpool", racing)
    r = tc.post("/api/auth/login", json={"username": "ZED", "password": "oldpw1"}).json()
    assert r == {"code": 1, "msg": "账号或密码错误"}
    assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
