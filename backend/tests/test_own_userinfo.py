# 客户端拿到的 userInfo 必须是当前账号自己的，不能带出共用上游账号的身份资料；
# 存在共用上游账号名下的方案 / 收藏 / 遗漏预警 / 课程报名一律不转发。
import json, httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db, profile
from app.dayys_session import DataYsSession
from tests.points_helpers import set_points_raw

# 共用上游账号的资料：这些值一个都不能出现在给客户端的响应里
UPSTREAM_INFO = {"id": 777, "username": "Y1888", "name": "张三", "mobile": "13900001111",
                 "cardId": "110101199001011234", "createDate": "2022-03-04 05:06:07",
                 "email": "owner@example.com", "type": 1, "score": 500,
                 "endTime": 1900000000000, "vip": 1}
SECRETS = ["Y1888", "1888", "张三", "13900001111", "0001111", "110101199001011234",
           "1234", "2022-03-04", "owner@example.com", "777", "500"]

def build(handler=None):
    conn = db.connect(":memory:"); db.init_db(conn)
    calls = []
    def router(req):
        if req.url.path.endswith("/auth/login"):
            return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": UPSTREAM_INFO}})
        calls.append(req.url.path)
        return handler(req) if handler else httpx.Response(200, json={"code": 0, "data": {}})
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(router))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    u = db.create_user(conn, "20240001", "pw", None)
    set_points_raw(conn, "20240001", 9)
    # 号段账号先建档后激活：created_at 早于首次激活
    conn.execute("UPDATE users SET phone='13612345678', created_at=1600000000, first_activated_at=1700000000"
                 " WHERE id=?", (u.id,))
    conn.commit()
    return conn, db.get_user_by_id(conn, u.id), TestClient(app), calls

def assert_own(info: dict, user) -> None:
    text = json.dumps(info, ensure_ascii=False)
    for s in SECRETS:
        assert s not in text, s
    assert info["username"] == user.code
    assert info["name"] == profile.display_nickname(user)
    assert info["mobile"] == "136****5678"
    assert info["createDate"] == "2023-11-15 06:13:20"    # 首次激活 1700000000，按北京时间
    assert info["cardId"] and len(info["cardId"]) != 18   # 非空才过客户端实名检查；非 18 位个人信息页不显示
    assert info["id"] == user.id
    assert info["score"] == 0       # 只用于上游积分支付（已拦截），不给本站积分
    # 功能判断用到的字段沿用上游
    assert info["type"] == 1 and info["endTime"] == 1900000000000 and info["vip"] == 1

def test_login_returns_own_userinfo():
    conn, user, tc, _ = build()
    body = tc.post("/api/auth/login", json={"username": "20240001", "password": "pw"}).json()
    assert body["code"] == 0
    assert_own(body["data"]["userInfo"], user)

def test_login_userinfo_without_phone_has_blank_mobile():
    conn, user, tc, _ = build()
    conn.execute("UPDATE users SET phone=NULL WHERE id=?", (user.id,)); conn.commit()
    info = tc.post("/api/auth/login", json={"username": "20240001", "password": "pw"}).json()["data"]["userInfo"]
    assert info["mobile"] == ""      # 不能是 None：个人信息页直接对它调 substring

def _session(conn, user):
    return db.create_session(conn, user.id, 3600)

def test_is_expire_and_info_rewritten_keeping_code():
    def handler(req):
        code = 3001 if req.url.path.endswith("/user/isExpire") else 0
        return httpx.Response(200, json={"code": code, "msg": "x", "data": UPSTREAM_INFO})
    conn, user, tc, calls = build(handler)
    tok = _session(conn, user)
    for path, code in (("user/isExpire", 3001), ("user/info", 0)):
        r = tc.post(f"/api/{path}", json={}, headers={"token": tok})
        body = r.json()
        assert body["code"] == code and body["msg"] == "x"
        assert_own(body["data"], user)
        assert r.headers["content-length"] == str(len(r.content))
    assert calls == ["/api/user/isExpire", "/api/user/info"]

