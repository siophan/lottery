# 管理后台：代理资料（新建、改地区/级别/上级、资格状态、重置密码、改名、列表与统计）。
import time
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import admin_auth, db_agents, db_staff
from ..admin_auth import Principal
from ..db_agents import BizError

router = APIRouter()
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))
ANY_ROLE = Depends(admin_auth.require_role(*admin_auth.ALL_ROLES))

def _err(e: BizError):
    return JSONResponse({"ok": False, "error": e.msg}, status_code=e.status)

def _is_id_or_none(v) -> bool:
    return v is None or (isinstance(v, int) and not isinstance(v, bool))

@router.get("/agents")
async def list_agents(request: Request, p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    if p.role == "agent":          # 代理只看到自己的直属下级（划拨对象）
        return {"agents": db_agents.list_agents(conn, parent_id=p.agent_id)}
    return {"agents": db_agents.list_agents(conn)}

@router.post("/agents")
async def create_agent(request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    parent = payload.get("parent_agent_id")
    if not _is_id_or_none(parent):
        return _err(BizError("上级代理不存在"))
    try:
        a = db_agents.create_agent(
            request.app.state.db_conn, name=payload.get("name"), password=payload.get("password"),
            region=payload.get("region"), tier=payload.get("tier"), parent_agent_id=parent,
            actor_type=p.actor_type, actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "agent": db_agents.agent_to_dict(a)}

@router.patch("/agents/{agent_id}")
async def update_agent(agent_id: int, request: Request, payload: dict = Body(...),
                       p: Principal = STAFF_ONLY):
    if "name" in payload:
        return _err(BizError("改名请使用「改名」功能"))
    if "status" in payload:
        return _err(BizError("资格变更请使用「资格状态」功能"))
    kwargs = {k: payload[k] for k in ("region", "tier", "parent_agent_id") if k in payload}
    if "parent_agent_id" in kwargs and not _is_id_or_none(kwargs["parent_agent_id"]):
        return _err(BizError("上级代理不存在"))
    try:
        a = db_agents.update_agent(request.app.state.db_conn, agent_id, actor_type=p.actor_type,
                                   actor=p.username, now=int(time.time()), **kwargs)
    except BizError as e:
        return _err(e)
    return {"ok": True, "agent": db_agents.agent_to_dict(a)}

@router.post("/agents/{agent_id}/status")
async def set_status(agent_id: int, request: Request, payload: dict = Body(...),
                     p: Principal = STAFF_ONLY):
    try:
        a = db_agents.set_agent_status(request.app.state.db_conn, agent_id, payload.get("status"),
                                       payload.get("reason"), actor_type=p.actor_type,
                                       actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "agent": db_agents.agent_to_dict(a)}

@router.post("/agents/{agent_id}/password")
async def set_password(agent_id: int, request: Request, payload: dict = Body(...),
                       p: Principal = STAFF_ONLY):
    try:
        db_agents.set_agent_password(request.app.state.db_conn, agent_id, payload.get("password"),
                                     actor_type=p.actor_type, actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}

@router.post("/agents/{agent_id}/rename")
async def rename(agent_id: int, request: Request, payload: dict = Body(...),
                 p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    # 改名：最高权限者（含 X-Admin-Key）直接可用；管理员需持有 agent.rename 授权
    if p.role != "super" and not db_staff.has_grant(conn, p.admin_id, "agent.rename"):
        raise admin_auth.AdminDenied()
    try:
        a = db_agents.rename_agent(conn, agent_id, payload.get("name"), actor_type=p.actor_type,
                                   actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "agent": db_agents.agent_to_dict(a)}
