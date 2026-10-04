from app import db
from app.adapters import Draw

def fresh():
    conn = db.connect(":memory:"); db.init_db(conn)
    return conn

def test_seed_sources():
    conn = fresh()
    srcs = db.list_data_sources(conn)
    assert [(s.id, s.key, s.adapter) for s in srcs] == [(1, "qkltj", "qkltj"), (2, "qqtj", "qqtj")]
    qk, qq = srcs
    assert qk.base_url == "https://api.qkltj.com/api/draw-result"
    assert qq.base_url == "https://qqtj666.com/api/trial/draw-result"
    assert [(l.lottery_code, l.remote_code, l.cat) for l in qk.lotteries] == [
        ("5001", "5001", "1105"), ("5002", "5002", "1105"), ("6001", "6001", "hash"), ("6002", "6002", "hash")]
    assert [(l.lottery_code, l.remote_code) for l in qq.lotteries] == [("6001", "trxbhffc"), ("6002", "trxbh3fc")]
    assert qk.enabled is True and qk.interval_sec == 5 and qk.status == "unknown" and qk.headers == {}

def test_seed_only_on_first_create():
    conn = fresh()
    db.delete_data_source(conn, 1); db.delete_data_source(conn, 2)
    db.init_db(conn)                      # 重启：表已存在，不再补种子
    assert db.list_data_sources(conn) == []

def test_create_update_get_by_key():
    conn = fresh()
    s = db.create_data_source(conn, key="x3", name="X", adapter="qkltj", base_url="https://x/api",
                              headers={"Authorization": "Bearer t"}, interval_sec=7, enabled=False,
                              lotteries=[db.SourceLottery("6001", "a", "哈希分分彩", "hash")])
    assert s.id == 3 and s.headers == {"Authorization": "Bearer t"} and s.enabled is False
    assert db.get_data_source_by_key(conn, "x3").id == 3
    ok = db.update_data_source(conn, 3, key="x3", name="X2", adapter="qqtj", base_url="https://y/api",
                               headers={}, interval_sec=9, enabled=True,
                               lotteries=[db.SourceLottery("6002", "b", "哈希三分彩", "hash")])
    assert ok is True
    s = db.get_data_source(conn, 3)
    assert (s.name, s.adapter, s.interval_sec, s.enabled) == ("X2", "qqtj", 9, True)
    assert [l.lottery_code for l in s.lotteries] == ["6002"]
    assert db.update_data_source(conn, 99, key="z", name="z", adapter="qkltj", base_url="https://z",
                                 headers={}, interval_sec=5, enabled=True, lotteries=[]) is False

def test_enable_and_status():
    conn = fresh()
    assert db.set_data_source_enabled(conn, 2, False) is True
    assert db.get_data_source(conn, 2).enabled is False
    assert db.set_data_source_enabled(conn, 99, True) is False
    db.record_source_error(conn, 2, "trxbhffc: 超时 8s")
    s = db.get_data_source(conn, 2)
    assert s.status == "error" and s.last_error == "trxbhffc: 超时 8s" and s.last_ok_at is None
    db.record_source_ok(conn, 2, 1700000000)
    s = db.get_data_source(conn, 2)
    assert s.status == "ok" and s.last_error is None and s.last_ok_at == 1700000000

def test_draws_isolated_per_source_and_dedup():
    conn = fresh()
    d = [Draw("202610041324", "3,9,7,4,5", "2026-10-04 22:04:00")]
    assert db.insert_draws(conn, 1, "6001", d, 1) == 1
    assert db.insert_draws(conn, 2, "6001", [Draw("202610041324", "1,1,1,1,1", "2026-10-04 22:04:00")], 1) == 1
    assert db.insert_draws(conn, 1, "6001", d, 2) == 0       # 重复期号忽略
    assert db.latest_draws(conn, 1, "6001", 5)[0].opennumber == "3,9,7,4,5"
    assert db.latest_draws(conn, 2, "6001", 5)[0].opennumber == "1,1,1,1,1"   # 不同源互不覆盖

def test_latest_draws_orders_by_open_time_not_expect():
    conn = fresh()
    db.insert_draws(conn, 1, "6002", [
        Draw("2026100499", "1,2,3,4,5", "2026-10-04 04:57:00"),
        Draw("20261004100", "5,4,3,2,1", "2026-10-04 05:00:00"),   # 序号进位到 3 位：字符串序会排错
    ], 1)
    assert [x.expect for x in db.latest_draws(conn, 1, "6002", 2)] == ["20261004100", "2026100499"]

def test_prune_keeps_latest():
    conn = fresh()
    db.insert_draws(conn, 1, "6001", [Draw(f"E{i:03d}", "0,0,0,0,0", f"2026-10-04 10:{i:02d}:00") for i in range(10)], 1)
    assert db.prune_draws(conn, 1, "6001", 3) == 7
    assert [x.expect for x in db.latest_draws(conn, 1, "6001", 10)] == ["E009", "E008", "E007"]

def test_delete_cascades():
    conn = fresh()
    db.insert_draws(conn, 2, "6001", [Draw("1", "1", "2026-10-04 00:00:00")], 1)
    assert db.delete_data_source(conn, 2) is True
    assert db.get_data_source(conn, 2) is None
    assert conn.execute("SELECT COUNT(*) FROM source_lotteries WHERE source_id=2").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM draws WHERE source_id=2").fetchone()[0] == 0
    assert db.delete_data_source(conn, 2) is False
