import base64
import httpx
import pytest
from fastapi.testclient import TestClient
from app import db, profile
from app.config import Settings
from app.dayys_session import DataYsSession
from app.main import create_app
from tests.points_helpers import set_points_raw

EMPTY = {"code": 10025, "msg": "无积分，无权操作，请充值积分后自动恢复使用！"}
JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 60
JPEG_URL = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()
SVG_URL = "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode()

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

def logged_in(points=5):
    conn, tc, calls = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", points)
    body = tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"}).json()
    assert body["code"] == 0
    return conn, tc, calls, {"token": body["data"]["token"]}

def test_profile_returns_defaults_and_balance_without_upstream():
    conn, tc, calls, h = logged_in(5)
    n = calls["n"]
    body = tc.get("/api/user/profile", headers=h).json()
    avatar = profile.default_avatar("USER01")
    assert body == {"code": 0, "msg": "成功", "data": {
        "code": "USER01", "nickname": profile.default_nickname("USER01"), "avatar": avatar,
        "defaultAvatar": avatar, "points": 5, "nicknameIsDefault": True, "avatarIsDefault": True}}
    assert calls["n"] == n

def test_points_endpoint_reflects_current_balance():
    conn, tc, calls, h = logged_in(5)
    set_points_raw(conn, "USER01", 3)
    assert tc.get("/api/user/points", headers=h).json() == {"code": 0, "msg": "成功", "data": {"points": 3}}

def test_save_nickname_and_avatar_then_restore_default_avatar():
    conn, tc, calls, h = logged_in()
    d = tc.post("/api/user/profile", headers=h, json={"nickname": " 小明 ", "avatar": JPEG_URL}).json()["data"]
    assert (d["nickname"], d["avatar"], d["nicknameIsDefault"], d["avatarIsDefault"]) == ("小明", JPEG_URL, False, False)
    assert d["defaultAvatar"] == profile.default_avatar("USER01")
    assert tc.get("/api/user/profile", headers=h).json()["data"] == d
    d2 = tc.post("/api/user/profile", headers=h, json={"avatar": None}).json()["data"]
    assert (d2["nickname"], d2["avatar"], d2["avatarIsDefault"]) == ("小明", profile.default_avatar("USER01"), True)
    assert tc.post("/api/user/profile", headers=h, json={}).json()["data"] == d2   # 未出现的字段不改

@pytest.mark.parametrize("payload,msg", [
    ({"nickname": ""}, "昵称不能为空"),
    ({"nickname": "a" * 13}, "昵称最多 12 个字"),
    ({"nickname": "a\nb"}, "昵称包含不支持的字符"),
    ({"avatar": SVG_URL}, "头像格式不支持"),
    ({"avatar": "data:image/jpeg;base64," + base64.b64encode(JPEG + b"\0" * 102400).decode()}, "头像图片过大"),
    ({"nickname": "新名", "avatar": SVG_URL}, "头像格式不支持"),
])
def test_invalid_input_is_rejected_without_partial_write(payload, msg):
    conn, tc, calls, h = logged_in()
    assert tc.post("/api/user/profile", headers=h, json=payload).json() == {"code": 1, "msg": msg}
    d = tc.get("/api/user/profile", headers=h).json()["data"]
    assert d["nicknameIsDefault"] and d["avatarIsDefault"]

@pytest.mark.parametrize("raw", [b"[1]", b"{", b"\"x\"", b"[" * 100000 + b"]" * 100000])
def test_non_object_body_is_parameter_error(raw):
    conn, tc, calls, h = logged_in()
    r = tc.post("/api/user/profile", headers={**h, "Content-Type": "application/json"}, content=raw)
    assert r.json() == {"code": 1, "msg": "参数错误"}

def test_endpoints_share_gate_interception():
    conn, tc, calls, h = logged_in()
    n = calls["n"]
    for method, url in (("get", "/api/user/profile"), ("get", "/api/user/points"), ("post", "/api/user/profile")):
        kw = {"json": {"nickname": "x"}} if method == "post" else {}
        assert getattr(tc, method)(url, **kw).json()["code"] == 10020
        set_points_raw(conn, "USER01", 0)
        assert getattr(tc, method)(url, headers=h, **kw).json() == EMPTY
        set_points_raw(conn, "USER01", 5)
        db.update_user(conn, "USER01", status="banned")
        assert getattr(tc, method)(url, headers=h, **kw).json()["code"] == 10024
        db.update_user(conn, "USER01", status="active")
    assert calls["n"] == n
    assert db.get_user_by_code(conn, "USER01").nickname is None      # 被拦截的保存没有写入
