# 多数据源服务端集中采集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 FastAPI 中间层里对「区块链统计」「全球统计」等多个数据源独立定时采集开奖号、按源隔离入库，经统一格式接口下发给客户端工作台，并在管理后台管理数据源与查看状态。

**Architecture:** `app/adapters.py` 把各源返回统一为 `Draw`；`app/collector.py` 在 FastAPI 进程内为每个启用源跑一个 asyncio 循环，写入 SQLite（`data_sources / source_lotteries / draws`）并回写状态；`/api/ds/*` 给客户端返回与区块链统计同构的数据；`/admin/data-sources*` + Ant Design Pro 页面做管理；客户端用一个独立 helper（`client/ds-sources.js`）+ 幂等补丁脚本修改三个工作台 chunk。

**Tech Stack:** Python 3.12、FastAPI 0.111、httpx 0.27、SQLite、pytest；React 18 + Ant Design Pro（Vite）；Electron 客户端（webpack 产物 chunk）、node:test。

**Spec:** `docs/superpowers/specs/2026-10-04-multi-datasource-collector-design.md`

## Global Constraints

- 后端 Python **3.10+**（代码用 `X | None`），本地用 `python3.12` 建 `backend/.venv`；所有 pytest 命令在 `backend/` 下用 `.venv/bin/python -m pytest`。
- 不新增 Python 依赖（无 pytest-asyncio：异步逻辑在同步测试里用 `asyncio.run(...)`）。
- 统一彩种编码沿用区块链统计数字编码：`6001` 哈希分分彩、`6002` 哈希三分彩、`5001` 波场分分11选5、`5002` 波场三分11选5。
- 采集：每次请求 `rows=10`，单次超时 8 秒，默认周期 5 秒，最小周期 3 秒，退避 `min(interval × 2^n, 60)`，每个「源 × 彩种」保留 2000 期。
- 排序一律 `open_time DESC, expect DESC`（三分彩期号不补零，不能按期号排序）。
- `/api/ds/{source}/draw-result` 返回与区块链统计同构：`{code, msg, data:[{expect, opennumber, openTime, lottoId, lottoTypeCn}]}`，`rows` 上限 300；业务错误一律 HTTP 200 + `{"code":1,"msg":...}`。
- 生产必须保持**单 uvicorn 进程**（不要加 `--workers`），否则会重复采集。
- 代码注释、提示文案用中文；commit message 用英文，结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 工作分支：`feat/multi-datasource-collector`（已创建）。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/app/adapters.py` | 新建 | `Draw`、`ParseError`、各源解析函数、`ADAPTERS` 注册表 |
| `backend/app/db.py` | 修改 | 三张新表、首次建表种子数据、数据源 CRUD、状态回写、开奖入库/裁剪/查询 |
| `backend/app/collector.py` | 新建 | `Collector`：单轮拉取 `tick`、循环 `_run`、`start/stop/reload`、`backoff_delay` |
| `backend/app/config.py` | 修改 | `collector_enabled`（env `COLLECTOR_ENABLED`） |
| `backend/app/routes/ds.py` | 新建 | 客户端接口 `/api/ds/sources`、`/api/ds/{source}/draw-result` |
| `backend/app/routes/admin_datasources.py` | 新建 | 管理接口 `/admin/data-sources*` + 提交校验 |
| `backend/app/main.py` | 修改 | lifespan 启停采集器；挂载两个新路由（ds 在 catch-all 之前） |
| `backend/admin-ui/src/api.ts` | 修改 | 数据源相关请求函数与类型 |
| `backend/admin-ui/src/pages/DataSources.tsx` | 新建 | 数据源列表 / 编辑弹窗 / 最新开奖抽屉 |
| `backend/admin-ui/src/MainLayout.tsx` | 修改 | 新菜单「数据源」 |
| `backend/app/static/admin-dist/**` | 重新构建 | 后台构建产物（随源码提交） |
| `client/ds-sources.js` | 新建 | 客户端 helper（UMD）：合并下拉、请求服务端列表、状态色 |
| `client/index.html` | 修改 | 先于业务脚本加载 `ds-sources.js` |
| `scripts/patch-ds-client.js` | 新建 | 幂等补丁脚本（锚点精确命中校验） |
| `client/js/chunk-b7e0f68a.59391aa2.js` 等 3 个 | 由脚本修改 | 哈希 / 11选5 / 运动会工作台 |
| `electron/ds-sources.test.js`、`electron/ds-client-patch.test.js` | 新建 | node:test |
| `backend/README.md`、`backend/DEPLOY.md` | 修改 | 采集器说明、单进程约束、`COLLECTOR_ENABLED` |

---

### Task 1: 返回格式适配器

**Files:**
- Create: `backend/app/adapters.py`
- Test: `backend/tests/test_adapters.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) class Draw: expect: str; opennumber: str; open_time: str`
  - `class ParseError(Exception)`
  - `parse_qkltj(obj) -> list[Draw]`、`parse_qqtj(obj) -> list[Draw]`
  - `ADAPTERS: dict[str, Callable[[object], list[Draw]]] = {"qkltj": ..., "qqtj": ...}`

- [ ] **Step 0: 重建本地 venv（现有 `.venv` 指向系统 Python 3.9，无法 import 现有代码）**

```bash
cd backend && rm -rf .venv && python3.12 -m venv .venv && .venv/bin/pip install -q -r requirements.txt && .venv/bin/python -m pytest -q
```
Expected: `68 passed`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_adapters.py`：

```python
import pytest
from app.adapters import ADAPTERS, Draw, ParseError, parse_qkltj, parse_qqtj

# 2026-10-04 实测返回（截取一条）
QKLTJ = {"msg": "成功！", "code": 0, "data": [{
    "block": "86816657", "expect": "202610041324", "lottoId": "6001",
    "lottoTypeCn": "哈希分分彩", "openTime": "2026-10-04 22:04:14", "opennumber": "3,9,7,4,5"}]}
QQTJ = {"code": 0, "msg": "成功", "data": [{
    "cycleNo": 1324, "issue": "202610041324", "drawResult": "3,9,7,4,5",
    "drawTime": "2026-10-04 22:04:00", "context": {"block": "86816657"}}]}

def test_parse_qkltj():
    assert parse_qkltj(QKLTJ) == [Draw("202610041324", "3,9,7,4,5", "2026-10-04 22:04:14")]

def test_parse_qqtj():
    assert parse_qqtj(QQTJ) == [Draw("202610041324", "3,9,7,4,5", "2026-10-04 22:04:00")]

def test_registry():
    assert ADAPTERS["qkltj"] is parse_qkltj and ADAPTERS["qqtj"] is parse_qqtj

def test_qqtj_payload_fed_to_qkltj_adapter_fails_loudly():
    # 本次 bug 的回归用例：字段名不兼容必须报错，而不是静默产出空数据
    with pytest.raises(ParseError, match="expect"):
        parse_qkltj(QQTJ)

def test_remote_error_code():
    with pytest.raises(ParseError, match="参数错误"):
        parse_qqtj({"code": 1, "msg": "参数错误", "data": []})

@pytest.mark.parametrize("bad", [None, [], "x", {"code": 0, "data": {}}, {"code": 0}])
def test_malformed_payload(bad):
    with pytest.raises(ParseError):
        parse_qkltj(bad)

def test_blank_field_rejected():
    obj = {"code": 0, "data": [{"issue": "1", "drawResult": "  ", "drawTime": "t"}]}
    with pytest.raises(ParseError, match="drawResult"):
        parse_qqtj(obj)

def test_empty_list_ok():
    assert parse_qqtj({"code": 0, "data": []}) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_adapters.py -q`
Expected: FAIL，`ModuleNotFoundError: No module named 'app.adapters'`

- [ ] **Step 3: Write minimal implementation**

`backend/app/adapters.py`：

```python
# 各外部数据源返回格式 → 统一的 Draw。新增一种返回格式时，在此加一个解析函数并注册到 ADAPTERS。
from dataclasses import dataclass

@dataclass(frozen=True)
class Draw:
    expect: str        # 期号
    opennumber: str    # 开奖号码，逗号分隔
    open_time: str     # 'YYYY-MM-DD HH:MM:SS'，排序依据

class ParseError(Exception):
    pass

def _items(obj) -> list:
    if not isinstance(obj, dict):
        raise ParseError("响应不是 JSON 对象")
    if obj.get("code") != 0:
        raise ParseError(f"远端返回 code={obj.get('code')}: {obj.get('msg', '')}")
    data = obj.get("data")
    if not isinstance(data, list):
        raise ParseError("data 不是列表")
    return data

def _field(item, name: str) -> str:
    v = item.get(name) if isinstance(item, dict) else None
    if not isinstance(v, str) or not v.strip():
        raise ParseError(f"缺少字段 {name}")
    return v.strip()

def _parse(obj, expect_key: str, number_key: str, time_key: str) -> list[Draw]:
    return [Draw(_field(it, expect_key), _field(it, number_key), _field(it, time_key))
            for it in _items(obj)]

def parse_qkltj(obj) -> list[Draw]:
    """区块链统计 api.qkltj.com：expect / opennumber / openTime"""
    return _parse(obj, "expect", "opennumber", "openTime")

def parse_qqtj(obj) -> list[Draw]:
    """全球统计 qqtj666.com：issue / drawResult / drawTime"""
    return _parse(obj, "issue", "drawResult", "drawTime")

ADAPTERS = {"qkltj": parse_qkltj, "qqtj": parse_qqtj}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_adapters.py -q`
Expected: PASS（12 passed）

- [ ] **Step 5: Commit**

```bash
git add backend/app/adapters.py backend/tests/test_adapters.py
git commit -m "feat(backend): response adapters for qkltj and qqtj draw sources

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 数据源与开奖数据存储

**Files:**
- Modify: `backend/app/db.py`（import 区、`init_db`、文件末尾追加）
- Test: `backend/tests/test_db_datasources.py`

**Interfaces:**
- Consumes: `app.adapters.Draw`
- Produces（全部在 `app.db`）：
  - `@dataclass class SourceLottery: lottery_code: str; remote_code: str; name: str; cat: str`
  - `@dataclass class DataSource: id: int; key: str; name: str; adapter: str; base_url: str; headers: dict; interval_sec: int; enabled: bool; status: str; last_error: str | None; last_ok_at: int | None; created_at: int; lotteries: list[SourceLottery]`
  - `list_data_sources(conn) -> list[DataSource]`、`get_data_source(conn, source_id: int) -> DataSource | None`、`get_data_source_by_key(conn, key: str) -> DataSource | None`
  - `create_data_source(conn, *, key, name, adapter, base_url, headers, interval_sec, enabled, lotteries) -> DataSource`
  - `update_data_source(conn, source_id, *, key, name, adapter, base_url, headers, interval_sec, enabled, lotteries) -> bool`（映射整体替换）
  - `set_data_source_enabled(conn, source_id, enabled: bool) -> bool`、`delete_data_source(conn, source_id) -> bool`（级联）
  - `record_source_ok(conn, source_id, now: int) -> None`、`record_source_error(conn, source_id, error: str) -> None`
  - `insert_draws(conn, source_id, lottery_code, draws: list[Draw], now: int) -> int`（新增条数）
  - `prune_draws(conn, source_id, lottery_code, keep: int) -> int`
  - `latest_draws(conn, source_id, lottery_code, rows: int) -> list[Draw]`
  - 种子：首次创建 `data_sources` 表时写入 `qkltj`(id=1)、`qqtj`(id=2)

- [ ] **Step 1: Write the failing test**

`backend/tests/test_db_datasources.py`：

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_db_datasources.py -q`
Expected: FAIL，`AttributeError: module 'app.db' has no attribute 'list_data_sources'`

- [ ] **Step 3: Write minimal implementation**

`backend/app/db.py` 顶部 import 改为：

```python
import json
import sqlite3
import time
from dataclasses import dataclass
from .adapters import Draw
from .security import hash_password, new_token
```

在 `AdminSession` dataclass 之后追加：

```python
@dataclass
class SourceLottery:
    lottery_code: str   # 统一编码：6001
    remote_code: str    # 远端编码：trxbhffc
    name: str           # 哈希分分彩
    cat: str            # 所属工作台：hash | 1105 | animals

@dataclass
class DataSource:
    id: int
    key: str
    name: str
    adapter: str
    base_url: str
    headers: dict
    interval_sec: int
    enabled: bool
    status: str               # unknown | ok | error
    last_error: str | None
    last_ok_at: int | None
    created_at: int
    lotteries: list

DEFAULT_SOURCES = [
    dict(key="qkltj", name="区块链统计", adapter="qkltj",
         base_url="https://api.qkltj.com/api/draw-result",
         lotteries=[SourceLottery("6001", "6001", "哈希分分彩", "hash"),
                    SourceLottery("6002", "6002", "哈希三分彩", "hash"),
                    SourceLottery("5001", "5001", "波场分分11选5", "1105"),
                    SourceLottery("5002", "5002", "波场三分11选5", "1105")]),
    dict(key="qqtj", name="全球统计", adapter="qqtj",
         base_url="https://qqtj666.com/api/trial/draw-result",
         lotteries=[SourceLottery("6001", "trxbhffc", "哈希分分彩", "hash"),
                    SourceLottery("6002", "trxbh3fc", "哈希三分彩", "hash")]),
]
```

`init_db` 改为（在原 `executescript` 前判断表是否已存在，脚本末尾追加三张表，最后种子）：

```python
def init_db(conn: sqlite3.Connection) -> None:
    # 只在首次建 data_sources 表时写种子；管理员之后删光数据源，重启也不会被补回
    ds_existed = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_sources'"
    ).fetchone() is not None
    conn.executescript(
        """
        ...（原 users / sessions / admins / admin_sessions 四张表保持不变）...
        CREATE TABLE IF NOT EXISTS data_sources(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          adapter TEXT NOT NULL,
          base_url TEXT NOT NULL,
          headers_json TEXT NOT NULL DEFAULT '{}',
          interval_sec INTEGER NOT NULL DEFAULT 5,
          enabled INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'unknown',
          last_error TEXT,
          last_ok_at INTEGER,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS source_lotteries(
          source_id INTEGER NOT NULL,
          lottery_code TEXT NOT NULL,
          remote_code TEXT NOT NULL,
          name TEXT NOT NULL,
          cat TEXT NOT NULL,
          PRIMARY KEY(source_id, lottery_code)
        );
        CREATE TABLE IF NOT EXISTS draws(
          source_id INTEGER NOT NULL,
          lottery_code TEXT NOT NULL,
          expect TEXT NOT NULL,
          opennumber TEXT NOT NULL,
          open_time TEXT NOT NULL,
          fetched_at INTEGER NOT NULL,
          PRIMARY KEY(source_id, lottery_code, expect)
        );
        CREATE INDEX IF NOT EXISTS idx_draws_time ON draws(source_id, lottery_code, open_time);
        """
    )
    conn.commit()
    if not ds_existed:
        for s in DEFAULT_SOURCES:
            create_data_source(conn, key=s["key"], name=s["name"], adapter=s["adapter"],
                               base_url=s["base_url"], headers={}, interval_sec=5,
                               enabled=True, lotteries=s["lotteries"])
```

（注意：保留原有四张表的 SQL 原文，只在其后追加。）

文件末尾追加：

```python
# ---------------- 数据源 ----------------

def _load_lotteries(conn, source_id: int) -> list[SourceLottery]:
    rows = conn.execute(
        "SELECT * FROM source_lotteries WHERE source_id=? ORDER BY lottery_code", (source_id,)
    ).fetchall()
    return [SourceLottery(r["lottery_code"], r["remote_code"], r["name"], r["cat"]) for r in rows]

def _row_to_source(conn, r: sqlite3.Row) -> DataSource:
    return DataSource(r["id"], r["key"], r["name"], r["adapter"], r["base_url"],
                      json.loads(r["headers_json"] or "{}"), r["interval_sec"], bool(r["enabled"]),
                      r["status"], r["last_error"], r["last_ok_at"], r["created_at"],
                      _load_lotteries(conn, r["id"]))

def list_data_sources(conn) -> list[DataSource]:
    return [_row_to_source(conn, r)
            for r in conn.execute("SELECT * FROM data_sources ORDER BY id").fetchall()]

def get_data_source(conn, source_id: int) -> DataSource | None:
    r = conn.execute("SELECT * FROM data_sources WHERE id=?", (source_id,)).fetchone()
    return _row_to_source(conn, r) if r else None

def get_data_source_by_key(conn, key: str) -> DataSource | None:
    r = conn.execute("SELECT * FROM data_sources WHERE key=?", (key,)).fetchone()
    return _row_to_source(conn, r) if r else None

def _replace_lotteries(conn, source_id: int, lotteries: list[SourceLottery]) -> None:
    conn.execute("DELETE FROM source_lotteries WHERE source_id=?", (source_id,))
    conn.executemany(
        "INSERT INTO source_lotteries(source_id,lottery_code,remote_code,name,cat) VALUES(?,?,?,?,?)",
        [(source_id, l.lottery_code, l.remote_code, l.name, l.cat) for l in lotteries],
    )

def create_data_source(conn, *, key, name, adapter, base_url, headers, interval_sec,
                       enabled, lotteries) -> DataSource:
    cur = conn.execute(
        "INSERT INTO data_sources(key,name,adapter,base_url,headers_json,interval_sec,enabled,created_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (key, name, adapter, base_url, json.dumps(headers, ensure_ascii=False),
         interval_sec, int(enabled), int(time.time())),
    )
    _replace_lotteries(conn, cur.lastrowid, lotteries)
    conn.commit()
    return get_data_source(conn, cur.lastrowid)

def update_data_source(conn, source_id: int, *, key, name, adapter, base_url, headers,
                       interval_sec, enabled, lotteries) -> bool:
    cur = conn.execute(
        "UPDATE data_sources SET key=?,name=?,adapter=?,base_url=?,headers_json=?,interval_sec=?,enabled=?"
        " WHERE id=?",
        (key, name, adapter, base_url, json.dumps(headers, ensure_ascii=False),
         interval_sec, int(enabled), source_id),
    )
    if cur.rowcount == 0:
        conn.rollback()
        return False
    _replace_lotteries(conn, source_id, lotteries)
    conn.commit()
    return True

def set_data_source_enabled(conn, source_id: int, enabled: bool) -> bool:
    cur = conn.execute("UPDATE data_sources SET enabled=? WHERE id=?", (int(enabled), source_id))
    conn.commit()
    return cur.rowcount > 0

def delete_data_source(conn, source_id: int) -> bool:
    conn.execute("DELETE FROM draws WHERE source_id=?", (source_id,))
    conn.execute("DELETE FROM source_lotteries WHERE source_id=?", (source_id,))
    cur = conn.execute("DELETE FROM data_sources WHERE id=?", (source_id,))
    conn.commit()
    return cur.rowcount > 0

def record_source_ok(conn, source_id: int, now: int) -> None:
    conn.execute("UPDATE data_sources SET status='ok', last_error=NULL, last_ok_at=? WHERE id=?",
                 (now, source_id))
    conn.commit()

def record_source_error(conn, source_id: int, error: str) -> None:
    conn.execute("UPDATE data_sources SET status='error', last_error=? WHERE id=?",
                 (error, source_id))
    conn.commit()

# ---------------- 开奖数据 ----------------

def insert_draws(conn, source_id: int, lottery_code: str, draws: list[Draw], now: int) -> int:
    cur = conn.executemany(
        "INSERT OR IGNORE INTO draws(source_id,lottery_code,expect,opennumber,open_time,fetched_at)"
        " VALUES(?,?,?,?,?,?)",
        [(source_id, lottery_code, d.expect, d.opennumber, d.open_time, now) for d in draws],
    )
    conn.commit()
    return cur.rowcount

def prune_draws(conn, source_id: int, lottery_code: str, keep: int) -> int:
    cur = conn.execute(
        "DELETE FROM draws WHERE source_id=? AND lottery_code=? AND expect NOT IN ("
        " SELECT expect FROM draws WHERE source_id=? AND lottery_code=?"
        " ORDER BY open_time DESC, expect DESC LIMIT ?)",
        (source_id, lottery_code, source_id, lottery_code, keep),
    )
    conn.commit()
    return cur.rowcount

def latest_draws(conn, source_id: int, lottery_code: str, rows: int) -> list[Draw]:
    rs = conn.execute(
        "SELECT expect, opennumber, open_time FROM draws WHERE source_id=? AND lottery_code=?"
        " ORDER BY open_time DESC, expect DESC LIMIT ?",
        (source_id, lottery_code, rows),
    ).fetchall()
    return [Draw(r["expect"], r["opennumber"], r["open_time"]) for r in rs]
```

- [ ] **Step 4: Run tests to verify they pass（含全量回归）**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部 PASS（新增 9 个 + 原有 68 个 + Task 1 的 12 个）

- [ ] **Step 5: Commit**

```bash
git add backend/app/db.py backend/tests/test_db_datasources.py
git commit -m "feat(backend): data source, lottery mapping and draws storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 采集器

**Files:**
- Create: `backend/app/collector.py`
- Test: `backend/tests/test_collector.py`

**Interfaces:**
- Consumes: `app.adapters.ADAPTERS / ParseError`；`app.db` 的 `get_data_source / list_data_sources / insert_draws / prune_draws / record_source_ok / record_source_error`
- Produces:
  - `backoff_delay(interval_sec: int, failures: int) -> float`
  - `class Collector(conn, client: httpx.AsyncClient | None = None)`，方法：`async tick(source_id: int) -> bool`、`async start() -> None`、`async stop() -> None`、`async reload(source_id: int) -> None`、`running_ids() -> set[int]`
  - 常量：`FETCH_ROWS = 10`、`FETCH_TIMEOUT = 8.0`、`MAX_BACKOFF = 60`、`KEEP_ROWS = 2000`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_collector.py`：

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_collector.py -q`
Expected: FAIL，`ModuleNotFoundError: No module named 'app.collector'`

- [ ] **Step 3: Write minimal implementation**

`backend/app/collector.py`：

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_collector.py -q`
Expected: PASS（8 passed）

- [ ] **Step 5: Commit**

```bash
git add backend/app/collector.py backend/tests/test_collector.py
git commit -m "feat(backend): per-source asyncio collector with isolation and backoff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 客户端接口 `/api/ds/*` + 应用接线

**Files:**
- Create: `backend/app/routes/ds.py`
- Modify: `backend/app/config.py`、`backend/app/main.py`
- Test: `backend/tests/test_ds_routes.py`、`backend/tests/test_config.py`（追加一个用例）

**Interfaces:**
- Consumes: `db.list_data_sources / get_data_source_by_key / latest_draws`、`gate.authorize`、`Collector`
- Produces:
  - `Settings.collector_enabled: bool = True`（env `COLLECTOR_ENABLED`）
  - `create_app(settings=None, client=None, conn=None, dayys=None, collector=None)`；`app.state.collector`
  - `GET /api/ds/sources?cat=` → `{"code":0,"msg":"成功","data":[{"source","sourceName","code","name","status"}]}`
  - `GET /api/ds/{source}/draw-result?code=&rows=` → `{"code":0,"msg":"成功","data":[{"expect","opennumber","openTime","lottoId","lottoTypeCn"}]}`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_config.py` 末尾追加：

```python
def test_collector_enabled_flag():
    from app.config import load_settings
    assert load_settings({}).collector_enabled is True
    assert load_settings({"COLLECTOR_ENABLED": "false"}).collector_enabled is False
```

`backend/tests/test_ds_routes.py`：

```python
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

def test_rows_capped_at_300():
    conn, tc, H, _ = build()
    db.insert_draws(conn, 1, "6001", [Draw(f"E{i:04d}", "0", f"2026-10-04 {i // 60:02d}:{i % 60:02d}:00")
                                      for i in range(400)], 1)
    assert len(tc.get("/api/ds/qkltj/draw-result?code=6001&rows=999", headers=H).json()["data"]) == 300

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_ds_routes.py tests/test_config.py -q`
Expected: FAIL（`create_app() got an unexpected keyword argument 'collector'`、`collector_enabled` 不存在）

- [ ] **Step 3: Implement**

`backend/app/config.py`：`Settings` 末尾加字段，`load_settings` 加读取：

```python
    admin_cookie_name: str = "admin_session"
    collector_enabled: bool = True     # 多数据源采集；测试/临时排障可置 false
```

```python
        admin_cookie_name=env.get("ADMIN_COOKIE_NAME", "admin_session"),
        collector_enabled=flag(env.get("COLLECTOR_ENABLED", "true")),
    )
```

`backend/app/routes/ds.py`：

```python
# 客户端多数据源接口：下拉列表 + 与区块链统计同构的开奖结果。须带我方用户 token。
from fastapi import APIRouter, Request
from .. import db, gate

router = APIRouter()
MAX_ROWS = 300

def _deny(request: Request):
    ok, err = gate.authorize(request.app.state.db_conn, request.headers.get("token", ""))
    return None if ok else err

@router.get("/ds/sources")
async def sources(request: Request, cat: str = ""):
    err = _deny(request)
    if err:
        return err
    data = []
    for s in db.list_data_sources(request.app.state.db_conn):
        if not s.enabled:
            continue
        for lot in s.lotteries:
            if cat and lot.cat != cat:
                continue
            data.append({"source": s.key, "sourceName": s.name, "code": lot.lottery_code,
                         "name": lot.name, "status": s.status})
    return {"code": 0, "msg": "成功", "data": data}

@router.get("/ds/{source}/draw-result")
async def draw_result(source: str, request: Request, code: str = "", rows: str = "1"):
    err = _deny(request)
    if err:
        return err
    try:
        n = int(rows)
    except ValueError:
        n = 0
    if n < 1:
        return {"code": 1, "msg": "rows 参数错误"}
    conn = request.app.state.db_conn
    s = db.get_data_source_by_key(conn, source)
    if s is None:
        return {"code": 1, "msg": "数据源不存在"}
    if not s.enabled:
        return {"code": 1, "msg": "数据源已停用"}
    lot = next((l for l in s.lotteries if l.lottery_code == code), None)
    if lot is None:
        return {"code": 1, "msg": "该数据源未配置此彩种"}
    draws = db.latest_draws(conn, s.id, code, min(n, MAX_ROWS))
    return {"code": 0, "msg": "成功", "data": [
        {"expect": d.expect, "opennumber": d.opennumber, "openTime": d.open_time,
         "lottoId": code, "lottoTypeCn": lot.name}
        for d in draws
    ]}
```

`backend/app/main.py`：
1. import 区追加：

```python
from contextlib import asynccontextmanager
from .collector import Collector
from .routes import ds as ds_routes
```

2. `create_app` 签名与开头改为：

```python
def create_app(settings: Settings = None, client=None, conn=None, dayys=None, collector=None) -> FastAPI:
    settings = settings or load_settings(os.environ)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if app.state.settings.collector_enabled:
            await app.state.collector.start()
        try:
            yield
        finally:
            await app.state.collector.stop()

    app = FastAPI(lifespan=lifespan)
```

3. 在 `app.state.dayys = ...` 之后加：

```python
    app.state.collector = collector or Collector(app.state.db_conn)
```

4. 路由注册改为（ds 必须在 catch-all 之前）：

```python
    app.include_router(auth_routes.router, prefix="/api")   # 先于 catch-all
    app.include_router(ds_routes.router, prefix="/api")     # 多数据源，先于 catch-all
    app.include_router(local_router, prefix="/api")
    app.include_router(admin_routes.router, prefix="/admin")
```

- [ ] **Step 4: Run tests to verify they pass（全量）**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/ds.py backend/app/config.py backend/app/main.py backend/tests/test_ds_routes.py backend/tests/test_config.py
git commit -m "feat(backend): /api/ds endpoints and collector lifespan wiring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 管理接口 `/admin/data-sources*`

**Files:**
- Create: `backend/app/routes/admin_datasources.py`
- Modify: `backend/app/main.py`（挂载路由）
- Test: `backend/tests/test_admin_datasources.py`

**Interfaces:**
- Consumes: `admin_auth.cookie_or_key_ok`、`db.*` 数据源函数、`ADAPTERS`、`app.state.collector.reload(id)`
- Produces（JSON 字段与 `db.DataSource` 同名，`lotteries` 为对象数组）：
  - `GET /admin/data-sources` → `{"sources":[DataSource...]}`
  - `POST /admin/data-sources` → `{"ok":true,"source":{...}}` / 400 `{"ok":false,"error":"..."}`
  - `PUT /admin/data-sources/{id}` → `{"ok":true,"source":{...}}` / 400 / 404
  - `PATCH /admin/data-sources/{id}/enabled` body `{"enabled":bool}` → `{"ok":true}` / 400 / 404
  - `DELETE /admin/data-sources/{id}` → `{"ok":true}` / 404
  - `GET /admin/data-sources/{id}/draws?code=&rows=20` → `{"draws":[{"expect","opennumber","open_time"}]}` / 404
  - 无权限一律 403 `{"error":"forbidden"}`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_datasources.py`：

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_datasources.py -q`
Expected: FAIL（`/admin/data-sources` 返回 404 / 405）

- [ ] **Step 3: Implement**

`backend/app/routes/admin_datasources.py`：

```python
# 管理后台：数据源增删改、启停、最新开奖。鉴权沿用 cookie-or-key；写操作后让采集器按新配置重载。
import re
from dataclasses import asdict
from fastapi import APIRouter, Request, Body
from fastapi.responses import JSONResponse
from .. import db, admin_auth
from ..adapters import ADAPTERS

router = APIRouter()

KEY_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
URL_RE = re.compile(r"^https?://[^\s?]+$")
CATS = {"hash", "1105", "animals"}
MIN_INTERVAL = 3
MAX_DRAW_ROWS = 300

def _forbidden():
    return JSONResponse({"error": "forbidden"}, status_code=403)

def _bad(msg: str):
    return JSONResponse({"ok": False, "error": msg}, status_code=400)

def _not_found():
    return JSONResponse({"ok": False, "error": "not found"}, status_code=404)

def _nonempty(v) -> bool:
    return isinstance(v, str) and v.strip() != ""

def _parse_source(p: dict):
    """校验并规整提交的数据源，返回 (fields, None) 或 (None, 错误信息)。"""
    key = p.get("key")
    if not isinstance(key, str) or not KEY_RE.match(key):
        return None, "key 只能是 1-32 位小写字母、数字、- 或 _"
    if not _nonempty(p.get("name")):
        return None, "名称不能为空"
    if p.get("adapter") not in ADAPTERS:
        return None, "返回格式（adapter）无效"
    base_url = p.get("base_url")
    if not isinstance(base_url, str) or not URL_RE.match(base_url):
        return None, "接口地址需以 http(s):// 开头且不含 ? 参数"
    headers = p.get("headers", {})
    if not isinstance(headers, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in headers.items()
    ):
        return None, "请求头必须是字符串键值对"
    interval = p.get("interval_sec", 5)
    if isinstance(interval, bool) or not isinstance(interval, int) or interval < MIN_INTERVAL:
        return None, f"拉取周期不能小于 {MIN_INTERVAL} 秒"
    enabled = p.get("enabled", True)
    if not isinstance(enabled, bool):
        return None, "enabled 必须是布尔值"
    lots_in = p.get("lotteries")
    if not isinstance(lots_in, list) or not lots_in:
        return None, "至少配置一个彩种映射"
    lots, seen = [], set()
    for item in lots_in:
        if not isinstance(item, dict) or not all(
            _nonempty(item.get(k)) for k in ("lottery_code", "remote_code", "name")
        ):
            return None, "彩种映射的统一编码、远端编码、名称不能为空"
        if item.get("cat") not in CATS:
            return None, "彩种映射的工作台无效"
        code = item["lottery_code"].strip()
        if code in seen:
            return None, f"统一编码 {code} 重复"
        seen.add(code)
        lots.append(db.SourceLottery(code, item["remote_code"].strip(), item["name"].strip(), item["cat"]))
    return dict(key=key, name=p["name"].strip(), adapter=p["adapter"], base_url=base_url,
                headers=headers, interval_sec=interval, enabled=enabled, lotteries=lots), None

@router.get("/data-sources")
async def list_sources(request: Request):
    if not admin_auth.cookie_or_key_ok(request):
        return _forbidden()
    return {"sources": [asdict(s) for s in db.list_data_sources(request.app.state.db_conn)]}

@router.post("/data-sources")
async def create_source(request: Request, payload: dict = Body(...)):
    if not admin_auth.cookie_or_key_ok(request):
        return _forbidden()
    fields, err = _parse_source(payload)
    if err:
        return _bad(err)
    conn = request.app.state.db_conn
    if db.get_data_source_by_key(conn, fields["key"]) is not None:
        return _bad(f"key {fields['key']} 已存在")
    s = db.create_data_source(conn, **fields)
    await request.app.state.collector.reload(s.id)
    return {"ok": True, "source": asdict(s)}

@router.put("/data-sources/{source_id}")
async def update_source(source_id: int, request: Request, payload: dict = Body(...)):
    if not admin_auth.cookie_or_key_ok(request):
        return _forbidden()
    conn = request.app.state.db_conn
    if db.get_data_source(conn, source_id) is None:
        return _not_found()
    fields, err = _parse_source(payload)
    if err:
        return _bad(err)
    other = db.get_data_source_by_key(conn, fields["key"])
    if other is not None and other.id != source_id:
        return _bad(f"key {fields['key']} 已存在")
    db.update_data_source(conn, source_id, **fields)
    await request.app.state.collector.reload(source_id)
    return {"ok": True, "source": asdict(db.get_data_source(conn, source_id))}

@router.patch("/data-sources/{source_id}/enabled")
async def toggle_source(source_id: int, request: Request, payload: dict = Body(...)):
    if not admin_auth.cookie_or_key_ok(request):
        return _forbidden()
    enabled = payload.get("enabled")
    if not isinstance(enabled, bool):
        return _bad("enabled 必须是布尔值")
    if not db.set_data_source_enabled(request.app.state.db_conn, source_id, enabled):
        return _not_found()
    await request.app.state.collector.reload(source_id)
    return {"ok": True}

@router.delete("/data-sources/{source_id}")
async def delete_source(source_id: int, request: Request):
    if not admin_auth.cookie_or_key_ok(request):
        return _forbidden()
    if not db.delete_data_source(request.app.state.db_conn, source_id):
        return _not_found()
    await request.app.state.collector.reload(source_id)   # 源已删除：只取消任务
    return {"ok": True}

@router.get("/data-sources/{source_id}/draws")
async def latest_draws(source_id: int, request: Request, code: str = "", rows: int = 20):
    if not admin_auth.cookie_or_key_ok(request):
        return _forbidden()
    conn = request.app.state.db_conn
    if db.get_data_source(conn, source_id) is None:
        return _not_found()
    draws = db.latest_draws(conn, source_id, code, max(1, min(rows, MAX_DRAW_ROWS)))
    return {"draws": [asdict(d) for d in draws]}
```

`backend/app/main.py`：import 区加 `from .routes import admin_datasources as admin_ds_routes`，在 `app.include_router(admin_routes.router, prefix="/admin")` 下一行加：

```python
    app.include_router(admin_ds_routes.router, prefix="/admin")
```

- [ ] **Step 4: Run tests to verify they pass（全量）**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/admin_datasources.py backend/app/main.py backend/tests/test_admin_datasources.py
git commit -m "feat(backend): admin API for data source management

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 管理后台「数据源」页面

**Files:**
- Modify: `backend/admin-ui/src/api.ts`（末尾追加）、`backend/admin-ui/src/MainLayout.tsx`
- Create: `backend/admin-ui/src/pages/DataSources.tsx`
- Rebuild: `backend/app/static/admin-dist/**`

**Interfaces:**
- Consumes: Task 5 的 `/admin/data-sources*`
- Produces: `api.ts` 导出 `SourceLottery`、`DataSourceRow`、`DataSourceInput`、`DrawRow`、`listDataSources()`、`saveDataSource(id, input)`、`setDataSourceEnabled(id, enabled)`、`deleteDataSource(id)`、`listDraws(id, code, rows)`

- [ ] **Step 1: 追加 API 函数**（`backend/admin-ui/src/api.ts` 末尾）

```ts
// ---------------- 数据源 ----------------

export interface SourceLottery {
  lottery_code: string
  remote_code: string
  name: string
  cat: string
}

export interface DataSourceRow {
  id: number
  key: string
  name: string
  adapter: string
  base_url: string
  headers: Record<string, string>
  interval_sec: number
  enabled: boolean
  status: string
  last_error: string | null
  last_ok_at: number | null
  created_at: number
  lotteries: SourceLottery[]
}

export type DataSourceInput = Omit<
  DataSourceRow,
  'id' | 'status' | 'last_error' | 'last_ok_at' | 'created_at'
>

export interface DrawRow {
  expect: string
  opennumber: string
  open_time: string
}

export async function listDataSources(): Promise<DataSourceRow[]> {
  const r = await req('/data-sources')
  if (r.status !== 200) throw new Error('list data sources failed: ' + r.status)
  const d = await r.json()
  return d.sources as DataSourceRow[]
}

export async function saveDataSource(
  id: number | null,
  input: DataSourceInput,
): Promise<{ ok: boolean; error?: string }> {
  const r = await req(id == null ? '/data-sources' : '/data-sources/' + id, {
    method: id == null ? 'POST' : 'PUT',
    body: JSON.stringify(input),
  })
  const d = await r.json().catch(() => ({}))
  return { ok: r.status === 200 && d.ok === true, error: d.error }
}

export async function setDataSourceEnabled(id: number, enabled: boolean): Promise<boolean> {
  const r = await req(`/data-sources/${id}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
  return r.status === 200
}

export async function deleteDataSource(id: number): Promise<boolean> {
  const r = await req(`/data-sources/${id}`, { method: 'DELETE' })
  return r.status === 200
}

export async function listDraws(id: number, code: string, rows = 20): Promise<DrawRow[]> {
  const r = await req(`/data-sources/${id}/draws?code=${encodeURIComponent(code)}&rows=${rows}`)
  if (r.status !== 200) return []
  const d = await r.json()
  return d.draws as DrawRow[]
}
```

- [ ] **Step 2: 新建页面** `backend/admin-ui/src/pages/DataSources.tsx`

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormDigit,
  ProFormGroup,
  ProFormList,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button, Drawer, Popconfirm, Switch, Table, Tabs, Tag, Tooltip } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  DataSourceInput,
  DataSourceRow,
  DrawRow,
  deleteDataSource,
  listDataSources,
  listDraws,
  saveDataSource,
  setDataSourceEnabled,
} from '../api'
import { fmtDateTime } from '../util'

const ADAPTER_OPTIONS = [
  { label: '区块链统计格式（expect / opennumber）', value: 'qkltj' },
  { label: '全球统计格式（issue / drawResult）', value: 'qqtj' },
]

const CAT_OPTIONS = [
  { label: '哈希', value: 'hash' },
  { label: '11选5', value: '1105' },
  { label: '运动会', value: 'animals' },
]

function StatusTag({ row }: { row: DataSourceRow }) {
  if (!row.enabled) return <Tag>停用</Tag>
  if (row.status === 'ok') return <Tag color="success">正常</Tag>
  if (row.status === 'error')
    return (
      <Tooltip title={row.last_error}>
        <Tag color="error">异常</Tag>
      </Tooltip>
    )
  return <Tag>未知</Tag>
}

interface FormValues {
  key: string
  name: string
  adapter: string
  base_url: string
  headers_text: string
  interval_sec: number
  enabled: boolean
  lotteries: DataSourceInput['lotteries']
}

function toFormValues(r?: DataSourceRow): Partial<FormValues> {
  if (!r) return { adapter: 'qkltj', headers_text: '{}', interval_sec: 5, enabled: true, lotteries: [] }
  return {
    key: r.key,
    name: r.name,
    adapter: r.adapter,
    base_url: r.base_url,
    headers_text: JSON.stringify(r.headers, null, 2),
    interval_sec: r.interval_sec,
    enabled: r.enabled,
    lotteries: r.lotteries,
  }
}

function SourceForm({
  record,
  trigger,
  onDone,
}: {
  record?: DataSourceRow
  trigger: JSX.Element
  onDone: () => void
}) {
  const { message } = App.useApp()
  return (
    <ModalForm<FormValues>
      title={record ? `编辑数据源 · ${record.name}` : '新增数据源'}
      trigger={trigger}
      width={760}
      modalProps={{ destroyOnClose: true }}
      initialValues={toFormValues(record)}
      onFinish={async (v) => {
        let headers: Record<string, string>
        try {
          headers = JSON.parse(v.headers_text || '{}')
        } catch {
          message.error('请求头不是合法的 JSON')
          return false
        }
        const res = await saveDataSource(record ? record.id : null, {
          key: v.key,
          name: v.name,
          adapter: v.adapter,
          base_url: v.base_url,
          headers,
          interval_sec: v.interval_sec,
          enabled: v.enabled,
          lotteries: v.lotteries || [],
        })
        if (!res.ok) {
          message.error(res.error || '保存失败')
          return false
        }
        message.success('已保存')
        onDone()
        return true
      }}
    >
      <ProFormGroup>
        <ProFormText name="name" label="名称" width="sm" rules={[{ required: true }]} />
        <ProFormText
          name="key"
          label="标识 key"
          width="sm"
          tooltip="小写字母、数字、- 或 _；客户端接口路径中使用，上线后不要随意修改"
          rules={[{ required: true }]}
        />
        <ProFormSelect name="adapter" label="返回格式" width="md" options={ADAPTER_OPTIONS} rules={[{ required: true }]} />
      </ProFormGroup>
      <ProFormText name="base_url" label="接口地址（不含 ? 参数）" rules={[{ required: true }]} />
      <ProFormGroup>
        <ProFormDigit name="interval_sec" label="拉取周期（秒）" min={3} width="xs" fieldProps={{ precision: 0 }} rules={[{ required: true }]} />
        <ProFormSwitch name="enabled" label="启用" />
      </ProFormGroup>
      <ProFormTextArea name="headers_text" label="请求头 / 鉴权参数（JSON 对象）" fieldProps={{ rows: 3 }} />
      <ProFormList
        name="lotteries"
        label="彩种映射"
        min={1}
        copyIconProps={false}
        creatorButtonProps={{ creatorButtonText: '添加彩种' }}
      >
        <ProFormGroup>
          <ProFormText name="lottery_code" label="统一编码" width="xs" rules={[{ required: true }]} />
          <ProFormText name="remote_code" label="远端编码" width="sm" rules={[{ required: true }]} />
          <ProFormText name="name" label="名称" width="sm" rules={[{ required: true }]} />
          <ProFormSelect name="cat" label="工作台" width="xs" options={CAT_OPTIONS} rules={[{ required: true }]} />
        </ProFormGroup>
      </ProFormList>
    </ModalForm>
  )
}

function DrawsDrawer({ record, onClose }: { record: DataSourceRow | null; onClose: () => void }) {
  const [data, setData] = useState<Record<string, DrawRow[]>>({})
  useEffect(() => {
    if (!record) return
    setData({})
    record.lotteries.forEach(async (l) => {
      const rows = await listDraws(record.id, l.lottery_code, 20)
      setData((d) => ({ ...d, [l.lottery_code]: rows }))
    })
  }, [record])
  return (
    <Drawer open={!!record} onClose={onClose} width={600} title={record ? `最新开奖 · ${record.name}` : ''}>
      {record && (
        <Tabs
          items={record.lotteries.map((l) => ({
            key: l.lottery_code,
            label: `${l.name}（${l.lottery_code}）`,
            children: (
              <Table<DrawRow>
                size="small"
                rowKey="expect"
                pagination={false}
                loading={!data[l.lottery_code]}
                dataSource={data[l.lottery_code] || []}
                columns={[
                  { title: '期号', dataIndex: 'expect' },
                  { title: '开奖号码', dataIndex: 'opennumber' },
                  { title: '开奖时间', dataIndex: 'open_time' },
                ]}
              />
            ),
          }))}
        />
      )}
    </Drawer>
  )
}

export default function DataSources() {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()
  const [drawsOf, setDrawsOf] = useState<DataSourceRow | null>(null)
  const reload = () => actionRef.current?.reload()

  const columns: ProColumns<DataSourceRow>[] = [
    { title: '名称', dataIndex: 'name' },
    { title: 'key', dataIndex: 'key', copyable: true },
    { title: '接口地址', dataIndex: 'base_url', ellipsis: true, copyable: true },
    { title: '周期', dataIndex: 'interval_sec', width: 70, render: (_, r) => `${r.interval_sec}s` },
    { title: '彩种', dataIndex: 'lotteries', render: (_, r) => r.lotteries.map((l) => l.name).join('、') },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 70,
      render: (_, r) => (
        <Switch
          size="small"
          checked={r.enabled}
          onChange={async (on) => {
            if (await setDataSourceEnabled(r.id, on)) {
              message.success(on ? '已启用' : '已停用')
              reload()
            } else {
              message.error('操作失败')
            }
          }}
        />
      ),
    },
    { title: '状态', dataIndex: 'status', width: 80, render: (_, r) => <StatusTag row={r} /> },
    {
      title: '最后成功',
      dataIndex: 'last_ok_at',
      render: (_, r) => (r.last_ok_at ? fmtDateTime(r.last_ok_at) : '-'),
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, r) => [
        <SourceForm key="edit" record={r} trigger={<a>编辑</a>} onDone={reload} />,
        <a key="draws" onClick={() => setDrawsOf(r)}>
          最新开奖
        </a>,
        <Popconfirm
          key="del"
          title={`删除「${r.name}」及其全部开奖数据？`}
          onConfirm={async () => {
            if (await deleteDataSource(r.id)) {
              message.success('已删除')
              reload()
            } else {
              message.error('删除失败')
            }
          }}
        >
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ]

  return (
    <>
      <ProTable<DataSourceRow>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        pagination={false}
        polling={10000}
        request={async () => ({ data: await listDataSources(), success: true })}
        toolBarRender={() => [
          <SourceForm
            key="new"
            trigger={
              <Button type="primary" icon={<PlusOutlined />}>
                新增数据源
              </Button>
            }
            onDone={reload}
          />,
        ]}
      />
      <DrawsDrawer record={drawsOf} onClose={() => setDrawsOf(null)} />
    </>
  )
}
```

- [ ] **Step 3: 接入菜单** `backend/admin-ui/src/MainLayout.tsx`

```tsx
import { ApiOutlined, DashboardOutlined, LogoutOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import DataSources from './pages/DataSources'

const ROUTE = {
  path: '/',
  routes: [
    { path: '/dashboard', name: '概览', icon: <DashboardOutlined /> },
    { path: '/users', name: '用户管理', icon: <TeamOutlined /> },
    { path: '/data-sources', name: '数据源', icon: <ApiOutlined /> },
  ],
}

const TITLES: Record<string, string> = { '/dashboard': '概览', '/users': '用户管理', '/data-sources': '数据源' }
```

渲染处改为：

```tsx
      <PageContainer header={{ title: TITLES[pathname] }}>
        {pathname === '/dashboard' ? <Dashboard /> : pathname === '/users' ? <UsersTable /> : <DataSources />}
      </PageContainer>
```

- [ ] **Step 4: 构建（含 tsc 类型检查）**

Run: `cd backend/admin-ui && npm run build`
Expected: 无 TS 报错，输出到 `../app/static/admin-dist`

- [ ] **Step 5: 本地手工验证**

```bash
cd backend && ADMIN_KEY=dev ADMIN_COOKIE_SECURE=false DB_PATH=/tmp/ys-ds-dev.db .venv/bin/python manage.py admin-set admin devpass
cd backend && ADMIN_KEY=dev ADMIN_COOKIE_SECURE=false DB_PATH=/tmp/ys-ds-dev.db .venv/bin/python -m uvicorn app.main:app --port 8000
```
浏览器打开 `http://127.0.0.1:8000/admin/` 用 admin/devpass 登录 →「数据源」：
- 两个默认源，约 10 秒内状态变为「正常」，「最后成功」有时间；
- 「最新开奖」中两源 6001 的期号、号码一致；
- 把全球统计接口地址改成 `https://qqtj666.com/api/trial/nope` 保存 → 状态变「异常」，悬停显示 `HTTP 404`，区块链统计仍「正常」；改回后恢复正常；
- 停用开关、新增、删除可用。


- [ ] **Step 6: Commit**

```bash
git add backend/admin-ui/src backend/app/static/admin-dist
git commit -m "feat(admin): data sources page with status, editing and latest draws

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 客户端 helper `ds-sources.js`

**Files:**
- Create: `client/ds-sources.js`
- Modify: `client/index.html`
- Test: `electron/ds-sources.test.js`

**Interfaces:**
- Produces（浏览器全局 `window.dsSources`，Node 下 `module.exports`）：
  - `optKey(option) -> string`（`value|requestUrl`）
  - `toOption(item, apiURL) -> {value, label, requestUrl, server: true, status}`
  - `persistable(options) -> options`（去掉 `server: true`）
  - `merge(items, options, apiURL) -> options`（服务端项在前 + 本地项）
  - `dotColor(option) -> string`
  - `fetchServer(apiURL, cat, token, fetchImpl?) -> Promise<items[]>`（任何失败都返回 `[]`）

- [ ] **Step 1: Write the failing test** `electron/ds-sources.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const ds = require('../client/ds-sources.js');

const API = 'https://lottery.jh8.ai/api';
const ITEM = { source: 'qqtj', sourceName: '全球统计', code: '6001', name: '哈希分分彩', status: 'ok' };

test('toOption 生成走服务端接口的下拉项', () => {
  assert.deepStrictEqual(ds.toOption(ITEM, API), {
    value: '6001', label: '哈希分分彩 · 全球统计',
    requestUrl: 'https://lottery.jh8.ai/api/ds/qqtj/draw-result', server: true, status: 'ok',
  });
});

test('optKey 区分同彩种不同源', () => {
  const a = ds.toOption(ITEM, API);
  const b = ds.toOption({ ...ITEM, source: 'qkltj', sourceName: '区块链统计' }, API);
  assert.notStrictEqual(ds.optKey(a), ds.optKey(b));
  assert.strictEqual(ds.optKey({ value: '11001', requestUrl: null }), '11001|');
});

test('merge：服务端项在前，旧服务端项被替换，本地项保留', () => {
  const local = { value: '9', label: '我的源', requestUrl: 'https://x/api' };
  const stale = { ...ds.toOption(ITEM, API), status: 'error' };
  const out = ds.merge([ITEM], [stale, local], API);
  assert.deepStrictEqual(out, [ds.toOption(ITEM, API), local]);
});

test('persistable 去掉服务端项', () => {
  const local = { value: '9', label: 'x', requestUrl: 'https://x' };
  assert.deepStrictEqual(ds.persistable([ds.toOption(ITEM, API), local]), [local]);
  assert.deepStrictEqual(ds.persistable(undefined), []);
});

test('dotColor', () => {
  assert.strictEqual(ds.dotColor({ status: 'ok' }), '#19be6b');
  assert.strictEqual(ds.dotColor({ status: 'error' }), '#ed4014');
  assert.strictEqual(ds.dotColor({ status: 'unknown' }), '#c5c8ce');
});

test('fetchServer：带 token 请求并返回 data', async () => {
  let seen;
  const fake = async (url, opts) => { seen = { url, opts }; return { json: async () => ({ code: 0, data: [ITEM] }) }; };
  assert.deepStrictEqual(await ds.fetchServer(API, 'hash', 'TOK', fake), [ITEM]);
  assert.strictEqual(seen.url, 'https://lottery.jh8.ai/api/ds/sources?cat=hash');
  assert.strictEqual(seen.opts.headers.token, 'TOK');
});

test('fetchServer：业务错误或网络失败返回空数组', async () => {
  assert.deepStrictEqual(await ds.fetchServer(API, 'hash', 'T', async () => ({ json: async () => ({ code: 10020 }) })), []);
  assert.deepStrictEqual(await ds.fetchServer(API, 'hash', 'T', async () => { throw new Error('offline'); }), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test electron/ds-sources.test.js`
Expected: FAIL，`Cannot find module '../client/ds-sources.js'`

- [ ] **Step 3: Implement** `client/ds-sources.js`

```js
// 多数据源 helper：把服务端下发的「数据源 × 彩种」并入工作台下拉框。
// 浏览器里挂到 window.dsSources（由 index.html 先于业务脚本加载），Node 测试里 require。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.dsSources = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var COLORS = { ok: '#19be6b', error: '#ed4014' };
  var UNKNOWN = '#c5c8ce';

  // 同一彩种编码可能来自多个源，切换判断必须带上 requestUrl
  function optKey(o) {
    return String(o && o.value) + '|' + ((o && o.requestUrl) || '');
  }

  function toOption(item, apiURL) {
    return {
      value: String(item.code),
      label: item.name + ' · ' + item.sourceName,
      requestUrl: apiURL + '/ds/' + item.source + '/draw-result',
      server: true,
      status: item.status,
    };
  }

  // 只有用户自己添加的源写回 localStorage
  function persistable(options) {
    return (options || []).filter(function (o) { return !o.server; });
  }

  function merge(items, options, apiURL) {
    return (items || []).map(function (it) { return toOption(it, apiURL); }).concat(persistable(options));
  }

  function dotColor(o) {
    return COLORS[o && o.status] || UNKNOWN;
  }

  function fetchServer(apiURL, cat, token, fetchImpl) {
    var f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) return Promise.resolve([]);
    var headers = {};
    if (token) headers.token = token;
    return Promise.resolve()
      .then(function () { return f(apiURL + '/ds/sources?cat=' + encodeURIComponent(cat), { headers: headers }); })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d.code === 0 && Array.isArray(d.data) ? d.data : []; })
      .catch(function () { return []; });
  }

  return { optKey: optKey, toOption: toOption, persistable: persistable, merge: merge,
           dotColor: dotColor, fetchServer: fetchServer };
});
```

- [ ] **Step 4: 在 index.html 里先于业务脚本加载**

`client/index.html` 为单行压缩 HTML。把第一个 `<script type=module src=app://./js/chunk-vendors.d49203a2.js>` 替换为：

```html
<script src=app://./ds-sources.js></script><script type=module src=app://./js/chunk-vendors.d49203a2.js>
```

用脚本做精确替换并校验只命中一次：

```bash
node -e '
const fs=require("fs"),f="client/index.html",a="<script type=module src=app://./js/chunk-vendors.d49203a2.js>";
let s=fs.readFileSync(f,"utf8"); if(s.includes("ds-sources.js")) process.exit(0);
if(s.split(a).length!==2) throw new Error("anchor not unique");
fs.writeFileSync(f,s.replace(a,"<script src=app://./ds-sources.js></script>"+a));'
grep -o '<script[^>]*ds-sources[^>]*>' client/index.html
```
Expected: 输出一行 `<script src=app://./ds-sources.js>`

- [ ] **Step 5: Run tests**

Run: `node --test electron/ds-sources.test.js && npm test`
Expected: PASS（新增 7 个 + 原有测试）

- [ ] **Step 6: Commit**

```bash
git add client/ds-sources.js client/index.html electron/ds-sources.test.js
git commit -m "feat(client): ds-sources helper for server-issued data source options

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 工作台 chunk 补丁

**Files:**
- Create: `scripts/patch-ds-client.js`
- Modify（由脚本生成）: `client/js/chunk-b7e0f68a.59391aa2.js`、`client/js/chunk-50732e0a.702f76ce.js`、`client/js/chunk-60235acf.b3ce76aa.js`
- Test: `electron/ds-client-patch.test.js`

**Interfaces:**
- Consumes: `window.dsSources`（Task 7）；页面模块作用域内的 `__webpack_require__("f121")`（`src/config/index.js`，含 `apiURL`）
- Produces: `scripts/patch-ds-client.js` 导出 `{ patchChunk(raw) -> string, CHUNKS, MARK, enc }`；命令行直接运行即对 3 个 chunk 打补丁

**背景（给实现者）：** 三个 chunk 是 webpack dev 风格产物，每个模块源码放在 `eval('...')` 单引号字符串里：换行写成 `\n`、单引号写成 `\'`、双引号与中文原样。锚点和替换文本都必须先按这个规则编码（`enc`）再在原文件上替换。已实测：下表每个锚点在三个 chunk 中各命中 1 次（`JSON.stringify(this.options)` 为 2 次）。

- [ ] **Step 1: Write the failing test** `electron/ds-client-patch.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { patchChunk, CHUNKS, MARK } = require('../scripts/patch-ds-client.js');

const DIR = path.join(__dirname, '..', 'client', 'js');

// 在 vm 里执行 chunk，截获每个模块交给 eval 的源码（不真正执行页面逻辑）
function evalSources(raw) {
  const captured = [];
  const window = { webpackJsonp: [] };
  const ctx = vm.createContext({ window, eval: (s) => { captured.push(s); } });
  new vm.Script(raw).runInContext(ctx);
  const req = Object.assign(() => ({}), { r() {}, d() {}, n: () => () => ({}) });
  for (const fn of Object.values(window.webpackJsonp[0][1])) {
    try { fn.call({}, { exports: {} }, {}, req); } catch (e) { /* 只关心 eval 源码 */ }
  }
  return captured;
}

