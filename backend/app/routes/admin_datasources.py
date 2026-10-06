# 管理后台：数据源增删改、启停、最新开奖。仅后台人员（最高权限者/管理员，或 X-Admin-Key）可访问；写操作后让采集器按新配置重载。
import re
from dataclasses import asdict
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import db, admin_auth
from ..adapters import ADAPTERS

router = APIRouter()
# 数据源只对后台人员开放（代理不可见）
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))

# 一律 fullmatch：re.match + $ 会放过结尾的换行符
KEY_RE = re.compile(r"[a-z0-9_-]{1,32}")
URL_RE = re.compile(r"https?://[^\s?]+")
CATS = {"hash", "1105", "animals"}
MIN_INTERVAL = 3
MAX_DRAW_ROWS = 300

def _bad(msg: str):
    return JSONResponse({"ok": False, "error": msg}, status_code=400)

def _not_found():
    return JSONResponse({"ok": False, "error": "not found"}, status_code=404)

def _nonempty(v) -> bool:
    return isinstance(v, str) and v.strip() != ""

def _parse_source(p: dict):
    """校验并规整提交的数据源，返回 (fields, None) 或 (None, 错误信息)。"""
    key = p.get("key")
    if not isinstance(key, str) or not KEY_RE.fullmatch(key):
        return None, "key 只能是 1-32 位小写字母、数字、- 或 _"
    if not _nonempty(p.get("name")):
        return None, "名称不能为空"
    if p.get("adapter") not in ADAPTERS:
        return None, "返回格式（adapter）无效"
    base_url = p.get("base_url")
    if not isinstance(base_url, str) or not URL_RE.fullmatch(base_url):
        return None, "接口地址需以 http(s):// 开头且不含 ? 参数"
    headers = p.get("headers", {})
    if not isinstance(headers, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in headers.items()
    ):
        return None, "请求头必须是字符串键值对"
    interval = p.get("interval_sec", 5)
    if isinstance(interval, bool) or not isinstance(interval, int) or interval < MIN_INTERVAL:
        return None, f"拉取周期不能小于 {MIN_INTERVAL} 秒"
    enabled = p.get("enabled", True)
    if not isinstance(enabled, bool):
        return None, "enabled 必须是布尔值"
    lots_in = p.get("lotteries")
    if not isinstance(lots_in, list) or not lots_in:
        return None, "至少配置一个彩种映射"
    lots, seen = [], set()
    for item in lots_in:
        if not isinstance(item, dict) or not all(
            _nonempty(item.get(k)) for k in ("lottery_code", "remote_code", "name")
        ):
            return None, "彩种映射的统一编码、远端编码、名称不能为空"
        if item.get("cat") not in CATS:
            return None, "彩种映射的工作台无效"
        code = item["lottery_code"].strip()
        if code in seen:
            return None, f"统一编码 {code} 重复"
        seen.add(code)
        lots.append(db.SourceLottery(code, item["remote_code"].strip(), item["name"].strip(), item["cat"]))
    return dict(key=key, name=p["name"].strip(), adapter=p["adapter"], base_url=base_url,
                headers=headers, interval_sec=interval, enabled=enabled, lotteries=lots), None

@router.get("/data-sources")
async def list_sources(request: Request, _p=STAFF_ONLY):
    return {"sources": [asdict(s) for s in db.list_data_sources(request.app.state.db_conn)]}

@router.post("/data-sources")
async def create_source(request: Request, payload: dict = Body(...), _p=STAFF_ONLY):
    fields, err = _parse_source(payload)
    if err:
        return _bad(err)
    conn = request.app.state.db_conn
    if db.get_data_source_by_key(conn, fields["key"]) is not None:
        return _bad(f"key {fields['key']} 已存在")
    s = db.create_data_source(conn, **fields)
    await request.app.state.collector.reload(s.id)
    return {"ok": True, "source": asdict(s)}

@router.put("/data-sources/{source_id}")
async def update_source(source_id: int, request: Request, payload: dict = Body(...), _p=STAFF_ONLY):
    conn = request.app.state.db_conn
    if db.get_data_source(conn, source_id) is None:
        return _not_found()
    fields, err = _parse_source(payload)
    if err:
        return _bad(err)
    other = db.get_data_source_by_key(conn, fields["key"])
    if other is not None and other.id != source_id:
        return _bad(f"key {fields['key']} 已存在")
    db.update_data_source(conn, source_id, **fields)
    await request.app.state.collector.reload(source_id)
    return {"ok": True, "source": asdict(db.get_data_source(conn, source_id))}

@router.patch("/data-sources/{source_id}/enabled")
async def toggle_source(source_id: int, request: Request, payload: dict = Body(...), _p=STAFF_ONLY):
    enabled = payload.get("enabled")
    if not isinstance(enabled, bool):
        return _bad("enabled 必须是布尔值")
    if not db.set_data_source_enabled(request.app.state.db_conn, source_id, enabled):
        return _not_found()
    await request.app.state.collector.reload(source_id)
    return {"ok": True}

@router.delete("/data-sources/{source_id}")
async def delete_source(source_id: int, request: Request, _p=STAFF_ONLY):
    if not db.delete_data_source(request.app.state.db_conn, source_id):
        return _not_found()
    await request.app.state.collector.reload(source_id)   # 源已删除：只取消任务
    return {"ok": True}

@router.get("/data-sources/{source_id}/draws")
async def latest_draws(source_id: int, request: Request, code: str = "", rows: int = 20,
                       _p=STAFF_ONLY):
    conn = request.app.state.db_conn
    if db.get_data_source(conn, source_id) is None:
        return _not_found()
    draws = db.latest_draws(conn, source_id, code, max(1, min(rows, MAX_DRAW_ROWS)))
    return {"draws": [asdict(d) for d in draws]}
