# 开奖推送（K线即时刷新）：K线窗口开一条 SSE 长连接订阅一个彩种，服务端发现新一期就把新增的那几期推下去，
# 客户端不再靠工作台 7 秒轮询 + 六屏各自重拉全量数据。
#   上游彩种（topRows / mantissaTopRows）：有人订阅时，同一彩种只由服务端每秒查一次上游（所有订阅者共用），
#     请求可重叠（上游单次约 2~3 秒），最后一个订阅者离开 IDLE_STOP 秒后停查。
#   我方数据源（/ds/<key>/draw-result）：采集器入库后立即通知（Collector.on_insert），不另外轮询。
# 推送内容：{"rows": [新增各期，新的在前], "prev": 新增各期之前那一期的期号}。客户端本地最新一期等于 prev
# 时直接追加；对不上（漏了期、刚连上）就整屏重载。prev 为 null 表示服务端也接不上（重开或跳期太多）。
# 状态都在进程内存，与 collector 一样要求单 uvicorn 进程。
import asyncio
import json
import signal
import threading
import time
from . import db

ANCHOR_ROWS = 5          # 每次取最新几期，用来和上一次结果比对出新增
POLL_INTERVAL = 1.0      # 上游查询间隔（秒）
MAX_INFLIGHT = 3         # 同一彩种同时在途的上游请求上限
FETCH_TIMEOUT = 8.0
MAX_BACKOFF = 30
IDLE_STOP = 30           # 没有订阅者多少秒后停止查上游
HEARTBEAT = 15           # 心跳间隔（秒），也用来定期复查登录状态；须小于 nginx proxy_read_timeout
QUEUE_SIZE = 20          # 每个订阅者最多积压的推送条数，满了丢最旧的（客户端靠 prev 对不上整屏重载兜底）
MAX_STREAMS = 2000       # 全进程推送连接上限
MAX_STREAMS_PER_USER = 10


def diff_rows(known: list[dict], latest: list[dict]):
    """known / latest 都是新的在前。返回 (新增各期, prev)；没有新增返回 ([], None)。
    latest 的最新一期已在 known 里（同一期或上游返回了旧数据）→ 没有新增；
    known 的最新一期在 latest 里 → 它前面的就是新增，prev 为它的期号；
    都对不上（跳了太多期 / 首次）→ latest 全部视为新增，prev 为 None（客户端整屏重载）。"""
    if not latest:
        return [], None
    seen = {r.get("expect") for r in known}
    if latest[0].get("expect") in seen:
        return [], None
    if known:
        top = known[0].get("expect")
        for i, r in enumerate(latest):
            if r.get("expect") == top:
                return latest[:i], top
    return latest, None


class Feed:
    """一个推送源（一个彩种 / 一个数据源彩种）及其订阅者。"""

    def __init__(self, key: tuple):
        self.key = key
        self.subs: set[asyncio.Queue] = set()
        self.known: list[dict] = []      # 最近一次比对用的最新几期（新的在前）
        self.primed = False              # 第一次取数只记下基准，不推送
        self.task: asyncio.Task | None = None
        self.idle_since: float | None = None

    def publish(self, latest: list[dict]) -> None:
        if not self.primed:
            self.known, self.primed = latest[:ANCHOR_ROWS], True
            return
        rows, prev = diff_rows(self.known, latest)
        if not rows:
            return
        merged = rows + [r for r in self.known if r.get("expect") not in {x.get("expect") for x in rows}]
        self.known = merged[:ANCHOR_ROWS]
        msg = {"rows": rows, "prev": prev}
        for q in list(self.subs):
            if q.full():
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(msg)


