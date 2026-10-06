import pytest
from app import db, db_agents, db_segments
from app.db_agents import BizError
from app.security import verify_password
from tests.agent_helpers import (audit, build_app, key_client, login_client, mk_agent_raw,
                                 set_agent_status_raw)

NOW = 1_800_000_000

def assign(conn, agent_id, start, end):
    return db_segments.assign_segment(conn, agent_id, start, end, actor_type="admin", actor="root",
                                      now=NOW)

def owned(conn, agent_id):
    return [r["code"] for r in conn.execute("SELECT code FROM users WHERE agent_id=? ORDER BY code",
                                            (agent_id,))]

def biz(fn, *a, **k) -> BizError:
    with pytest.raises(BizError) as ei:
        fn(*a, **k)
    return ei.value

# ---------------- 号段校验 ----------------

@pytest.mark.parametrize("start,end,msg", [
    (999_999, 1_000_000, "编号必须是 1000000–9999999 之间的整数"),
    (9_999_999, 10_000_000, "编号必须是 1000000–9999999 之间的整数"),
    ("1000000", 1_000_001, "编号必须是 1000000–9999999 之间的整数"),
    (True, 1_000_001, "编号必须是 1000000–9999999 之间的整数"),
    (1_000_005, 1_000_004, "起始编号不能大于结束编号"),
    (1_000_000, 1_010_000, "单次最多 10000 个编号"),
])
def test_parse_range_rejects(start, end, msg):
    assert biz(db_segments.parse_range, start, end).msg == msg

def test_parse_range_accepts_bounds():
    assert db_segments.parse_range(1_000_000, 1_009_999) == (1_000_000, 1_009_999)
    assert db_segments.parse_range(9_999_999, 9_999_999) == (9_999_999, 9_999_999)

# ---------------- 分配 ----------------

def test_assign_creates_pending_accounts_with_initial_password():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag")
    assert assign(conn, aid, 1_000_000, 1_000_002) == {"count": 3, "created": 3, "reassigned": 0}
    assert owned(conn, aid) == ["1000000", "1000001", "1000002"]
    u = db.get_user_by_code(conn, "1000001")
    assert u.first_activated_at is None and u.activated_at is None and u.onboarded_at is None
    assert u.status == "active" and u.expires_at is None
    assert verify_password(db.INITIAL_PASSWORD, u.salt, u.password_hash)
    op = conn.execute("SELECT * FROM segment_ops").fetchone()
    assert (op["op"], op["start_no"], op["end_no"], op["count"], op["to_agent_id"], op["actor"]) == (
        "assign", 1_000_000, 1_000_002, 3, aid, "root")
    e = audit(conn, "segment.assign")[0]
    assert e["target"] == "1000000-1000002" and e["detail"] == {
        "agent": "ag", "count": 3, "created": 3, "reassigned": 0}

def test_assign_10000_in_one_go_shares_one_hash():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag")
    assert assign(conn, aid, 2_000_000, 2_009_999)["created"] == 10_000
    assert conn.execute("SELECT COUNT(DISTINCT salt) FROM users WHERE agent_id=?", (aid,)).fetchone()[0] == 1

def test_assign_conflict_rejects_whole_batch():
    conn, _ = build_app()
    a1 = mk_agent_raw(conn, "a1"); a2 = mk_agent_raw(conn, "a2")
    assign(conn, a1, 1_000_005, 1_000_006)
    db.create_user(conn, "1000008", "pw", None)               # 存量已激活的 7 位编号
    e = biz(assign, conn, a2, 1_000_000, 1_000_009)
    assert e.status == 409 and e.msg == "以下编号已存在，不能分配：1000005、1000006、1000008"
    assert owned(conn, a2) == []
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 3     # 无任何新建
    assert conn.execute("SELECT COUNT(*) FROM segment_ops").fetchone()[0] == 1

def test_assign_conflict_message_truncates():
    conn, _ = build_app()
    a1 = mk_agent_raw(conn, "a1"); a2 = mk_agent_raw(conn, "a2")
    assign(conn, a1, 1_000_000, 1_000_011)
    assert biz(assign, conn, a2, 1_000_000, 1_000_011).msg.endswith("1000009 等 12 个")