const NEEDLES = [
  'dsLoad(first) {',
  'dsInit() {',
  'this.dsInit();',
  'window.dsSources.optKey(this.options[index]) != window.dsSources.optKey({ value: this.codeId, requestUrl: this.requestUrl })',
  "this.requestUrl = this.options[index].requestUrl;\n        this.num = '';",
  'JSON.stringify(window.dsSources.persistable(this.options))',
  "return [!scope.row.server && scope.row.value != '11001'",
  'window.dsSources.dotColor(item)',
  'clearInterval(this.dsTimer);',
];

for (const name of CHUNKS) {
  const file = path.join(DIR, name);

  test(`${name}: 已打补丁且再次运行不变（幂等）`, () => {
    const raw = fs.readFileSync(file, 'utf8');
    assert.ok(raw.includes(MARK));
    assert.strictEqual(patchChunk(raw), raw);
  });

  test(`${name}: 全部模块源码语法有效，页面模块含补丁逻辑`, () => {
    const srcs = evalSources(fs.readFileSync(file, 'utf8'));
    assert.ok(srcs.length > 10);
    for (const s of srcs) new vm.Script(s);          // 编码出错会在这里抛 SyntaxError
    const page = srcs.find((s) => s.includes('switchCode(index) {'));
    for (const n of NEEDLES) assert.ok(page.includes(n), `缺少: ${n}`);
    assert.strictEqual(page.split('JSON.stringify(window.dsSources.persistable(this.options))').length - 1, 2);
  });
}

