# 积分（子项目 C）：数据层。余额在 users.points / agents.points，流水在 points_ledger，设置在 settings。
# 表结构在 db.init_db 中统一创建。所有余额变化都在调用方的 BEGIN IMMEDIATE 事务内经 apply_delta_nocommit 完成。
import json
import secrets
from . import db
from .db_agents import BizError, begin_write, get_agent

HOLDER_TYPES = ("user", "agent")
KINDS = ("trial", "grant", "revoke", "transfer_out", "transfer_in", "charge")
CHARGE_PERIOD = 86400                 # 首次扣减延迟与扣减周期，固定 24 小时
TRIAL_DEFAULTS = {"trial_enabled": False, "trial_points": 7}
TRIAL_POINTS_MIN, TRIAL_POINTS_MAX = 1, 100
SYSTEM_ACTOR = "system"               # actor_type=system 时的操作者：每日扣减 / 体验赠送
NO_BALANCE = "积分余额不足"
MAX_AMOUNT = 100_000                  # 单笔上限
MAX_BATCH = 1000                      # 批量充值一次最多账号数
REASON_MAX = 200
STAFF_ACTOR_LABEL = "后台"            # 代理视图里替代后台人员用户名的显示（与号段流水一致）

# ---------------- 余额与流水原语 ----------------

def _locate(conn, holder_type: str, holder_id: str):
    """返回 (表名, 主键列, 主键值, 当前行)；不存在返回行为 None。用户按账号编号（大写），代理按 agent id。"""
    if holder_type == "user":
        key = holder_id.upper()
        return "users", "code", key, conn.execute("SELECT * FROM users WHERE code=?", (key,)).fetchone()
    if holder_type == "agent":
        key = int(holder_id)
        if not db.valid_id(key):
            return "agents", "id", key, None
        return "agents", "id", key, conn.execute("SELECT * FROM agents WHERE id=?", (key,)).fetchone()
    raise ValueError(f"unknown holder_type {holder_type!r}")

def apply_delta_nocommit(conn, holder_type: str, holder_id: str, delta: int, kind: str, *,
                         actor_type: str, actor: str, now: int, counterparty_type: str | None = None,
                         counterparty_id: str | None = None, reason: str | None = None,
                         batch_id: str | None = None, cycle_key: int | None = None) -> tuple[int, int]:
    """在调用方已开启的写事务内改余额并写一条流水，返回 (变化前, 变化后)。
    holder_id：用户为账号编号，代理为 agent id 的字符串。结果为负 → BizError 409「积分余额不足」（不写任何东西）。"""
    if kind not in KINDS:
        raise ValueError(f"unknown kind {kind!r}")
    table, col, key, row = _locate(conn, holder_type, holder_id)
    if row is None:
        raise BizError("账号不存在" if holder_type == "user" else "代理不存在", 404)
    before = row["points"]
    after = before + delta
    if after < 0:
        raise BizError(NO_BALANCE, 409)
    conn.execute(f"UPDATE {table} SET points=? WHERE {col}=?", (after, key))
    conn.execute(
        "INSERT INTO points_ledger(holder_type,holder_id,delta,balance_before,balance_after,kind,"
        "counterparty_type,counterparty_id,actor_type,actor,reason,batch_id,cycle_key,created_at)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (holder_type, str(key), delta, before, after, kind, counterparty_type, counterparty_id,
         actor_type, actor, reason, batch_id, cycle_key, now))
    return before, after

def note_user_transition_nocommit(conn, code: str, before: int, after: int, *, actor_type: str,
                                  actor: str, now: int) -> None:
    """已激活账号余额 >0 → 0 写审计 points.suspended；0 → >0 写 points.resumed（积分暂停由余额推导，不另存状态）。
    未激活账号（预充值）不写。只解除积分暂停，不改变 status。"""
    r = conn.execute("SELECT first_activated_at FROM users WHERE code=?", (code.upper(),)).fetchone()
    if r is None or r["first_activated_at"] is None:
        return
    if before > 0 and after == 0:
        db._audit_nocommit(conn, actor_type, actor, "points.suspended", code.upper(), {}, now)
    elif before == 0 and after > 0:
        db._audit_nocommit(conn, actor_type, actor, "points.resumed", code.upper(), {"balance": after}, now)

def purge_old_ledger(conn, now: int) -> int:
    """流水与审计日志一样保留三年（db.AUDIT_RETENTION_SEC），由每日维护清理。"""
    cur = conn.execute("DELETE FROM points_ledger WHERE created_at < ?", (now - db.AUDIT_RETENTION_SEC,))
    conn.commit()
    return cur.rowcount

