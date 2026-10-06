# 积分账目完整性：回收代理退回预充积分、删除账号先记扣回流水、同编号重建不重复体验赠送。
from app import db, db_points, db_segments
from tests.agent_helpers import audit, build_app, mk_agent_raw, set_agent_status_raw
from tests.points_helpers import NOW, agent_points, ledger, points_of, set_agent_points_raw

def test_recycle_refunds_prepaid_points_to_the_recycled_agent():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A")
    b = mk_agent_raw(conn, "B")
    db_segments.assign_segment(conn, a, 1_000_001, 1_000_003, actor_type="admin", actor="root", now=NOW)
    set_agent_points_raw(conn, a, 500)
    db_points.recharge_user(conn, a, "1000001", 300, actor="A", now=NOW)
    db_points.recharge_user(conn, a, "1000002", 50, actor="A", now=NOW)
    assert agent_points(conn, a) == 150
    set_agent_status_raw(conn, a, "cancelled")
    db_segments.recycle_agent(conn, a, actor_type="admin", actor="root", now=NOW + 1)
    assert (points_of(conn, "1000001"), points_of(conn, "1000002"), agent_points(conn, a)) == (0, 0, 500)
    rows = ledger(conn, created_at=NOW + 1)
    assert [(r["holder_type"], r["holder_id"], r["delta"], r["kind"], r["reason"]) for r in rows] == [
        ("user", "1000001", -300, "transfer_out", "回收编号退回"),
        ("agent", str(a), 300, "transfer_in", "回收编号退回"),
        ("user", "1000002", -50, "transfer_out", "回收编号退回"),
        ("agent", str(a), 50, "transfer_in", "回收编号退回"),
    ]
    assert audit(conn, "agent.recycle")[0]["detail"]["refunded"] == 350
    # 再分配给 B：B 拿到的是余额为 0 的号
    db_segments.assign_segment(conn, b, 1_000_001, 1_000_003, actor_type="admin", actor="root", now=NOW + 2)
    assert points_of(conn, "1000001") == 0

def test_delete_user_revokes_balance_in_the_ledger_and_audits_atomically():
    conn, _ = build_app()
    db.create_user(conn, "ZED", "pw", None)
    db_points.staff_adjust(conn, "user", "ZED", "grant", 50, None, actor_type="admin", actor="root", now=NOW)
    assert db.delete_user(conn, "zed", actor_type="admin", actor="root", now=NOW + 1)
    last = ledger(conn, holder_id="ZED")[-1]
    assert (last["delta"], last["balance_after"], last["kind"], last["reason"], last["actor"]) == (
        -50, 0, "revoke", "删除账号", "root")
    [e] = audit(conn, "user.delete")
    assert (e["actor"], e["target"], e["detail"]) == ("root", "ZED", {"points": 50})
    assert db.delete_user(conn, "ZED") is False
    assert len(audit(conn, "user.delete")) == 1

def test_recreated_code_does_not_get_a_second_trial():
    conn, _ = build_app()
    db_points.set_trial_settings(conn, True, 7, actor_type="admin", actor="root", now=NOW)
    db.create_user(conn, "ZED", "x", None, pending=True)
    assert db.activate_user(conn, "ZED", NOW) == "ok"
    assert points_of(conn, "ZED") == 7
    db.delete_user(conn, "ZED", now=NOW + 1)
    db.create_user(conn, "ZED", "x", None, pending=True)
    assert db.activate_user(conn, "ZED", NOW + 2) == "ok"
    assert points_of(conn, "ZED") == 0
    assert [r["kind"] for r in ledger(conn, holder_id="ZED")] == ["trial", "revoke"]
