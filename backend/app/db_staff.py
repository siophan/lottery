# 后台人员管理（最高权限者专用）：管理员账号增删、重置密码；授权（本期只有 agent.rename）。
from . import db
from .db_agents import BizError, begin_write, check_password, ensure_name_available, name_key, normalize_name
from .security import hash_password

GRANTS = ("agent.rename",)

def _staff_admin(conn, admin_id: int):
    """取目标管理员；只有 role='admin' 可被管理（最高权限者 / 代理不在此处管理）。"""
    a = db.get_admin_by_id(conn, admin_id)
    if a is None or a.role == "agent":
        raise BizError("管理员不存在", 404)
    if a.role != "admin":
        raise BizError("不能在后台修改最高权限者", 409)
    return a

def has_grant(conn, admin_id: int | None, grant: str) -> bool:
    return grant in db.list_active_grants(conn, admin_id)

def list_admins(conn) -> list[dict]:
    rows = conn.execute("SELECT id, username, role, created_at FROM admins"
                        " WHERE role IN ('super','admin') ORDER BY id").fetchall()
    return [dict(id=r["id"], username=r["username"], role=r["role"], created_at=r["created_at"],
                 grants=db.list_active_grants(conn, r["id"])) for r in rows]

def create_staff_admin(conn, username, password, *, actor: str, now: int) -> int:
    username = normalize_name(username)
    check_password(password)
    h, salt = hash_password(password)
    begin_write(conn)
    try:
        ensure_name_available(conn, name_key(username), now, None)
        cur = conn.execute("INSERT INTO admins(username,password_hash,salt,created_at,role)"
                           " VALUES(?,?,?,?,'admin')", (username, h, salt, now))
        db._audit_nocommit(conn, "admin", actor, "admin.create", username, {}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return cur.lastrowid

def upsert_staff_admin(conn, username: str, password: str, now: int) -> str:
    """manage.py admin-set：新建管理员或重置已有后台人员密码，返回 created | updated。
    代理账号（role='agent'）不能用本命令改；新建走与代理名称共用的命名空间检查（不区分大小写、含保留期）。"""
    h, salt = hash_password(password)
    begin_write(conn)
    try:
        existing = db.get_admin_by_username(conn, username)
        if existing is not None:
            if existing.role == "agent":
                raise BizError("该用户名属于代理账号，不能用 admin-set 修改", 409)
            conn.execute("UPDATE admins SET password_hash=?, salt=? WHERE id=?", (h, salt, existing.id))
            res = "updated"
        else:
            ensure_name_available(conn, name_key(username), now, None)
            conn.execute("INSERT INTO admins(username,password_hash,salt,created_at,role)"
                         " VALUES(?,?,?,?,'admin')", (username, h, salt, now))
            res = "created"
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return res

def set_admin_password(conn, admin_id: int, password, *, actor: str, now: int) -> None:
    check_password(password)
    a = _staff_admin(conn, admin_id)
    h, salt = hash_password(password)
    try:
        conn.execute("UPDATE admins SET password_hash=?, salt=? WHERE id=?", (h, salt, a.id))
        conn.execute("DELETE FROM admin_sessions WHERE admin_id=?", (a.id,))
        db._audit_nocommit(conn, "admin", actor, "admin.password", a.username, {}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def delete_admin(conn, admin_id: int, *, actor: str, now: int) -> None:
    """删除管理员：同时清会话、撤销其全部授权。"""
    a = _staff_admin(conn, admin_id)
    try:
        conn.execute("DELETE FROM admin_sessions WHERE admin_id=?", (a.id,))
        conn.execute("UPDATE admin_grants SET revoked_at=? WHERE admin_id=? AND revoked_at IS NULL",
                     (now, a.id))
        conn.execute("DELETE FROM admins WHERE id=?", (a.id,))
        db._audit_nocommit(conn, "admin", actor, "admin.delete", a.username, {}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def add_grant(conn, admin_id: int, grant, *, actor: str, now: int) -> None:
    if grant not in GRANTS:
        raise BizError("授权项无效")
    a = _staff_admin(conn, admin_id)
    if has_grant(conn, a.id, grant):
        raise BizError("已授权", 409)
    try:
        conn.execute("INSERT INTO admin_grants(admin_id,grant,granted_by,granted_at) VALUES(?,?,?,?)",
                     (a.id, grant, actor, now))
        db._audit_nocommit(conn, "admin", actor, "grant.add", a.username, {"grant": grant}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def revoke_grant(conn, admin_id: int, grant, *, actor: str, now: int) -> None:
    a = db.get_admin_by_id(conn, admin_id)
    if a is None or not has_grant(conn, a.id, grant):
        raise BizError("未授权", 404)
    try:
        conn.execute("UPDATE admin_grants SET revoked_at=? WHERE admin_id=? AND grant=? AND revoked_at IS NULL",
                     (now, a.id, grant))
        db._audit_nocommit(conn, "admin", actor, "grant.revoke", a.username, {"grant": grant}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def list_grants(conn) -> list[dict]:
    """授权流水（含已撤销），新的在前。"""
    rows = conn.execute("SELECT g.*, a.username FROM admin_grants g LEFT JOIN admins a ON a.id=g.admin_id"
                        " ORDER BY g.id DESC").fetchall()
    return [dict(id=r["id"], admin_id=r["admin_id"], username=r["username"], grant=r["grant"],
                 granted_by=r["granted_by"], granted_at=r["granted_at"], revoked_at=r["revoked_at"])
            for r in rows]
