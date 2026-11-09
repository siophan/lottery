import json
import posixpath
import re
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
# 均衡方案 / 倍投方案 / 关注专家 / 遗漏监控 / 模拟练习原本存在共用账号名下（人人可见可删），现由 member_data.py 按会员
# 隔离处理，在兜底转发里先于下面的放行清单分派，都不在放行清单里。课程报名入口已去掉，查询按「未报名」回成功
# （报错时职业培训页不加载），报名接口拦截
EMPTY_DATA = {
    "coursemsg/info": None,       # 未报名
}
# 返回共用账号 userInfo 的接口：响应里的 data 要换成当前账号自己的视图（userinfo.rewrite_user_info）
USERINFO_PATHS = {"user/isexpire", "user/info"}
# 允许转发的路径形状：非空段、只含字母数字下划线连字符（上游所有接口都是这种形状）。
# 上游若按 Servlet / Spring 规则处理路径，「user/updatePwd;x」「user/updatePwd.json」「user/updatePwd.」
# 都会落到被拦的接口上，所以 ; . 空白 控制字符 反斜杠 空段 一律不转发，不去猜上游怎么规范化
SAFE_PATH = re.compile(r"[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*")
# 放行清单：客户端（client/js）实际调用的上游接口，去掉上面拦截的那些。上游可能还有客户端没用到的
# 扣费 / 改账号接口，清单外的一律不转发。客户端更新用到新接口时，要先把它加进来
ALLOWED_PATHS = frozenset(p.lower() for p in """
version
basketballGameInfoJc/historySchedule basketballGameInfoJc/matchDetailData basketballGameInfoJc/meetingList
basketballGameInfoJc/schedule basketballGameInfoJc/scheduleChart basketballGameInfoJc/searchOdds
codeTrend/animalsDm codeTrend/chart
core/serviceAi
crawler/getList crawler/numList
dantuo/getHot dantuo/getList
footballHistoryClash/schedule footballHistoryMeetingJc/schedule
footballHistorySchedule/historySchedule footballHistorySchedule/schedule
footballHistoryScheduleJc/historySchedule footballHistoryScheduleJc/schedule
footballLeague/info footballLeague/schedule footballLeague/standingBs footballLeague/standingLs footballLeague/team
footballZqszsc/schedule
footballgameinfo/chart footballgameinfo/live footballgameinfo/schedule
footballgameinfojc/getChang footballgameinfojc/jc2c1 footballgameinfojc/schedule footballgameinfojc/scheduleChart
footballgameinfojc/scheduleChart2c1 footballgameinfojc/scheduleLive footballgameinfojc/searchOdds
footballplanjc/history footballplanjc/info footballplanjc/list
footballplanttg/history footballplanttg/info footballplanttg/list
hisData/getHistoryDataList hisData/getOddsList
lotteryNumber/getOpenNum lotteryNumber/mantissaDate lotteryNumber/mantissaTopRows lotteryNumber/topRows
lotterynumberplan/info lotterynumberplan/list lotterynumberplan/page
miss3dp3/list missanimal/list misshash/list
numExpert/rankingAll numExpertPlan/expect numExpertPlan/list
omission/getOpenNumber
planFixed/list
product/list
sjb/getJf sjb/getQd sjb/getSchedule
softnotice/getNotice softnotice/list
softproductzc/showVip
sportExpert/infoList sportExpert/rankingAll
sportExpertPlan/basketballJc/plan sportExpertPlan/chartJc sportExpertPlan/football/plan
sportExpertPlan/footballJc/expert sportExpertPlan/footballJc/plan sportExpertPlan/footballJc/planInfo
sportExpertPlan/kLink
user/info user/isExpire user/isVip
video/list videodirectory/list
vipplan/history vipplan/list vipplan/profit vipplan/statistics
""".split())

def normalize(path: str) -> str:
    return posixpath.normpath("/" + path).strip("/").lower()

def is_blocked(path: str) -> bool:
    """形状不合规、不在放行清单、或命中拦截清单与前缀（按小写比较）的路径一律拦截。"""
    if not SAFE_PATH.fullmatch(path):
        return True
    norm = normalize(path)
    return (norm not in ALLOWED_PATHS or norm in BLOCKED_PATHS
            or norm.split("/", 1)[0] in BLOCKED_PREFIXES)

def empty_response(path: str) -> dict | None:
    """已拦截的读取接口要回的「没有数据」响应；不是这类接口返回 None。只对 is_blocked 为真的路径调用。"""
    norm = normalize(path)
    return {"code": 0, "msg": "成功", "data": EMPTY_DATA[norm]} if norm in EMPTY_DATA else None

