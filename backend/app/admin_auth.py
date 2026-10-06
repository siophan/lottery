import hmac
import time
from dataclasses import dataclass
from fastapi import Request
from . import db, db_agents, security

STAFF = ("super", "admin")      # 后台人员：最高权限者 + 管理员
ALL_ROLES = ("super", "admin", "agent")
AGENT_BLOCKED_MSG = {
    "paused": "代理资格已暂停，无法登录",
    "cancelled": "代理资格已取消，无法登录",
}

class AdminDenied(Exception):
    """未登录、角色不符或越权：main.py 统一转成 403 {"error": "forbidden"}。"""

@dataclass
class Principal:
    role: str                   # super | admin | agent（X-Admin-Key 视为 super）
    username: str               # 审计操作者；X-Admin-Key 为 "admin-key"
    admin_id: int | None        # X-Admin-Key 为 None
    agent_id: int | None = None # 仅代理身份有值

    @property
    def actor_type(self) -> str:
        return "agent" if self.role == "agent" else "admin"

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

def agent_login_problem(conn, admin) -> str | None:
    """代理身份资格非激活（暂停/取消）时返回提示文案；可登录或非代理返回 None。"""
    if admin.role != "agent":
        return None
    agent = db_agents.get_agent_by_admin_id(conn, admin.id)
    if agent is None:
        return "代理资料不存在，无法登录"
    return AGENT_BLOCKED_MSG.get(agent.status)

def principal_for_admin(conn, admin) -> Principal | None:
    """把已登录的后台账号转成当前身份；代理资格非激活时返回 None（已有会话逐请求拒绝）。"""
    if admin.role != "agent":
        return Principal(admin.role, admin.username, admin.id)
    agent = db_agents.get_agent_by_admin_id(conn, admin.id)
    if agent is None or agent.status != "active":
        return None
    return Principal("agent", admin.username, admin.id, agent.id)

def current_principal(request: Request) -> Principal | None:
    settings = request.app.state.settings
    conn = request.app.state.db_conn
    admin = current_admin(conn, request.cookies.get(settings.admin_cookie_name))
    if admin is not None:
        p = principal_for_admin(conn, admin)
        if p is not None:
            return p
    key = settings.admin_key
    header = request.headers.get("X-Admin-Key") or ""
    # encode to bytes: compare_digest raises TypeError on non-ASCII str
    if key and hmac.compare_digest(header.encode("utf-8"), key.encode("utf-8")):
        return Principal("super", "admin-key", None)      # 运维密钥视为最高权限者
    return None

def require_role(*roles: str):
    """FastAPI 依赖工厂：当前身份不在 roles 内（含未登录）→ AdminDenied（403）。"""
    def dep(request: Request) -> Principal:
        p = current_principal(request)
        if p is None or p.role not in roles:
            raise AdminDenied()
        return p
    return dep
