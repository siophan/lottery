import re, time, json, httpx
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession
from app.sms import SmsError
from app.routes.auth import password_problem
from app.security import verify_password

PHONE = "13812341234"

def upstream_ok(req):
    return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {"vip": 1}}})

class FakeSms:
    def __init__(self):
        self.sent = []          # [(phone, code)]
        self.fail = False
    async def send_code(self, phone, code):
        if self.fail:
            raise SmsError("boom")
        self.sent.append((phone, code))

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(upstream_ok))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    sms = FakeSms()
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys, sms=sms)
    return conn, TestClient(app), sms

def fresh_user(conn, code="USER01", password="123456"):
    """已激活但未完成首登的账号。"""
    u = db.create_user(conn, code, password, None)
    conn.execute("UPDATE users SET onboarded_at=NULL WHERE id=?", (u.id,)); conn.commit()
    return u

def ticket_for(conn, u, ttl=900):
    return db.create_onboard_ticket(conn, u.id, ttl)

def send_sms(tc, ticket, phone=PHONE):
    return tc.post("/api/auth/onboard/sms", json={"onboardToken": ticket, "phone": phone}).json()

def form(ticket, **kw):
    d = dict(onboardToken=ticket, oldPassword="123456", newPassword="Abcd1234",
             confirmPassword="Abcd1234", phone=PHONE, smsCode="000000")
    d.update(kw)
    return d

def submit(tc, ticket, **kw):
    return tc.post("/api/auth/onboard", json=form(ticket, **kw)).json()

def issue_code(conn, phone=PHONE, code="246810", now=None):
    db.save_sms_code(conn, phone, "onboard", code, 300, int(time.time()) if now is None else now)
    return code

# ---------------- password_problem 纯函数 ----------------

@pytest.mark.parametrize("old,new,confirm,msg", [
    ("123456", "Abc123", "Abc123", "新密码长度不能少于8位"),
    ("123456", "Abcd1234" + "x" * 13, "Abcd1234" + "x" * 13, "新密码长度不能超过20位"),
    ("123456", "abcdefgh", "abcdefgh", "新密码必须同时包含字母和数字"),
    ("123456", "12345678", "12345678", "新密码必须同时包含字母和数字"),
    ("Oldpass12", "Oldpass12", "Oldpass12", "新密码不能与初始密码相同"),
    ("123456", "Abcd1234", "Abcd12345", "两次输入的新密码不一致"),
    ("123456", "Abcd1234", "Abcd1234", None),
    ("123456", "Abcd1234" + "x" * 12, "Abcd1234" + "x" * 12, None),   # 恰好 20 位
    ("123456", "Abcd123中", "Abcd123中", None),  # 8 个字符，中文按字符计长
])
def test_password_problem(old, new, confirm, msg):
    assert password_problem(old, new, confirm) == msg

def test_password_problem_chinese_letters_do_not_count_as_letters():
    assert password_problem("123456", "中文中文1234", "中文中文1234") == "新密码必须同时包含字母和数字"

# ---------------- /auth/onboard/sms ----------------

def test_sms_bad_ticket_10031():
    conn, tc, sms = build()
    assert send_sms(tc, "nope") == {"code": 10031, "msg": "操作已超时，请重新登录"}
    assert sms.sent == []

def test_sms_expired_ticket_10031(monkeypatch):
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    real = time.time
    monkeypatch.setattr(time, "time", lambda: real() + 901)
    assert send_sms(tc, t)["code"] == 10031
    assert sms.sent == []

@pytest.mark.parametrize("phone", ["", "1381234123", "23812341234", "12812341234", "138123412345", "abc"])
def test_sms_bad_phone(phone):
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    assert send_sms(tc, t, phone) == {"code": 1, "msg": "手机号格式错误"}
    assert sms.sent == []

