# 开奖推送接口：GET /api/draws/stream?code=&mantissa=&source=（SSE，须带我方用户 token 头）。
# 不带 source 订阅上游彩种（与 topRows / mantissaTopRows 同源），带 source 订阅我方数据源（与 /ds/<source>/draw-result 同源）。
# 连上先发一行注释和 ready 事件（客户端收到才算推送可用，若被中间代理缓冲就一直收不到，客户端继续靠轮询）；
# 之后每期新增发一个 draws 事件，空闲时每 HEARTBEAT 秒一行心跳并复查登录状态，失效即断开。
import asyncio
import json
import re
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from .. import db, gate
from ..draw_feed import HEARTBEAT

router = APIRouter()
PARAM_RE = re.compile(r"[0-9A-Za-z_-]{1,32}")


def _event(name: str, data) -> str:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}\n\n"


async def stream_events(hub, key: tuple, user_id: int, still_valid):
    """推送事件生成器。客户端断开时 StreamingResponse 会取消它；登录失效时自己结束。退出时退订并释放连接名额。
    名额在生成器里占用：响应还没开始客户端就断开时生成器不会运行，也就不会漏释放。"""
    hub.acquire(user_id)
    q = None
    try:
        q = hub.subscribe(key)
        yield ": ok\n\n" + _event("ready", {})
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=HEARTBEAT)
            except asyncio.TimeoutError:
                if not still_valid():
                    return
                yield ": ping\n\n"
                continue
            if msg is None:            # 服务端退出（DrawFeedHub.close_streams）
                return
            yield _event("draws", msg)
    finally:
        if q is not None:
            hub.unsubscribe(key, q)
        hub.release(user_id)


@router.get("/draws/stream")
async def draws_stream(request: Request, code: str = "", mantissa: str = "", source: str = ""):
    conn = request.app.state.db_conn
    token = request.headers.get("token", "")
    user, err = gate.authorize_user(conn, token)
    if user is None:
        return err
    if not PARAM_RE.fullmatch(code) or (mantissa and not PARAM_RE.fullmatch(mantissa)) \
            or (source and not PARAM_RE.fullmatch(source)):
        return {"code": 1, "msg": "参数错误"}
    if source:
        s = db.get_data_source_by_key(conn, source)
        if s is None or not s.enabled:
            return {"code": 1, "msg": "数据源不存在或已停用"}
        lot = next((l for l in s.lotteries if l.lottery_code == code), None)
        if lot is None:
            return {"code": 1, "msg": "该数据源未配置此彩种"}
        key = ("ds", s.id, code, lot.name)
    else:
        key = ("up", code, mantissa or None)
    hub = request.app.state.draw_feed
    if not hub.has_capacity(user.id):
        return {"code": 1, "msg": "推送连接过多"}

    def still_valid() -> bool:
        return gate.authorize_user(conn, token)[0] is not None

    return StreamingResponse(
        stream_events(hub, key, user.id, still_valid),
        media_type="text/event-stream",
        # X-Accel-Buffering：让 nginx 不缓冲这条响应，推送才能即时到达
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
