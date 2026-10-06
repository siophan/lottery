import json
import time
from . import db

PREAUTH_PATHS = {"auth/login", "version"}
INVALID_TOKEN_CODES = {10020, 10021}
POINTS_EMPTY = {"code": 10025, "msg": "无积分，无权操作，请充值积分后自动恢复使用！"}

def authorize(conn, token_header: str):
    if not token_header:
        return False, {"code": 10020, "msg": "未登录"}
    sess = db.get_session(conn, token_header)
    if sess is None or sess.expires_at < int(time.time()):
        return False, {"code": 10020, "msg": "登录已失效，请重新登录"}
    user = db.get_user_by_id(conn, sess.user_id)
    if user is not None and user.status == "banned":
        return False, {"code": 10024, "msg": "账号已封禁，无法登录"}
    # 待激活 / 暂停 / 到期 / 未完成首登：旧会话一律视为无效，防止绕过
    if (user is None or user.first_activated_at is None or user.status != "active"
            or user.onboarded_at is None
            or (user.expires_at is not None and user.expires_at < int(time.time()))):
        return False, {"code": 10022, "msg": "账号已停用或已到期"}
    if user.points <= 0:        # 积分暂停（余额为 0）：优先级最低，排在封禁 / 暂停 / 到期 / 未完成首登之后
        return False, dict(POINTS_EMPTY)
    return True, None

def response_signals_invalid(content: bytes) -> bool:
    try:
        return json.loads(content).get("code") in INVALID_TOKEN_CODES
    except Exception:
        return False
