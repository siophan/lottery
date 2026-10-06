import os
import sqlite3
import time
from fastapi import APIRouter, Request, Body, Response, Depends
from fastapi.responses import JSONResponse, FileResponse
from .. import db, profile
from .. import admin_auth, db_agents
from ..admin_auth import Principal
from ..throttle import LOCKED_MSG, client_ip

router = APIRouter()
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))
ANY_ROLE = Depends(admin_auth.require_role(*admin_auth.ALL_ROLES))

ALLOWED_STATUS = ("active", "disabled", "banned")   # 使用控制：正常 / 暂停 / 封禁

_ADMIN_INDEX = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "static", "admin-dist", "index.html"
)

@router.get("/")
async def admin_index():
    # Ant Design Pro（Vite 构建）单页应用入口；静态资源由 main.py 挂在 /admin/assets。
    return FileResponse(_ADMIN_INDEX)

def _err(error: str, status: int):
    return JSONResponse({"ok": False, "error": error}, status_code=status)

def _not_found():
    return _err("账号不存在", 404)

def _password_rejected(payload: dict):
    # 管理员不得设置任意密码：显式报错而不是静默忽略，避免调用方误以为已设置成功
    if "password" in payload:
        return _err("不支持设置密码，请使用激活或重置密码", 400)
    return None

MAX_INT = 2 ** 62      # SQLite INTEGER 为 64 位有符号；留足余量，避免 OverflowError 变 500

def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)

def _valid_expires(v) -> bool:
    # 到期时间：null（永不过期）或 0 <= v < 2**62 的整数
    return v is None or (_is_int(v) and 0 <= v < MAX_INT)

def _audit(request: Request, p: Principal, action: str, target: str, detail: dict) -> None:
    db.add_audit(request.app.state.db_conn, p.actor_type, p.username, action, target, detail)

