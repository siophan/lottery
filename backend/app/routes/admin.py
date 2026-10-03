from fastapi import APIRouter, Request, Body, Response
from fastapi.responses import JSONResponse
from .. import db
from .. import admin_auth

router = APIRouter()

def _check(request: Request):
    return admin_auth.cookie_or_key_ok(request)

def _forbidden():
    return JSONResponse({"error": "forbidden"}, status_code=403)

@router.post("/users")
async def create_user(request: Request, payload: dict = Body(...)):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    u = db.create_user(conn, payload["code"], payload["password"], payload.get("expires_at"))
    return {"ok": True, "code": u.code}

@router.get("/users")
async def list_users(request: Request):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    return {"users": [
        {"code": u.code, "status": u.status, "expires_at": u.expires_at, "created_at": u.created_at}
        for u in db.list_users(conn)
    ]}

@router.patch("/users/{code}")
async def patch_user(code: str, request: Request, payload: dict = Body(...)):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    kwargs = {}
    for k in ("expires_at", "status", "password"):
        if k in payload:
            kwargs[k] = payload[k]
    return {"ok": db.update_user(conn, code, **kwargs)}

@router.delete("/users/{code}")
async def delete_user(code: str, request: Request):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    return {"ok": db.delete_user(conn, code)}

@router.post("/login")
async def admin_login(request: Request, response: Response, payload: dict = Body(...)):
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    admin = admin_auth.authenticate(conn, payload.get("username", ""), payload.get("password", ""))
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
