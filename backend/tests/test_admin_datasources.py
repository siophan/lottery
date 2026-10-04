import httpx
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.adapters import Draw
from app.dayys_session import DataYsSession

class FakeCollector:
    def __init__(self): self.reloaded = []
    async def start(self): pass
    async def stop(self): pass
    async def reload(self, sid): self.reloaded.append(sid)

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": 0})))
    col = FakeCollector()
    app = create_app(Settings(admin_key="SECRET", admin_cookie_secure=False), client=client, conn=conn,
                     dayys=DataYsSession(client, "SRV", "pw", "dev", "1004"), collector=col)
    return conn, TestClient(app), col

H = {"X-Admin-Key": "SECRET"}

def payload(**over):
    p = {"key": "new1", "name": "新源", "adapter": "qqtj", "base_url": "https://n.example/api/draw-result",
         "headers": {"X-Token": "abc"}, "interval_sec": 6, "enabled": True,
         "lotteries": [{"lottery_code": "6001", "remote_code": "ffc", "name": "哈希分分彩", "cat": "hash"}]}
    p.update(over)
    return p

def test_requires_admin():
    _, tc, _ = build()
    assert tc.get("/admin/data-sources").status_code == 403
    assert tc.post("/admin/data-sources", json=payload()).status_code == 403
    assert tc.request("DELETE", "/admin/data-sources/1").status_code == 403

def test_list_includes_seed_and_status():
    conn, tc, _ = build()
    db.record_source_error(conn, 2, "trxbhffc: 超时 8s")
    srcs = tc.get("/admin/data-sources", headers=H).json()["sources"]
    assert [s["key"] for s in srcs] == ["qkltj", "qqtj"]
    qq = srcs[1]
    assert qq["status"] == "error" and qq["last_error"] == "trxbhffc: 超时 8s"
    assert qq["lotteries"][0] == {"lottery_code": "6001", "remote_code": "trxbhffc", "name": "哈希分分彩", "cat": "hash"}

def test_create_and_reload():
    conn, tc, col = build()
    r = tc.post("/admin/data-sources", headers=H, json=payload())
    assert r.status_code == 200 and r.json()["ok"] is True
    s = r.json()["source"]
    assert s["id"] == 3 and s["headers"] == {"X-Token": "abc"} and s["interval_sec"] == 6
    assert col.reloaded == [3]

@pytest.mark.parametrize("over,msg", [
    ({"key": "Bad Key"}, "key"),
    ({"name": " "}, "名称"),
    ({"adapter": "nope"}, "adapter"),
    ({"base_url": "ftp://x"}, "接口地址"),
    ({"base_url": "https://x/api?code=1"}, "接口地址"),
    ({"headers": {"a": 1}}, "请求头"),
    ({"interval_sec": 2}, "周期"),
    ({"interval_sec": True}, "周期"),
    ({"enabled": "yes"}, "enabled"),
    ({"lotteries": []}, "彩种"),
    ({"lotteries": [{"lottery_code": "6001", "remote_code": "", "name": "x", "cat": "hash"}]}, "彩种映射"),
    ({"lotteries": [{"lottery_code": "6001", "remote_code": "a", "name": "x", "cat": "zzz"}]}, "工作台"),
    ({"lotteries": [{"lottery_code": "6001", "remote_code": "a", "name": "x", "cat": "hash"},
                    {"lottery_code": "6001", "remote_code": "b", "name": "y", "cat": "hash"}]}, "重复"),
    ({"key": "qqtj"}, "已存在"),
    ({"key": "abc\n"}, "key"),                                   # $ 会放过结尾换行
    ({"base_url": "https://n.example/api/draw-result\n"}, "接口地址"),
])
def test_create_validation(over, msg):
    _, tc, col = build()
    r = tc.post("/admin/data-sources", headers=H, json=payload(**over))
    assert r.status_code == 400 and r.json()["ok"] is False and msg in r.json()["error"]
    assert col.reloaded == []

def test_update():
    conn, tc, col = build()
    r = tc.put("/admin/data-sources/2", headers=H, json=payload(key="qqtj", name="全球统计2", interval_sec=10))
    assert r.status_code == 200 and r.json()["source"]["name"] == "全球统计2"
    s = db.get_data_source(conn, 2)
    assert s.interval_sec == 10 and [l.remote_code for l in s.lotteries] == ["ffc"]
    assert col.reloaded == [2]
    # 改 key 不能撞上别的源；保持自己的 key 可以
    assert tc.put("/admin/data-sources/2", headers=H, json=payload(key="qkltj")).status_code == 400
    assert tc.put("/admin/data-sources/99", headers=H, json=payload(key="zz")).status_code == 404

def test_toggle_enabled():
    conn, tc, col = build()
    assert tc.patch("/admin/data-sources/2/enabled", headers=H, json={"enabled": False}).json() == {"ok": True}
    assert db.get_data_source(conn, 2).enabled is False
    assert col.reloaded == [2]
    assert tc.patch("/admin/data-sources/2/enabled", headers=H, json={"enabled": "no"}).status_code == 400
    assert tc.patch("/admin/data-sources/99/enabled", headers=H, json={"enabled": True}).status_code == 404

def test_delete():
    conn, tc, col = build()
    assert tc.request("DELETE", "/admin/data-sources/2", headers=H).json() == {"ok": True}
    assert db.get_data_source(conn, 2) is None and col.reloaded == [2]
    assert tc.request("DELETE", "/admin/data-sources/2", headers=H).status_code == 404

def test_latest_draws():
    conn, tc, _ = build()
    db.insert_draws(conn, 2, "6001", [Draw(f"E{i}", "1,2,3,4,5", f"2026-10-04 00:0{i}:00") for i in range(5)], 1)
    d = tc.get("/admin/data-sources/2/draws?code=6001&rows=2", headers=H).json()["draws"]
    assert d == [{"expect": "E4", "opennumber": "1,2,3,4,5", "open_time": "2026-10-04 00:04:00"},
                 {"expect": "E3", "opennumber": "1,2,3,4,5", "open_time": "2026-10-04 00:03:00"}]
    assert tc.get("/admin/data-sources/99/draws?code=6001", headers=H).status_code == 404