class DrawFeedHub:
    def __init__(self, conn, client, from_id: str):
        self.conn = conn
        self.client = client             # 上游 httpx 客户端（base_url 为上游 /api）
        self.from_id = from_id
        self.feeds: dict[tuple, Feed] = {}
        self.streams = 0
        self.user_streams: dict[int, int] = {}
        self.closing = False             # 进程退出中：通知各连接结束，不再接受新连接

    # ---------- 订阅 ----------
    def has_capacity(self, user_id: int) -> bool:
        return not self.closing and self.streams < MAX_STREAMS and self.user_streams.get(user_id, 0) < MAX_STREAMS_PER_USER

    def acquire(self, user_id: int) -> None:
        self.streams += 1
        self.user_streams[user_id] = self.user_streams.get(user_id, 0) + 1

    def release(self, user_id: int) -> None:
        self.streams = max(0, self.streams - 1)
        n = self.user_streams.get(user_id, 0) - 1
        if n > 0:
            self.user_streams[user_id] = n
        else:
            self.user_streams.pop(user_id, None)

    def subscribe(self, key: tuple) -> asyncio.Queue:
        feed = self.feeds.get(key)
        if feed is None:
            feed = self.feeds[key] = Feed(key)
        q: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        feed.subs.add(q)
        feed.idle_since = None
        if key[0] == "up" and (feed.task is None or feed.task.done()):
            feed.task = asyncio.create_task(self._watch(feed), name=f"draw-feed-{key}")
        elif key[0] == "ds" and not feed.primed:
            self._load_ds(feed)
        return q

    def unsubscribe(self, key: tuple, q: asyncio.Queue) -> None:
        feed = self.feeds.get(key)
        if feed is None:
            return
        feed.subs.discard(q)
        if not feed.subs:
            feed.idle_since = time.monotonic()
            if key[0] == "ds":           # 我方数据源没有后台任务，没人订阅就直接丢掉
                del self.feeds[key]

    def close_streams(self) -> None:
        """让所有推送连接结束（给每个订阅者送一个 None）。uvicorn 退出时会等所有连接结束，
        推送长连接不主动结束的话 systemctl restart 会一直卡到 systemd 强杀。"""
        self.closing = True
        for feed in list(self.feeds.values()):
            for q in list(feed.subs):
                while q.full():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                q.put_nowait(None)

    def install_exit_hook(self) -> None:
        """在 uvicorn 的 SIGTERM / SIGINT 处理之前先结束推送连接（lifespan 启动时调用）。
        uvicorn 用 signal.signal 装处理函数，这里包一层；非主线程（测试里的 TestClient）装不了，跳过。"""
        if threading.current_thread() is not threading.main_thread():
            return
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            prev = signal.getsignal(sig)
            if not callable(prev):
                continue

            def handler(signum, frame, prev=prev):
                loop.call_soon_threadsafe(self.close_streams)
                prev(signum, frame)
            signal.signal(sig, handler)

    async def stop(self) -> None:
        for feed in list(self.feeds.values()):
            if feed.task is not None:
                feed.task.cancel()
                try:
                    await feed.task
                except (asyncio.CancelledError, Exception):
                    pass
        self.feeds.clear()

    # ---------- 我方数据源 ----------
    def _ds_rows(self, source_id: int, code: str, name: str) -> list[dict]:
        return [{"expect": d.expect, "opennumber": d.opennumber, "openTime": d.open_time,
                 "lottoId": code, "lottoTypeCn": name}
                for d in db.latest_draws(self.conn, source_id, code, ANCHOR_ROWS)]

    def _load_ds(self, feed: Feed) -> None:
        _, source_id, code, name = feed.key
        feed.publish(self._ds_rows(source_id, code, name))

    def notify_ds(self, source_id: int, code: str) -> None:
        """采集器入库后调用：该数据源彩种有订阅者就比对最新几期并推送。"""
        for key, feed in list(self.feeds.items()):
            if key[0] == "ds" and key[1] == source_id and key[2] == code and feed.subs:
                try:
                    feed.publish(self._ds_rows(source_id, code, key[3]))
                except Exception as e:      # 推送失败不能影响采集
                    print(f"draw feed ds={source_id}/{code} notify failed: {e!r}")

    # ---------- 上游彩种 ----------
    async def fetch_upstream(self, code: str, mantissa: str | None) -> list[dict]:
        if mantissa:
            path, body = "/lotteryNumber/mantissaTopRows", {"code": code, "rows": ANCHOR_ROWS, "mantissa": mantissa}
        else:
            path, body = "/lotteryNumber/topRows", {"code": code, "rows": ANCHOR_ROWS}
        resp = await self.client.post(path, content=json.dumps(body),
                                      headers={"Content-Type": "application/json", "fromId": self.from_id},
                                      timeout=FETCH_TIMEOUT)
        obj = resp.json()
        data = obj.get("data") if isinstance(obj, dict) else None
        if obj.get("code") != 0 or not isinstance(data, list):
            raise ValueError(f"unexpected upstream response code={obj.get('code')!r}")
        return [r for r in data if isinstance(r, dict) and r.get("expect")]

    async def _watch(self, feed: Feed) -> None:
        _, code, mantissa = feed.key
        inflight: set[asyncio.Task] = set()
        failures = 0

        def done(t: asyncio.Task) -> None:
            nonlocal failures
            inflight.discard(t)
            if t.cancelled():
                return
            e = t.exception()
            if e is not None:
                failures += 1
                if failures in (1, 10) or failures % 100 == 0:
                    print(f"draw feed up={code}/{mantissa or ''} fetch failed x{failures}: {e!r}")
                return
            failures = 0
            feed.publish(t.result())

        try:
            while True:
                if not feed.subs and feed.idle_since is not None and time.monotonic() - feed.idle_since >= IDLE_STOP:
                    break
                if len(inflight) < MAX_INFLIGHT:
                    t = asyncio.create_task(self.fetch_upstream(code, mantissa))
                    inflight.add(t)
                    t.add_done_callback(done)
                delay = POLL_INTERVAL if failures == 0 else min(POLL_INTERVAL * 2 ** failures, MAX_BACKOFF)
                await asyncio.sleep(delay)
        finally:
            for t in list(inflight):
                t.cancel()
            if self.feeds.get(feed.key) is feed and not feed.subs:
                del self.feeds[feed.key]
