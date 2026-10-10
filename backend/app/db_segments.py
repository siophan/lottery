# 账号编号段（子项目 B）：分配即建档、划拨、回收、流水。归属只看 users.agent_id；segment_ops 只是流水。
from . import db, db_points
from .db_agents import BizError, begin_write, get_agent
from .security import hash_password

PREFIX = "Z"                              # 新号统一「Z + 7 位数字」：Z0000001–Z9999999
NO_MIN, NO_MAX = 1, 9_999_999             # 接口与号段流水只用数字部分
MAX_BATCH = 10_000                        # 单次分配 / 划拨上限
_Z_CODE = PREFIX + "[0-9]" * 7            # GLOB：只匹配 Z 编号；老的纯数字 / 字母编号不迁移、不落入区间

def code_of(n: int) -> str:
    return f"{PREFIX}{n:07d}"

def _no_of(code: str) -> int | None:
    """Z 编号 → 数字部分；老编号返回 None。"""
    tail = code[len(PREFIX):]
    return int(tail) if code.startswith(PREFIX) and len(tail) == 7 and tail.isdigit() else None

def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)

def parse_range(start, end) -> tuple[int, int]:
    if not (_is_int(start) and _is_int(end) and NO_MIN <= start <= NO_MAX and NO_MIN <= end <= NO_MAX):
        raise BizError("编号必须是 1–9999999 之间的整数（即 Z0000001–Z9999999）")
    if start > end:
        raise BizError("起始编号不能大于结束编号")
    if end - start + 1 > MAX_BATCH:
        raise BizError("单次最多 10000 个编号")
    return start, end

def _rows_in_range(conn, start: int, end: int) -> dict:
    rs = conn.execute(
        f"SELECT id, code, agent_id, first_activated_at FROM users"
        f" WHERE code GLOB '{_Z_CODE}' AND code BETWEEN ? AND ?",
        (code_of(start), code_of(end))).fetchall()
    return {_no_of(r["code"]): r for r in rs}

def _fmt_codes(nums: list[int]) -> str:
    head = "、".join(code_of(n) for n in nums[:10])
    return head + (f" 等 {len(nums)} 个" if len(nums) > 10 else "")

def _log_op(conn, op, start, end, count, from_id, to_id, actor, now) -> None:
    conn.execute("INSERT INTO segment_ops(op,start_no,end_no,count,from_agent_id,to_agent_id,actor,created_at)"
                 " VALUES(?,?,?,?,?,?,?,?)", (op, start, end, count, from_id, to_id, actor, now))

def assign_segment(conn, agent_id: int, start, end, *, actor_type: str, actor: str, now: int) -> dict:
    """分配即建档：段内每个编号建为待激活账号（初始密码 123456）归属该代理，整段一个事务。
    段内已存在且不是「无归属的待激活账号」的编号 → 整次拒绝；无归属待激活号（回收后的号）直接改归属。"""
    start, end = parse_range(start, end)
    # 整段共用一次 PBKDF2：所有待激活号的初始密码相同且公开，共用盐不泄露任何秘密；
    # 激活 / 重置时 activate_user / reset_user_password 会用新盐重新哈希。逐行哈希 1 万次约需半小时。
    h, salt = hash_password(db.INITIAL_PASSWORD)
    begin_write(conn)
    try:
        ag = get_agent(conn, agent_id)
        if ag is None:
            raise BizError("代理不存在", 404)
        if ag.status != "active":
            raise BizError("代理资格不是激活状态，不能分配", 409)
        existing = _rows_in_range(conn, start, end)
        bad = sorted(n for n, r in existing.items()
                     if r["agent_id"] is not None or r["first_activated_at"] is not None)
        if bad:
            raise BizError("以下编号已存在，不能分配：" + _fmt_codes(bad), 409)
        # 吸收的无归属待激活号与新建号一致：永久有效；使用控制（封禁 / 暂停）保持不变，只能由后台解除
        conn.executemany("UPDATE users SET agent_id=?, expires_at=NULL WHERE id=?",
                         [(ag.id, r["id"]) for r in existing.values()])
        new = [n for n in range(start, end + 1) if n not in existing]
        conn.executemany(
            "INSERT INTO users(code,password_hash,salt,expires_at,status,created_at,agent_id)"
            " VALUES(?,?,?,NULL,'active',?,?)",
            [(code_of(n), h, salt, now, ag.id) for n in new])
        count = end - start + 1
        _log_op(conn, "assign", start, end, count, None, ag.id, actor, now)
        detail = {"agent": ag.name, "count": count, "created": len(new), "reassigned": len(existing)}
        db._audit_nocommit(conn, actor_type, actor, "segment.assign", f"{code_of(start)}-{code_of(end)}",
                           detail, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"count": count, "created": len(new), "reassigned": len(existing)}

