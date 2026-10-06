import re
import secrets
import sys
import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from .. import db
from ..security import verify_password
from ..throttle import LOCKED_MSG, client_ip
from ..dayys_session import DataYsLoginError

router = APIRouter()

ONBOARD_TICKET_TTL = 900        # 首登票据 15 分钟
SMS_PURPOSE = "onboard"
SMS_CODE_TTL = 300              # 验证码 5 分钟有效
SMS_COOLDOWN = 60               # 同号冷却 60 秒
SMS_DAILY_LIMIT = 10            # 同号 24 小时上限
PHONE_RE = re.compile(r"^1[3-9]\d{9}$")

_TICKET_INVALID = {"code": 10031, "msg": "操作已超时，请重新登录"}
_SMS_CHECK_MSG = {
    "missing": "验证码已过期，请重新获取",
    "expired": "验证码已过期，请重新获取",
    "wrong": "验证码错误",
    "too_many": "验证码错误次数过多，请重新获取",
}


def _ticket_user_problem(user, now: int) -> JSONResponse | None:
    """票据签发后账号可能被封禁/暂停/到期：此时不再允许继续首登流程。"""
    if user.status == "banned":
        return JSONResponse({"code": 10024, "msg": "账号已封禁，无法登录"})
    if user.status != "active" or (user.expires_at is not None and user.expires_at < now):
        return JSONResponse({"code": 10022, "msg": "账号已停用或已到期"})
    return None


def _fail(msg: str) -> JSONResponse:
    return JSONResponse({"code": 1, "msg": msg})


def _bound_phone_problem(user, phone: str) -> JSONResponse | None:
    """重置密码后重新首登：已绑定手机号的账号只能用原号码验证（spec 待确认 #6）。"""
    if user.phone and phone != user.phone:
        return _fail(f"请使用已绑定的手机号（尾号{user.phone[-4:]}）验证")
    return None


async def _json_dict(request: Request) -> dict:
    # 请求体不是 JSON 对象时按空处理，由后续校验统一返回业务错误
    try:
        payload = await request.json()
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _str(payload: dict, key: str) -> str:
    v = payload.get(key)
    return v if isinstance(v, str) else ""


def password_problem(old: str, new: str, confirm: str) -> str | None:
    """新密码规则（spec 4.2 第 3–6 条，按此顺序）；通过返回 None，否则返回提示文案。"""
    if len(new) < 8:
        return "新密码长度不能少于8位"
    if len(new) > 20:
        return "新密码长度不能超过20位"
    # 字母/数字只按 ASCII 计，避免全角字符、中文被当成字母
    if not (re.search(r"[A-Za-z]", new) and re.search(r"[0-9]", new)):
        return "新密码必须同时包含字母和数字"
    if new == db.INITIAL_PASSWORD or new == old:
        return "新密码不能与初始密码相同"
    if new != confirm:
        return "两次输入的新密码不一致"
    return None


@router.post("/auth/login")
async def login(request: Request):
    payload = await request.json()
    username = (payload.get("username") or "").upper()
    password = payload.get("password") or ""
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    dayys = request.app.state.dayys

    throttle = request.app.state.login_throttle
    ip = client_ip(request)
    # 先查限流再验密码：锁定期间不做 PBKDF2，既挡暴力猜测也省 CPU
    if throttle.locked(username, ip):
        return JSONResponse({"code": 1, "msg": LOCKED_MSG})

    user = db.get_user_by_code(conn, username)
    if user is None or not verify_password(password, user.salt, user.password_hash):
        throttle.failed(username, ip)
        return JSONResponse({"code": 1, "msg": "账号或密码错误"})
    throttle.succeeded(username)        # 密码正确即清零该账号的失败计数
    now = int(time.time())
    if user.first_activated_at is None:     # 待激活账号预置了初始密码，输对密码才会走到这里
        return JSONResponse({"code": 10023, "msg": "账号未激活，请联系有激活权限的人员激活"})
    if user.status == "banned":      # 封禁优先于暂停/到期
        return JSONResponse({"code": 10024, "msg": "账号已封禁，无法登录"})
    if user.status != "active" or (user.expires_at is not None and user.expires_at < now):
        return JSONResponse({"code": 10022, "msg": "账号已停用或已到期"})
    if user.onboarded_at is None:
        # 未完成首登：不建会话、不触达上游，只发只能用于改密/发短信的临时票据
        ticket = db.create_onboard_ticket(conn, user.id, ONBOARD_TICKET_TTL)
        return JSONResponse({"code": 10030, "msg": "首次登录请修改密码并绑定手机号",
                             "data": {"onboardToken": ticket}})

    # 取共享 data-ys 账号的 userInfo（确保服务端已登录上游）
    try:
        user_info = await dayys.get_user_info()
    except DataYsLoginError as e:
        return JSONResponse({"code": 502, "msg": f"上游账号不可用: {e}"}, status_code=502)

    token = db.create_session(conn, user.id, settings.session_ttl)
    return JSONResponse({"code": 0, "data": {"token": token, "userInfo": user_info}})


