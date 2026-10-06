# 管理后台：管理员账号与授权管理（仅最高权限者；X-Admin-Key 视为最高权限者）。
import time
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import admin_auth, db_staff
from ..admin_auth import Principal
from ..db_agents import BizError

router = APIRouter()
SUPER_ONLY = Depends(admin_auth.require_role("super"))

def _err(e: BizError):
    return JSONResponse({"ok": False, "error": e.msg}, status_code=e.status)

@router.get("/admins")
async def list_admins(request: Request, p: Principal = SUPER_ONLY):
    return {"admins": db_staff.list_admins(request.app.state.db_conn)}

@router.post("/admins")
async def create_admin(request: Request, payload: dict = Body(...), p: Principal = SUPER_ONLY):
    try:
        admin_id = db_staff.create_staff_admin(request.app.state.db_conn, payload.get("username"),
                                               payload.get("password"), actor=p.username,
                                               now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "id": admin_id}

@router.post("/admins/{admin_id}/password")
async def set_admin_password(admin_id: int, request: Request, payload: dict = Body(...),
                             p: Principal = SUPER_ONLY):
    try:
        db_staff.set_admin_password(request.app.state.db_conn, admin_id, payload.get("password"),
                                    actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}

@router.delete("/admins/{admin_id}")
async def delete_admin(admin_id: int, request: Request, p: Principal = SUPER_ONLY):
    try:
        db_staff.delete_admin(request.app.state.db_conn, admin_id, actor=p.username,
                              now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}

@router.get("/grants")
async def list_grants(request: Request, p: Principal = SUPER_ONLY):
    return {"grants": db_staff.list_grants(request.app.state.db_conn)}

@router.post("/grants")
async def add_grant(request: Request, payload: dict = Body(...), p: Principal = SUPER_ONLY):
    admin_id = payload.get("admin_id")
    if not isinstance(admin_id, int) or isinstance(admin_id, bool):
        return _err(BizError("管理员不存在", 404))
    try:
        db_staff.add_grant(request.app.state.db_conn, admin_id, payload.get("grant"),
                           actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}

@router.delete("/grants/{admin_id}/{grant}")
async def revoke_grant(admin_id: int, grant: str, request: Request, p: Principal = SUPER_ONLY):
    try:
        db_staff.revoke_grant(request.app.state.db_conn, admin_id, grant, actor=p.username,
                              now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}
