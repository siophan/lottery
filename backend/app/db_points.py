# 积分（子项目 C）：数据层。余额在 users.points / agents.points，流水在 points_ledger，设置在 settings。
# 表结构在 db.init_db 中统一创建。所有余额变化都在调用方的 BEGIN IMMEDIATE 事务内经 apply_delta_nocommit 完成。
import json
from . import db
from .db_agents import BizError, begin_write

HOLDER_TYPES = ("user", "agent")
KINDS = ("trial", "grant", "revoke", "transfer_out", "transfer_in", "charge")
CHARGE_PERIOD = 86400                 # 首次扣减延迟与扣减周期，固定 24 小时
TRIAL_DEFAULTS = {"trial_enabled": False, "trial_points": 7}
TRIAL_POINTS_MIN, TRIAL_POINTS_MAX = 1, 100
SYSTEM_ACTOR = "system"               # actor_type=system 时的操作者：每日扣减 / 体验赠送
NO_BALANCE = "积分余额不足"

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
