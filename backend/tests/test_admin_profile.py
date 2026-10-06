from app import db, profile
from tests.agent_helpers import audit, build_app, key_client, login_client, mk_admin, mk_agent_raw

def own(conn, code: str, agent_id: int | None) -> db.User:
    u = db.create_user(conn, code, "pw", None)
    conn.execute("UPDATE users SET agent_id=? WHERE id=?", (agent_id, u.id)); conn.commit()
    return u

def rows_by_code(tc) -> dict:
    return {r["code"]: r for r in tc.get("/admin/users").json()["users"]}

def test_user_list_includes_display_nickname():
    conn, app = build_app()
    a = own(conn, "U1", None); own(conn, "U2", None)
    db.set_user_profile(conn, a.id, nickname="小明")
    rows = rows_by_code(key_client(app))
    assert rows["U1"]["nickname"] == "小明"
    assert rows["U2"]["nickname"] == profile.default_nickname("U2")
    assert "avatar" not in rows["U1"]

def test_profile_view_for_staff_and_agent_scope():
    conn, app = build_app()
    ag = mk_agent_raw(conn, "代理甲")
    mine = own(conn, "U1", ag); own(conn, "U2", None)
    db.set_user_profile(conn, mine.id, avatar="data:image/jpeg;base64,/9j/")
    body = key_client(app).get("/admin/users/u1/profile").json()
    assert body == {"ok": True, "code": "U1", "nickname": profile.default_nickname("U1"),
                    "avatar": "data:image/jpeg;base64,/9j/", "nickname_is_default": True, "avatar_is_default": False}
    agent = login_client(app, "代理甲")
    assert agent.get("/admin/users/U1/profile").json()["ok"] is True
    r = agent.get("/admin/users/U2/profile")
    assert r.status_code == 404 and r.json() == {"ok": False, "error": "账号不存在"}
    assert key_client(app).get("/admin/users/NOPE/profile").status_code == 404
    assert rows_by_code(agent)["U1"]["nickname"] == profile.default_nickname("U1")

def test_reset_restores_defaults_with_audit_staff_only():
    conn, app = build_app()
    ag = mk_agent_raw(conn, "代理甲")
    u = own(conn, "U1", ag)
    db.set_user_profile(conn, u.id, nickname="坏名字", avatar="data:image/jpeg;base64,/9j/")
    assert login_client(app, "代理甲").post("/admin/users/U1/profile/reset").status_code == 403
    mk_admin(conn, "管理员乙")
    assert login_client(app, "管理员乙").post("/admin/users/u1/profile/reset").json() == {"ok": True}
    assert db.get_user_by_code(conn, "U1").nickname is None and db.get_user_avatar(conn, u.id) is None
    [e] = audit(conn, "user.profile_reset")
    assert (e["actor"], e["target"], e["detail"]) == ("管理员乙", "U1", {"nickname_custom": True, "avatar_custom": True})
    assert key_client(app).post("/admin/users/U1/profile/reset").json() == {"ok": True}
    assert audit(conn, "user.profile_reset")[0]["detail"] == {"nickname_custom": False, "avatar_custom": False}
    assert key_client(app).post("/admin/users/NOPE/profile/reset").status_code == 404
