import pytest
from fastapi.testclient import TestClient
from app import db, db_points
from app.db_agents import BizError
from tests.agent_helpers import (audit, build_app, key_client, login_client, mk_admin, mk_agent_raw,
                                 set_agent_status_raw)
from tests.points_helpers import (NOW, activated_user, agent_points, ledger, points_of,
                                  set_agent_points_raw)

def biz(fn, *a, **k) -> BizError:
    with pytest.raises(BizError) as ei:
        fn(*a, **k)
    return ei.value

def staff(conn, holder_type, holder, op, amount, reason=None):
    return db_points.staff_adjust(conn, holder_type, holder, op, amount, reason, actor_type="admin",
                                  actor="root", now=NOW)

def own(conn, agent_id, *codes, pending=True):
    """建账号并归属到代理名下（默认待激活）。"""
    for c in codes:
        db.create_user(conn, c, "pw", None, pending=pending)
        conn.execute("UPDATE users SET agent_id=? WHERE code=?", (agent_id, c))
    conn.commit()

# ---------------- 参数 ----------------

@pytest.mark.parametrize("v", [0, -1, 100_001, True, 1.5, "5", None])
def test_amount_must_be_1_to_100000(v):
    assert biz(db_points.check_amount, v).msg == "积分数量需为 1–100000 的整数"

def test_amount_bounds_accepted():
    assert db_points.check_amount(1) == 1 and db_points.check_amount(100_000) == 100_000

def test_reason_rules():
    assert db_points.check_reason(None, required=False) is None
    assert db_points.check_reason("  ", required=False) is None
    assert db_points.check_reason(" 补偿 ", required=True) == "补偿"
    assert biz(db_points.check_reason, " ", required=True).msg == "请填写扣分原因"
    assert biz(db_points.check_reason, "x" * 201, required=False).msg == "原因不能超过200字"
    assert biz(db_points.check_reason, 5, required=False).msg == "原因取值无效"

# ---------------- 后台人员加分 / 扣分 ----------------

def test_staff_grant_user_creates_points_from_nothing():
    conn, _ = build_app()
    activated_user(conn, "U1")
    assert staff(conn, "user", "u1", "grant", 30, "首充") == {"amount": 30, "balance": 30}
    [row] = ledger(conn)
    assert (row["kind"], row["delta"], row["counterparty_type"], row["reason"]) == ("grant", 30, None, "首充")
    [e] = audit(conn, "points.grant")
    assert (e["actor_type"], e["actor"], e["target"]) == ("admin", "root", "U1")
    assert e["detail"] == {"holder_type": "user", "amount": 30, "balance": 30, "reason": "首充"}
    assert [x["target"] for x in audit(conn, "points.resumed")] == ["U1"]      # 已激活账号 0 → >0

def test_staff_grant_pending_account_is_precharge_without_resume_audit():
    conn, _ = build_app()
    db.create_user(conn, "P1", "pw", None, pending=True)
    staff(conn, "user", "P1", "grant", 5)
    assert points_of(conn, "P1") == 5 and audit(conn, "points.resumed") == []

def test_staff_revoke_requires_reason_and_clamps_at_zero():
    conn, _ = build_app()
    activated_user(conn, "U1", 3)
    assert biz(staff, conn, "user", "U1", "revoke", 1).msg == "请填写扣分原因"
    assert staff(conn, "user", "U1", "revoke", 10, "违规") == {"amount": 3, "balance": 0}
    row = ledger(conn)[-1]
    assert (row["kind"], row["delta"], row["balance_after"], row["reason"]) == ("revoke", -3, 0, "违规")
    [e] = audit(conn, "points.revoke")
    assert e["detail"] == {"holder_type": "user", "amount": 3, "balance": 0, "requested": 10, "reason": "违规"}
    assert [x["target"] for x in audit(conn, "points.suspended")] == ["U1"]
    e2 = biz(staff, conn, "user", "U1", "revoke", 1, "再扣")
    assert (e2.status, e2.msg) == (409, "余额为 0，无可扣积分")

