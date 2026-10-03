import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from .. import db
from ..security import verify_password
from ..dayys_session import DataYsLoginError

router = APIRouter()

@router.post("/auth/login")
async def login(request: Request):
    payload = await request.json()
    username = (payload.get("username") or "").upper()
    password = payload.get("password") or ""
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    dayys = request.app.state.dayys

    user = db.get_user_by_code(conn, username)
    if user is None or not verify_password(password, user.salt, user.password_hash):
        return JSONResponse({"code": 1, "msg": "账号或密码错误"})
    if user.status != "active" or (user.expires_at is not None and user.expires_at < int(time.time())):
        return JSONResponse({"code": 10022, "msg": "账号已停用或已到期"})

    # 取共享 data-ys 账号的 userInfo（确保服务端已登录上游）
    try:
        user_info = await dayys.get_user_info()
    except DataYsLoginError as e:
        return JSONResponse({"code": 502, "msg": f"上游账号不可用: {e}"}, status_code=502)

    token = db.create_session(conn, user.id, settings.session_ttl)
    return JSONResponse({"code": 0, "data": {"token": token, "userInfo": user_info}})
