# 多数据源采集：每个启用的源一个 asyncio 循环，互不影响；结果按 source_id 入库并回写状态。
# 运行在 FastAPI 进程内（lifespan 启停），生产必须单 uvicorn 进程，否则会重复采集。
import asyncio
import time
import httpx
from . import db
from .adapters import ADAPTERS, ParseError

FETCH_ROWS = 10        # 全球统计 trial 接口最多返回 10 行
FETCH_TIMEOUT = 8.0
MAX_BACKOFF = 60
KEEP_ROWS = 2000

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

    async def _fetch_one(self, src, lot) -> None:
        try:
            resp = await self.client.get(
                src.base_url, params={"code": lot.remote_code, "rows": FETCH_ROWS},
                headers=src.headers, timeout=FETCH_TIMEOUT,
            )
        except httpx.TimeoutException:
            raise FetchError(f"超时 {int(FETCH_TIMEOUT)}s")
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
        while True:
            src = db.get_data_source(self.conn, source_id)
            if src is None or not src.enabled:
                return
            try:
                ok = await self.tick(source_id)
            except Exception as e:      # CancelledError 不是 Exception，取消照常生效
                ok = False
                print(f"collector source={source_id} tick crashed: {e!r}")
            failures = 0 if ok else failures + 1
            await asyncio.sleep(backoff_delay(src.interval_sec, failures))

    def _spawn(self, source_id: int) -> None:
        self._tasks[source_id] = asyncio.create_task(self._run(source_id))

    async def _cancel(self, source_id: int) -> None:
        t = self._tasks.pop(source_id, None)
        if t is None:
            return
        t.cancel()
        try:
            await t
        except asyncio.CancelledError:
            pass

    async def start(self) -> None:
        for src in db.list_data_sources(self.conn):
            if src.enabled:
                self._spawn(src.id)

    async def reload(self, source_id: int) -> None:
        """配置变更后调用：取消旧任务，源仍存在且启用时按新配置重建。"""
        await self._cancel(source_id)
        src = db.get_data_source(self.conn, source_id)
        if src is not None and src.enabled:
            self._spawn(source_id)

    async def stop(self) -> None:
        for sid in list(self._tasks):
            await self._cancel(sid)
        if self._owns_client:
            await self.client.aclose()

    def running_ids(self) -> set[int]:
        return {sid for sid, t in self._tasks.items() if not t.done()}
