# 设计：多数据源服务端集中采集（修复「全球统计」接入失败）

**日期**：2026-10-04
**状态**：已通过设计评审，待 spec 复核

## 背景与根因

客户端（哈希 / 11选5 / 运动会工作台）现有「数据源地址」功能：用户粘贴一个 URL，客户端拆成 `requestUrl + code` 存入 localStorage 下拉选项，由渲染进程直接 `GET {requestUrl}?code=..&rows=..`（入口唯一：`app.js` 中的 `topRows`），工作台每 7 秒轮询**当前选中**的那一个源。

「区块链统计」（`api.qkltj.com`）可用，「全球统计」（`qqtj666.com`）不可用。排查结论（2026-10-04 实测）：

| 项 | 区块链统计 | 全球统计 |
|---|---|---|
| HTTP / CORS 预检（含 token、fromId 头） | 200，放行 | 200，放行 |
| 期号字段 | `expect` | `issue` |
| 开奖号字段 | `opennumber` | `drawResult` |
| 开奖时间字段 | `openTime` | `drawTime` |
| 彩种字段 | `lottoId: "6001"` | 无 |
| `code` 参数 | 数字（6001） | 字符串（trxbhffc），传 6001 返回「参数错误」 |
| 单次最多返回行数 | ≥100 | **10**，且无历史翻页参数 |
| 频率限制 | 未见 | `x-ratelimit-limit: 90` |

**根因**：返回字段名不兼容。工作台 `showOpenNum` 直接执行 `res.data[0].opennumber.split(",")`，全球统计无 `opennumber` 字段 → TypeError，号码永远不显示。不是网络、鉴权或跨域问题。

此外，全球统计 trial 接口最多 10 行，而客户端遗漏/走势页需要 100~300 行，必须在服务端持续采集累积历史。

## 决策（brainstorming 已拍板）

1. **服务端集中采集**：在既有 FastAPI 中间层（`lottery.jh8.ai`）内采集、入库、对客户端提供统一格式接口。
2. **进程内 asyncio 采集任务**（方案 A），不另起采集进程、不用 cron。
3. **客户端下拉框由服务端下发**「数据源 × 彩种」列表，并保留用户手动添加的源。
4. **统一彩种编码**沿用区块链统计的数字编码（6001/6002/5001/5002）。

## 目标与范围

**范围内**
- 数据源管理：增删改、启停，每个源独立配置接口地址、请求头（鉴权参数）、拉取周期、彩种映射。
- 每个启用的源独立定时拉取，单源异常不影响其他源。
- 开奖数据按 `source_id` 隔离存储（期号、号码、开奖时间）。
- 客户端工作台切换数据源后立即加载该源数据；下拉项展示源在线状态。
- 管理后台展示每个源的状态（正常 / 异常 / 停用）、最后错误、最后成功时间。

**非目标（YAGNI）**
- 后台可配置的通用字段映射（出现第三种返回格式时再加适配器函数）。
- WebSocket / SSE 推送（沿用客户端 7 秒轮询）。
- 多源号码比对、自动选优、告警通知。
- 修改老版本客户端行为（老客户端继续直连区块链统计）。

## 架构

```
qkltj / qqtj666 / …（后续新增的源）
      ▲  每个启用的源一个 asyncio 任务；某源异常只影响自身
      │  适配器把各源返回统一为 Draw(expect, opennumber, open_time)
FastAPI (lottery.jh8.ai，单 uvicorn 进程)
  ├─ collector：调度、入库、状态写回、失败退避
  ├─ SQLite：data_sources / source_lotteries / draws（按 source_id 隔离）
  ├─ /admin/data-sources*  数据源 CRUD / 启停 / 状态 / 最新开奖（管理后台）
  └─ /api/ds/*            客户端：源列表 + 开奖号（校验我方用户 token）
      ▼
客户端工作台：下拉 = 服务端下发的「源 × 彩种」 + 用户手动添加的源
```

## 数据模型（`app/db.py` 扩展）