def test_staff_adjust_agent_and_missing_targets():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag")
    assert staff(conn, "agent", aid, "grant", 100) == {"amount": 100, "balance": 100}
    assert staff(conn, "agent", aid, "revoke", 40, "回收") == {"amount": 40, "balance": 60}
    assert [e["target"] for e in audit(conn, "points.grant")] == ["ag"]
    assert ledger(conn)[0]["holder_id"] == str(aid)
    e = biz(staff, conn, "user", "NOPE", "grant", 1)
    assert (e.status, e.msg) == (404, "账号不存在")
    e = biz(staff, conn, "agent", 999, "grant", 1)
    assert (e.status, e.msg) == (404, "代理不存在")
    assert biz(staff, conn, "agent", 2 ** 63, "grant", 1).status == 404

def test_staff_grant_requires_active_agent():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag", status="paused")
    e = biz(staff, conn, "agent", aid, "grant", 1)
    assert (e.status, e.msg) == (409, "代理资格不是激活状态，不能加分")
    set_agent_points_raw(conn, aid, 5)
    assert staff(conn, "agent", aid, "revoke", 5, "清零")["balance"] == 0      # 扣分不受资格限制

# ---------------- 代理转分 ----------------

def test_senior_transfers_to_direct_child():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A"); b = mk_agent_raw(conn, "B", tier="junior", parent=a)
    set_agent_points_raw(conn, a, 50)
    assert db_points.transfer_to_agent(conn, a, b, 20, actor="A", now=NOW) == {"amount": 20, "balance": 30}
    assert (agent_points(conn, a), agent_points(conn, b)) == (30, 20)
    out, inn = ledger(conn)
    assert (out["holder_id"], out["kind"], out["delta"], out["counterparty_type"], out["counterparty_id"]) == (
        str(a), "transfer_out", -20, "agent", str(b))
    assert (inn["holder_id"], inn["kind"], inn["delta"], inn["counterparty_id"]) == (str(b), "transfer_in", 20, str(a))
    [e] = audit(conn, "points.transfer")
    assert (e["actor_type"], e["target"], e["detail"]) == ("agent", "B", {"from": "A", "to": "B", "amount": 20, "balance": 30})

def test_transfer_only_to_direct_child_not_grandchild():
    # 需求回复第 7 条：上下级转分只到直属下级，隔层（下级的下级）不行
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A"); b = mk_agent_raw(conn, "B", parent=a)
    g = mk_agent_raw(conn, "G", tier="junior", parent=b)
    set_agent_points_raw(conn, a, 10)
    t = lambda f, to, n: db_points.transfer_to_agent(conn, f, to, n, actor="x", now=NOW)
    assert biz(t, a, g, 1).msg == "只能转给自己的直属下级"
    t(a, b, 1)
    t(b, g, 1)

def test_transfer_rules():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A"); b = mk_agent_raw(conn, "B", tier="junior", parent=a)
    other = mk_agent_raw(conn, "O"); c = mk_agent_raw(conn, "C", tier="junior", parent=other)
    set_agent_points_raw(conn, a, 10); set_agent_points_raw(conn, b, 10)
    t = lambda f, to, n: db_points.transfer_to_agent(conn, f, to, n, actor="x", now=NOW)
    e = biz(t, b, a, 1)                                  # 低级不能转、也不能转回上级
    assert (e.status, e.msg) == (403, "只有高级代理可以转积分")
    assert biz(t, a, c, 1).msg == "只能转给自己的直属下级"
    assert biz(t, a, a, 1).msg == "只能转给自己的直属下级"
    assert biz(t, a, 2 ** 63, 1).msg == "只能转给自己的直属下级"
    e = biz(t, a, b, 11)
    assert (e.status, e.msg) == (409, "积分余额不足")
    set_agent_status_raw(conn, b, "paused")
    e = biz(t, a, b, 1)
    assert (e.status, e.msg) == (409, "下级代理资格不是激活状态，不能转积分")
    assert (agent_points(conn, a), agent_points(conn, b), ledger(conn)) == (10, 10, [])

# ---------------- 代理给本人名下账号充值 ----------------