def transfer_segment(conn, from_agent_id: int, to_agent_id, start, end, *, actor: str,
                     now: int) -> dict:
    """高级代理把本人名下、从未激活的连续编号划拨给直属下级；不可撤回（没有反向接口）。"""
    start, end = parse_range(start, end)
    if not _is_int(to_agent_id):
        raise BizError("只能划拨给自己的直属下级")
    begin_write(conn)
    try:
        me = get_agent(conn, from_agent_id)
        if me is None or me.tier != "senior":
            raise BizError("只有高级代理可以划拨编号", 403)
        to = get_agent(conn, to_agent_id)
        if to is None or to.parent_agent_id != me.id:
            raise BizError("只能划拨给自己的直属下级")
        if to.status != "active":
            raise BizError("下级代理资格不是激活状态，不能划拨", 409)
        existing = _rows_in_range(conn, start, end)
        bad = [n for n in range(start, end + 1)
               if n not in existing or existing[n]["agent_id"] != me.id
               or existing[n]["first_activated_at"] is not None]
        if bad:
            raise BizError("以下编号不在你名下或已激活，不能划拨：" + _fmt_codes(bad), 409)
        conn.executemany("UPDATE users SET agent_id=? WHERE id=?",
                         [(to.id, r["id"]) for r in existing.values()])
        count = end - start + 1
        _log_op(conn, "transfer", start, end, count, me.id, to.id, actor, now)
        db._audit_nocommit(conn, "agent", actor, "segment.transfer", f"{code_of(start)}-{code_of(end)}",
                           {"from": me.name, "to": to.name, "count": count}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"count": count}

def recycle_agent(conn, agent_id: int, *, actor_type: str, actor: str, now: int) -> dict:
    """回收（仅资格已取消的代理）：名下未激活账号变为无归属待激活号，下级代理解除上级关系；
    已激活账号保持原归属。回收后该代理不能再恢复资格。
    未激活账号上预充的积分同一事务退回该代理（转出/转入流水各一条），
    否则这些号再分配给别的代理时，积分会被白白带走且账本无记录。"""
    begin_write(conn)
    try:
        a = get_agent(conn, agent_id)
        if a is None:
            raise BizError("代理不存在", 404)
        if a.status != "cancelled":
            raise BizError("只能回收资格已取消的代理", 409)
        if a.recycled_at is not None:
            raise BizError("该代理已回收", 409)
        pending = conn.execute("SELECT code, points FROM users WHERE agent_id=? AND first_activated_at IS NULL",
                               (a.id,)).fetchall()
        nums = sorted(n for n in (_no_of(r["code"]) for r in pending) if n is not None)   # 流水起止只记 Z 号
        refunded = 0
        for r in pending:
            if r["points"] > 0:
                db_points.apply_delta_nocommit(conn, "user", r["code"], -r["points"], "transfer_out",
                                               actor_type=actor_type, actor=actor, now=now,
                                               counterparty_type="agent", counterparty_id=str(a.id),
                                               reason="回收编号退回")
                db_points.apply_delta_nocommit(conn, "agent", str(a.id), r["points"], "transfer_in",
                                               actor_type=actor_type, actor=actor, now=now,
                                               counterparty_type="user", counterparty_id=r["code"],
                                               reason="回收编号退回")
                refunded += r["points"]
        conn.execute("UPDATE users SET agent_id=NULL WHERE agent_id=? AND first_activated_at IS NULL",
                     (a.id,))
        children = [r["id"] for r in conn.execute("SELECT id FROM agents WHERE parent_agent_id=?",
                                                  (a.id,))]
        conn.execute("UPDATE agents SET parent_agent_id=NULL WHERE parent_agent_id=?", (a.id,))
        conn.execute("UPDATE agents SET recycled_at=? WHERE id=?", (now, a.id))
        _log_op(conn, "recycle", nums[0] if nums else None, nums[-1] if nums else None, len(pending),
                a.id, None, actor, now)
        db._audit_nocommit(conn, actor_type, actor, "agent.recycle", a.name,
                           {"count": len(pending), "children": children, "refunded": refunded}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"count": len(pending), "children": len(children)}

STAFF_ACTOR_LABEL = "后台"       # 代理视图里替代后台人员用户名的显示

def list_segment_ops(conn, limit: int, offset: int, agent_id: int | None = None, *,
                     hide_staff: bool = False) -> tuple[list[dict], int]:
    """流水列表；hide_staff=True（代理视图）时，后台人员执行的分配 / 回收不暴露其用户名。"""
    where, args = ("WHERE o.from_agent_id=? OR o.to_agent_id=?", [agent_id, agent_id]) \
        if agent_id is not None else ("", [])
    total = conn.execute(f"SELECT COUNT(*) FROM segment_ops o {where}", args).fetchone()[0]
    rs = conn.execute(
        "SELECT o.*, f.name AS from_name, t.name AS to_name FROM segment_ops o"
        " LEFT JOIN agents f ON f.id=o.from_agent_id LEFT JOIN agents t ON t.id=o.to_agent_id"
        f" {where} ORDER BY o.id DESC LIMIT ? OFFSET ?", args + [limit, offset]).fetchall()
    ops = [dict(r) for r in rs]
    if hide_staff:
        for o in ops:
            if o["op"] != "transfer":          # 划拨由代理本人执行，其余都是后台人员
                o["actor"] = STAFF_ACTOR_LABEL
    return ops, total