def test_sms_success_sends_6_digit_code_and_stores_hash_only():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    r = send_sms(tc, t)
    assert r == {"code": 0, "msg": "验证码已发送", "data": {"resendAfter": 60}}
    assert len(sms.sent) == 1
    phone, code = sms.sent[0]
    assert phone == PHONE and re.fullmatch(r"\d{6}", code)
    row = conn.execute("SELECT * FROM sms_codes WHERE phone=? AND purpose='onboard'", (PHONE,)).fetchone()
    assert row is not None and code not in json.dumps(dict(row))
    assert db.check_sms_code(conn, PHONE, "onboard", code, int(time.time())) == "ok"

def test_sms_cooldown_60s(monkeypatch):
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    assert send_sms(tc, t)["code"] == 0
    assert send_sms(tc, t) == {"code": 1, "msg": "验证码发送过于频繁，请稍后再试"}
    assert len(sms.sent) == 1
    real = time.time
    monkeypatch.setattr(time, "time", lambda: real() + 61)
    t2 = ticket_for(conn, db.get_user_by_code(conn, "USER01"), ttl=900)
    assert send_sms(tc, t2)["code"] == 0
    assert len(sms.sent) == 2

def test_sms_daily_cap_10():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    now = int(time.time())
    conn.executemany("INSERT INTO sms_send_log(phone,sent_at) VALUES(?,?)", [(PHONE, now - 3600)] * 10)
    conn.commit()           # 没有 sms_codes 行，冷却不触发
    assert send_sms(tc, t) == {"code": 1, "msg": "今日验证码发送次数已达上限"}
    assert sms.sent == []

def test_sms_daily_cap_9_still_allowed():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    now = int(time.time())
    conn.executemany("INSERT INTO sms_send_log(phone,sent_at) VALUES(?,?)", [(PHONE, now - 3600)] * 9)
    conn.commit()
    assert send_sms(tc, t)["code"] == 0

def test_sms_sender_failure_rolls_back_code():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    sms.fail = True
    assert send_sms(tc, t) == {"code": 1, "msg": "验证码发送失败，请稍后再试"}
    assert conn.execute("SELECT COUNT(*) FROM sms_codes").fetchone()[0] == 0

# ---------------- /auth/onboard 失败分支 ----------------

def test_onboard_bad_ticket_10031():
    conn, tc, sms = build()
    assert submit(tc, "nope") == {"code": 10031, "msg": "操作已超时，请重新登录"}

def test_onboard_expired_ticket_10031(monkeypatch):
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    real = time.time
    monkeypatch.setattr(time, "time", lambda: real() + 901)
    assert submit(tc, t)["code"] == 10031

def test_onboard_wrong_old_password():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    assert submit(tc, t, oldPassword="bad") == {"code": 1, "msg": "旧密码错误"}

@pytest.mark.parametrize("new,msg", [
    ("Abc123", "新密码长度不能少于8位"),
    ("Abcd1234" + "x" * 13, "新密码长度不能超过20位"),
    ("abcdefgh", "新密码必须同时包含字母和数字"),
    ("12345678", "新密码必须同时包含字母和数字"),
])
def test_onboard_password_rules(new, msg):
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    assert submit(tc, t, newPassword=new, confirmPassword=new) == {"code": 1, "msg": msg}

def test_onboard_new_equals_old_password():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn, password="Oldpass12"))
    assert submit(tc, t, oldPassword="Oldpass12", newPassword="Oldpass12",
                  confirmPassword="Oldpass12") == {"code": 1, "msg": "新密码不能与初始密码相同"}

def test_onboard_confirm_mismatch():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    assert submit(tc, t, confirmPassword="Abcd12345") == {"code": 1, "msg": "两次输入的新密码不一致"}

def test_onboard_bad_phone():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    assert submit(tc, t, phone="1234") == {"code": 1, "msg": "手机号格式错误"}

def test_onboard_sms_code_missing_message():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    assert submit(tc, t) == {"code": 1, "msg": "验证码已过期，请重新获取"}

