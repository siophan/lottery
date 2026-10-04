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
