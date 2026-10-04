import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.adapters import Draw
from app.dayys_session import DataYsSession

class FakeCollector:
    def __init__(self):
        self.events = []
    async def start(self): self.events.append("start")
    async def stop(self): self.events.append("stop")
    async def reload(self, sid): self.events.append(("reload", sid))

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    def upstream(req):
        raise AssertionError(f"不应转发上游: {req.url}")
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(upstream))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004")
    col = FakeCollector()
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys, collector=col)
    u = db.create_user(conn, "U1", "pw", None)
    tok = db.create_session(conn, u.id, 3600)
    return conn, TestClient(app), {"token": tok}, col

def test_requires_our_token():
    _, tc, _, _ = build()
    assert tc.get("/api/ds/sources?cat=hash").json()["code"] == 10020
    assert tc.get("/api/ds/qqtj/draw-result?code=6001&rows=1").json()["code"] == 10020

def test_sources_filters_cat_and_disabled():
    conn, tc, H, _ = build()
    db.record_source_error(conn, 2, "x")
    d = tc.get("/api/ds/sources?cat=hash", headers=H).json()
    assert d["code"] == 0
    assert d["data"] == [
        {"source": "qkltj", "sourceName": "区块链统计", "code": "6001", "name": "哈希分分彩", "status": "unknown"},
        {"source": "qkltj", "sourceName": "区块链统计", "code": "6002", "name": "哈希三分彩", "status": "unknown"},
        {"source": "qqtj", "sourceName": "全球统计", "code": "6001", "name": "哈希分分彩", "status": "error"},
        {"source": "qqtj", "sourceName": "全球统计", "code": "6002", "name": "哈希三分彩", "status": "error"},
    ]
    assert [x["code"] for x in tc.get("/api/ds/sources?cat=1105", headers=H).json()["data"]] == ["5001", "5002"]
    db.set_data_source_enabled(conn, 2, False)
    assert {x["source"] for x in tc.get("/api/ds/sources?cat=hash", headers=H).json()["data"]} == {"qkltj"}

def test_draw_result_same_shape_as_qkltj_and_ordered():
    conn, tc, H, _ = build()
    db.insert_draws(conn, 2, "6002", [
        Draw("2026100499", "1,2,3,4,5", "2026-10-04 04:57:00"),
        Draw("20261004100", "5,4,3,2,1", "2026-10-04 05:00:00"),
    ], 1)
    d = tc.get("/api/ds/qqtj/draw-result?code=6002&rows=2", headers=H).json()
    assert d["code"] == 0
    assert d["data"] == [
        {"expect": "20261004100", "opennumber": "5,4,3,2,1", "openTime": "2026-10-04 05:00:00",
         "lottoId": "6002", "lottoTypeCn": "哈希三分彩"},
        {"expect": "2026100499", "opennumber": "1,2,3,4,5", "openTime": "2026-10-04 04:57:00",
         "lottoId": "6002", "lottoTypeCn": "哈希三分彩"},
    ]
    # rows 默认 1
    assert len(tc.get("/api/ds/qqtj/draw-result?code=6002", headers=H).json()["data"]) == 1

def test_draw_result_isolated_by_source():
    conn, tc, H, _ = build()
    db.insert_draws(conn, 1, "6001", [Draw("E1", "1,1,1,1,1", "2026-10-04 00:01:00")], 1)
    db.insert_draws(conn, 2, "6001", [Draw("E1", "2,2,2,2,2", "2026-10-04 00:01:00")], 1)
    assert tc.get("/api/ds/qkltj/draw-result?code=6001", headers=H).json()["data"][0]["opennumber"] == "1,1,1,1,1"
    assert tc.get("/api/ds/qqtj/draw-result?code=6001", headers=H).json()["data"][0]["opennumber"] == "2,2,2,2,2"

def test_rows_capped_at_keep_rows():
    conn, tc, H, _ = build()
    # 上限 = 库内保留深度 KEEP_ROWS（2000）；客户端遗漏页会请求 rows=3000
    db.insert_draws(conn, 1, "6001", [Draw(f"E{i:05d}", "0", f"2026-10-04 {i // 3600:02d}:{i // 60 % 60:02d}:{i % 60:02d}")
                                      for i in range(2100)], 1)
    assert len(tc.get("/api/ds/qkltj/draw-result?code=6001&rows=3000", headers=H).json()["data"]) == 2000

def test_draw_result_business_errors():
    conn, tc, H, _ = build()
    assert tc.get("/api/ds/nope/draw-result?code=6001", headers=H).json() == {"code": 1, "msg": "数据源不存在"}
    assert tc.get("/api/ds/qqtj/draw-result?code=5001", headers=H).json() == {"code": 1, "msg": "该数据源未配置此彩种"}
    assert tc.get("/api/ds/qqtj/draw-result?code=6001&rows=abc", headers=H).json() == {"code": 1, "msg": "rows 参数错误"}
    assert tc.get("/api/ds/qqtj/draw-result?code=6001&rows=0", headers=H).json() == {"code": 1, "msg": "rows 参数错误"}
    db.set_data_source_enabled(conn, 2, False)
    assert tc.get("/api/ds/qqtj/draw-result?code=6001", headers=H).json() == {"code": 1, "msg": "数据源已停用"}

def test_empty_data_is_ok():
    _, tc, H, _ = build()
    assert tc.get("/api/ds/qqtj/draw-result?code=6001", headers=H).json() == {"code": 0, "msg": "成功", "data": []}

def test_lifespan_starts_and_stops_collector():
    _, tc, _, col = build()
    with tc:
        assert col.events == ["start"]
    assert col.events == ["start", "stop"]

def test_lifespan_respects_collector_disabled():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200)))
    col = FakeCollector()
    app = create_app(Settings(collector_enabled=False), client=client, conn=conn,
                     dayys=DataYsSession(client, "S", "p", "d", "1004"), collector=col)
    with TestClient(app):
        pass
    assert col.events == ["stop"]