# ---------------- 体验期设置 ----------------

def get_trial_settings(conn) -> dict:
    rows = {r["key"]: json.loads(r["value"]) for r in conn.execute(
        "SELECT key, value FROM settings WHERE key IN ('trial_enabled','trial_points')")}
    return {"trial_enabled": bool(rows.get("trial_enabled", TRIAL_DEFAULTS["trial_enabled"])),
            "trial_points": int(rows.get("trial_points", TRIAL_DEFAULTS["trial_points"]))}

def set_trial_settings(conn, enabled, points, *, actor_type: str, actor: str, now: int) -> dict:
    """修改体验期开关与赠送分数（1–100）；只影响此后首次激活的账号，不补发、不追溯。值有变化才写审计。"""
    if not isinstance(enabled, bool):
        raise BizError("体验期开关取值无效")
    if not (isinstance(points, int) and not isinstance(points, bool)
            and TRIAL_POINTS_MIN <= points <= TRIAL_POINTS_MAX):
        raise BizError("体验赠送分数需为 1–100 的整数")
    new = {"trial_enabled": enabled, "trial_points": points}
    begin_write(conn)
    try:
        old = get_trial_settings(conn)
        for k, v in new.items():
            conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", (k, json.dumps(v)))
        if new != old:
            db._audit_nocommit(conn, actor_type, actor, "settings.trial", "trial", {"from": old, "to": new}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return new

# ---------------- 参数校验 ----------------

def check_amount(v) -> int:
    if not (isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= MAX_AMOUNT):
        raise BizError("积分数量需为 1–100000 的整数")
    return v

def check_reason(v, *, required: bool) -> str | None:
    if v is None or (isinstance(v, str) and not v.strip()):
        if required:
            raise BizError("请填写扣分原因")
        return None
    if not isinstance(v, str):
        raise BizError("原因取值无效")
    v = v.strip()
    if len(v) > REASON_MAX:
        raise BizError("原因不能超过200字")
    return v

def _user_row(conn, code):
    r = conn.execute("SELECT * FROM users WHERE code=?", (code.upper(),)).fetchone() \
        if isinstance(code, str) else None
    if r is None:
        raise BizError("账号不存在", 404)
    return r

def _agent(conn, agent_id):
    a = get_agent(conn, agent_id) if isinstance(agent_id, int) and not isinstance(agent_id, bool) else None
    if a is None:
        raise BizError("代理不存在", 404)
    return a

def _fmt_codes(codes: list[str]) -> str:
    head = "、".join(codes[:10])
    return head + (f" 等 {len(codes)} 个" if len(codes) > 10 else "")

# ---------------- 后台人员：加分 / 扣分 ----------------

def staff_adjust(conn, holder_type: str, holder, op: str, amount, reason, *, actor_type: str,
                 actor: str, now: int) -> dict:
    """后台人员给账号（holder=编号）或代理（holder=agent id）加分（凭空增加）/ 扣分（原因必填，最多扣到 0）。
    返回 {"amount": 实际变化量（正数）, "balance": 变化后余额}。"""
    if op not in ("grant", "revoke"):
        raise ValueError(op)
    amount = check_amount(amount)
    reason = check_reason(reason, required=op == "revoke")
    begin_write(conn)
    try:
        if holder_type == "user":
            row = _user_row(conn, holder)
            hid, target, before = row["code"], row["code"], row["points"]
        else:
            a = _agent(conn, holder)
            if op == "grant" and a.status != "active":
                raise BizError("代理资格不是激活状态，不能加分", 409)
            hid, target, before = str(a.id), a.name, a.points
        if op == "revoke" and before == 0:
            raise BizError("余额为 0，无可扣积分", 409)
        delta = amount if op == "grant" else -min(amount, before)     # 扣分最多扣到 0
        before, after = apply_delta_nocommit(conn, holder_type, hid, delta, op, actor_type=actor_type,
                                             actor=actor, now=now, reason=reason)
        if holder_type == "user":
            note_user_transition_nocommit(conn, hid, before, after, actor_type=actor_type, actor=actor, now=now)
        detail = {"holder_type": holder_type, "amount": abs(delta), "balance": after}
        if op == "revoke" and abs(delta) != amount:
            detail["requested"] = amount
        if reason is not None:
            detail["reason"] = reason
        db._audit_nocommit(conn, actor_type, actor, f"points.{op}", target, detail, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"amount": abs(delta), "balance": after}

# ---------------- 代理：转分给直属下级 / 给本人名下账号充值 ----------------

def _transfer_pair(conn, from_type, from_id, to_type, to_id, amount, *, actor_type, actor, now,
                   batch_id=None) -> tuple[int, int]:
    """转出方 transfer_out + 收款方 transfer_in，双方互为 counterparty。返回 (转出方余额, 收款方余额)。"""
    _, out_after = apply_delta_nocommit(conn, from_type, from_id, -amount, "transfer_out",
                                        actor_type=actor_type, actor=actor, now=now, counterparty_type=to_type,
                                        counterparty_id=to_id, batch_id=batch_id)
    in_before, in_after = apply_delta_nocommit(conn, to_type, to_id, amount, "transfer_in",
                                               actor_type=actor_type, actor=actor, now=now,
                                               counterparty_type=from_type, counterparty_id=from_id,
                                               batch_id=batch_id)
    if to_type == "user":
        note_user_transition_nocommit(conn, to_id, in_before, in_after, actor_type=actor_type, actor=actor, now=now)
    return out_after, in_after

def transfer_to_agent(conn, from_agent_id: int, to_agent_id, amount, *, actor: str, now: int) -> dict:
    """高级代理把自身积分转给直属下级代理（收款代理须资格激活）；余额不足整笔失败。不能反向转回。"""
    amount = check_amount(amount)
    begin_write(conn)
    try:
        me = _agent(conn, from_agent_id)
        if me.tier != "senior":
            raise BizError("只有高级代理可以转积分", 403)
        to = (get_agent(conn, to_agent_id)
              if isinstance(to_agent_id, int) and not isinstance(to_agent_id, bool) else None)
        if to is None or to.parent_agent_id != me.id:
            raise BizError("只能转给自己的直属下级")
        if to.status != "active":
            raise BizError("下级代理资格不是激活状态，不能转积分", 409)
        mine, _ = _transfer_pair(conn, "agent", str(me.id), "agent", str(to.id), amount,
                                 actor_type="agent", actor=actor, now=now)
        db._audit_nocommit(conn, "agent", actor, "points.transfer", to.name,
                           {"from": me.name, "to": to.name, "amount": amount, "balance": mine}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"amount": amount, "balance": mine}

def recharge_user(conn, agent_id: int, code, amount, *, actor: str, now: int) -> dict:
    """代理用自身余额给本人名下账号充值（未激活账号也可预充）。非本人名下账号按不存在处理。"""
    amount = check_amount(amount)
    begin_write(conn)
    try:
        me = _agent(conn, agent_id)
        u = _user_row(conn, code)
        if u["agent_id"] != me.id:
            raise BizError("账号不存在", 404)
        mine, theirs = _transfer_pair(conn, "agent", str(me.id), "user", u["code"], amount,
                                      actor_type="agent", actor=actor, now=now)
        db._audit_nocommit(conn, "agent", actor, "points.recharge", u["code"],
                           {"agent": me.name, "amount": amount, "balance": theirs}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"amount": amount, "balance": mine}

# ---------------- 批量充值 ----------------

def batch_recharge(conn, codes, amount, reason, *, actor_type: str, actor: str, agent_id: int | None,
                   now: int) -> dict:
    """多个账号各加相同数，全有或全无。agent_id 为 None：后台人员（凭空增加，kind=grant）；
    否则为代理：只能给本人名下账号、按总额校验自身余额（transfer_out/transfer_in）。整批共用一个 batch_id。"""
    amount = check_amount(amount)
    reason = check_reason(reason, required=False)
    if not isinstance(codes, list) or not all(isinstance(c, str) and c.strip() for c in codes):
        raise BizError("账号列表无效")
    norm = list(dict.fromkeys(c.strip().upper() for c in codes))      # 去重并保持顺序
    if not 1 <= len(norm) <= MAX_BATCH:
        raise BizError("一次最多给 1000 个账号充值")
    batch_id = secrets.token_hex(8)
    begin_write(conn)
    try:
        rows = {r["code"]: r for r in conn.execute(
            f"SELECT code, agent_id FROM users WHERE code IN ({','.join('?' * len(norm))})", norm)}
        missing = [c for c in norm if c not in rows or (agent_id is not None and rows[c]["agent_id"] != agent_id)]
        if missing:
            raise BizError("以下账号不存在：" + _fmt_codes(missing), 404)
        total = amount * len(norm)
        balance = None
        if agent_id is None:
            for c in norm:
                before, after = apply_delta_nocommit(conn, "user", c, amount, "grant", actor_type=actor_type,
                                                     actor=actor, now=now, reason=reason, batch_id=batch_id)
                note_user_transition_nocommit(conn, c, before, after, actor_type=actor_type, actor=actor, now=now)
        else:
            me = _agent(conn, agent_id)
            if me.points < total:
                raise BizError(f"积分余额不足（需要 {total}，当前 {me.points}）", 409)
            for c in norm:
                balance, _ = _transfer_pair(conn, "agent", str(me.id), "user", c, amount, actor_type=actor_type,
                                            actor=actor, now=now, batch_id=batch_id)
        detail = {"count": len(norm), "amount": amount, "total": total, "codes": norm}
        if reason is not None:
            detail["reason"] = reason
        db._audit_nocommit(conn, actor_type, actor, "points.batch", batch_id, detail, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"count": len(norm), "total": total, "batch_id": batch_id, "balance": balance}

# ---------------- 流水查询 ----------------

def list_ledger(conn, limit: int, offset: int, *, holder_type: str | None = None, holder_id: str | None = None,
                kind: str | None = None, since: int | None = None, until: int | None = None,
                agent_id: int | None = None, hide_staff: bool = False) -> tuple[list[dict], int]:
    """流水列表（新→旧）。agent_id 不为 None 时只返回该代理作为持有方或对方的流水（代理视图）；
    hide_staff=True 时后台人员的操作者名显示为「后台」。since / until 为 created_at 的闭区间。"""
    where, args = [], []
    if agent_id is not None:
        where.append("((l.holder_type='agent' AND l.holder_id=?) OR (l.counterparty_type='agent' AND l.counterparty_id=?))")
        args += [str(agent_id), str(agent_id)]
    if holder_type is not None:
        where.append("l.holder_type=?"); args.append(holder_type)
    if holder_id is not None:
        where.append("l.holder_id=?"); args.append(holder_id.upper() if holder_type == "user" else holder_id)
    if kind is not None:
        where.append("l.kind=?"); args.append(kind)
    if since is not None:
        where.append("l.created_at>=?"); args.append(since)
    if until is not None:
        where.append("l.created_at<=?"); args.append(until)
    w = ("WHERE " + " AND ".join(where)) if where else ""
    total = conn.execute(f"SELECT COUNT(*) FROM points_ledger l {w}", args).fetchone()[0]
    rs = conn.execute(
        "SELECT l.*, ha.name AS holder_agent_name, ca.name AS counterparty_agent_name FROM points_ledger l"
        " LEFT JOIN agents ha ON l.holder_type='agent' AND ha.id=CAST(l.holder_id AS INTEGER)"
        " LEFT JOIN agents ca ON l.counterparty_type='agent' AND ca.id=CAST(l.counterparty_id AS INTEGER)"
        f" {w} ORDER BY l.id DESC LIMIT ? OFFSET ?", args + [limit, offset]).fetchall()
    out = []
    for r in rs:
        d = {k: r[k] for k in ("id", "holder_type", "holder_id", "delta", "balance_before", "balance_after",
                               "kind", "counterparty_type", "counterparty_id", "actor_type", "actor",
                               "reason", "batch_id", "cycle_key", "created_at")}
        d["holder_name"] = r["holder_agent_name"] if r["holder_type"] == "agent" else r["holder_id"]
        d["counterparty_name"] = (r["counterparty_agent_name"] if r["counterparty_type"] == "agent"
                                  else r["counterparty_id"])
        if hide_staff and d["actor_type"] == "admin":
            d["actor"] = STAFF_ACTOR_LABEL
        out.append(d)
    return out, total

# ---------------- 体验赠送（首次激活时，在 db.activate_user 的事务内调用） ----------------

def grant_trial_nocommit(conn, code: str, now: int) -> int:
    """体验期开启且该账号从未赠送过 → 赠送设定分数（流水 trial、审计 points.trial，操作者 system）。
    返回赠送分数（未赠送为 0）。每账号仅一次：以 trial_granted_at 为准。"""
    cfg = get_trial_settings(conn)
    r = conn.execute("SELECT trial_granted_at FROM users WHERE code=?", (code.upper(),)).fetchone()
    if not cfg["trial_enabled"] or r is None or r["trial_granted_at"] is not None:
        return 0
    n = cfg["trial_points"]
    apply_delta_nocommit(conn, "user", code, n, "trial", actor_type="system", actor=SYSTEM_ACTOR, now=now)
    conn.execute("UPDATE users SET trial_granted_at=? WHERE code=?", (now, code.upper()))
    db._audit_nocommit(conn, "system", SYSTEM_ACTOR, "points.trial", code.upper(), {"amount": n}, now)
    return n