@router.post("/auth/onboard/sms")
async def onboard_sms(request: Request):
    payload = await _json_dict(request)
    conn = request.app.state.db_conn
    sms = request.app.state.sms
    now = int(time.time())

    user = db.get_onboard_ticket_user(conn, _str(payload, "onboardToken"), now)
    if user is None:
        return JSONResponse(_TICKET_INVALID)
    blocked = _ticket_user_problem(user, now)
    if blocked is not None:
        return blocked
    phone = _str(payload, "phone")
    if not PHONE_RE.fullmatch(phone):
        return _fail("手机号格式错误")
    blocked = _bound_phone_problem(user, phone)
    if blocked is not None:
        return blocked
    last = db.last_sms_sent_at(conn, phone)
    if last is not None and now - last < SMS_COOLDOWN:
        return _fail("验证码发送过于频繁，请稍后再试")
    # 同号 24 小时上限；另按账号限制，防止凭一张票据向大量不同手机号群发
    if (db.count_sms_sent_since(conn, phone, now - 86400) >= SMS_DAILY_LIMIT
            or db.count_sms_sent_by_user_since(conn, user.id, now - 86400) >= SMS_DAILY_LIMIT):
        return _fail("今日验证码发送次数已达上限")

    code = "".join(secrets.choice("0123456789") for _ in range(6))
    db.save_sms_code(conn, phone, SMS_PURPOSE, code, SMS_CODE_TTL, now, user_id=user.id)
    try:
        await sms.send_code(phone, code)
    except Exception as e:      # SmsError 及发送器的任何意外异常：删掉刚存的码，不向用户暴露细节
        db.delete_sms_code(conn, phone, SMS_PURPOSE, user_id=user.id)
        # 给运维留诊断线索：类型 + 信息（SmsError 的信息本身不含密钥）
        print(f"[sms] send failed: {type(e).__name__}: {e}", file=sys.stderr)
        return _fail("验证码发送失败，请稍后再试")
    return JSONResponse({"code": 0, "msg": "验证码已发送", "data": {"resendAfter": SMS_COOLDOWN}})


@router.post("/auth/onboard")
async def onboard(request: Request):
    payload = await _json_dict(request)
    conn = request.app.state.db_conn
    now = int(time.time())

    user = db.get_onboard_ticket_user(conn, _str(payload, "onboardToken"), now)
    if user is None:
        return JSONResponse(_TICKET_INVALID)
    blocked = _ticket_user_problem(user, now)
    if blocked is not None:
        return blocked
    old = _str(payload, "oldPassword")
    if not verify_password(old, user.salt, user.password_hash):
        return _fail("旧密码错误")
    new = _str(payload, "newPassword")
    problem = password_problem(old, new, _str(payload, "confirmPassword"))
    if problem:
        return _fail(problem)
    phone = _str(payload, "phone")
    if not PHONE_RE.fullmatch(phone):
        return _fail("手机号格式错误")
    blocked = _bound_phone_problem(user, phone)
    if blocked is not None:
        return blocked
    # 前面都通过才校验（消耗）验证码，避免无谓的错误计数
    result = db.check_sms_code(conn, phone, SMS_PURPOSE, _str(payload, "smsCode"), now,
                               user_id=user.id)
    if result != "ok":
        return _fail(_SMS_CHECK_MSG[result])

    db.complete_onboarding(conn, user.id, new, phone, now,
                           audit_detail={"phone": db.mask_phone(phone)})
    return JSONResponse({"code": 0, "msg": "密码修改与手机号绑定成功，请使用新密码重新登录"})
