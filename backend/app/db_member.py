# 会员各自的数据（app/member_data.py）：本地存的方案与关注专家，以及存在共用上游账号下的条目归属。
# 表结构见 db._migrate_member_data；删除账号时由 db.delete_user 一并清理。
import json
import sqlite3

# ---- 方案（kind: average 均衡 | double 倍投）：data 为客户端提交的 JSON 原文 ----

def count_plans(conn, user_id: int, kind: str) -> int:
    return conn.execute("SELECT COUNT(*) FROM member_plans WHERE user_id=? AND kind=?",
                        (user_id, kind)).fetchone()[0]

def add_plan(conn, user_id: int, kind: str, data: dict, now: int) -> int:
    cur = conn.execute("INSERT INTO member_plans(user_id,kind,data,created_at) VALUES(?,?,?,?)",
                       (user_id, kind, json.dumps(data, ensure_ascii=False), now))
    conn.commit()
    return cur.lastrowid

def list_plans(conn, user_id: int, kind: str, limit: int, offset: int) -> list[sqlite3.Row]:
    return conn.execute("SELECT id,data,created_at FROM member_plans WHERE user_id=? AND kind=?"
                        " ORDER BY id DESC LIMIT ? OFFSET ?", (user_id, kind, limit, offset)).fetchall()

def get_plan(conn, user_id: int, kind: str, plan_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT id,data,created_at FROM member_plans WHERE id=? AND user_id=? AND kind=?",
                        (plan_id, user_id, kind)).fetchone()

def delete_plans(conn, user_id: int, kind: str, plan_ids: list[int]) -> int:
    cur = conn.execute(f"DELETE FROM member_plans WHERE user_id=? AND kind=? AND id IN ({','.join('?' * len(plan_ids))})",
                       (user_id, kind, *plan_ids))
    conn.commit()
    return cur.rowcount

# ---- 关注专家 ----

def count_favorites(conn, user_id: int) -> int:
    return conn.execute("SELECT COUNT(*) FROM member_favorites WHERE user_id=?", (user_id,)).fetchone()[0]

def get_favorite(conn, user_id: int, expert_id: int, expert_type: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM member_favorites WHERE user_id=? AND expert_id=? AND expert_type=?",
                        (user_id, expert_id, expert_type)).fetchone()

def add_favorite(conn, user_id: int, expert_id: int, expert_type: int, name: str, now: int) -> sqlite3.Row:
    """已关注过则保留原记录（不改名、不改时间），返回该记录。"""
    conn.execute("INSERT OR IGNORE INTO member_favorites(user_id,expert_id,expert_type,name,created_at)"
                 " VALUES(?,?,?,?,?)", (user_id, expert_id, expert_type, name, now))
    conn.commit()
    return get_favorite(conn, user_id, expert_id, expert_type)

def list_favorites(conn, user_id: int) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM member_favorites WHERE user_id=? ORDER BY id DESC", (user_id,)).fetchall()

def delete_favorite(conn, user_id: int, fav_id: int) -> bool:
    cur = conn.execute("DELETE FROM member_favorites WHERE id=? AND user_id=?", (fav_id, user_id))
    conn.commit()
    return cur.rowcount > 0

# ---- 共用上游账号下的条目归属（kind: misscontrol | usernumplan）；upstream_id 统一按字符串存 ----

def owned_ids(conn, user_id: int, kind: str) -> set[str]:
    return {r[0] for r in conn.execute("SELECT upstream_id FROM member_upstream_items WHERE user_id=? AND kind=?",
                                       (user_id, kind))}

def is_owned(conn, user_id: int, kind: str, upstream_id: str) -> bool:
    return conn.execute("SELECT 1 FROM member_upstream_items WHERE kind=? AND upstream_id=? AND user_id=?",
                        (kind, upstream_id, user_id)).fetchone() is not None

def claim(conn, user_id: int, kind: str, upstream_id: str, now: int) -> None:
    conn.execute("INSERT OR IGNORE INTO member_upstream_items(kind,upstream_id,user_id,created_at) VALUES(?,?,?,?)",
                 (kind, upstream_id, user_id, now))
    conn.commit()

def release(conn, user_id: int, kind: str, upstream_id: str) -> None:
    conn.execute("DELETE FROM member_upstream_items WHERE kind=? AND upstream_id=? AND user_id=?",
                 (kind, upstream_id, user_id))
    conn.commit()