```sql
CREATE TABLE IF NOT EXISTS data_sources(
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  key          TEXT UNIQUE NOT NULL,       -- URL 中使用，如 qkltj / qqtj
  name         TEXT NOT NULL,              -- 显示名，如「全球统计」
  adapter      TEXT NOT NULL,              -- 适配器名：qkltj | qqtj
  base_url     TEXT NOT NULL,              -- 不含 query，如 https://qqtj666.com/api/trial/draw-result
  headers_json TEXT NOT NULL DEFAULT '{}', -- 鉴权等附加请求头
  interval_sec INTEGER NOT NULL DEFAULT 5, -- 拉取周期，最小 3
  enabled      INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'unknown',  -- unknown | ok | error
  last_error   TEXT,
  last_ok_at   INTEGER,                    -- epoch 秒
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS source_lotteries(
  source_id    INTEGER NOT NULL,
  lottery_code TEXT NOT NULL,              -- 统一编码：6001
  remote_code  TEXT NOT NULL,              -- 远端编码：trxbhffc
  name         TEXT NOT NULL,              -- 哈希分分彩
  cat          TEXT NOT NULL,              -- 所属工作台：hash | 1105 | animals
  PRIMARY KEY(source_id, lottery_code)
);
CREATE TABLE IF NOT EXISTS draws(
  source_id    INTEGER NOT NULL,
  lottery_code TEXT NOT NULL,
  expect       TEXT NOT NULL,
  opennumber   TEXT NOT NULL,
  open_time    TEXT NOT NULL,             -- 'YYYY-MM-DD HH:MM:SS'，排序依据
  fetched_at   INTEGER NOT NULL,
  PRIMARY KEY(source_id, lottery_code, expect)
);
```

- 删除数据源时级联删除其 `source_lotteries` 与 `draws`（在同一事务内手工删除）。
- 每个「源 × 彩种」保留最近 2000 期。**排序一律按 `open_time DESC, expect DESC`**：三分彩期号为「日期 + 不补零序号」（如 `20261004441`），按期号字符串或数值排序在序号位数变化、跨天时都会错，而 `open_time` 为定长 `YYYY-MM-DD HH:MM:SS`，字典序即时间序。
- **初始数据**（`init_db` 时若 `data_sources` 为空则写入，幂等）：

| key | name | adapter | base_url | 彩种映射（统一→远端，cat） |
|---|---|---|---|---|
| qkltj | 区块链统计 | qkltj | `https://api.qkltj.com/api/draw-result` | 6001→6001 哈希分分彩 hash；6002→6002 哈希三分彩 hash；5001→5001 波场分分11选5 1105；5002→5002 波场三分11选5 1105 |
| qqtj | 全球统计 | qqtj | `https://qqtj666.com/api/trial/draw-result` | 6001→trxbhffc 哈希分分彩 hash；6002→trxbh3fc 哈希三分彩 hash |

## 组件

### `app/adapters.py` —— 返回格式适配

- `Draw = dataclass(expect: str, opennumber: str, open_time: str)`（`open_time` 必需，用于排序）
- `class ParseError(Exception)`
- `ADAPTERS = {"qkltj": parse_qkltj, "qqtj": parse_qqtj}`
  - `parse_qkltj(obj)`：取 `data[i].expect / opennumber / openTime`。
  - `parse_qqtj(obj)`：取 `data[i].issue / drawResult / drawTime`。
- 共同校验：`obj` 为 dict、`code == 0`、`data` 为 list、每项必需字段存在且为非空字符串；否则抛 `ParseError`，信息包含缺失字段名或远端 `msg`（例：`缺少字段 opennumber`、`远端返回 code=1: 参数错误`）。

### `app/collector.py` —— 采集调度