def test_agent_recharges_own_account_including_pending():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A", tier="junior")
    own(conn, a, "1000000")
    set_agent_points_raw(conn, a, 10)
    assert db_points.recharge_user(conn, a, "1000000", 7, actor="A", now=NOW) == {"amount": 7, "balance": 3}
    assert points_of(conn, "1000000") == 7
    out, inn = ledger(conn)
    assert (out["kind"], out["counterparty_type"], out["counterparty_id"]) == ("transfer_out", "user", "1000000")
    assert (inn["holder_type"], inn["kind"], inn["counterparty_id"]) == ("user", "transfer_in", str(a))
    [e] = audit(conn, "points.recharge")
    assert (e["target"], e["detail"]) == ("1000000", {"agent": "A", "amount": 7, "balance": 7})

def test_recharge_rules():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A"); o = mk_agent_raw(conn, "O")
    own(conn, a, "1000000"); own(conn, o, "1000001")
    set_agent_points_raw(conn, a, 5)
    r = lambda code, n: db_points.recharge_user(conn, a, code, n, actor="A", now=NOW)
    e = biz(r, "1000001", 1)                             # 他人名下账号按不存在处理
    assert (e.status, e.msg) == (404, "账号不存在")
    assert biz(r, "NOPE", 1).status == 404
    assert biz(r, "1000000", 6).msg == "积分余额不足"
    assert ledger(conn) == [] and agent_points(conn, a) == 5

def test_recharge_resumes_arrears_account():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A")
    activated_user(conn, "1000000")
    conn.execute("UPDATE users SET agent_id=? WHERE code='1000000'", (a,)); conn.commit()
    set_agent_points_raw(conn, a, 5)
    db_points.recharge_user(conn, a, "1000000", 2, actor="A", now=NOW)
    [e] = audit(conn, "points.resumed")
    assert (e["actor_type"], e["actor"], e["target"]) == ("agent", "A", "1000000")

# ---------------- 批量充值 ----------------

def batch(conn, codes, amount, *, agent_id=None, actor="root"):
    return db_points.batch_recharge(conn, codes, amount, None, actor_type="agent" if agent_id else "admin",
                                    actor=actor, agent_id=agent_id, now=NOW)

def test_staff_batch_grants_each_account_same_amount():
    conn, _ = build_app()
    for c in ("U1", "U2"):
        activated_user(conn, c)
    res = batch(conn, ["u1", "U2", "u1"], 30)                  # 去重
    assert (res["count"], res["total"], res["balance"]) == (2, 60, None)
    assert (points_of(conn, "U1"), points_of(conn, "U2")) == (30, 30)
    rows = ledger(conn)
    assert [(r["holder_id"], r["kind"], r["batch_id"]) for r in rows] == [
        ("U1", "grant", res["batch_id"]), ("U2", "grant", res["batch_id"])]
    [e] = audit(conn, "points.batch")
    assert (e["target"], e["detail"]) == (res["batch_id"], {"count": 2, "amount": 30, "total": 60, "codes": ["U1", "U2"]})

def test_batch_all_or_nothing_on_missing_account():
    conn, _ = build_app()
    activated_user(conn, "U1")
    e = biz(batch, conn, ["U1", "X1", "X2"], 5)
    assert (e.status, e.msg) == (404, "以下账号不存在：X1、X2")
    assert points_of(conn, "U1") == 0 and ledger(conn) == []

def test_agent_batch_checks_total_and_ownership():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A"); o = mk_agent_raw(conn, "O")
    own(conn, a, "1000000", "1000001"); own(conn, o, "1000002")
    set_agent_points_raw(conn, a, 19)
    e = biz(batch, conn, ["1000000", "1000001"], 10, agent_id=a, actor="A")
    assert (e.status, e.msg) == (409, "积分余额不足（需要 20，当前 19）")
    assert biz(batch, conn, ["1000000", "1000002"], 1, agent_id=a, actor="A").msg == "以下账号不存在：1000002"
    res = batch(conn, ["1000000", "1000001"], 9, agent_id=a, actor="A")
    assert (res["count"], res["total"], res["balance"]) == (2, 18, 1)
    assert [r["kind"] for r in ledger(conn)] == ["transfer_out", "transfer_in", "transfer_out", "transfer_in"]
    assert {r["batch_id"] for r in ledger(conn)} == {res["batch_id"]}
    assert audit(conn, "points.batch")[0]["actor_type"] == "agent"

