# 多数据源采集：每个启用的源一个 asyncio 循环，互不影响；结果按 source_id 入库并回写状态。
# 运行在 FastAPI 进程内（lifespan 启停），生产必须单 uvicorn 进程，否则会重复采集。
# 另外每次（重）建源任务时，对库内不足 BACKFILL_ROWS 期的彩种做一次性历史回填（独立任务，不拖慢实时轮询）。
import asyncio
import time
import httpx
from . import db
from .adapters import ADAPTERS, ParseError

FETCH_ROWS = 10        # 全球统计 trial 接口最多返回 10 行
FETCH_TIMEOUT = 8.0
MAX_BACKOFF = 60
KEEP_ROWS = 2000
DEFAULT_INTERVAL = 5   # 尚未读到配置时的默认轮询间隔（秒）
BACKFILL_ROWS = 1000   # 区块链统计大 rows 最多给 1000 行；全球统计 trial 仍只给 10 行
BACKFILL_TIMEOUT = 120.0   # 区块链统计 1000 行约 70s

class FetchError(Exception):
    pass

def backoff_delay(interval_sec: int, failures: int) -> float:
    """连续失败 n 次后的等待秒数：min(interval × 2^n, 60)；未失败时就是 interval。"""
    if failures <= 0:
        return interval_sec
    return min(interval_sec * 2 ** failures, MAX_BACKOFF)

