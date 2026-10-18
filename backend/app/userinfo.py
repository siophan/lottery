# 共用上游账号的数据不能下发给客户端：所有用户共用一个上游账号，上游返回的 userInfo 是该账号主人的编号、姓名、
# 手机号、身份证、注册时间，部分接口还带着该账号的关注记录。原样下发会让每个客户在首页「软件编号」「个人信息」
# 和专家页「已关注」里看到别人的资料，所以返回前一律换成当前账号自己的视图或去掉。
import json
from datetime import datetime, timedelta, timezone
from . import db, profile

_CST = timezone(timedelta(hours=8))
# 上游字段里只留客户端做功能判断用的（type 控制首页定时检查到期，endTime 由 isExpire 判断，vip 为会员标志），其余丢弃
_KEEP = ("type", "endTime", "vip")
# 客户端 name 或 cardId 为空就弹「请实名认证」并锁住功能；个人信息页只在 cardId 为 18 位时显示，占位值不会露出来
_CARD_PLACEHOLDER = "-"
# 用过的共用账号编号（settings 每个一行）。遗漏页把数据存在客户端本地、key 以 userInfo.username 开头，
# 以前 username 是共用账号编号；客户端拿本地 key 的前缀来问哪些是旧编号（routes/user.py），编号本身不下发
_UPSTREAM_KEY = "upstream_username:"
LEGACY_CANDIDATES_MAX = 50
LEGACY_CANDIDATE_LEN_MAX = 64

def client_user_info(upstream: dict, user: db.User) -> dict:
    info = {k: upstream[k] for k in _KEEP if k in upstream}
    info.update({
        "id": user.id,
        "username": user.code,
        "name": profile.display_nickname(user),
        "mobile": db.mask_phone(user.phone) or "",   # 个人信息页直接对它 substring，不能为 None；页面自己再打码一次结果不变
        "cardId": _CARD_PLACEHOLDER,
        # 号段账号预先建档，created_at 是建号时间；能登录的账号都已激活过，以首次激活为注册时间
        "createDate": datetime.fromtimestamp(user.first_activated_at or user.created_at, _CST).strftime("%Y-%m-%d %H:%M:%S"),
        # 只用于上游付费弹窗的「积分支付」余额；上游下单已整段拦截，给 0 免得让人以为能用本站积分付款
        "score": 0,
    })
    return info

def _rewrite_json(content: bytes, fn) -> bytes:
    """content 是 JSON 对象时交给 fn 改写后重新编码；fn 返回 False 或不是 JSON 对象时原样返回。"""
    try:
        payload = json.loads(content)
    except ValueError:
        return content
    if not isinstance(payload, dict) or fn(payload) is False:
        return content
    return json.dumps(payload, ensure_ascii=False).encode()

def rewrite_user_info(content: bytes, user: db.User) -> bytes:
    """返回共用账号 userInfo 的上游响应：data 换成当前账号的视图；data 不是对象时原样返回。"""
    def fn(payload):
        if not isinstance(payload.get("data"), dict):
            return False
        payload["data"] = client_user_info(payload["data"], user)
    return _rewrite_json(content, fn)

def redact_fields(content: bytes, fields) -> bytes:
    """上游响应顶层的这些字段是共用账号自己的状态（如关注记录），置为 null（客户端按「没有」处理）。"""
    def fn(payload):
        if not any(payload.get(f) is not None for f in fields):
            return False
        for f in fields:
            if f in payload:
                payload[f] = None
    return _rewrite_json(content, fn)

class UpstreamNames:
    """用过的共用账号编号：settings 每个一行，值为最后一次见到的时间（换过共用账号时按它挑最新的一份）。
    进程内记住上次写入的编号，登录时只在编号变了（换号或重启后第一次）才写库。"""

    def __init__(self):
        self._last: str | None = None

    def remember(self, conn, upstream: dict, now: int) -> None:
        name = upstream.get("username")
        if not isinstance(name, str) or not name or name == self._last:
            return
        conn.execute("INSERT INTO settings(key,value) VALUES(?,?)"
                     " ON CONFLICT(key) DO UPDATE SET value=excluded.value", (_UPSTREAM_KEY + name, str(now)))
        conn.commit()
        self._last = name

def legacy_matches(conn, candidates: list[str]) -> list[str]:
    """candidates 里哪些是用过的共用账号编号，最近用过的排前面（客户端按此顺序取第一份有数据的）。"""
    if not candidates:
        return []
    keys = list(dict.fromkeys(_UPSTREAM_KEY + c for c in candidates))
    rows = conn.execute(f"SELECT key FROM settings WHERE key IN ({','.join('?' * len(keys))})"
                        " ORDER BY CAST(value AS INTEGER) DESC, key", keys).fetchall()
    return [r["key"][len(_UPSTREAM_KEY):] for r in rows]

# 每个账号每天最多查几次：客户端每台电脑每个账号成功一次后就不再查，失败才重试。共用账号编号的数字部分以前在首页公开
# 显示过，不限次就能拿这个接口逐个试出完整编号
LEGACY_CHECKS_PER_DAY = 3

class LegacyCheckLimiter:
    """进程内按账号计数（重启清零），按 UTC 自然日重置。"""

    def __init__(self):
        self._used: dict[int, tuple[int, int]] = {}    # user_id → (日序号, 当日次数)

    def allow(self, user_id: int, now: int) -> bool:
        day = now // 86400
        d, n = self._used.get(user_id, (day, 0))
        if d != day:
            n = 0
        if n >= LEGACY_CHECKS_PER_DAY:
            return False
        self._used[user_id] = (day, n + 1)
        return True
