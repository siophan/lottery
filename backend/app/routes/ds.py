# 客户端多数据源接口：下拉列表 + 与区块链统计同构的开奖结果。须带我方用户 token。
from fastapi import APIRouter, Request
from .. import db, gate

router = APIRouter()
MAX_ROWS = 300

def _deny(request: Request):
    ok, err = gate.authorize(request.app.state.db_conn, request.headers.get("token", ""))
    return None if ok else err

@router.get("/ds/sources")
async def sources(request: Request, cat: str = ""):
    err = _deny(request)
    if err:
        return err
    data = []
    for s in db.list_data_sources(request.app.state.db_conn):
        if not s.enabled:
            continue
        for lot in s.lotteries:
            if cat and lot.cat != cat:
                continue
            data.append({"source": s.key, "sourceName": s.name, "code": lot.lottery_code,
                         "name": lot.name, "status": s.status})
    return {"code": 0, "msg": "成功", "data": data}

@router.get("/ds/{source}/draw-result")
async def draw_result(source: str, request: Request, code: str = "", rows: str = "1"):
    err = _deny(request)
    if err:
        return err
    try:
        n = int(rows)
    except ValueError:
        n = 0
    if n < 1:
        return {"code": 1, "msg": "rows 参数错误"}
    conn = request.app.state.db_conn
    s = db.get_data_source_by_key(conn, source)
    if s is None:
        return {"code": 1, "msg": "数据源不存在"}
    if not s.enabled:
        return {"code": 1, "msg": "数据源已停用"}
    lot = next((l for l in s.lotteries if l.lottery_code == code), None)
    if lot is None:
        return {"code": 1, "msg": "该数据源未配置此彩种"}
    draws = db.latest_draws(conn, s.id, code, min(n, MAX_ROWS))
    return {"code": 0, "msg": "成功", "data": [
        {"expect": d.expect, "opennumber": d.opennumber, "openTime": d.open_time,
         "lottoId": code, "lottoTypeCn": lot.name}
        for d in draws
    ]}
