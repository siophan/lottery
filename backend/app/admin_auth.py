import hmac
import time
from . import db, security

def authenticate(conn, username: str, password: str):
    admin = db.get_admin_by_username(conn, username)
    if not admin:
        return None
    if not security.verify_password(password, admin.salt, admin.password_hash):
        return None
    return admin

def issue_session(conn, settings, admin) -> str:
    token = security.new_token()
    db.create_admin_session(conn, token, admin.id, settings.admin_session_ttl)
    return token

def current_admin(conn, token):
    if not token:
        return None
    sess = db.get_admin_session(conn, token)
    if not sess or sess.expires_at < int(time.time()):
        return None
    return db.get_admin_by_id(conn, sess.admin_id)

def cookie_or_key_ok(request) -> bool:
    settings = request.app.state.settings
    conn = request.app.state.db_conn
    token = request.cookies.get(settings.admin_cookie_name)
    if current_admin(conn, token) is not None:
        return True
    key = settings.admin_key
    header = request.headers.get("X-Admin-Key") or ""
    # encode to bytes: compare_digest raises TypeError on non-ASCII str
    return bool(key) and hmac.compare_digest(header.encode("utf-8"), key.encode("utf-8"))

def actor_of(request) -> str | None:
    """审计用操作者：cookie 登录的管理员取用户名；X-Admin-Key 方式记为 "admin-key"；未通过鉴权返回 None。"""
    settings = request.app.state.settings
    conn = request.app.state.db_conn
    admin = current_admin(conn, request.cookies.get(settings.admin_cookie_name))
    if admin is not None:
        return admin.username
    return "admin-key" if cookie_or_key_ok(request) else None