def test_onboard_sms_code_expired_message(monkeypatch):
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    code = issue_code(conn)
    real = time.time
    monkeypatch.setattr(time, "time", lambda: real() + 400)   # 码 300s 过期，票据 900s 仍有效
    assert submit(tc, t, smsCode=code) == {"code": 1, "msg": "验证码已过期，请重新获取"}

def test_onboard_sms_code_wrong_message():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    issue_code(conn, code="246810")
    assert submit(tc, t, smsCode="111111") == {"code": 1, "msg": "验证码错误"}

def test_onboard_sms_code_too_many_attempts():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    issue_code(conn, code="246810")
    for _ in range(4):
        assert submit(tc, t, smsCode="111111")["msg"] == "验证码错误"
    assert submit(tc, t, smsCode="111111") == {"code": 1, "msg": "验证码错误次数过多，请重新获取"}
    # 码已作废：连正确码也不行
    assert submit(tc, t, smsCode="246810") == {"code": 1, "msg": "验证码已过期，请重新获取"}

def test_onboard_earlier_failures_do_not_consume_sms_code():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    code = issue_code(conn)
    assert submit(tc, t, newPassword="short", confirmPassword="short", smsCode=code)["code"] == 1
    assert submit(tc, t, smsCode=code)["code"] == 0      # 码仍可用
    # 且失败分支没有消耗错误次数
    assert conn.execute("SELECT COUNT(*) FROM sms_codes").fetchone()[0] == 0

def test_onboard_failure_leaves_user_untouched():
    conn, tc, sms = build()
    u = fresh_user(conn)
    t = ticket_for(conn, u)
    submit(tc, t, smsCode="111111")
    after = db.get_user_by_code(conn, "USER01")
    assert after.onboarded_at is None and after.phone is None
    assert verify_password("123456", after.salt, after.password_hash)

# ---------------- /auth/onboard 成功 ----------------

def test_onboard_success_full_flow():
    conn, tc, sms = build()
    u = fresh_user(conn)
    old_session = db.create_session(conn, u.id, 3600)
    t = ticket_for(conn, u)
    code = issue_code(conn)
    r = submit(tc, t, smsCode=code)
    assert r == {"code": 0, "msg": "密码修改与手机号绑定成功，请使用新密码重新登录"}

    after = db.get_user_by_code(conn, "USER01")
    assert after.phone == PHONE and after.onboarded_at is not None
    assert db.get_session(conn, old_session) is None
    assert db.get_onboard_ticket_user(conn, t, int(time.time())) is None
    assert conn.execute("SELECT COUNT(*) FROM sms_codes").fetchone()[0] == 0

    row = conn.execute("SELECT * FROM audit_logs WHERE action='user.onboard'").fetchone()
    assert row["actor_type"] == "user" and row["actor"] == "USER01" and row["target"] == "USER01"
    assert json.loads(row["detail_json"]) == {"phone": "138****1234"}
    assert PHONE not in row["detail_json"]

    # 旧密码失效、新密码可登录且直接拿到会话
    assert tc.post("/api/auth/login", json={"username": "USER01", "password": "123456"}).json()["code"] == 1
    login = tc.post("/api/auth/login", json={"username": "USER01", "password": "Abcd1234"}).json()
    assert login["code"] == 0 and login["data"]["token"]

def test_onboard_ticket_cannot_be_reused():
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    assert submit(tc, t, smsCode=issue_code(conn))["code"] == 0
    assert submit(tc, t, smsCode=issue_code(conn))["code"] == 10031

def test_onboard_end_to_end_via_login_and_sms_endpoint():
    conn, tc, sms = build()
    fresh_user(conn)
    login = tc.post("/api/auth/login", json={"username": "USER01", "password": "123456"}).json()
    assert login["code"] == 10030
    t = login["data"]["onboardToken"]
    assert send_sms(tc, t)["code"] == 0
    _, code = sms.sent[0]
    assert submit(tc, t, smsCode=code)["code"] == 0

