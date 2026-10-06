"""登录失败限流：进程内滑动窗口计数（生产为单个 uvicorn 进程，无需共享存储）。

按账号编号（大写）与客户端 IP 分别计数；窗口内失败次数达到上限即锁定一段时间。
密码正确但没拿到会话的登录（未激活、首登、暂停、封禁、无积分）只计入 IP。
锁定期间直接拒绝，不再做 PBKDF2 校验，顺带节省 CPU。内存有界：访问时清理过期记录，
键数超过上限时丢弃最久未失败、且不在锁定期的键。
"""
import time
from collections import OrderedDict, deque

LOCKED_MSG = "登录失败次数过多，请15分钟后再试"
_LOCAL_PEERS = ("127.0.0.1", "::1")


class FailureCounter:
    def __init__(self, limit: int, window: float, lockout: float,
                 max_keys: int = 10000, clock=time.monotonic):
        self.limit = limit
        self.window = window
        self.lockout = lockout
        self.max_keys = max_keys
        self.clock = clock
        # key -> [失败时间戳 deque, 锁定截止时间(0 表示未锁)]；按最近一次失败排序，最旧在前
        self._entries: OrderedDict[str, list] = OrderedDict()

    def __len__(self) -> int:
        return len(self._entries)

    def __contains__(self, key: str) -> bool:
        return key in self._entries

    def _stale(self, entry, now: float) -> bool:
        hits, locked_until = entry
        return locked_until <= now and (not hits or hits[-1] <= now - self.window)

    def _prune_oldest(self, now: float) -> None:
        # 最旧的若干键若已完全过期就顺手删掉（有序字典头部即最久未失败的键）
        while self._entries:
            key, entry = next(iter(self._entries.items()))
            if not self._stale(entry, now):
                break
            del self._entries[key]

    def locked(self, key: str) -> bool:
        now = self.clock()
        entry = self._entries.get(key)
        if entry is None:
            return False
        if entry[1] > now:
            return True
        if self._stale(entry, now):
            del self._entries[key]
        return False

    def hit(self, key: str) -> None:
        now = self.clock()
        self._prune_oldest(now)
        entry = self._entries.get(key)
        if entry is None:
            if len(self._entries) >= self.max_keys:
                self._evict(now)
            entry = self._entries[key] = [deque(), 0]
        else:
            self._entries.move_to_end(key)
        hits = entry[0]
        if entry[1] and entry[1] <= now:      # 锁定已到期：重新计数
            entry[1] = 0
            hits.clear()
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        hits.append(now)
        if len(hits) >= self.limit:
            entry[1] = now + self.lockout
            hits.clear()

    def _evict(self, now: float) -> None:
        # 优先丢最久未失败、且不在锁定期的键：灌满键数不能让已锁定的账号/IP 提前解锁
        for key, entry in self._entries.items():
            if entry[1] <= now:
                del self._entries[key]
                return
        self._entries.popitem(last=False)     # 全部都在锁定期：退而丢最旧的

    def clear(self, key: str) -> None:
        self._entries.pop(key, None)


class LoginThrottle:
    """账号：15 分钟内失败 5 次锁 15 分钟；IP：15 分钟内失败 30 次锁 15 分钟。"""

    def __init__(self, clock=time.monotonic):
        self.code = FailureCounter(5, 900, 900, clock=clock)
        self.ip = FailureCounter(30, 900, 900, clock=clock)

    def locked(self, code: str, ip: str) -> bool:
        # 两个都要查（会顺带清理过期记录），不能短路
        code_locked = self.code.locked(code)
        ip_locked = self.ip.locked(ip)
        return code_locked or ip_locked

    def failed(self, code: str, ip: str) -> None:
        self.code.hit(code)
        self.ip.hit(ip)

    def attempted(self, ip: str) -> None:
        """密码正确但不发会话的登录：只计入 IP，不锁账号（否则别人可借此锁住真实用户）。"""
        self.ip.hit(ip)

    def succeeded(self, code: str) -> None:
        self.code.clear(code)


def client_ip(request) -> str:
    """生产环境在本机 nginx 之后：对端是本机时才信任转发头。
    X-Real-IP 由 nginx 用 $remote_addr 覆盖写入，可直接用；X-Forwarded-For 经 $proxy_add_x_forwarded_for
    会保留客户端自带的值并在最右追加 $remote_addr，所以只取最右一项（最左可被伪造）。"""
    host = request.client.host if request.client else ""
    if host in _LOCAL_PEERS:
        v = (request.headers.get("x-real-ip") or "").split(",")[0].strip()
        if v:
            return v
        v = (request.headers.get("x-forwarded-for") or "").split(",")[-1].strip()
        if v:
            return v
    return host
