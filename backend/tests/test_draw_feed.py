import asyncio
import json
import httpx
from fastapi.testclient import TestClient
from app import db, draw_feed
from app.adapters import Draw
from app.collector import Collector
from app.config import Settings
from app.dayys_session import DataYsSession
from app.draw_feed import DrawFeedHub, Feed, diff_rows
from app.main import create_app
from app.routes.draws import stream_events
from tests.points_helpers import set_points_raw
from tests.test_collector import ok_handler
from tests.test_ds_routes import FakeCollector


def rows(*expects):
    return [{"expect": e, "opennumber": "1,2,3"} for e in expects]


def ex(rs):
    return [r["expect"] for r in rs]


# ---------- 比对 ----------

def test_diff_rows_new_rows_before_known_top():
    new, prev = diff_rows(rows("3", "2", "1"), rows("5", "4", "3", "2", "1"))
    assert ex(new) == ["5", "4"] and prev == "3"


def test_diff_rows_same_or_stale_response_is_not_new():
    assert diff_rows(rows("3", "2"), rows("3", "2")) == ([], None)
    assert diff_rows(rows("3", "2"), rows("2", "1")) == ([], None)     # 上游返回了更旧的快照
    assert diff_rows(rows("3"), []) == ([], None)


def test_diff_rows_gap_too_large_has_no_prev():
    new, prev = diff_rows(rows("3", "2"), rows("9", "8"))
    assert ex(new) == ["9", "8"] and prev is None


def test_feed_first_publish_only_primes_then_pushes_increment():
    f = Feed(("up", "201", None))
    q = asyncio.Queue(maxsize=draw_feed.QUEUE_SIZE)
    f.subs.add(q)
    f.publish(rows("3", "2", "1"))
    assert q.empty()
    f.publish(rows("4", "3", "2", "1"))
    msg = q.get_nowait()
    assert ex(msg["rows"]) == ["4"] and msg["prev"] == "3"
    f.publish(rows("4", "3", "2"))          # 同一期再来一次不重复推
    assert q.empty()
    assert ex(f.known) == ["4", "3", "2", "1"]


def test_feed_full_queue_drops_oldest(monkeypatch):
    f = Feed(("up", "201", None))
    q = asyncio.Queue(maxsize=2)
    f.subs.add(q)
    f.publish(rows("1"))
    for e in ("2", "3", "4"):
        f.publish(rows(e, str(int(e) - 1)))
    assert [ex(q.get_nowait()["rows"]) for _ in range(2)] == [["3"], ["4"]]


# ---------- 上游彩种：同一彩种所有订阅者共用一个查询任务 ----------

def test_upstream_watch_shared_and_stops_when_idle(monkeypatch):
    monkeypatch.setattr(draw_feed, "POLL_INTERVAL", 0.01)
    monkeypatch.setattr(draw_feed, "IDLE_STOP", 0)
    seen = []
    latest = ["2", "1"]

    def handler(req):
        seen.append((req.url.path, json.loads(req.content), req.headers.get("fromId"), req.headers.get("token")))
        return httpx.Response(200, json={"code": 0, "data": rows(*latest)})

    async def run():
        client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(handler))
        hub = DrawFeedHub(None, client, "1004")
        key = ("up", "201", None)
        q1, q2 = hub.subscribe(key), hub.subscribe(key)
        assert len(hub.feeds) == 1
        await asyncio.sleep(0.05)
        assert q1.empty() and q2.empty()
        latest.insert(0, "3")
        msg = await asyncio.wait_for(q1.get(), 1)
        assert ex(msg["rows"]) == ["3"] and msg["prev"] == "2"
        assert ex((await asyncio.wait_for(q2.get(), 1))["rows"]) == ["3"]
        task = hub.feeds[key].task
        hub.unsubscribe(key, q1)
        hub.unsubscribe(key, q2)
        await asyncio.wait_for(task, 1)
        assert key not in hub.feeds
        await client.aclose()

    asyncio.run(run())
    path, body, from_id, token = seen[0]
    assert path == "/api/lotteryNumber/topRows" and body == {"code": "201", "rows": draw_feed.ANCHOR_ROWS}
    assert from_id == "1004" and token is None      # 开奖号码不用共用账号 token


def test_upstream_watch_mantissa_path_and_survives_errors(monkeypatch):
    monkeypatch.setattr(draw_feed, "POLL_INTERVAL", 0.01)
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        if calls["n"] <= 2:
            return httpx.Response(200, json={"code": 500, "msg": "busy"})
        body = json.loads(req.content)
        assert req.url.path == "/api/lotteryNumber/mantissaTopRows" and body["mantissa"] == "7"
        return httpx.Response(200, json={"code": 0, "data": rows(str(calls["n"]))})

    async def run():
        client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(handler))
        hub = DrawFeedHub(None, client, "1004")
        q = hub.subscribe(("up", "301", "7"))
        msg = await asyncio.wait_for(q.get(), 2)
        assert msg["rows"] and msg["prev"] is None       # 每次都是新的一期且接不上：没有 prev
        await hub.stop()
        await client.aclose()

    asyncio.run(run())


# ---------- 我方数据源：入库即推 ----------

