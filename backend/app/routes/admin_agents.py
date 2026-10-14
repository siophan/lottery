# 管理后台：代理资料（新建、改地区/级别/上级、资格状态、重置密码、改名、列表与统计）。
import secrets
import string
import time
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import admin_auth, db_agents, db_staff
from ..admin_auth import Principal
from ..db_agents import BizError

router = APIRouter()
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))
ANY_ROLE = Depends(admin_auth.require_role(*admin_auth.ALL_ROLES))
AGENT_ONLY = Depends(admin_auth.require_role("agent"))
MAX_INT = 2 ** 62

AGENT_HIDDEN_FIELDS = ("status_reason", "status_by")     # 后台人员操作信息，代理视图不返回

def _err(e: BizError):
    return JSONResponse({"ok": False, "error": e.msg}, status_code=e.status)

def _is_id_or_none(v) -> bool:
    return v is None or (isinstance(v, int) and not isinstance(v, bool))

@router.get("/agents")
async def list_agents(request: Request, p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    if p.role == "agent":          # 代理只看到自己的直属下级（划拨对象），且不含后台内部的资格变更信息
        return {"agents": [{k: v for k, v in a.items() if k not in AGENT_HIDDEN_FIELDS}
                           for a in db_agents.list_agents(conn, parent_id=p.agent_id)]}
    return {"agents": db_agents.list_agents(conn)}

AGENT_CREATE_BEYOND = "只能开通低于自身级别的代理"
_PW_ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0OoIl1")   # 去掉易混字符

def generate_password(length: int = 12) -> str:
    """开通代理时未填密码：生成字母 + 数字的随机密码（至少各一个），只在本次响应里返回一次。"""
    while True:
        pw = "".join(secrets.choice(_PW_ALPHABET) for _ in range(length))
        if any(c.isalpha() for c in pw) and any(c.isdigit() for c in pw):
            return pw

def _agent_create_fields(conn, p: Principal, payload: dict):
    """代理开通下级（发财猫需求第 2 条）：只有高级代理能开，且只能开本人名下的低级代理，地区标签沿用本人。
    传了其他级别 / 上级 / 地区按越权拒绝，而不是静默改写。返回 (region, tier, parent_agent_id)。"""
    me = db_agents.get_agent(conn, p.agent_id)
    if me is None or me.tier != "senior":
        raise BizError("低级代理不能开通下级代理", 403)
    if (payload.get("tier", "junior") != "junior"
            or payload.get("parent_agent_id", me.id) != me.id
            or payload.get("region", me.region) != me.region):
        raise BizError(AGENT_CREATE_BEYOND, 403)
    return me.region, "junior", me.id

@router.get("/agents/creation-logs")
async def creation_logs(request: Request, p: Principal = AGENT_ONLY):
    """代理查看本人名下代理的开通记录（后台人员在操作日志里看全部）。"""
    q = request.query_params
    try:
        limit, offset = int(q.get("limit", 20)), int(q.get("offset", 0))
    except ValueError:
        return _err(BizError("参数无效"))
    if not 0 <= offset <= MAX_INT:
        return _err(BizError("参数无效"))
    logs, total = db_agents.list_child_creations(request.app.state.db_conn, p.agent_id,
                                                 max(1, min(limit, 200)), offset)
    return {"logs": logs, "total": total}

@router.post("/agents")
async def create_agent(request: Request, payload: dict = Body(...), p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    if p.role == "agent":
        try:
            region, tier, parent = _agent_create_fields(conn, p, payload)
        except BizError as e:
            return _err(e)
    else:
        region, tier, parent = payload.get("region"), payload.get("tier"), payload.get("parent_agent_id")
    if not _is_id_or_none(parent):
        return _err(BizError("上级代理不存在"))
    password = payload.get("password")
    generated = None
    if password is None or (isinstance(password, str) and not password.strip()):
        password = generated = generate_password()
    try:
        a = db_agents.create_agent(
            conn, name=payload.get("name"), password=password,
            region=region, tier=tier, parent_agent_id=parent,
            actor_type=p.actor_type, actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    out = {"ok": True, "agent": db_agents.agent_to_dict(a)}
    if generated is not None:
        out["generated_password"] = generated
    return out

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
