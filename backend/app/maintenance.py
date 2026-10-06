import asyncio
import time
from . import db, db_points

MAINTENANCE_INTERVAL = 86400    # 每日一次

def run_maintenance(conn, now: int) -> dict:
    """清理过期数据：审计日志与积分流水（三年）、短信发送记录（24h）、首登票据、用户/管理员会话。
    每一步独立 try：某一步失败只打印，不影响其余清理；返回各步删除行数（失败的步骤不在结果里）。"""
    steps = (
        ("audit_logs", lambda: db.purge_old_audit_logs(conn, now)),
        ("points_ledger", lambda: db_points.purge_old_ledger(conn, now)),
        ("sms_send_log", lambda: db.purge_old_sms_send_log(conn, now)),
        ("onboard_tickets", lambda: db.purge_expired_onboard_tickets(conn, now)),
        ("sessions", lambda: db.purge_expired_sessions(conn)),
        ("admin_sessions", lambda: db.purge_expired_admin_sessions(conn)),
    )
    result = {}
    for name, fn in steps:
        try:
            result[name] = fn()
        except Exception as e:
            print(f"maintenance {name} failed: {e!r}")
    return result

async def maintenance_loop(conn, interval: int = MAINTENANCE_INTERVAL) -> None:
    """每 interval 秒跑一次维护（启动时的首次由 lifespan 同步执行）；
    单次异常只记日志，循环继续。被取消时直接退出。"""
    while True:
        await asyncio.sleep(interval)
        try:
            run_maintenance(conn, int(time.time()))
        except Exception as e:      # run_maintenance 已逐步兜底，这里再防一层
            print(f"maintenance run failed: {e!r}")
