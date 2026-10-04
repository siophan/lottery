import asyncio
import httpx
from app import db
from app.collector import Collector, backoff_delay

def qk_resp(code):
    return {"msg": "成功！", "code": 0, "data": [
        {"expect": "202610041324", "opennumber": "3,9,7,4,5", "openTime": "2026-10-04 22:04:14", "lottoId": code}]}

def qq_resp():
    return {"code": 0, "msg": "成功", "data": [
        {"issue": "202610041324", "drawResult": "3,9,7,4,5", "drawTime": "2026-10-04 22:04:00"}]}

def ok_handler(req):
    if req.url.host == "qqtj666.com":
        return httpx.Response(200, json=qq_resp())
    return httpx.Response(200, json=qk_resp(req.url.params["code"]))

def make(handler):
    conn = db.connect(":memory:"); db.init_db(conn)      # 种子：1=qkltj（4 彩种），2=qqtj（2 彩种）
    return conn, Collector(conn, httpx.AsyncClient(transport=httpx.MockTransport(handler)))

def test_tick_requests_remote_code_and_rows():
    seen = []
    def handler(req):
        seen.append((req.url.host, req.url.path, req.url.params["code"], req.url.params["rows"]))
        return ok_handler(req)
    conn, col = make(handler)
    assert asyncio.run(col.tick(2)) is True
    assert seen == [("qqtj666.com", "/api/trial/draw-result", "trxbhffc", "10"),
                    ("qqtj666.com", "/api/trial/draw-result", "trxbh3fc", "10")]
    assert [d.expect for d in db.latest_draws(conn, 2, "6001", 5)] == ["202610041324"]

def test_failing_source_does_not_affect_other():
    def handler(req):
        if req.url.host == "qqtj666.com":
            raise httpx.ReadTimeout("timed out", request=req)
        return ok_handler(req)
    conn, col = make(handler)
    async def run():
        return await col.tick(1), await col.tick(2)
    assert asyncio.run(run()) == (True, False)
    s1, s2 = db.get_data_source(conn, 1), db.get_data_source(conn, 2)
    assert s1.status == "ok" and s1.last_ok_at is not None
    assert s2.status == "error" and "trxbhffc: 超时" in s2.last_error and "trxbh3fc: 超时" in s2.last_error
    assert len(db.latest_draws(conn, 1, "6001", 5)) == 1
    assert db.latest_draws(conn, 2, "6001", 5) == []

def test_partial_failure_keeps_other_lotteries():
    def handler(req):
        if req.url.params["code"] == "trxbhffc":
            return httpx.Response(429, text="too many")
        return ok_handler(req)
    conn, col = make(handler)
    assert asyncio.run(col.tick(2)) is False
    s = db.get_data_source(conn, 2)
    assert s.status == "error" and s.last_error == "trxbhffc: HTTP 429"
    assert len(db.latest_draws(conn, 2, "6002", 5)) == 1      # 三分彩照常入库

def test_parse_error_and_non_json_reported():
    def handler(req):
        if req.url.params["code"] == "trxbhffc":
            return httpx.Response(200, json=qk_resp("6001"))     # 格式不对
        return httpx.Response(200, text="<html>")
    conn, col = make(handler)
    asyncio.run(col.tick(2))
    err = db.get_data_source(conn, 2).last_error
    assert "trxbhffc: 缺少字段 issue" in err and "trxbh3fc: 非 JSON 响应" in err

def test_success_after_error_resets_status():
    state = {"fail": True}
    def handler(req):
        if state["fail"]:
            return httpx.Response(500)
        return ok_handler(req)
    conn, col = make(handler)
    asyncio.run(col.tick(2))
    assert db.get_data_source(conn, 2).status == "error"
    state["fail"] = False
    asyncio.run(col.tick(2))
    s = db.get_data_source(conn, 2)
    assert s.status == "ok" and s.last_error is None

def test_custom_headers_sent():
    seen = {}
    def handler(req):
        seen["auth"] = req.headers.get("authorization")
        return ok_handler(req)
    conn, col = make(handler)
    s = db.get_data_source(conn, 2)
    db.update_data_source(conn, 2, key=s.key, name=s.name, adapter=s.adapter, base_url=s.base_url,
                          headers={"Authorization": "Bearer T"}, interval_sec=5, enabled=True,
                          lotteries=s.lotteries)
    asyncio.run(col.tick(2))
    assert seen["auth"] == "Bearer T"

def test_backoff_delay():
    assert [backoff_delay(5, n) for n in (0, 1, 2, 3, 4)] == [5, 10, 20, 40, 60]

