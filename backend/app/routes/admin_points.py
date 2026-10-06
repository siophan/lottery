# 管理后台：积分（加分 / 扣分 / 代理转分 / 代理充值 / 批量充值 / 流水）。
import time
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import admin_auth, db_points
from ..admin_auth import Principal
from ..db_agents import BizError

router = APIRouter()
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))
AGENT_ONLY = Depends(admin_auth.require_role("agent"))
ANY_ROLE = Depends(admin_auth.require_role(*admin_auth.ALL_ROLES))
MAX_INT = 2 ** 62

def _err(e: BizError):
    return JSONResponse({"ok": False, "error": e.msg}, status_code=e.status)

def _bad():
    return JSONResponse({"ok": False, "error": "参数无效"}, status_code=400)

def _staff_adjust(request: Request, p: Principal, holder_type: str, holder, op: str, payload: dict):
    try:
        res = db_points.staff_adjust(request.app.state.db_conn, holder_type, holder, op,
                                     payload.get("amount"), payload.get("reason"),
                                     actor_type=p.actor_type, actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

@router.post("/users/{code}/points/grant")
async def grant_user(code: str, request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    return _staff_adjust(request, p, "user", code, "grant", payload)

@router.post("/users/{code}/points/revoke")
async def revoke_user(code: str, request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    return _staff_adjust(request, p, "user", code, "revoke", payload)

@router.post("/agents/{agent_id}/points/grant")
async def grant_agent(agent_id: int, request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    return _staff_adjust(request, p, "agent", agent_id, "grant", payload)

@router.post("/agents/{agent_id}/points/revoke")
async def revoke_agent(agent_id: int, request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    return _staff_adjust(request, p, "agent", agent_id, "revoke", payload)

@router.post("/users/{code}/points/recharge")
async def recharge_user(code: str, request: Request, payload: dict = Body(...), p: Principal = AGENT_ONLY):
    try:
        res = db_points.recharge_user(request.app.state.db_conn, p.agent_id, code, payload.get("amount"),
                                      actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

@router.post("/agents/{agent_id}/points/transfer")
async def transfer_agent(agent_id: int, request: Request, payload: dict = Body(...), p: Principal = AGENT_ONLY):
    try:
        res = db_points.transfer_to_agent(request.app.state.db_conn, p.agent_id, agent_id,
                                          payload.get("amount"), actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

@router.post("/points/batch-recharge")
async def batch_recharge(request: Request, payload: dict = Body(...), p: Principal = ANY_ROLE):
    try:
        res = db_points.batch_recharge(request.app.state.db_conn, payload.get("codes"), payload.get("amount"),
                                       payload.get("reason"), actor_type=p.actor_type, actor=p.username,
                                       agent_id=p.agent_id if p.role == "agent" else None,
                                       now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

def _opt_int(q, key: str):
    """可选整数查询参数：缺省 / 空串 → None；非整数或超出 0..2**62 → ValueError。"""
    raw = q.get(key)
    if raw is None or raw == "":
        return None
    v = int(raw)
    if not 0 <= v <= MAX_INT:
        raise ValueError(key)
    return v

@router.get("/points/ledger")
async def ledger(request: Request, p: Principal = ANY_ROLE):
    q = request.query_params
    try:
        limit = _opt_int(q, "limit") or 50
        offset = _opt_int(q, "offset") or 0
        since, until = _opt_int(q, "since"), _opt_int(q, "until")
    except ValueError:
        return _bad()
    holder_type = q.get("holder_type") or None
    holder_id = (q.get("holder_id") or "").strip() or None
    kind = q.get("kind") or None
    if (holder_type is not None and holder_type not in db_points.HOLDER_TYPES) \
            or (kind is not None and kind not in db_points.KINDS) \
            or (holder_id is not None and holder_type is None):
        return _bad()
    rows, total = db_points.list_ledger(
        request.app.state.db_conn, max(1, min(limit, 200)), offset, holder_type=holder_type,
        holder_id=holder_id, kind=kind, since=since, until=until,
        agent_id=p.agent_id if p.role == "agent" else None, hide_staff=p.role == "agent")
    return {"ledger": rows, "total": total}