# 单设备登录（同一账号同一时间只在一台电脑上有效）：
# 客户端主进程给发往我方接口的每个请求加 X-Device-Id（本机硬件特征码的哈希）和 X-Device-Name（URL 编码的计算机名）。
DEVICE_HEADER = "x-device-id"
DEVICE_NAME_HEADER = "x-device-name"
DEVICE_RE = re.compile(r"[A-Za-z0-9_-]{16,128}")
DEFAULT_IDLE_TTL = 7200         # 与 Settings.session_idle_ttl 默认一致
TOUCH_EVERY = 30                # 最后活跃时间最多每 30 秒写一次库
ONLINE_WINDOW = 90              # 最后活跃在 90 秒内算在线（客户端每 15 秒心跳一次）
KICKED_MSG = {
    "replaced": "该账号已在其他设备登录，您已被强制下线，请重新登录",
    "admin": "您已被后台强制下线，请重新登录",
}

def kicked_response(reason: str | None) -> dict:
    # 10021：客户端原有的「被挤下线」码，弹窗提示 msg、清空本地会话、回到登录页
    return {"code": 10021, "msg": KICKED_MSG.get(reason or "", KICKED_MSG["replaced"])}

def device_of(headers) -> str:
    """请求头里的设备码；格式不对按没带处理（返回空串）。"""
    v = (headers.get(DEVICE_HEADER) or "").strip()
    return v if DEVICE_RE.fullmatch(v) else ""

def device_name_of(headers) -> str | None:
    from urllib.parse import unquote
    raw = headers.get(DEVICE_NAME_HEADER) or ""
    try:
        name = unquote(raw, errors="strict")
    except UnicodeDecodeError:
        return None
    name = "".join(ch for ch in name if ch.isprintable()).strip()[:64]
    return name or None

def authorize_user(conn, token_header: str, device: str = "", *, idle_ttl: int = DEFAULT_IDLE_TTL,
                   now: int | None = None):
    """会话 + 账号状态校验；通过 → (User, None)，否则 (None, 错误响应)。
    device 为请求头里的设备码：会话绑定了设备时必须一致（旧设备拿着被盗用的 token 换台电脑也不行）。"""
    now = int(time.time()) if now is None else now
    if not token_header:
        return None, {"code": 10020, "msg": "未登录"}
    sess = db.get_session(conn, token_header)
    if sess is None or sess.expires_at < now:
        return None, {"code": 10020, "msg": "登录已失效，请重新登录"}
    if sess.revoked_at is not None:         # 被其他设备登录挤掉 / 后台强制下线
        return None, kicked_response(sess.revoked_reason)
    if sess.device_id is not None and device != sess.device_id:
        return None, {"code": 10020, "msg": "登录已失效，请重新登录"}
    if (sess.last_seen_at or sess.created_at) < now - idle_ttl:
        db.delete_session(conn, sess.token)     # 空闲超时（崩溃 / 断网 / 休眠）：释放设备占用
        return None, {"code": 10020, "msg": "登录已超时，请重新登录"}
    user = db.get_user_by_id(conn, sess.user_id)
    if user is not None and user.status == "banned":
        return None, {"code": 10024, "msg": "账号已封禁，无法登录"}
    # 待激活 / 暂停 / 到期 / 未完成首登：旧会话一律视为无效，防止绕过
    if (user is None or user.first_activated_at is None or user.status != "active"
            or user.onboarded_at is None
            or (user.expires_at is not None and user.expires_at < now)):
        return None, {"code": 10022, "msg": "账号已停用或已到期"}
    if user.points <= 0:        # 积分暂停（余额为 0）：优先级最低，排在封禁 / 暂停 / 到期 / 未完成首登之后
        return None, dict(POINTS_EMPTY)
    if sess.last_seen_at is None or now - sess.last_seen_at >= TOUCH_EVERY:
        db.touch_session(conn, sess.token, now)
    return user, None

def authorize_request(request):
    """从请求里取 token、设备码与空闲时限，调 authorize_user。"""
    return authorize_user(request.app.state.db_conn, request.headers.get("token", ""),
                          device_of(request.headers),
                          idle_ttl=request.app.state.settings.session_idle_ttl)

def authorize(conn, token_header: str, device: str = "", *, idle_ttl: int = DEFAULT_IDLE_TTL):
    user, err = authorize_user(conn, token_header, device, idle_ttl=idle_ttl)
    return user is not None, err

def authorize_ok(request):
    user, err = authorize_request(request)
    return user is not None, err

def response_signals_invalid(content: bytes) -> bool:
    try:
        return json.loads(content).get("code") in INVALID_TOKEN_CODES
    except Exception:
        return False
