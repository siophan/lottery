# 需求回复第 11 条：管理员权限高于代理。
# 代理可暂停 / 恢复本人名下账号；管理员暂停（或封禁）的账号代理无权恢复；代理暂停的账号管理员可以恢复。
import pytest
from app import db, db_segments
from tests.agent_helpers import audit, build_app, key_client, login_client, mk_agent_raw

NOW = 1_800_000_000
ADMIN_PAUSED = "该账号由管理员暂停或封禁，代理无权恢复"

def setup(code_count=1):
    conn, app = build_app()
    me = mk_agent_raw(conn, "me")
    db_segments.assign_segment(conn, me, 1, code_count, actor_type="admin", actor="root", now=NOW)
    return conn, app, me

def status_of(conn, code="Z0000001"):
    u = db.get_user_by_code(conn, code)
    return u.status, u.status_by

def rows(tc):
    return {u["code"]: u for u in tc.get("/admin/users").json()["users"]}

def test_agent_pauses_and_resumes_own_account():
    conn, app, _ = setup()
    tc = login_client(app, "me")
    r = tc.post("/admin/users/Z0000001/pause")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert status_of(conn) == ("disabled", "agent")
    assert rows(tc)["Z0000001"]["status_by"] == "agent"
    r = tc.post("/admin/users/Z0000001/resume")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert status_of(conn) == ("active", None)
    es = audit(conn, "user.status")
    assert [(e["actor_type"], e["actor"], e["target"], e["detail"]) for e in reversed(es)] == [
        ("agent", "me", "Z0000001", {"from": "active", "to": "disabled"}),
        ("agent", "me", "Z0000001", {"from": "disabled", "to": "active"}),
    ]

@pytest.mark.parametrize("status", ["disabled", "banned"])
def test_agent_cannot_resume_admin_paused_or_banned(status):
    conn, app, _ = setup()
    assert key_client(app).patch("/admin/users/Z0000001", json={"status": status}).status_code == 200
    assert status_of(conn) == (status, "admin")
    tc = login_client(app, "me")
    assert rows(tc)["Z0000001"]["status_by"] == "admin"
    r = tc.post("/admin/users/Z0000001/resume")
    assert r.status_code == 403 and r.json() == {"ok": False, "error": ADMIN_PAUSED}
    assert status_of(conn) == (status, "admin")

def test_legacy_pause_without_recorder_counts_as_admin():
    # 第 11 条之前只有后台能暂停：status_by 为空的存量暂停按管理员处理
    conn, app, _ = setup()
    conn.execute("UPDATE users SET status='disabled', status_by=NULL WHERE code='Z0000001'")
    conn.commit()
    r = login_client(app, "me").post("/admin/users/Z0000001/resume")
    assert r.status_code == 403 and r.json()["error"] == ADMIN_PAUSED

def test_admin_can_resume_agent_paused():
    conn, app, _ = setup()
    login_client(app, "me").post("/admin/users/Z0000001/pause")
    assert key_client(app).patch("/admin/users/Z0000001", json={"status": "active"}).status_code == 200
    assert status_of(conn) == ("active", None)

def test_admin_repause_takes_over_agent_pause():
    # 管理员对代理已暂停的账号再改成封禁：记录改为管理员，代理就不能再恢复
    conn, app, _ = setup()
    tc = login_client(app, "me")
    tc.post("/admin/users/Z0000001/pause")
    key_client(app).patch("/admin/users/Z0000001", json={"status": "banned"})
    assert status_of(conn) == ("banned", "admin")
    assert tc.post("/admin/users/Z0000001/resume").status_code == 403

def test_agent_pause_and_resume_state_errors():
    conn, app, _ = setup()
    tc = login_client(app, "me")
    r = tc.post("/admin/users/Z0000001/resume")
    assert r.status_code == 409 and r.json() == {"ok": False, "error": "账号未暂停"}
    tc.post("/admin/users/Z0000001/pause")
    r = tc.post("/admin/users/Z0000001/pause")
    assert r.status_code == 409 and r.json() == {"ok": False, "error": "账号已暂停或封禁"}
    assert len(audit(conn, "user.status")) == 1

def test_agent_cannot_touch_others_accounts():
    conn, app, _ = setup()
    mk_agent_raw(conn, "other")
    tc = login_client(app, "other")
    for op in ("pause", "resume"):
        r = tc.post(f"/admin/users/Z0000001/{op}")
        assert r.status_code == 404 and r.json() == {"ok": False, "error": "账号不存在"}
    assert status_of(conn) == ("active", None)

def test_parent_agent_cannot_resume_child_pause():
    # 代理只能操作本人名下账号：上级也不能恢复下级代理名下的账号
    conn, app = build_app()
    top = mk_agent_raw(conn, "top")
    kid = mk_agent_raw(conn, "kid", tier="junior", parent=top)
    db_segments.assign_segment(conn, kid, 1, 1, actor_type="admin", actor="root", now=NOW)
    login_client(app, "kid").post("/admin/users/Z0000001/pause")
    r = login_client(app, "top").post("/admin/users/Z0000001/resume")
    assert r.status_code == 404
    assert status_of(conn) == ("disabled", "agent")

def test_pause_and_resume_are_agent_only():
    conn, app, _ = setup()
    tc = key_client(app)
    assert tc.post("/admin/users/Z0000001/pause").status_code == 403
    assert tc.post("/admin/users/Z0000001/resume").status_code == 403

def test_agent_pause_stops_charging_and_activation_needs_resume():
    conn, app, _ = setup(2)
    tc = login_client(app, "me")
    assert tc.post("/admin/users/Z0000001/activate").status_code == 200
    conn.execute("UPDATE users SET next_charge_at=? WHERE code='Z0000001'", (NOW,))
    conn.commit()
    tc.post("/admin/users/Z0000001/pause")
    assert db.get_user_by_code(conn, "Z0000001").next_charge_at is None   # 暂停即停扣
    tc.post("/admin/users/Z0000002/pause")
    r = tc.post("/admin/users/Z0000002/activate")
    assert r.status_code == 409 and r.json()["error"] == "账号已封禁或暂停，需先恢复后再激活"
    tc.post("/admin/users/Z0000002/resume")
    assert tc.post("/admin/users/Z0000002/activate").status_code == 200