def test_assign_ignores_non_numeric_legacy_codes():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag")
    db.create_user(conn, "100000A", "pw", None)             # 字典序落在区间内但不是 7 位数字
    assert assign(conn, aid, 1_000_000, 1_009_999)["created"] == 10_000
    assert db.get_user_by_code(conn, "100000A").agent_id is None

def test_assign_reuses_unowned_pending_numbers():
    conn, _ = build_app()
    a1 = mk_agent_raw(conn, "a1"); a2 = mk_agent_raw(conn, "a2")
    assign(conn, a1, 1_000_000, 1_000_001)
    conn.execute("UPDATE users SET agent_id=NULL"); conn.commit()   # 模拟回收后的号
    assert assign(conn, a2, 1_000_000, 1_000_002) == {"count": 3, "created": 1, "reassigned": 2}
    assert owned(conn, a2) == ["1000000", "1000001", "1000002"]

def test_assign_requires_active_agent():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag", status="paused")
    e = biz(assign, conn, aid, 1_000_000, 1_000_000)
    assert e.status == 409 and e.msg == "代理资格不是激活状态，不能分配"
    assert biz(assign, conn, 999, 1_000_000, 1_000_000).status == 404

def test_assign_route_staff_only():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag")
    r = key_client(app).post("/admin/segments/assign", json={"agent_id": aid, "start": 1_000_000,
                                                               "end": 1_000_009})
    assert r.status_code == 200 and r.json() == {"ok": True, "count": 10, "created": 10, "reassigned": 0}
    r = key_client(app).post("/admin/segments/assign", json={"agent_id": aid, "start": 1, "end": 2})
    assert r.status_code == 400 and r.json()["error"] == "编号必须是 1000000–9999999 之间的整数"
    r = login_client(app, "ag").post("/admin/segments/assign",
                                     json={"agent_id": aid, "start": 1_000_100, "end": 1_000_100})
    assert r.status_code == 403

# ---------------- 划拨 ----------------

def setup_tree(conn):
    top = mk_agent_raw(conn, "top")
    kid = mk_agent_raw(conn, "kid", tier="senior", parent=top)
    grand = mk_agent_raw(conn, "grand", tier="junior", parent=kid)
    assign(conn, top, 1_000_000, 1_000_009)
    return top, kid, grand

def test_senior_transfers_own_pending_range_to_direct_child():
    conn, app = build_app()
    top, kid, _ = setup_tree(conn)
    r = login_client(app, "top").post("/admin/segments/transfer",
                                      json={"to_agent_id": kid, "start": 1_000_002, "end": 1_000_004})
    assert r.status_code == 200 and r.json() == {"ok": True, "count": 3}
    assert owned(conn, kid) == ["1000002", "1000003", "1000004"]
    op = conn.execute("SELECT * FROM segment_ops WHERE op='transfer'").fetchone()
    assert (op["from_agent_id"], op["to_agent_id"], op["count"], op["actor"]) == (top, kid, 3, "top")
    e = audit(conn, "segment.transfer")[0]
    assert e["actor_type"] == "agent" and e["actor"] == "top"
    assert e["detail"] == {"from": "top", "to": "kid", "count": 3}

def test_transfer_scope_rules():
    conn, app = build_app()
    top, kid, grand = setup_tree(conn)
    tc = login_client(app, "top")
    body = lambda to, s, e: {"to_agent_id": to, "start": s, "end": e}
    r = tc.post("/admin/segments/transfer", json=body(grand, 1_000_000, 1_000_000))
    assert r.status_code == 400 and r.json()["error"] == "只能划拨给自己的直属下级"
    r = tc.post("/admin/segments/transfer", json=body(kid, 1_000_008, 1_000_011))
    assert r.status_code == 409 and r.json()["error"] == "以下编号不在你名下或已激活，不能划拨：1000010、1000011"
    db.activate_user(conn, "1000005", NOW)
    r = tc.post("/admin/segments/transfer", json=body(kid, 1_000_005, 1_000_005))
    assert r.status_code == 409
    set_agent_status_raw(conn, kid, "paused")
    r = tc.post("/admin/segments/transfer", json=body(kid, 1_000_000, 1_000_000))
    assert r.status_code == 409 and r.json()["error"] == "下级代理资格不是激活状态，不能划拨"
    assert owned(conn, kid) == []

