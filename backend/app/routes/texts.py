# 文案编辑（发财猫需求第 1 条）：后台增删改查（仅后台人员）+ 客户端按标识 / 分类读取最新文案。
import time
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import admin_auth, db_texts
from ..admin_auth import Principal
from ..db_agents import BizError

router = APIRouter()          # 挂在 /api：客户端读取，不需要登录（登录页的须知类文案也要能读）
admin_router = APIRouter()    # 挂在 /admin
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))

def _err(e: BizError):
    return JSONResponse({"ok": False, "error": e.msg}, status_code=e.status)

@admin_router.get("/texts/categories")
async def categories(p: Principal = STAFF_ONLY):
    return {"categories": [{"value": k, "label": v} for k, v in db_texts.CATEGORIES.items()]}

@admin_router.get("/texts")
async def list_texts(request: Request, p: Principal = STAFF_ONLY):
    return {"texts": db_texts.list_texts(request.app.state.db_conn)}

@admin_router.post("/texts")
async def create_text(request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    try:
        t = db_texts.create_text(request.app.state.db_conn, category=payload.get("category"),
                                 key=payload.get("key"), title=payload.get("title"),
                                 content=payload.get("content", ""), actor_type=p.actor_type,
                                 actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "text": t}

@admin_router.put("/texts/{text_id}")
async def update_text(text_id: int, request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    changes = {k: payload[k] for k in ("category", "key", "title", "content") if k in payload}
    try:
        t = db_texts.update_text(request.app.state.db_conn, text_id, changes, actor_type=p.actor_type,
                                 actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "text": t}

@admin_router.delete("/texts/{text_id}")
async def delete_text(text_id: int, request: Request, p: Principal = STAFF_ONLY):
    try:
        db_texts.delete_text(request.app.state.db_conn, text_id, actor_type=p.actor_type,
                             actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}

@router.get("/texts")
async def read_texts(request: Request, keys: str = "", category: str = ""):
    """?keys=a,b（最多 KEYS_MAX 个）或 ?category=notice。返回 {key: {title, content, category, updated_at}}；
    不存在的 key 不出现在结果里，由客户端保留原文案。no-store：后台保存后立即生效。"""
    conn = request.app.state.db_conn
    if keys:
        ks = [k.strip() for k in keys.split(",") if k.strip()]
        if len(ks) > db_texts.KEYS_MAX:
            return {"code": 1, "msg": f"keys 最多 {db_texts.KEYS_MAX} 个"}
        rows = db_texts.texts_by_keys(conn, ks)
    elif category:
        if category not in db_texts.CATEGORIES:
            return {"code": 1, "msg": "分类无效"}
        rows = db_texts.texts_by_category(conn, category)
    else:
        return {"code": 1, "msg": "缺少 keys 或 category"}
    data = {t["key"]: {"title": t["title"], "content": t["content"], "category": t["category"],
                       "updated_at": t["updated_at"]} for t in rows}
    return JSONResponse({"code": 0, "msg": "成功", "data": data}, headers={"Cache-Control": "no-store"})