@pytest.mark.parametrize("codes,msg", [
    ([], "一次最多给 1000 个账号充值"),
    ("U1", "账号列表无效"),
    (["U1", 5], "账号列表无效"),
    (["U1", " "], "账号列表无效"),
    ([f"C{i}" for i in range(1001)], "一次最多给 1000 个账号充值"),
])
def test_batch_validates_codes(codes, msg):
    conn, _ = build_app()
    assert biz(batch, conn, codes, 1).msg == msg

def test_batch_1000_accounts_in_one_go():
    conn, _ = build_app()
    codes = [str(1_000_000 + i) for i in range(1000)]
    conn.executemany("INSERT INTO users(code,password_hash,salt,status,created_at) VALUES(?, 'h', 's', 'active', 0)",
                     [(c,) for c in codes])
    conn.commit()
    assert batch(conn, codes, 3)["total"] == 3000
    assert conn.execute("SELECT SUM(points) FROM users").fetchone()[0] == 3000

# ---------------- 流水查询 ----------------

def test_list_ledger_filters_and_agent_scope():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A"); b = mk_agent_raw(conn, "B", tier="junior", parent=a)
    own(conn, a, "1000000")
    activated_user(conn, "U9")
    staff(conn, "agent", a, "grant", 100)
    db_points.transfer_to_agent(conn, a, b, 10, actor="A", now=NOW + 10)
    db_points.recharge_user(conn, a, "1000000", 5, actor="A", now=NOW + 20)
    staff(conn, "user", "U9", "grant", 1)
    rows, total = db_points.list_ledger(conn, 50, 0)
    assert total == 6 and rows[0]["holder_id"] == "U9"          # 新 → 旧
    rows, total = db_points.list_ledger(conn, 50, 0, agent_id=a, hide_staff=True)
    # 代理视图只含本人作为持有方的流水：grant、transfer_out、recharge 的代理侧（不含用户侧入账行）
    assert total == 3 and all(r["holder_type"] == "agent" and r["holder_id"] == str(a) for r in rows)
    grant = [r for r in rows if r["kind"] == "grant"][0]
    assert (grant["holder_name"], grant["actor"]) == ("A", "后台")
    rows, total = db_points.list_ledger(conn, 50, 0, agent_id=b)
    [tin] = rows
    assert total == 1 and (tin["kind"], tin["holder_name"], tin["counterparty_name"]) == ("transfer_in", "B", "A")
    assert db_points.list_ledger(conn, 50, 0, holder_type="user", holder_id="1000000")[1] == 1
    assert db_points.list_ledger(conn, 50, 0, kind="transfer_out")[1] == 2
    assert db_points.list_ledger(conn, 50, 0, since=NOW + 10, until=NOW + 20)[1] == 4

def test_agent_ledger_view_never_shows_other_agents_rows_or_balances():
    conn, _ = build_app()
    a = mk_agent_raw(conn, "A"); b = mk_agent_raw(conn, "B", tier="junior", parent=a)
    set_agent_points_raw(conn, a, 50000)
    db_points.transfer_to_agent(conn, a, b, 10, actor="A", now=NOW + 10)
    rows, total = db_points.list_ledger(conn, 50, 0, agent_id=b)
    assert total == 1 and rows[0]["kind"] == "transfer_in" and rows[0]["holder_id"] == str(b)
    assert all(r["kind"] != "transfer_out" for r in rows)
    assert 50000 not in [r["balance_before"] for r in rows] and 49990 not in [r["balance_after"] for r in rows]
    assert (rows[0]["balance_before"], rows[0]["balance_after"]) == (0, 10)    # 只看得到自己的余额
    rows, total = db_points.list_ledger(conn, 50, 0, agent_id=a)             # 上级看自己的转出行
    assert total == 1 and (rows[0]["kind"], rows[0]["balance_before"], rows[0]["balance_after"]) == ("transfer_out", 50000, 49990)

# ---------------- 路由与权限 ----------------

