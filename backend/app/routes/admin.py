import os
import sqlite3
import time
from fastapi import APIRouter, Request, Body, Response
from fastapi.responses import JSONResponse, FileResponse
from .. import db
from .. import admin_auth

router = APIRouter()

ALLOWED_STATUS = ("active", "disabled", "banned")   # 使用控制：正常 / 暂停 / 封禁

_ADMIN_INDEX = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "static", "admin-dist", "index.html"
)

def _check(request: Request):
    return admin_auth.cookie_or_key_ok(request)

def _forbidden():
    return JSONResponse({"error": "forbidden"}, status_code=403)

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

def _audit(request: Request, action: str, target: str, detail: dict) -> None:
    db.add_audit(request.app.state.db_conn, "admin", admin_auth.actor_of(request),
                 action, target, detail)

@router.post("/users")
async def create_user(request: Request, payload: dict = Body(...)):
    if not _check(request):
        return _forbidden()
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
    _audit(request, "user.create", u.code, {"expires_at": expires_at})
    return {"ok": True, "code": u.code}

@router.get("/users")
async def list_users(request: Request):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    return {"users": [
        {"code": u.code, "status": u.status, "expires_at": u.expires_at, "created_at": u.created_at,
         "activated": u.first_activated_at is not None,
         "first_activated_at": u.first_activated_at,
         "phone": db.mask_phone(u.phone),
         "onboarded": u.onboarded_at is not None}
        for u in db.list_users(conn)
    ]}

@router.post("/users/{code}/activate")
async def activate_user(code: str, request: Request):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    res = db.activate_user(conn, code, int(time.time()))
    if res == "not_found":
        return _not_found()
    if res == "already":
        return _err("账号已激活", 409)
    _audit(request, "user.activate", code.upper(), {})
    return {"ok": True}

@router.post("/users/{code}/reset-password")
async def reset_password(code: str, request: Request):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    res = db.reset_user_password(conn, code)
    if res == "not_found":
        return _not_found()
    if res == "pending":
        return _err("账号未激活", 409)
    _audit(request, "user.reset_password", code.upper(), {})
    return {"ok": True}

@router.patch("/users/{code}")
async def patch_user(code: str, request: Request, payload: dict = Body(...)):
    if not _check(request):
        return _forbidden()
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
        db.apply_user_changes(conn, u, actor_type="admin", actor=admin_auth.actor_of(request),
                              now=int(time.time()), **kwargs)
    return {"ok": True}

@router.delete("/users/{code}")
async def delete_user(code: str, request: Request):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    if not db.delete_user(conn, code):
        return _not_found()
    _audit(request, "user.delete", code.upper(), {})
    return {"ok": True}

@router.get("/audit-logs")
async def audit_logs(request: Request):
    if not _check(request):
        return _forbidden()
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
    target = target.strip().upper() if target and target.strip() else None
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
    admin = admin_auth.authenticate(conn, username, password)
    if not admin:
        return JSONResponse({"ok": False}, status_code=401)
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
    if not admin:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"username": admin.username}