def test_onboard_tolerates_garbage_body():
    conn, tc, sms = build()
    r = tc.post("/api/auth/onboard", content=b"[1,2]", headers={"content-type": "application/json"})
    assert r.json()["code"] == 10031
    r = tc.post("/api/auth/onboard/sms", json={"onboardToken": 123, "phone": None})
    assert r.json()["code"] == 10031

def test_default_sms_sender_uses_dedicated_client_and_log_sender():
    from app.sms import LogSmsSender
    conn = db.connect(":memory:"); db.init_db(conn)
    shared = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(upstream_ok))
    app = create_app(Settings(), client=shared, conn=conn)
    assert isinstance(app.state.sms, LogSmsSender)
    assert app.state.sms_client is not None and app.state.sms_client is not shared

def test_injected_sms_creates_no_extra_client():
    conn = db.connect(":memory:"); db.init_db(conn)
    app = create_app(Settings(), conn=conn, sms=FakeSms())
    assert app.state.sms_client is None

# ---------------- 票据签发后账号状态变化 ----------------

@pytest.mark.parametrize("mutate,code,msg", [
    (lambda conn: db.update_user(conn, "USER01", status="banned"), 10024, "账号已封禁，无法登录"),
    (lambda conn: db.update_user(conn, "USER01", status="disabled"), 10022, "账号已停用或已到期"),
    (lambda conn: db.update_user(conn, "USER01", expires_at=int(time.time()) - 5), 10022, "账号已停用或已到期"),
])
def test_onboard_endpoints_reject_account_blocked_after_ticket(mutate, code, msg):
    conn, tc, sms = build()
    t = ticket_for(conn, fresh_user(conn))
    issue_code(conn)
    mutate(conn)
    assert send_sms(tc, t) == {"code": code, "msg": msg}
    assert sms.sent == []
    assert submit(tc, t, smsCode="246810") == {"code": code, "msg": msg}
    assert db.get_user_by_code(conn, "USER01").onboarded_at is None

# ---------------- 审计与改密同一事务 ----------------

def test_complete_onboarding_writes_audit_in_same_transaction():
    conn = db.connect(":memory:"); db.init_db(conn)
    u = fresh_user(conn)
    db.complete_onboarding(conn, u.id, "Abcd1234", PHONE, 1000, audit_detail={"phone": "138****1234"})
    row = conn.execute("SELECT * FROM audit_logs").fetchone()
    assert (row["actor_type"], row["actor"], row["action"], row["target"], row["created_at"]) == \
        ("user", "USER01", "user.onboard", "USER01", 1000)
    assert json.loads(row["detail_json"]) == {"phone": "138****1234"}
    assert db.get_user_by_code(conn, "USER01").onboarded_at == 1000

def test_complete_onboarding_audit_failure_rolls_back_password_change():
    conn = db.connect(":memory:"); db.init_db(conn)
    u = fresh_user(conn)
    with pytest.raises(TypeError):
        db.complete_onboarding(conn, u.id, "Abcd1234", PHONE, 1000, audit_detail={"x": object()})
    after = db.get_user_by_code(conn, "USER01")
    assert after.onboarded_at is None and after.phone is None
    assert verify_password("123456", after.salt, after.password_hash)
    assert conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0] == 0

def test_complete_onboarding_without_audit_detail_writes_no_audit():
    conn = db.connect(":memory:"); db.init_db(conn)
    u = fresh_user(conn)
    db.complete_onboarding(conn, u.id, "Abcd1234", PHONE, 1000)
    assert conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0] == 0

# ---------------- 发送器异常诊断 ----------------

def test_sms_sender_unexpected_exception_logged_to_stderr(capsys):
    conn, tc, sms = build()
    async def boom(phone, code):
        raise RuntimeError("provider exploded")
    sms.send_code = boom
    t = ticket_for(conn, fresh_user(conn))
    assert send_sms(tc, t) == {"code": 1, "msg": "验证码发送失败，请稍后再试"}
    err = capsys.readouterr().err
    assert "RuntimeError" in err and "provider exploded" in err
    assert conn.execute("SELECT COUNT(*) FROM sms_codes").fetchone()[0] == 0