def test_start_reload_stop():
    hosts = set()
    def handler(req):
        hosts.add(req.url.host)
        return ok_handler(req)
    conn, col = make(handler)
    conn.execute("UPDATE data_sources SET interval_sec=0"); conn.commit()   # 测试里不等待
    async def run():
        await col.start()
        await asyncio.sleep(0.05)
        assert col.running_ids() == {1, 2}
        db.set_data_source_enabled(conn, 2, False)
        await col.reload(2)
        assert col.running_ids() == {1}
        db.set_data_source_enabled(conn, 2, True)
        await col.reload(2)
        assert col.running_ids() == {1, 2}
        await col.stop()
        assert col.running_ids() == set()
    asyncio.run(run())
    assert hosts == {"api.qkltj.com", "qqtj666.com"}
    assert db.get_data_source(conn, 1).status == "ok"


def test_run_survives_config_read_error(monkeypatch):
    reqs = []
    def handler(req):
        reqs.append(req.url.params.get("code"))
        return ok_handler(req)
    conn, col = make(handler)
    conn.execute("UPDATE data_sources SET interval_sec=0"); conn.commit()
    real = db.get_data_source
    state = {"calls": 0, "raised_at_reqs": None}
    def flaky(c, sid):
        state["calls"] += 1
        # 第 3 次读配置（第二轮循环开头，此时间隔已知为 0）抛错一次
        if state["calls"] == 3:
            state["raised_at_reqs"] = len(reqs)
            raise RuntimeError("database is locked")
        return real(c, sid)
    monkeypatch.setattr("app.collector.db.get_data_source", flaky)
    async def run():
        col._spawn(2)
        for _ in range(2000):            # 最多约 2s，满足条件即退出
            await asyncio.sleep(0.001)
            if state["raised_at_reqs"] is not None and len(reqs) > state["raised_at_reqs"]:
                break
        alive = col.running_ids()
        await col.stop()
        return alive
    assert asyncio.run(run()) == {2}                   # 任务没有因读配置异常而死
    assert len(reqs) > state["raised_at_reqs"] > 0     # 抛错之后仍继续采集
    assert db.get_data_source(conn, 2).status == "ok"


def test_run_first_config_read_error_uses_default_backoff(monkeypatch):
    conn, col = make(ok_handler)
    def boom(c, sid):
        raise RuntimeError("database is locked")
    monkeypatch.setattr("app.collector.db.get_data_source", boom)
    async def run():
        col._spawn(2)
        await asyncio.sleep(0.01)
        alive = col.running_ids()      # 首次读配置就失败：任务仍在（睡默认 5s×2 的退避）
        await col.stop()
        return alive
    assert asyncio.run(run()) == {2}


def test_stop_survives_dead_task_and_closes_client():
    conn = db.connect(":memory:"); db.init_db(conn)
    conn.execute("UPDATE data_sources SET interval_sec=0"); conn.commit()
    col = Collector(conn)           # 自有 client，stop 必须关闭它
    async def run():
        async def boom():
            raise RuntimeError("died")
        async def forever():
            await asyncio.sleep(3600)
        dead = asyncio.create_task(boom())
        await asyncio.sleep(0)       # 让 dead 先因异常结束
        alive = asyncio.create_task(forever())
        col._tasks[1] = dead         # dict 顺序：先取消已死任务
        col._tasks[2] = alive
        await col.stop()
        assert alive.cancelled()
        assert col.running_ids() == set()
        assert col.client.is_closed
    asyncio.run(run())


# ---------------- 一次性历史回填 ----------------

def backfill_rows(n):
    return {"msg": "成功！", "code": 0, "data": [
        {"expect": f"B{i:04d}", "opennumber": "1,2,3,4,5", "openTime": f"2026-10-03 {i // 60:02d}:{i % 60:02d}:00",
         "lottoId": "x"} for i in range(n)]}

def only_qkltj(conn):
    db.set_data_source_enabled(conn, 2, False)      # 回填测试只看区块链统计

async def wait_until(cond, spins=2000):
    """只让出事件循环、不真睡：直到 cond() 成立或转满 spins 次。"""
    for _ in range(spins):
        if cond():
            return True
        await asyncio.sleep(0)
    return cond()

async def drain_backfills(col):
    await asyncio.gather(*list(col._backfills.values()), return_exceptions=True)

