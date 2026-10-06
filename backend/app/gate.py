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
# 允许转发的路径形状：非空段、只含字母数字下划线连字符（上游所有接口都是这种形状）。
# 上游若按 Servlet / Spring 规则处理路径，「user/updatePwd;x」「user/updatePwd.json」「user/updatePwd.」
# 都会落到被拦的接口上，所以 ; . 空白 控制字符 反斜杠 空段 一律不转发，不去猜上游怎么规范化
SAFE_PATH = re.compile(r"[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*")
# 放行清单：客户端（client/js）实际调用的上游接口，去掉上面拦截的那些。上游可能还有客户端没用到的
# 扣费 / 改账号接口，清单外的一律不转发。客户端更新用到新接口时，要先把它加进来
ALLOWED_PATHS = frozenset(p.lower() for p in """
version
averagePlan/del averagePlan/info averagePlan/list averagePlan/save
basketballGameInfoJc/historySchedule basketballGameInfoJc/matchDetailData basketballGameInfoJc/meetingList
basketballGameInfoJc/schedule basketballGameInfoJc/scheduleChart basketballGameInfoJc/searchOdds
codeTrend/animalsDm codeTrend/chart
core/serviceAi
coursemsg/info coursemsg/save
crawler/getList crawler/numList
dantuo/getHot dantuo/getList
doublePlan/del doublePlan/info doublePlan/list doublePlan/save
expertFavorites/del expertFavorites/list expertFavorites/save
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
misscontrol/del misscontrol/list misscontrol/save
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
user/info user/init user/isExpire user/isVip
userNumPlan/del userNumPlan/info userNumPlan/list userNumPlan/save
video/list videodirectory/list
vipplan/history vipplan/list vipplan/profit vipplan/statistics
""".split())

def is_blocked(path: str) -> bool:
    """形状不合规、不在放行清单、或命中拦截清单与前缀（按小写比较）的路径一律拦截。"""
    if not SAFE_PATH.fullmatch(path):
        return True
    norm = posixpath.normpath("/" + path).strip("/").lower()
    return (norm not in ALLOWED_PATHS or norm in BLOCKED_PATHS
            or norm.split("/", 1)[0] in BLOCKED_PREFIXES)

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