def test_transfer_irreversible_and_junior_cannot_transfer():
    conn, app = build_app()
    top, kid, grand = setup_tree(conn)
    login_client(app, "top").post("/admin/segments/transfer",
                                  json={"to_agent_id": kid, "start": 1_000_000, "end": 1_000_001})
    kid_tc = login_client(app, "kid")
    r = kid_tc.post("/admin/segments/transfer", json={"to_agent_id": top, "start": 1_000_000,
                                                       "end": 1_000_001})
    assert r.status_code == 400                                   # 上级不是自己的下级：划不回去
    kid_tc.post("/admin/segments/transfer", json={"to_agent_id": grand, "start": 1_000_000,
                                                   "end": 1_000_000})
    r = login_client(app, "grand").post("/admin/segments/transfer",
                                        json={"to_agent_id": kid, "start": 1_000_000, "end": 1_000_000})
    assert r.status_code == 403 and r.json()["error"] == "只有高级代理可以划拨编号"

def test_staff_cannot_transfer():
    conn, app = build_app()
    top, kid, _ = setup_tree(conn)
    r = key_client(app).post("/admin/segments/transfer",
                             json={"to_agent_id": kid, "start": 1_000_000, "end": 1_000_000})
    assert r.status_code == 403 and r.json() == {"error": "forbidden"}

# ---------------- 回收 ----------------

def test_recycle_only_cancelled_and_effects():
    conn, app = build_app()
    top, kid, grand = setup_tree(conn)
    db.activate_user(conn, "1000000", NOW)
    tc = key_client(app)
    r = tc.post(f"/admin/agents/{top}/recycle")
    assert r.status_code == 409 and r.json()["error"] == "只能回收资格已取消的代理"
    db_agents.set_agent_status(conn, top, "cancelled", "退出", actor_type="admin", actor="r", now=NOW)
    r = tc.post(f"/admin/agents/{top}/recycle")
    assert r.status_code == 200 and r.json() == {"ok": True, "count": 9, "children": 1}
    assert owned(conn, top) == ["1000000"]                         # 已激活的保持原归属
    assert db.get_user_by_code(conn, "1000001").agent_id is None
    assert db_agents.get_agent(conn, kid).parent_agent_id is None
    assert db_agents.get_agent(conn, top).recycled_at is not None
    op = conn.execute("SELECT * FROM segment_ops WHERE op='recycle'").fetchone()
    assert (op["start_no"], op["end_no"], op["count"], op["from_agent_id"]) == (1_000_001, 1_000_009, 9, top)
    assert audit(conn, "agent.recycle")[0]["detail"] == {"count": 9, "children": [kid]}
    assert tc.post(f"/admin/agents/{top}/recycle").json()["error"] == "该代理已回收"
    r = tc.post(f"/admin/agents/{top}/status", json={"status": "active", "reason": "回来"})
    assert r.status_code == 409 and r.json()["error"] == "该代理已回收，不能恢复"
    assert assign(conn, kid, 1_000_001, 1_000_009)["reassigned"] == 9     # 回收后的号可再分配

def test_recycle_forbidden_for_agent():
    conn, app = build_app()
    top, kid, _ = setup_tree(conn)
    assert login_client(app, "top").post(f"/admin/agents/{kid}/recycle").status_code == 403

# ---------------- 流水 ----------------

def test_segment_ops_scope():
    conn, app = build_app()
    top, kid, _ = setup_tree(conn)
    other = mk_agent_raw(conn, "other")
    assign(conn, other, 3_000_000, 3_000_000)
    login_client(app, "top").post("/admin/segments/transfer",
                                  json={"to_agent_id": kid, "start": 1_000_000, "end": 1_000_000})
    all_ops = key_client(app).get("/admin/segment-ops").json()
    assert all_ops["total"] == 3 and all_ops["ops"][0]["op"] == "transfer"
    assert all_ops["ops"][0]["from_name"] == "top" and all_ops["ops"][0]["to_name"] == "kid"
    assert key_client(app).get("/admin/segment-ops", params={"agent_id": other}).json()["total"] == 1
    mine = login_client(app, "kid").get("/admin/segment-ops", params={"agent_id": other}).json()
    assert mine["total"] == 1 and mine["ops"][0]["op"] == "transfer"
    assert key_client(app).get("/admin/segment-ops", params={"agent_id": "x"}).status_code == 400
