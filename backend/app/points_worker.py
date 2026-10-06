# 每日扣减 Worker（子项目 C）：进程内每 60 秒一轮，按账号滚动 24 小时扣 1 分。
# run_charge_cycle 是纯同步函数、时间由参数传入（测试注入时钟，无需 sleep）；charge_loop 在事件循环线程里
# 直接调用它（不丢进线程池），因此一轮扣减与其他请求处理在共享 SQLite 连接上不会交错，
# 再由 BEGIN IMMEDIATE 与外部进程（manage.py）互斥。
import asyncio
import time
from . import db_points
from .db_agents import begin_write

CHARGE_INTERVAL = 60
PERIOD = db_points.CHARGE_PERIOD
# 可计费：已激活、使用控制正常、未过到期时间、余额 > 0（与 gate 的到期判定一致：expires_at < now 为已到期）
_CHARGEABLE = ("first_activated_at IS NOT NULL AND status='active'"
               " AND (expires_at IS NULL OR expires_at >= :now) AND points > 0")

def run_charge_cycle(conn, now: int) -> dict:
    """一轮扣减（整轮一个写事务），返回各类处理的账号数：
    stopped  不可计费 → next_charge_at 置空（停扣，不累计、不追扣）
    started  可计费但 next_charge_at 为空（刚恢复）→ 计费起点 = now，下次 = now + 24h，不扣
    reset    逾期 ≥ 24h（Worker 停机错过周期）→ 按重新激活处理，不扣
    charged  到期且逾期不足 24h → 扣 1 分（cycle_key = 该周期的 next_charge_at），下次 += 24h
    suspended 本轮扣到 0 的账号数（写审计 points.suspended；下一轮因不可计费被停扣）"""
    p = {"now": now, "period": PERIOD}
    res = {"stopped": 0, "started": 0, "reset": 0, "charged": 0, "suspended": 0}
    begin_write(conn)
    try:
        res["stopped"] = conn.execute(
            f"UPDATE users SET next_charge_at=NULL WHERE next_charge_at IS NOT NULL AND NOT ({_CHARGEABLE})",
            p).rowcount
        res["started"] = conn.execute(
            "UPDATE users SET charge_anchor_at=:now, next_charge_at=:now + :period"
            f" WHERE next_charge_at IS NULL AND {_CHARGEABLE}", p).rowcount
        res["reset"] = conn.execute(
            "UPDATE users SET charge_anchor_at=:now, next_charge_at=:now + :period"
            f" WHERE {_CHARGEABLE} AND :now >= next_charge_at + :period", p).rowcount
        due = conn.execute(f"SELECT code, next_charge_at FROM users WHERE {_CHARGEABLE}"
                           " AND next_charge_at <= :now ORDER BY id", p).fetchall()
        for r in due:
            code, cycle = r["code"], r["next_charge_at"]
            # 防重复记账：该周期已有扣减流水（UNIQUE(holder_id, cycle_key)）则只推进周期、不再扣
            done = conn.execute("SELECT 1 FROM points_ledger WHERE kind='charge' AND holder_id=? AND cycle_key=?",
                                (code, cycle)).fetchone()
            if done is None:
                before, after = db_points.apply_delta_nocommit(
                    conn, "user", code, -1, "charge", actor_type="system", actor=db_points.SYSTEM_ACTOR,
                    now=now, cycle_key=cycle)
                db_points.note_user_transition_nocommit(conn, code, before, after, actor_type="system",
                                                        actor=db_points.SYSTEM_ACTOR, now=now)
                res["charged"] += 1
                if after == 0:
                    res["suspended"] += 1
            conn.execute("UPDATE users SET next_charge_at=? WHERE code=?", (cycle + PERIOD, code))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return res

async def charge_loop(conn, interval: float = CHARGE_INTERVAL, clock=time.time, sleep=asyncio.sleep) -> None:
    """启动即跑一轮，之后每 interval 秒一轮；单轮异常只记日志，循环继续。被取消时直接退出。
    clock / sleep 可注入（测试用假时钟与假 sleep，不真正等待）。"""
    while True:
        try:
            run_charge_cycle(conn, int(clock()))
        except Exception as e:
            print(f"points charge failed: {e!r}")
        await sleep(interval)
