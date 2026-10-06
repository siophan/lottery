# 后台解绑手机号：账号被他人抢先首登（绑了别人的手机号）后，后台人员重置密码 + 解绑即可让真实用户重新首登。
import httpx
from fastapi.testclient import TestClient
from app import db
from app.config import Settings
from app.dayys_session import DataYsSession
from app.main import create_app
from tests.agent_helpers import H, audit, build_app, login_client, mk_admin, mk_agent_raw
from tests.test_onboard import FakeSms, issue_code, upstream_ok

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(upstream_ok))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600, admin_key="SECRET", admin_cookie_secure=False),
                     client=client, conn=conn, dayys=dayys, sms=FakeSms())
    return conn, TestClient(app)

def onboard(conn, tc, phone, new_pw):
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "123456"}).json()
    assert r["code"] == 10030, r
    u = db.get_user_by_code(conn, "USER01")
    issue_code(conn, phone=phone, code="246810", user_id=u.id)
    return tc.post("/api/auth/onboard", json={
        "onboardToken": r["data"]["onboardToken"], "oldPassword": "123456", "newPassword": new_pw,
        "confirmPassword": new_pw, "phone": phone, "smsCode": "246810"}).json()

def test_hijacked_account_recovers_after_reset_and_unbind():
    conn, tc = build()
    u = db.create_user(conn, "USER01", "123456", None)
    conn.execute("UPDATE users SET onboarded_at=NULL WHERE id=?", (u.id,)); conn.commit()
    assert onboard(conn, tc, "13900005678", "Evil1234")["code"] == 0          # 他人抢先首登
    staff = TestClient(tc.app, headers=H)
    assert staff.post("/admin/users/USER01/reset-password").json() == {"ok": True}
    assert onboard(conn, tc, "13812341234", "Mine1234") == {
        "code": 1, "msg": "请使用已绑定的手机号（尾号5678）验证"}               # 不解绑就无法恢复
    assert staff.post("/admin/users/user01/unbind-phone").json() == {"ok": True}
    assert db.get_user_by_code(conn, "USER01").phone is None
    assert onboard(conn, tc, "13812341234", "Mine1234")["code"] == 0
    assert db.get_user_by_code(conn, "USER01").phone == "13812341234"
    [row] = audit(conn, "user.unbind_phone")
    assert (row["target"], row["detail"]) == ("USER01", {"phone": "139****5678"})

def test_unbind_phone_errors_and_clears_pending_codes():
    conn, tc = build()
    staff = TestClient(tc.app, headers=H)
    assert staff.post("/admin/users/NOPE/unbind-phone").status_code == 404
    u = db.create_user(conn, "USER01", "pw", None)
    r = staff.post("/admin/users/USER01/unbind-phone")
    assert (r.status_code, r.json()["error"]) == (409, "未绑定手机号")
    conn.execute("UPDATE users SET phone='13900005678' WHERE id=?", (u.id,)); conn.commit()
    issue_code(conn, phone="13900005678", user_id=u.id)
    assert staff.post("/admin/users/USER01/unbind-phone").json() == {"ok": True}
    assert conn.execute("SELECT COUNT(*) FROM sms_codes WHERE user_id=?", (u.id,)).fetchone()[0] == 0

def test_unbind_phone_is_staff_only():
    conn, app = build_app()
    a = mk_agent_raw(conn, "ag1")
    u = db.create_user(conn, "USER01", "pw", None)
    conn.execute("UPDATE users SET phone='13900005678', agent_id=? WHERE id=?", (a, u.id)); conn.commit()
    assert login_client(app, "ag1").post("/admin/users/USER01/unbind-phone").status_code == 403
    mk_admin(conn, "adm")
    assert login_client(app, "adm").post("/admin/users/USER01/unbind-phone").json() == {"ok": True}
