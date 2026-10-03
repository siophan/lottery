from fastapi import APIRouter, Request, Body
from fastapi.responses import JSONResponse
from .. import db

router = APIRouter()

def _check(request: Request):
    key = request.app.state.settings.admin_key
    return bool(key) and request.headers.get("X-Admin-Key") == key

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