def test_routes_staff_grant_revoke_and_forbidden_for_agent():
    conn, app = build_app()
    activated_user(conn, "U1")
    a = mk_agent_raw(conn, "A")
    tc = key_client(app)
    r = tc.post("/admin/users/u1/points/grant", json={"amount": 5})
    assert r.status_code == 200 and r.json() == {"ok": True, "amount": 5, "balance": 5}
    r = tc.post("/admin/users/U1/points/revoke", json={"amount": 1})
    assert r.status_code == 400 and r.json() == {"ok": False, "error": "请填写扣分原因"}
    assert tc.post(f"/admin/agents/{a}/points/grant", json={"amount": 3}).json()["balance"] == 3
    assert tc.post(f"/admin/agents/{a}/points/revoke", json={"amount": 3, "reason": "x"}).json()["balance"] == 0
    assert tc.post("/admin/agents/999/points/grant", json={"amount": 3}).status_code == 404
    assert tc.post(f"/admin/agents/{2 ** 63}/points/grant", json={"amount": 3}).status_code == 404
    ag = login_client(app, "A")
    for path in ("/admin/users/U1/points/grant", "/admin/users/U1/points/revoke",
                 f"/admin/agents/{a}/points/grant", f"/admin/agents/{a}/points/revoke"):
        r = ag.post(path, json={"amount": 1, "reason": "x"})
        assert (r.status_code, r.json()) == (403, {"error": "forbidden"}), path

def test_routes_agent_recharge_transfer_and_staff_forbidden():
    conn, app = build_app()
    a = mk_agent_raw(conn, "A"); b = mk_agent_raw(conn, "B", tier="junior", parent=a)
    own(conn, a, "1000000")
    set_agent_points_raw(conn, a, 10)
    ag = login_client(app, "A")
    assert ag.post("/admin/users/1000000/points/recharge", json={"amount": 2}).json() == {
        "ok": True, "amount": 2, "balance": 8}
    assert ag.post(f"/admin/agents/{b}/points/transfer", json={"amount": 3}).json() == {
        "ok": True, "amount": 3, "balance": 5}
    r = login_client(app, "B").post(f"/admin/agents/{a}/points/transfer", json={"amount": 1})
    assert (r.status_code, r.json()) == (403, {"ok": False, "error": "只有高级代理可以转积分"})
    mk_admin(conn, "boss", role="admin")
    st = login_client(app, "boss")
    assert st.post("/admin/users/1000000/points/recharge", json={"amount": 1}).status_code == 403
    assert st.post(f"/admin/agents/{b}/points/transfer", json={"amount": 1}).status_code == 403
    assert TestClient(app).post("/admin/points/batch-recharge", json={}).status_code == 403

def test_routes_batch_and_ledger_scope():
    conn, app = build_app()
    a = mk_agent_raw(conn, "A")
    own(conn, a, "1000000", "1000001")
    activated_user(conn, "U9")
    tc = key_client(app)
    r = tc.post("/admin/points/batch-recharge", json={"codes": ["1000000", "U9"], "amount": 4})
    assert r.json()["ok"] is True and r.json()["count"] == 2 and r.json()["balance"] is None
    set_agent_points_raw(conn, a, 10)
    ag = login_client(app, "A")
    r = ag.post("/admin/points/batch-recharge", json={"codes": ["1000000", "U9"], "amount": 1})
    assert (r.status_code, r.json()["error"]) == (404, "以下账号不存在：U9")
    r = ag.post("/admin/points/batch-recharge", json={"codes": ["1000000", "1000001"], "amount": 1})
    assert r.json()["balance"] == 8
    d = tc.get("/admin/points/ledger").json()
    assert d["total"] == 6 and len(d["ledger"]) == 6
    d = ag.get("/admin/points/ledger").json()
    assert d["total"] == 2 and all((x["holder_type"], x["holder_id"]) == ("agent", str(a)) for x in d["ledger"])
    assert tc.get("/admin/points/ledger?holder_type=user&holder_id=u9").json()["total"] == 1
    assert tc.get("/admin/points/ledger?kind=grant&limit=1").json()["total"] == 2
    for qs in ("kind=bogus", "holder_type=x", "holder_id=U9", "since=abc", "offset=-1", f"until={2 ** 63}"):
        r = tc.get("/admin/points/ledger?" + qs)
        assert (r.status_code, r.json()) == (400, {"ok": False, "error": "参数无效"}), qs
