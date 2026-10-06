# 管理后台：编号段分配（后台人员）、划拨（高级代理）、回收（后台人员）、流水。
import time
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import admin_auth, db_segments
from ..admin_auth import Principal
from ..db_agents import BizError

router = APIRouter()
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))
AGENT_ONLY = Depends(admin_auth.require_role("agent"))
ANY_ROLE = Depends(admin_auth.require_role(*admin_auth.ALL_ROLES))
MAX_INT = 2 ** 62

def _err(e: BizError):
    return JSONResponse({"ok": False, "error": e.msg}, status_code=e.status)

@router.post("/segments/assign")
async def assign(request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    agent_id = payload.get("agent_id")
    if not isinstance(agent_id, int) or isinstance(agent_id, bool):
        return _err(BizError("代理不存在", 404))
    try:
        res = db_segments.assign_segment(request.app.state.db_conn, agent_id, payload.get("start"),
                                         payload.get("end"), actor_type=p.actor_type,
                                         actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

@router.post("/segments/transfer")
async def transfer(request: Request, payload: dict = Body(...), p: Principal = AGENT_ONLY):
    try:
        res = db_segments.transfer_segment(request.app.state.db_conn, p.agent_id,
                                           payload.get("to_agent_id"), payload.get("start"),
                                           payload.get("end"), actor=p.username,
                                           now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

@router.post("/agents/{agent_id}/recycle")
async def recycle(agent_id: int, request: Request, p: Principal = STAFF_ONLY):
    try:
        res = db_segments.recycle_agent(request.app.state.db_conn, agent_id, actor_type=p.actor_type,
                                        actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

@router.get("/segment-ops")
async def segment_ops(request: Request, p: Principal = ANY_ROLE):
    q = request.query_params
    try:
        limit = int(q.get("limit", 50))
        offset = int(q.get("offset", 0))
        agent_id = int(q["agent_id"]) if q.get("agent_id") else None
    except ValueError:
        return JSONResponse({"ok": False, "error": "参数无效"}, status_code=400)
    if not 0 <= offset <= MAX_INT or (agent_id is not None and not 0 <= agent_id <= MAX_INT):
        return JSONResponse({"ok": False, "error": "参数无效"}, status_code=400)
    if p.role == "agent":            # 代理只看与自己有关的流水，且不暴露后台人员用户名
        agent_id = p.agent_id
    rows, total = db_segments.list_segment_ops(request.app.state.db_conn, max(1, min(limit, 200)),
                                               offset, agent_id, hide_staff=p.role == "agent")
    return {"ops": rows, "total": total}