@router.post("/users")
async def create_user(request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    rejected = _password_rejected(payload)
    if rejected is not None:
        return rejected
    code = payload.get("code")
    # 编号不能为空，否则会产生无法通过 /users/{code} 路由删除的脏数据
    if not isinstance(code, str) or not code.strip():
        return JSONResponse({"ok": False, "error": "code required"}, status_code=400)
    expires_at = payload.get("expires_at")
    if not _valid_expires(expires_at):
        return _err("到期时间无效", 400)
    conn = request.app.state.db_conn
    code = code.strip()
    if db.get_user_by_code(conn, code):
        return _err("账号已存在", 409)
    # 只建待激活账号，密码预置为初始密码
    try:
        u = db.create_user(conn, code, db.INITIAL_PASSWORD, expires_at, pending=True)
    except sqlite3.IntegrityError:      # 并发下同编号抢先插入
        return _err("账号已存在", 409)
    _audit(request, p, "user.create", u.code, {"expires_at": expires_at})
    return {"ok": True, "code": u.code}

@router.get("/users")
async def list_users(request: Request, p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    raw = request.query_params.get("agent_id")
    try:
        agent_id = int(raw) if raw else None
    except ValueError:
        return _err("参数无效", 400)
    if agent_id is not None and not 0 <= agent_id <= MAX_INT:
        return _err("参数无效", 400)
    if p.role == "agent":            # 代理只读本人名下账号，忽略传入的 agent_id
        agent_id = p.agent_id
    return {"users": [
        {"code": u.code, "status": u.status, "expires_at": u.expires_at, "created_at": u.created_at,
         "activated": u.first_activated_at is not None,
         "first_activated_at": u.first_activated_at,
         "phone": db.mask_phone(u.phone),
         "onboarded": u.onboarded_at is not None,
         "agent_id": u.agent_id, "agent_name": agent_name,
         "number_status": db.number_status(u, agent_status),
         "points": u.points,
         "nickname": profile.display_nickname(u)}
        for u, agent_name, agent_status in db.list_users_with_agent(conn, agent_id)
    ]}

@router.get("/users/{code}/profile")
async def user_profile(code: str, request: Request, p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    u = db.get_user_by_code(conn, code)
    # 代理只能查看本人名下账号（他人账号按不存在处理）
    if u is None or (p.role == "agent" and u.agent_id != p.agent_id):
        return _not_found()
    avatar = db.get_user_avatar(conn, u.id)
    return {"ok": True, "code": u.code, "nickname": profile.display_nickname(u),
            "avatar": avatar if avatar is not None else profile.default_avatar(u.code),
            "nickname_is_default": u.nickname is None, "avatar_is_default": avatar is None}

@router.post("/users/{code}/profile/reset")
async def reset_user_profile(code: str, request: Request, p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    u = db.get_user_by_code(conn, code)
    if u is None:
        return _not_found()
    detail = {"nickname_custom": u.nickname is not None,
              "avatar_custom": db.get_user_avatar(conn, u.id) is not None}
    db.set_user_profile(conn, u.id, nickname=None, avatar=None)
    _audit(request, p, "user.profile_reset", u.code, detail)
    return {"ok": True}

@router.post("/users/{code}/activate")
async def activate_user(code: str, request: Request, p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    # 代理只能激活本人名下账号（他人账号按不存在处理）；后台人员不限
    by_agent = p.agent_id if p.role == "agent" else None
    res = db.activate_user(conn, code, int(time.time()), by_agent_id=by_agent)
    if res == "not_found":
        return _not_found()
    if res == "already":
        return _err("账号已激活", 409)
    _audit(request, p, "user.activate", code.upper(), {})
    return {"ok": True}

@router.post("/users/{code}/reset-password")
async def reset_password(code: str, request: Request, p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    res = db.reset_user_password(conn, code)
    if res == "not_found":
        return _not_found()
    if res == "pending":
        return _err("账号未激活", 409)
    _audit(request, p, "user.reset_password", code.upper(), {})
    return {"ok": True}

@router.patch("/users/{code}")
async def patch_user(code: str, request: Request, payload: dict = Body(...),
                     p: Principal = STAFF_ONLY):
    rejected = _password_rejected(payload)
    if rejected is not None:
        return rejected
    conn = request.app.state.db_conn
    u = db.get_user_by_code(conn, code)
    if not u:
        return _not_found()
    # 先校验再落库：任何一项非法都不产生部分修改
    kwargs = {}
    if "status" in payload:
        status = payload["status"]
        if not isinstance(status, str) or status not in ALLOWED_STATUS:
            return _err("状态取值无效", 400)
        kwargs["status"] = status
    if "expires_at" in payload:
        exp = payload["expires_at"]
        if not _valid_expires(exp):
            return _err("到期时间无效", 400)
        kwargs["expires_at"] = exp
    # 状态/到期更新与审计同一事务；暂停/封禁不删会话，由 gate 按状态逐请求拒绝
    if kwargs:
        db.apply_user_changes(conn, u, actor_type=p.actor_type, actor=p.username,
                              now=int(time.time()), **kwargs)
    return {"ok": True}

@router.delete("/users/{code}")
async def delete_user(code: str, request: Request, p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    if not db.delete_user(conn, code):
        return _not_found()
    _audit(request, p, "user.delete", code.upper(), {})
    return {"ok": True}

@router.get("/audit-logs")
async def audit_logs(request: Request, p: Principal = STAFF_ONLY):
    q = request.query_params
    try:
        limit = int(q.get("limit", 50))
        offset = int(q.get("offset", 0))
    except ValueError:
        return _err("参数无效", 400)
    if not 0 <= offset <= MAX_INT:      # 负数/超出 SQLite 整数范围（会 OverflowError）一律 400
        return _err("参数无效", 400)
    limit = max(1, min(limit, 200))
    target = q.get("target")
    target = target.strip() if target and target.strip() else None
    rows, total = db.list_audit(request.app.state.db_conn, limit, offset, target)
    return {"logs": rows, "total": total}

@router.post("/login")
async def admin_login(request: Request, response: Response, payload: dict = Body(...)):
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    username = payload.get("username", "")
    password = payload.get("password", "")
    if not isinstance(username, str) or not isinstance(password, str):
        return JSONResponse({"ok": False}, status_code=401)
    throttle = request.app.state.login_throttle
    ip = client_ip(request)
    # 与客户端登录共用限流器，但键加 "admin:" 前缀，两边互不锁定；代理用户名半公开，必须限流
    key = "admin:" + username.strip().casefold()
    # 先查限流再验密码：锁定期间不做 PBKDF2
    if throttle.locked(key, ip):
        return JSONResponse({"ok": False, "error": LOCKED_MSG}, status_code=429)
    admin = admin_auth.authenticate(conn, username, password)
    if not admin:
        throttle.failed(key, ip)
        return JSONResponse({"ok": False}, status_code=401)
    throttle.succeeded(key)         # 密码正确即清零该用户名的失败计数
    # 密码正确后才区分代理资格：暂停/取消的代理不能登录后台
    blocked = admin_auth.agent_login_problem(conn, admin)
    if blocked:
        return JSONResponse({"ok": False, "error": blocked}, status_code=403)
    token = admin_auth.issue_session(conn, settings, admin)
    response.set_cookie(
        settings.admin_cookie_name, token,
        httponly=True, secure=settings.admin_cookie_secure,
        samesite="lax", max_age=settings.admin_session_ttl,
    )
    return {"ok": True}

@router.post("/logout")
async def admin_logout(request: Request, response: Response):
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    token = request.cookies.get(settings.admin_cookie_name)
    if token:
        db.delete_admin_session(conn, token)
    response.delete_cookie(settings.admin_cookie_name)
    return {"ok": True}

@router.get("/me")
async def admin_me(request: Request):
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    admin = admin_auth.current_admin(conn, request.cookies.get(settings.admin_cookie_name))
    p = admin_auth.principal_for_admin(conn, admin) if admin else None
    if p is None:       # 未登录，或代理资格已暂停/取消（已有会话同样失效）
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    agent = db_agents.get_agent(conn, p.agent_id) if p.agent_id is not None else None
    return {"username": p.username, "role": p.role,
            "grants": db.list_active_grants(conn, p.admin_id),
            "agent": db_agents.agent_to_dict(agent) if agent else None}
