import json
import posixpath
import time
from . import db

PREAUTH_PATHS = {"auth/login", "version"}
INVALID_TOKEN_CODES = {10020, 10021}
POINTS_EMPTY = {"code": 10025, "msg": "无积分，无权操作，请充值积分后自动恢复使用！"}
# 所有用户共用一个上游账号：会改动该账号资料、密码、手机号、实名的接口一律不转发，
# 否则任一用户在旧客户端「个人信息 / 修改密码」里的操作会改掉全体共用的上游账号。
BLOCKED_PATHS = {"user/updatepwd", "user/updatemobile", "user/updateinfo", "user/realname",
                 "user/forgotpwd", "auth/forgetpwd", "auth/checkuserinfo", "sms/send"}
# 上游下单 / 续费 / 订单查询同样以共用账号的身份进行（含「积分支付」直接扣共用账号余额，订单列表人人可见），整段拦截
BLOCKED_PREFIXES = ("order",)
BLOCKED = {"code": 1, "msg": "该功能暂不可用"}

def is_blocked(path: str) -> bool:
    """按规范化后的路径匹配：忽略大小写、多余的斜杠和 . / .. 段，防止换个写法绕过。"""
    norm = posixpath.normpath("/" + path).strip("/").lower()
    return norm in BLOCKED_PATHS or norm.split("/", 1)[0] in BLOCKED_PREFIXES

def authorize_user(conn, token_header: str):
    """与 authorize 相同的校验；通过 → (User, None)，否则 (None, 错误响应)。"""
    if not token_header:
        return None, {"code": 10020, "msg": "未登录"}
    sess = db.get_session(conn, token_header)
    if sess is None or sess.expires_at < int(time.time()):
        return None, {"code": 10020, "msg": "登录已失效，请重新登录"}
    user = db.get_user_by_id(conn, sess.user_id)
    if user is not None and user.status == "banned":
        return None, {"code": 10024, "msg": "账号已封禁，无法登录"}
    # 待激活 / 暂停 / 到期 / 未完成首登：旧会话一律视为无效，防止绕过
    if (user is None or user.first_activated_at is None or user.status != "active"
            or user.onboarded_at is None
            or (user.expires_at is not None and user.expires_at < int(time.time()))):
        return None, {"code": 10022, "msg": "账号已停用或已到期"}
    if user.points <= 0:        # 积分暂停（余额为 0）：优先级最低，排在封禁 / 暂停 / 到期 / 未完成首登之后
        return None, dict(POINTS_EMPTY)
    return user, None

def authorize(conn, token_header: str):
    user, err = authorize_user(conn, token_header)
    return user is not None, err

def response_signals_invalid(content: bytes) -> bool:
    try:
        return json.loads(content).get("code") in INVALID_TOKEN_CODES
    except Exception:
        return False
