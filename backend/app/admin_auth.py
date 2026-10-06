import hmac
import time
from dataclasses import dataclass
from fastapi import Request
from fastapi.concurrency import run_in_threadpool
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

def _find_login(conn, username: str):
    """先按用户名精确匹配；未命中时按代理规范化名称（不区分大小写）匹配。
    后台人员用户名仍区分大小写，只有代理（名称全局不区分大小写唯一）才放宽。"""
    admin = db.get_admin_by_username(conn, username)
    if admin:
        return admin
    r = conn.execute("SELECT admin_id FROM agents WHERE name_key=?",
                     (db_agents.name_key(username),)).fetchone()
    return db.get_admin_by_id(conn, r["admin_id"]) if r else None

async def authenticate(conn, username: str, password: str):
    admin = _find_login(conn, username)
    if not admin:
        return None
    # PBKDF2 放到线程池，不阻塞事件循环；线程里只做哈希，数据库读取留在事件循环线程
    if not await run_in_threadpool(security.verify_password, password, admin.salt, admin.password_hash):
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
    """代理身份资格非激活（暂停/取消/未知状态）时返回提示文案；可登录或非代理返回 None。"""
    if admin.role != "agent":
        return None
    agent = db_agents.get_agent_by_admin_id(conn, admin.id)
    if agent is None:
        return "代理资料不存在，无法登录"
    if agent.status == "active":
        return None
    return AGENT_BLOCKED_MSG.get(agent.status, "代理资格无效，无法登录")

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
    """FastAPI 依赖工厂：当前身份不在 roles 内（含未登录）→ AdminDenied（403）。
    必须是 async：同步依赖会被放进线程池，与事件循环线程并发使用同一个 SQLite 连接会串号。"""
    async def dep(request: Request) -> Principal:
        p = current_principal(request)
        if p is None or p.role not in roles:
            raise AdminDenied()
        return p
    return dep