class Collector:
    def __init__(self, conn, client: httpx.AsyncClient | None = None):
        self.conn = conn
        self._owns_client = client is None
        self.client = client or httpx.AsyncClient(timeout=FETCH_TIMEOUT, follow_redirects=True)
        self._tasks: dict[int, asyncio.Task] = {}
        self._backfills: dict[tuple[int, str], asyncio.Task] = {}   # (source_id, lottery_code) → 回填任务
        self._locks: dict[int, asyncio.Lock] = {}                   # 按源串行化 reload，避免并发重建出孤儿任务

    async def _fetch_one(self, src, lot, rows: int = FETCH_ROWS, timeout: float = FETCH_TIMEOUT) -> None:
        try:
            resp = await self.client.get(
                src.base_url, params={"code": lot.remote_code, "rows": rows},
                headers=src.headers, timeout=timeout,
            )
        except httpx.TimeoutException:
            raise FetchError(f"超时 {int(timeout)}s")
        except httpx.RequestError as e:
            raise FetchError(f"网络错误: {e}")
        if resp.status_code != 200:
            raise FetchError(f"HTTP {resp.status_code}")
        try:
            obj = resp.json()
        except ValueError:
            raise FetchError("非 JSON 响应")
        parse = ADAPTERS.get(src.adapter)
        if parse is None:
            raise FetchError(f"未知适配器 {src.adapter}")
        try:
            draws = parse(obj)
        except ParseError as e:
            raise FetchError(str(e))
        db.insert_draws(self.conn, src.id, lot.lottery_code, draws, int(time.time()))
        db.prune_draws(self.conn, src.id, lot.lottery_code, KEEP_ROWS)

    async def tick(self, source_id: int) -> bool:
        """拉一轮该源的全部彩种；任一彩种失败不影响其余彩种。返回本轮是否全部成功。"""
        src = db.get_data_source(self.conn, source_id)
        if src is None:
            return False
        errors = []
        for lot in src.lotteries:
            try:
                await self._fetch_one(src, lot)
            except FetchError as e:
                errors.append(f"{lot.remote_code}: {e}")
            except Exception as e:      # 兜底：任何意外都只记在本源
                errors.append(f"{lot.remote_code}: {type(e).__name__}: {e}")
        if errors:
            db.record_source_error(self.conn, src.id, "; ".join(errors)[:500])
            return False
        db.record_source_ok(self.conn, src.id, int(time.time()))
        return True

    async def _run(self, source_id: int) -> None:
        failures = 0
        interval = DEFAULT_INTERVAL      # 读配置失败时沿用最近一次已知的间隔
        while True:
            try:
                # 读配置也在保护区内：数据库被锁、headers_json 损坏等都只算一次失败，循环不死
                src = db.get_data_source(self.conn, source_id)
                if src is None or not src.enabled:
                    return
                interval = src.interval_sec
                ok = await self.tick(source_id)
            except Exception as e:      # CancelledError 不是 Exception，取消照常生效
                ok = False
                print(f"collector source={source_id} loop error: {e!r}")
            failures = 0 if ok else failures + 1
            await asyncio.sleep(backoff_delay(interval, failures))

    async def _backfill(self, source_id: int, lottery_code: str) -> None:
        """一次性历史回填：库内不足 BACKFILL_ROWS 期时拉一次大 rows。
        失败只记日志、绝不外抛，也不改源状态（状态只反映实时轮询）。"""
        try:
            src = db.get_data_source(self.conn, source_id)
            if src is None or not src.enabled:
                return
            lot = next((l for l in src.lotteries if l.lottery_code == lottery_code), None)
            if lot is None or db.count_draws(self.conn, source_id, lottery_code) >= BACKFILL_ROWS:
                return
            await self._fetch_one(src, lot, BACKFILL_ROWS, BACKFILL_TIMEOUT)
            print(f"collector source={source_id} lottery={lottery_code} backfill done: "
                  f"{db.count_draws(self.conn, source_id, lottery_code)} rows")
        except Exception as e:      # CancelledError 不是 Exception，取消照常生效
            print(f"collector source={source_id} lottery={lottery_code} backfill failed: {e!r}")
        finally:
            key = (source_id, lottery_code)
            if self._backfills.get(key) is asyncio.current_task():
                del self._backfills[key]

    def _spawn(self, source_id: int) -> None:
        self._tasks[source_id] = asyncio.create_task(self._run(source_id), name=f"collector-{source_id}")

    def _spawn_backfills(self, src) -> None:
        for lot in src.lotteries:
            key = (src.id, lot.lottery_code)
            t = self._backfills.get(key)
            if t is not None and not t.done():      # 同一源×彩种不并发回填
                continue
            self._backfills[key] = asyncio.create_task(
                self._backfill(src.id, lot.lottery_code),
                name=f"collector-backfill-{src.id}-{lot.lottery_code}")

    async def _await_cancelled(self, t: asyncio.Task, label: str) -> None:
        t.cancel()
        try:
            await t
        except asyncio.CancelledError:
            pass
        except Exception as e:      # 任务早已因意外异常退出：只记录，保证 stop()/reload() 照常完成
            print(f"collector {label} task ended with error: {e!r}")

    async def _cancel(self, source_id: int) -> None:
        t = self._tasks.pop(source_id, None)
        if t is not None:
            await self._await_cancelled(t, f"source={source_id}")
        for key in [k for k in self._backfills if k[0] == source_id]:
            bt = self._backfills.pop(key, None)
            if bt is not None:
                await self._await_cancelled(bt, f"source={source_id} lottery={key[1]} backfill")

    def _lock(self, source_id: int) -> asyncio.Lock:
        return self._locks.setdefault(source_id, asyncio.Lock())

    async def start(self) -> None:
        for src in db.list_data_sources(self.conn):
            if src.enabled:
                self._spawn(src.id)
                self._spawn_backfills(src)

    async def reload(self, source_id: int) -> None:
        """配置变更后调用：取消旧任务，源仍存在且启用时按新配置重建。同一源的 reload 串行执行。"""
        async with self._lock(source_id):
            await self._cancel(source_id)
            src = db.get_data_source(self.conn, source_id)
            if src is not None and src.enabled:
                self._spawn(source_id)
                self._spawn_backfills(src)

    async def stop(self) -> None:
        for sid in dict.fromkeys([*self._tasks, *(k[0] for k in self._backfills)]):
            await self._cancel(sid)
        if self._owns_client:
            await self.client.aclose()

    def running_ids(self) -> set[int]:
        return {sid for sid, t in self._tasks.items() if not t.done()}