- `class Collector(conn, client)`：
  - `start()`：为每个 `enabled=1` 的源 `asyncio.create_task(self._run(source_id))`，存入 `self._tasks`。
  - `stop()`：取消全部任务并等待结束。
  - `reload(source_id)`：取消该源旧任务；若源仍存在且启用则按新配置重建；若停用则写 `status` 不变、仅停止任务。
  - `async tick(source) -> None`（可单独测试）：对该源每个彩种映射依次 `GET base_url?code={remote_code}&rows=10`，带 `headers_json`，超时 8 秒；按 `adapter` 解析；`INSERT OR IGNORE` 入库并裁剪。任一彩种失败不中断其余彩种。本轮结束后写回状态：
    - 全部成功：`status='ok'`、`last_error=NULL`、`last_ok_at=now`
    - 任一失败：`status='error'`、`last_error='{remote_code}: {原因}'`（多个用 `; ` 连接，截断到 500 字符）
  - `_run(source_id)`：循环 `tick` → `sleep(delay)`；`delay = interval_sec` 成功时；连续失败 n 次时 `min(interval_sec * 2**n, 60)`。循环体整体 try/except（`CancelledError` 除外），异常记入该源状态后继续，永不向外抛。
- 失败原因归类：`超时 8s`、`HTTP {status}`（含 429）、`非 JSON 响应`、`ParseError` 文本、`网络错误: {e}`。
- 生命周期：`main.py` 的 FastAPI `lifespan` 中 `collector.start()` / `collector.stop()`；`create_app(..., collector=None)` 允许测试注入或关闭采集（测试默认不启动后台任务，直接调 `tick`）。
- 采集用独立的 `httpx.AsyncClient`（不复用转发上游的 client，避免 base_url / 超时配置相互影响）。

### `app/routes/ds.py` —— 客户端接口

挂载在 `/api/ds`，在 `main.py` 中于 catch-all 代理之前 `include_router`。每个接口先 `gate.authorize(conn, token)`，失败返回与代理一致的 `{code: 10020|10022, msg}`。

- `GET /api/ds/sources?cat=hash`
  ```json
  {"code":0,"msg":"成功","data":[
    {"source":"qkltj","sourceName":"区块链统计","code":"6001","name":"哈希分分彩","status":"ok"},
    {"source":"qqtj","sourceName":"全球统计","code":"6001","name":"哈希分分彩","status":"error"}
  ]}
  ```
  仅返回 `enabled=1` 的源；按源 `id`、再按 `lottery_code` 排序。
- `GET /api/ds/{source}/draw-result?code=6001&rows=N`
  - 返回与区块链统计**同构**：`{"code":0,"msg":"成功","data":[{"expect","opennumber","openTime","lottoId","lottoTypeCn"}]}`，按 `open_time` 倒序，`rows` 默认 1、上限 300。
  - 源不存在 / 已停用 / 彩种未映射 / `rows` 非法 → `{"code":1,"msg":"..."}`（HTTP 200）。暂无数据 → `{"code":0,"data":[]}`。

### `app/routes/admin.py` 扩展 —— 数据源管理接口

鉴权沿用 `cookie_or_key_ok`。
- `GET /admin/data-sources`：全部源 + 各自彩种映射 + 状态字段。
- `POST /admin/data-sources`：新增（含映射数组）。校验：`key` 匹配 `^[a-z0-9_-]{1,32}$` 且唯一、`adapter ∈ ADAPTERS`、`base_url` 以 `http(s)://` 开头、`headers_json` 可解析为字符串字典、`interval_sec ≥ 3`、映射非空且 `lottery_code` 不重复。
- `PUT /admin/data-sources/{id}`：整体更新（映射整体替换）。
- `PATCH /admin/data-sources/{id}/enabled`：`{"enabled": true|false}`。
- `DELETE /admin/data-sources/{id}`：删除源及其映射、开奖数据。
- `GET /admin/data-sources/{id}/draws?code=6001&rows=20`：最新开奖。
- 所有写操作成功后调用 `collector.reload(id)`。校验失败返回 400 `{"ok":false,"error":"..."}`。

### 管理后台 `admin-ui`（Ant Design Pro）