def test_ds_feed_pushes_after_collector_insert():
    conn = db.connect(":memory:"); db.init_db(conn)
    db.insert_draws(conn, 2, "6001", [Draw("100", "1,2,3,4,5", "2026-10-20 10:00:00")], 1)

    async def run():
        hub = DrawFeedHub(conn, None, "1004")
        key = ("ds", 2, "6001", "哈希分分彩")
        q = hub.subscribe(key)
        hub.notify_ds(2, "6001")
        assert q.empty()
        db.insert_draws(conn, 2, "6001", [Draw("101", "5,4,3,2,1", "2026-10-20 10:01:00")], 2)
        hub.notify_ds(1, "6001")         # 别的源不影响
        assert q.empty()
        hub.notify_ds(2, "6001")
        msg = q.get_nowait()
        assert msg == {"rows": [{"expect": "101", "opennumber": "5,4,3,2,1", "openTime": "2026-10-20 10:01:00",
                                 "lottoId": "6001", "lottoTypeCn": "哈希分分彩"}], "prev": "100"}
        hub.unsubscribe(key, q)
        assert hub.feeds == {}

    asyncio.run(run())


def test_collector_calls_on_insert_only_for_new_draws():
    conn = db.connect(":memory:"); db.init_db(conn)
    col = Collector(conn, httpx.AsyncClient(transport=httpx.MockTransport(ok_handler)))
    hits = []
    col.on_insert = lambda sid, code: hits.append((sid, code))
    assert asyncio.run(col.tick(2)) is True
    assert hits == [(2, "6001"), (2, "6002")]
    assert asyncio.run(col.tick(2)) is True     # 同一期再拉一次：没有新增
    assert hits == [(2, "6001"), (2, "6002")]


# ---------- 接口 ----------

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004")
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys, collector=FakeCollector())
    u = db.create_user(conn, "U1", "pw", None)
    set_points_raw(conn, "U1", 10)
    tok = db.create_session(conn, u.id, 3600)
    return conn, app, TestClient(app), {"token": tok}, u


def test_stream_requires_login_and_valid_params():
    _, app, tc, H, u = build()
    assert tc.get("/api/draws/stream?code=201").json()["code"] == 10020
    assert tc.get("/api/draws/stream?code=", headers=H).json()["code"] == 1
    assert tc.get("/api/draws/stream?code=2%2F01", headers=H).json()["code"] == 1
    assert tc.get("/api/draws/stream?code=201&mantissa=a.b", headers=H).json()["code"] == 1
    assert tc.get("/api/draws/stream?code=6001&source=nope", headers=H).json()["code"] == 1
    assert tc.get("/api/draws/stream?code=9999&source=qqtj", headers=H).json()["code"] == 1
    hub = app.state.draw_feed
    for _ in range(draw_feed.MAX_STREAMS_PER_USER):
        hub.acquire(u.id)
    assert tc.get("/api/draws/stream?code=201", headers=H).json() == {"code": 1, "msg": "推送连接过多"}


def test_stream_events_ready_draws_heartbeat_and_release(monkeypatch):
    monkeypatch.setattr("app.routes.draws.HEARTBEAT", 0.05)
    conn = db.connect(":memory:"); db.init_db(conn)
    db.insert_draws(conn, 2, "6001", [Draw("100", "1", "2026-10-20 10:00:00")], 1)
    valid = {"ok": True}

    async def run():
        hub = DrawFeedHub(conn, None, "1004")
        key = ("ds", 2, "6001", "哈希分分彩")
        gen = stream_events(hub, key, 7, lambda: valid["ok"])
        first = await gen.__anext__()
        assert first.startswith(": ok\n\n") and "event: ready\n" in first
        assert hub.streams == 1 and hub.user_streams == {7: 1}
        db.insert_draws(conn, 2, "6001", [Draw("101", "2", "2026-10-20 10:01:00")], 2)
        hub.notify_ds(2, "6001")
        ev = await gen.__anext__()
        assert ev.startswith("event: draws\ndata: ") and ev.endswith("\n\n")
        data = json.loads(ev.split("data: ", 1)[1])
        assert ex(data["rows"]) == ["101"] and data["prev"] == "100"
        assert await gen.__anext__() == ": ping\n\n"
        valid["ok"] = False                     # 登录失效：下一次心跳时结束
        try:
            await gen.__anext__()
            raise AssertionError("应结束")
        except StopAsyncIteration:
            pass
        assert hub.streams == 0 and hub.user_streams == {} and hub.feeds == {}

    asyncio.run(run())


def test_close_streams_ends_open_streams_and_refuses_new():
    conn = db.connect(":memory:"); db.init_db(conn)

    async def run():
        hub = DrawFeedHub(conn, None, "1004")
        gen = stream_events(hub, ("ds", 2, "6001", "哈希分分彩"), 7, lambda: True)
        await gen.__anext__()
        hub.close_streams()
        try:
            await asyncio.wait_for(gen.__anext__(), 1)
            raise AssertionError("应结束")
        except StopAsyncIteration:
            pass
        assert hub.streams == 0 and hub.has_capacity(8) is False

    asyncio.run(run())
