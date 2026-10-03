import json
import time
from . import db

PREAUTH_PATHS = {"auth/login", "version"}
INVALID_TOKEN_CODES = {10020, 10021}

def authorize(conn, token_header: str):
    if not token_header:
        return False, {"code": 10020, "msg": "未登录"}
    sess = db.get_session(conn, token_header)
    if sess is None or sess.expires_at < int(time.time()):
        return False, {"code": 10020, "msg": "登录已失效，请重新登录"}
    user = None
    for u in db.list_users(conn):
        if u.id == sess.user_id:
            user = u
            break
    if user is None or user.status != "active" or (
        user.expires_at is not None and user.expires_at < int(time.time())
    ):
        return False, {"code": 10022, "msg": "账号已停用或已到期"}
    return True, None

def response_signals_invalid(content: bytes) -> bool:
    try:
        return json.loads(content).get("code") in INVALID_TOKEN_CODES
    except Exception:
        return False