def test_userinfo_paths_rewritten_case_insensitively():
    conn, user, tc, calls = build(lambda req: httpx.Response(200, json={"code": 0, "data": UPSTREAM_INFO}))
    tok = _session(conn, user)
    for path in ("User/Info", "user/ISEXPIRE"):
        assert_own(tc.post(f"/api/{path}", json={}, headers={"token": tok}).json()["data"], user)
    assert len(calls) == 2

def test_rewrite_user_info_leaves_other_shapes_alone():
    from app.userinfo import rewrite_user_info
    conn, user, _, _ = build()
    for raw in (b"not json", b"[1,2]", b'{"code":0,"data":[1]}', b'{"code":0,"data":null}'):
        assert rewrite_user_info(raw, user) == raw

def test_expert_page_favorites_of_shared_account_removed():
    plan = {"code": 0, "msg": "ok", "data": {"list": [{"name": "专家"}], "total": 1},
            "favorites": {"id": 9, "expertId": 123}}
    conn, user, tc, calls = build(lambda req: httpx.Response(200, json=plan))
    tok = _session(conn, user)
    for path in ("sportExpertPlan/footballJc/expert", "sportexpertplan/FOOTBALLJC/expert"):
        body = tc.post(f"/api/{path}", json={}, headers={"token": tok}).json()
        assert body == {**plan, "favorites": None}
    assert len(calls) == 2

def test_redact_fields_leaves_other_shapes_alone():
    from app.userinfo import redact_fields
    for raw in (b"not json", b"[1]", b'{"code":0,"data":[]}', b'{"code":0,"favorites":null}'):
        assert redact_fields(raw, ("favorites",)) == raw

def _legacy(tc, tok, body):
    return tc.post("/api/user/legacy-prefixes", content=json.dumps(body), headers={"token": tok}).json()

def test_legacy_prefixes_confirms_only_shared_account_codes():
    conn, user, tc, _ = build()
    tok = _session(conn, user)
    assert _legacy(tc, tok, {"candidates": ["Y1888"]})["data"]["matches"] == []   # 还没人登录过：不知道旧编号
    tc.post("/api/auth/login", json={"username": "20240001", "password": "pw"})      # 登录时记下共用账号编号
    body = _legacy(tc, tok, {"candidates": ["Z0000009", "Y1888", "Y1888", "20240001"]})
    assert body == {"code": 0, "msg": "成功", "data": {"matches": ["Y1888"]}}

def test_upstream_names_newest_first_and_written_only_on_change():
    from app.userinfo import UpstreamNames, legacy_matches
    conn = db.connect(":memory:"); db.init_db(conn)
    names = UpstreamNames()
    names.remember(conn, {"username": "Y1888"}, 100)
    names.remember(conn, {"username": "Y2000"}, 200)          # 换过共用账号：以前的编号仍然认得，新的排前面
    assert legacy_matches(conn, ["Y1888", "Y2000", "Z1"]) == ["Y2000", "Y1888"]
    names.remember(conn, {"username": "Y2000"}, 300)          # 没变：不写库
    assert conn.execute("SELECT value FROM settings WHERE key='upstream_username:Y2000'").fetchone()["value"] == "200"
    names.remember(conn, {"username": "Y1888"}, 400)          # 换回来：更新时间
    assert legacy_matches(conn, ["Y2000", "Y1888"]) == ["Y1888", "Y2000"]
    for bad in ({"username": ""}, {}, {"username": 5}):
        names.remember(conn, bad, 500)
    assert conn.execute("SELECT COUNT(*) c FROM settings WHERE key LIKE 'upstream_username:%'").fetchone()["c"] == 2
    assert legacy_matches(conn, []) == []

def test_legacy_prefixes_limited_per_user_per_day():
    from app.userinfo import LegacyCheckLimiter, LEGACY_CHECKS_PER_DAY
    conn, user, tc, _ = build()
    tok = _session(conn, user)
    for _ in range(LEGACY_CHECKS_PER_DAY):
        assert _legacy(tc, tok, {"candidates": ["Y1888"]})["code"] == 0
    assert _legacy(tc, tok, {"candidates": ["Y1888"]}) == {"code": 1, "msg": "操作过于频繁，请明天再试"}
    lim = LegacyCheckLimiter()
    assert [lim.allow(1, 86400 * 5 + i) for i in range(4)] == [True, True, True, False]
    assert lim.allow(2, 86400 * 5) is True                    # 按账号分开计
    assert lim.allow(1, 86400 * 6) is True                    # 第二天重置