def test_backfill_requests_large_rows_and_inserts():
    seen = []
    def handler(req):
        seen.append((req.url.params["code"], req.url.params["rows"]))
        if req.url.params["rows"] == "1000":
            return httpx.Response(200, json=backfill_rows(30))
        return ok_handler(req)
    conn, col = make(handler)
    only_qkltj(conn)
    async def run():
        await col.start()
        await drain_backfills(col)
        await col.stop()
    asyncio.run(run())
    assert sorted(c for c, r in seen if r == "1000") == ["5001", "5002", "6001", "6002"]
    assert sorted(c for c, r in seen if r == "10") == ["5001", "5002", "6001", "6002"]   # 实时轮询照常
    assert db.count_draws(conn, 1, "6001") == 31          # 回填 30 + 实时 1
    assert db.latest_draws(conn, 1, "6001", 1)[0].expect == "202610041324"

def test_backfill_skipped_when_enough_history():
    seen = []
    def handler(req):
        seen.append((req.url.params["code"], req.url.params["rows"]))
        if req.url.params["rows"] == "1000":
            return httpx.Response(200, json=backfill_rows(5))
        return ok_handler(req)
    conn, col = make(handler)
    only_qkltj(conn)
    from app.adapters import Draw
    db.insert_draws(conn, 1, "6001", [Draw(f"H{i:04d}", "0", f"2026-10-02 {i // 60 % 24:02d}:{i % 60:02d}:{i // 1440:02d}")
                                      for i in range(1000)], 1)
    async def run():
        await col.start()
        await drain_backfills(col)
        await col.stop()
    asyncio.run(run())
    assert sorted(c for c, r in seen if r == "1000") == ["5001", "5002", "6002"]      # 6001 已够 1000 期

def test_backfill_failure_keeps_status_and_live_continues():
    live = []
    def handler(req):
        if req.url.params["rows"] == "1000":
            raise httpx.ReadTimeout("timed out", request=req)
        live.append(req.url.params["code"])
        return ok_handler(req)
    conn, col = make(handler)
    only_qkltj(conn)
    async def run():
        await col._backfill(1, "6001")                    # 失败不外抛
        s = db.get_data_source(conn, 1)
        assert s.status == "unknown" and s.last_error is None      # 状态只反映实时轮询
        conn.execute("UPDATE data_sources SET interval_sec=0"); conn.commit()
        await col.start()
        await drain_backfills(col)
        n = len(live)
        assert await wait_until(lambda: len(live) > n + 8)          # 回填失败后实时轮询仍在跑
        alive = col.running_ids()
        await col.stop()
        return alive
    assert asyncio.run(run()) == {1}
    s = db.get_data_source(conn, 1)
    assert s.status == "ok" and s.last_error is None
    assert db.count_draws(conn, 1, "6001") == 1

def test_backfill_cancelled_by_reload_and_stop_and_not_duplicated():
    hits = []
    def handler(req):
        if req.url.params["rows"] == "1000":
            async def hang():
                hits.append(req.url.params["code"])
                await asyncio.Event().wait()             # 永不返回：模拟慢请求在途
            return hang()
        return ok_handler(req)
    conn, col = make(handler)
    only_qkltj(conn)
    async def run():
        await col.start()
        assert await wait_until(lambda: len(hits) == 4)
        first = list(col._backfills.values())
        col._spawn_backfills(db.get_data_source(conn, 1))   # 在途时重复触发：不应再发请求
        assert await wait_until(lambda: len(hits) > 4, spins=200) is False
        await col.reload(1)
        assert all(t.cancelled() for t in first)            # reload 取消旧回填并重建
        assert await wait_until(lambda: len(hits) == 8)
        second = list(col._backfills.values())
        assert len(second) == 4 and not any(t.done() for t in second)
        await col.stop()
        assert all(t.cancelled() for t in second)
        assert col._backfills == {}
    asyncio.run(run())
    assert db.get_data_source(conn, 1).status == "ok"


# ---------------- reload 并发与总开关 ----------------

def live_tasks(source_id):
    return [t for t in asyncio.all_tasks() if t.get_name() == f"collector-{source_id}" and not t.done()]

def test_concurrent_reloads_leave_exactly_one_task():
    conn, col = make(ok_handler)
    async def run():
        await col.start()
        await asyncio.sleep(0)
        await asyncio.gather(col.reload(2), col.reload(2), col.reload(2))
        alive = live_tasks(2)
        assert len(alive) == 1 and col._tasks[2] is alive[0]      # 没有未被跟踪的孤儿任务
        await col.stop()
        assert live_tasks(1) == [] and live_tasks(2) == []
    asyncio.run(run())