test('锚点不匹配时报错，而不是静默跳过', () => {
  assert.throws(() => patchChunk("eval('switchCode(index) {')"), /命中 0 次/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test electron/ds-client-patch.test.js`
Expected: FAIL，`Cannot find module '../scripts/patch-ds-client.js'`

- [ ] **Step 3: Implement** `scripts/patch-ds-client.js`

```js
#!/usr/bin/env node
// 多数据源客户端补丁：给哈希 / 11选5 / 运动会三个工作台 chunk 注入「服务端下发数据源」逻辑。
// 页面源码位于 webpack 的 eval('...') 字符串内，锚点与替换文本都按该字符串的引号规则编码后再替换。
// 幂等：已含 MARK 的文件原样返回；任一锚点命中次数与预期不符则抛错、不写盘。
const fs = require('fs');
const path = require('path');

const MARK = '/* ds-patch v1 */';
const DS = 'window.dsSources';
const API = '__webpack_require__("f121")["apiURL"]';   // src/config/index.js
const CHUNKS = [
  'chunk-b7e0f68a.59391aa2.js', // 哈希
  'chunk-50732e0a.702f76ce.js', // 11选5
  'chunk-60235acf.b3ce76aa.js', // 运动会
];

// 插在 switchCode 之前的新方法（methods 对象内，4 空格缩进）
const METHODS = [
  `${MARK}`,
  `    dsLoad(first) {`,
  `      const hadNone = ${DS}.persistable(this.options).length === 0;`,
  `      return ${DS}.fetchServer(${API}, this.catId, localStorage.getItem("token")).then(items => {`,
  `        this.options = ${DS}.merge(items, this.options, ${API});`,
  `        if (first && hadNone && items.length > 0) {`,
  `          const o = this.options[0];`,
  `          this.codeId = o.value;`,
  `          this.codeName = o.label;`,
  `          this.requestUrl = o.requestUrl;`,
  `          this.num = '';`,
  `          this.showOpenNum();`,
  `        }`,
  `      });`,
  `    },`,
  `    dsInit() {`,
  `      this.dsLoad(true);`,
  `      this.dsTimer = setInterval(() => this.dsLoad(false), 60000);`,
  `    },`,
  `    `,
].join('\n');

const REPLACEMENTS = [
  { // created(): 本地选项加载完后拉服务端列表
    find: 'this.showOpenNum();\n    this.dataRefreh();\n    this.conditionList',
    repl: 'this.showOpenNum();\n    this.dataRefreh();\n    this.dsInit();\n    this.conditionList',
    count: 1,
  },
  { // 新方法
    find: 'switchCode(index) {',
    repl: METHODS + 'switchCode(index) {',
    count: 1,
  },
  { // 同彩种不同源也要能切换
    find: 'if (this.options[index].value != this.codeId) {',
    repl: `if (${DS}.optKey(this.options[index]) != ${DS}.optKey({ value: this.codeId, requestUrl: this.requestUrl })) {`,
    count: 1,
  },
  { // 切换后强制刷新：两源同期号时原逻辑会判为「无需刷新」
    find: 'this.requestUrl = this.options[index].requestUrl;',
    repl: "this.requestUrl = this.options[index].requestUrl;\n        this.num = '';",
    count: 1,
  },
  { // 只持久化用户自己添加的源
    find: 'JSON.stringify(this.options)',
    repl: `JSON.stringify(${DS}.persistable(this.options))`,
    count: 2,
  },
  { // 服务端下发的源不显示删除按钮
    find: "return [scope.row.value != '11001'",
    repl: "return [!scope.row.server && scope.row.value != '11001'",
    count: 1,
  },
  { // 下拉项前加状态圆点
    find: '[_vm._v(_vm._s(item.label))])]);',
    repl: `[item.server ? _c('span', { style: { color: ${DS}.dotColor(item), marginRight: '6px' } }, [_vm._v("●")]) : _vm._e(), _vm._v(_vm._s(item.label))])]);`,
    count: 1,
  },
  { // 页面销毁时停掉列表刷新
    find: 'destroyed() {\n    // 在页面销毁后，清除计时器\n    this.clear();',
    repl: 'destroyed() {\n    // 在页面销毁后，清除计时器\n    this.clear();\n    clearInterval(this.dsTimer);',
    count: 1,
  },
];

function enc(s, q) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').split(q).join('\\' + q);
}

function patchChunk(raw) {
  const p = raw.indexOf('switchCode(index) {');
  if (p < 0) throw new Error('找不到 switchCode(index)');
  const e = raw.lastIndexOf('eval(', p);
  if (e < 0) throw new Error('找不到页面模块的 eval(');
  const q = raw[e + 5];
  if (raw.includes(enc(MARK, q))) return raw;
  let out = raw;
  for (const r of REPLACEMENTS) {
    const f = enc(r.find, q);
    const n = out.split(f).length - 1;
    if (n !== r.count) throw new Error(`锚点命中 ${n} 次（应为 ${r.count}）：${r.find.slice(0, 60)}`);
    out = out.split(f).join(enc(r.repl, q));
  }
  return out;
}

module.exports = { patchChunk, CHUNKS, MARK, enc };

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'client', 'js');
  for (const name of CHUNKS) {
    const file = path.join(dir, name);
    const raw = fs.readFileSync(file, 'utf8');
    const out = patchChunk(raw);
    if (out === raw) {
      console.log(`skip    ${name}（已打过补丁）`);
    } else {
      fs.writeFileSync(file, out);
      console.log(`patched ${name}`);
    }
  }
}
```

- [ ] **Step 4: 运行补丁脚本**

Run: `node scripts/patch-ds-client.js && node scripts/patch-ds-client.js`
Expected: 第一次三行 `patched ...`，第二次三行 `skip ...（已打过补丁）`

- [ ] **Step 5: Run tests**

Run: `node --test electron/ds-client-patch.test.js && npm test`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/patch-ds-client.js electron/ds-client-patch.test.js client/js/chunk-b7e0f68a.59391aa2.js client/js/chunk-50732e0a.702f76ce.js client/js/chunk-60235acf.b3ce76aa.js
git commit -m "feat(client): workbench dropdowns load server data sources with status dots

Fixes switching between two sources that share a lottery code, and keeps
server-issued options out of localStorage.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 文档与全量验证

**Files:**
- Modify: `backend/README.md`、`backend/DEPLOY.md`

- [ ] **Step 1: README 增加「多数据源采集」一节**（放在管理后台说明之后）

```markdown
## 多数据源采集

