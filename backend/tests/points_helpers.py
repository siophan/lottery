# 子项目 C（积分）测试共用工具。
from app import db

NOW = 1_800_000_000
DAY = 86400

def set_points_raw(conn, code: str, points: int) -> None:
    """绕过流水直接设置账号余额（仅测试造数据用：让已激活账号能通过登录 / gate 的积分拦截）。"""
    conn.execute("UPDATE users SET points=? WHERE code=?", (points, code.upper()))
    conn.commit()

def set_agent_points_raw(conn, agent_id: int, points: int) -> None:
    conn.execute("UPDATE agents SET points=? WHERE id=?", (points, agent_id))
    conn.commit()

def points_of(conn, code: str) -> int:
    return conn.execute("SELECT points FROM users WHERE code=?", (code.upper(),)).fetchone()["points"]

def agent_points(conn, agent_id: int) -> int:
    return conn.execute("SELECT points FROM agents WHERE id=?", (agent_id,)).fetchone()["points"]

def ledger(conn, **where) -> list[dict]:
    """按列等值过滤 points_ledger，按 id 升序返回 dict 列表。"""
    sql, args = "SELECT * FROM points_ledger", []
    if where:
        sql += " WHERE " + " AND ".join(f"{k}=?" for k in where)
        args = list(where.values())
    return [dict(r) for r in conn.execute(sql + " ORDER BY id", args)]

def activated_user(conn, code: str, points: int = 0, *, now: int = NOW) -> db.User:
    """已激活 + 已完成首登的账号（create_user 非 pending），可选设置余额。"""
    u = db.create_user(conn, code, "pw", None)
    conn.execute("UPDATE users SET first_activated_at=?, activated_at=?, onboarded_at=? WHERE id=?",
                 (now, now, now, u.id))
    conn.commit()
    if points:
        set_points_raw(conn, code, points)
    return db.get_user_by_code(conn, code)