def test_legacy_prefixes_requires_login_and_valid_input():
    conn, user, tc, _ = build()
    tok = _session(conn, user)
    assert tc.post("/api/user/legacy-prefixes", json={"candidates": ["Y1888"]}).json()["code"] == 10020
    for bad in ({}, {"candidates": "Y1888"}, {"candidates": [1]}, {"candidates": [""]},
                {"candidates": ["x" * 65]}, {"candidates": ["a"] * 51}, []):
        assert _legacy(tc, tok, bad)["code"] == 1, bad
    r = tc.post("/api/user/legacy-prefixes", content=b"{bad", headers={"token": tok}).json()
    assert r["code"] == 1
    assert _legacy(tc, tok, {"candidates": []})["data"]["matches"] == []

def test_course_registration_query_answers_not_registered():
    conn, user, tc, calls = build()
    tok = _session(conn, user)
    assert tc.post("/api/coursemsg/info", json={}, headers={"token": tok}).json() == {"code": 0, "msg": "成功", "data": None}
    assert tc.post("/api/coursemsg/save", json={}, headers={"token": tok}).json()["code"] == 1
    assert calls == []

def test_upgrade_clears_user_sessions_once():
    conn, user, _, _ = build()      # init_db 已跑过一次迁移
    conn.execute("DELETE FROM settings WHERE key='sessions_reset:own_userinfo'"); conn.commit()
    old = _session(conn, user)
    db.init_db(conn)                # 升级：清掉升级前的会话
    assert db.get_session(conn, old) is None
    new = _session(conn, user)
    db.init_db(conn)                # 之后重启不再清
    assert db.get_session(conn, new) is not None

def test_user_info_non_dict_data_passes_through():
    conn, user, tc, _ = build(lambda req: httpx.Response(200, json={"code": 500, "msg": "err"}))
    r = tc.post("/api/user/info", json={}, headers={"token": _session(conn, user)})
    assert r.json() == {"code": 500, "msg": "err"}

def test_user_init_not_forwarded():
    conn, user, tc, calls = build()
    r = tc.post("/api/user/init", json={}, headers={"token": _session(conn, user)})
    assert r.json()["code"] == 1 and calls == []

def test_shared_account_lists_return_empty():
    conn, user, tc, calls = build()
    tok = _session(conn, user)
    expect = {"userNumPlan/list": {"list": [], "total": []},
              "averagePlan/list": {"list": []}, "doublePlan/list": {"list": []},
              "expertFavorites/list": [], "misscontrol/list": []}
    for path, data in expect.items():
        assert tc.post(f"/api/{path}", json={}, headers={"token": tok}).json() == {"code": 0, "msg": "成功", "data": data}
        assert tc.post(f"/api/{path.lower()}", json={}, headers={"token": tok}).json()["data"] == data
    assert calls == []

def test_shared_account_writes_and_details_blocked():
    conn, user, tc, calls = build()
    tok = _session(conn, user)
    for path in ("userNumPlan/save", "userNumPlan/del", "userNumPlan/info",
                 "averagePlan/save", "averagePlan/del", "averagePlan/info",
                 "doublePlan/save", "doublePlan/del", "doublePlan/info",
                 "expertFavorites/save", "expertFavorites/del",
                 "misscontrol/save", "misscontrol/del", "coursemsg/save"):
        assert tc.post(f"/api/{path}", json={}, headers={"token": tok}).json() == {"code": 1, "msg": "该功能暂不可用"}, path
    assert calls == []

def test_shared_account_lists_still_require_login():
    conn, user, tc, calls = build()
    assert tc.post("/api/misscontrol/list", json={}).json()["code"] == 10020
    assert calls == []