服务启动后，进程内为每个启用的数据源单独定时拉取开奖号（默认 5 秒，`rows=10`），按数据源隔离存入 SQLite
（`data_sources / source_lotteries / draws`），某个源异常不影响其他源。首次建表时自动写入两个默认源：
区块链统计（qkltj，6001/6002/5001/5002）与全球统计（qqtj，6001→trxbhffc、6002→trxbh3fc）。

- 管理：后台「数据源」菜单——增删改、启停、查看状态（正常/异常 + 最后错误 + 最后成功时间）与最新开奖。
- 客户端接口（需我方 token）：`GET /api/ds/sources?cat=hash`、`GET /api/ds/{key}/draw-result?code=6001&rows=N`
  （返回格式与区块链统计一致，rows ≤ 300）。
- `COLLECTOR_ENABLED=false` 可关闭采集（排障用）。
- **必须单进程运行 uvicorn**（不要加 `--workers`），否则会重复采集。
- 全球统计 trial 接口每次最多 10 行、无历史翻页：历史从开始采集起累积（300 期分分彩约 5 小时、三分彩约 15 小时）。
```

- [ ] **Step 2: DEPLOY.md 在 systemd 一节下补充**

```markdown
> 多数据源采集运行在 uvicorn 进程内：保持上面的单进程 `ExecStart`，**不要**加 `--workers N`。
> 升级到含采集器的版本后，首次启动会自动建表并写入两个默认数据源，无需手工迁移。
> 部署后在后台「数据源」页确认两个源在 10 秒内变为「正常」。
```

- [ ] **Step 3: 全量测试**

Run: `cd backend && .venv/bin/python -m pytest -q && cd .. && npm test`
Expected: 后端、Electron 测试全部 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/README.md backend/DEPLOY.md
git commit -m "docs(backend): document multi-datasource collector and single-process requirement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 部署与客户端端到端验证（需用户确认后执行）

> 部署到 `lottery.jh8.ai` 与发版属于对外操作：执行前必须向用户确认。客户端 `apiURL` 固定指向生产，所以客户端端到端验证只能在后端部署后进行。

- [ ] **Step 1:** 用户确认后，按 `backend/DEPLOY.md` 部署后端；后台「数据源」页两个源 10 秒内为「正常」。
- [ ] **Step 2:** `npm start` 启动客户端，登录后进入哈希工作台：
  - 下拉框出现「哈希分分彩 · 区块链统计」「哈希分分彩 · 全球统计」等项，前有绿色圆点；
  - 在两个「哈希分分彩」之间切换，期号与号码立即刷新（两源同期号码应一致）；
  - 遗漏 / K 线 / 走势子窗口在全球统计源下可打开（期数受累积历史限制）；
  - 原有「数据源地址」手动添加的源仍可添加、删除，重启后仍在；服务端项无删除按钮、不写入 localStorage。
- [ ] **Step 3:** 后台停用「全球统计」→ 60 秒内客户端下拉中该源消失；后台把其地址改错 → 圆点变红、区块链统计照常刷新；恢复。
- [ ] **Step 4:** 11选5 工作台：默认仍是山东省等原选项，下拉中多出「波场分分11选5 · 区块链统计」等，可切换。
- [ ] **Step 5:** 用户确认后打包发版：`npm run dist:mac`、`npm run dist:win`。