- 新增菜单「数据源」页 `pages/DataSources.tsx`：
  - ProTable 列：名称、key、接口地址、周期、启用开关（直接调 PATCH）、状态 Tag（正常绿 / 异常红 / 停用灰 / 未知默认；异常时 Tooltip 显示 `last_error`）、最后成功时间、操作（编辑 / 最新开奖 / 删除）。每 10 秒自动刷新。
  - 新增 / 编辑弹窗：基本信息、适配器 Select、请求头 JSON 文本框、彩种映射可编辑子表（统一编码、远端编码、名称、所属工作台 Select）。
  - 「最新开奖」抽屉：按彩种 Tab 显示最近 20 期。
- `api.ts` 增加对应函数；构建产物照旧提交到 `app/static/admin-dist`。

### 客户端补丁（`client/js`）

对三个工作台 chunk（哈希 `chunk-b7e0f68a`、11选5 `chunk-50732e0a`、运动会 `chunk-60235acf`）做同样修改：

1. **合并下拉列表**：`created()` 中读完 localStorage 后，请求 `apiURL + "/ds/sources?cat=" + catId`；把结果转为
   `{value: code, label: name + " · " + sourceName, requestUrl: apiURL + "/ds/" + source + "/draw-result", server: true, status}`，放在用户自定义项之前。请求失败时仅用本地项（不报错）。若当前未选中任何源，默认选第一项并立即 `showOpenNum()`。每 60 秒重新拉取以更新状态（`destroyed` 时清除）。`topRows` 不改。
2. **切换判断**：`switchCode` 由比较 `value` 改为比较 `value + requestUrl`；切换时先把 `this.num` 置空再 `showOpenNum()`，避免两源同期号被判为「无需刷新」。
3. **状态展示**：下拉项文字前加圆点（`status==='ok'` 绿，`'error'` 红，其他灰）；用户自定义项不显示圆点。
4. **持久化与删除**：写 `codeOptions(A)` 前过滤 `server: true` 项；`server: true` 项不显示删除按钮（`delEditCode` 对其直接返回）。

补丁后重新打包 mac / win 客户端发版。老版本客户端行为不变。

## 已知限制

- 全球统计 trial 接口最多 10 行且无历史翻页，历史需从开始采集起累积：分分彩攒满 300 期约 5 小时，三分彩约 15 小时。期间遗漏 / 走势页按已有期数显示。
- 端到端延迟 ≤ 服务端周期（5s）+ 客户端轮询（7s），约 12 秒。
- 重新部署 API 会短暂中断采集；恢复后每轮 10 行可补齐中断期间的期号（中断 < 10 期时）。
- 全球统计限频 90（按每分钟估算）：默认 2 彩种 × 每 5 秒 = 24 次/分钟。

## 测试策略（pytest，沿用 `backend/tests` 风格）

- `test_adapters.py`：两站真实返回各一份 fixture 正常解析；缺字段、`code≠0`、`data` 非列表抛 `ParseError`；**把全球统计返回交给 `parse_qkltj` 必须抛 `ParseError`**（本次 bug 的回归用例）。
- `test_db_datasources.py`：种子数据幂等；两源同 `expect` 各自入库互不覆盖；重复期号忽略；裁剪保留 2000 期；删除源级联。
- `test_collector.py`（`httpx.MockTransport`）：A 源超时、B 源正常 → B 入库且 `status=ok`，A `status=error` 且 `last_error` 含 `超时`；HTTP 429 记录；部分彩种失败不阻断其余彩种；退避时长计算；`reload` 后按新配置运行、停用后任务停止。
- `test_ds_routes.py`：`/api/ds/sources` 过滤停用源与 `cat`；`draw-result` 同构字段、按开奖时间倒序（含三分彩期号位数变化的用例）、`rows` 上限；未知 / 停用源返回 `code=1`；无 token / 过期用户被拦截；路由优先于 catch-all 代理（不转发上游）。
- `test_admin_datasources.py`：CRUD、启停、各项校验 400、无权限 403、写操作触发 `reload`。
- 客户端补丁：打包后在 App 中手工验证——两源切换号码随之变化、断开全球统计（改错地址）后其状态变红而区块链统计照常刷新、用户自定义源仍可增删。
