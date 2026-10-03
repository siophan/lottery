# 设计：ys 中间层后端（自有用户体系 + 共享 data-ys 账号转发）

日期：2026-10-04
状态：已通过设计评审，待 spec 复核

## 背景

`ys-mac` 客户端目前直接用**每个使用者各自的 data-ys 账号**登录 `soft-api.data-ys.com` 并调用全部业务接口（约 80 个，横跨数字彩/足球/篮球/专家/AI）。其中分析/专家/AI 类是 data-ys 自家产物，没有等价公开源，"自建后端全量替代"不可行。

因此改用**中间层**思路：客户端功能**全部保留**，仍然走真实 data-ys；但在客户端与 data-ys 之间插一个我们自己的服务器，提供**我们自己的一套用户体系**，而所有需要 data-ys 的请求统一复用**服务器持有的一个 data-ys 账号**的 token。这样：

- 发给少数人使用时，他们用**我们系统的账号**登录，不需要各自的 data-ys 账号。
- 只有服务器持有 data-ys 会话，终端用户不直接登录 data-ys，**避免了单账号多端互相"踢下线"**。
- 不重写任何 data-ys 业务逻辑——全部透明透传，零维护。

## 决策（brainstorming 已拍板）

1. **形态**：中间层后端，部署在服务器 `lottery.jh8.ai`，客户端 `apiURL` 指向它。
2. **技术栈**：Python FastAPI，复用并扩展现有 `backend/`（已有干净的透明代理 + 测试）。
3. **用户体系**：带管理（注册/增删/到期），存数据库。
4. **data-ys 账号**：服务器持有**一个**账号，服务端登录拿 token，所有上游请求共用。
5. **分发**：客户端仅改 `apiURL` 一处。

## 目标与范围

- **本设计**：一个 FastAPI 中间层，提供
  - 我们自己的登录/鉴权（拦截 `/api/auth/login`，校验本地用户库，签发我方 token）；
  - data-ys 单账号会话管理（服务端登录、token 缓存、失效自动重登）；
  - 透明转发：校验我方 token → 换成 data-ys token → 打上游 → 原样返回；
  - 用户管理（增/删/改到期/列表）：管理 HTTP API + 极简 CLI。
- **非目标**：
  - 不重写任何 data-ys 业务接口（纯透传）；
  - 不做管理网页前端（只做 API + CLI）；
  - 不解决 data-ys 对单账号的限流/风控（不可控，仅记录风险）；
  - 不改客户端业务代码（仅改 `apiURL` 一处）；
  - 不改数字彩算号（与本设计无关）。

## 架构

```
各使用者客户端
   │  用【我们系统的账号密码】登录；后续请求带【我方 token】
   ▼
FastAPI 中间层  (lottery.jh8.ai，HTTPS)
   │  1) 校验我方 token（会话有效 + 用户未停用/未到期）
   │  2) 把请求头 token 换成【服务器持有的 data-ys token】
   │  3) 打上游（失效则自动重登并重试一次）
   ▼
soft-api.data-ys.com   ──原样返回──▶ 客户端
```

单账号 data-ys 会话由服务器集中持有与刷新；我方用户的到期/停用在 token 校验层强制。

## 目录结构

```
backend/
  app/
    config.py          # 扩展：data-ys 账号凭据、ADMIN_KEY、DB 路径、会话 TTL、fromId
    main.py            # 改：转发前加「鉴权 + 换 token」，挂载 auth/admin 路由
    upstream.py        # 复用（header 过滤、mask_token、forward）；新增 inject-token 辅助
    db.py              # 新增：SQLite 连接、建表、users / sessions 访问
    security.py        # 新增：pbkdf2 加盐哈希、校验、随机 token 生成
    dayys_session.py   # 新增：data-ys 单账号登录、token 缓存、失效重登（带并发锁）
    routes/
      __init__.py      # 现有 local_router
      auth.py          # 新增：POST /api/auth/login（本地校验 + 签发我方 token）
      admin.py         # 新增：/admin/*（用户管理，ADMIN_KEY 保护，不经代理）
  manage.py            # 新增：极简 CLI（加人/删人/改到期/列表），直接操作 DB
  requirements.txt     # 复用（httpx + fastapi 已够；哈希用标准库）
  tests/               # 复用 + 新增（见测试策略）
```

## 组件职责与接口

### app/db.py —— SQLite 存储

两张表（SQLite 单文件，路径由 `DB_PATH` 配置，默认 `backend/data/app.db`）：

```
users(
  id            INTEGER PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,   -- 登录标识（= 客户端"软件编号"框输入的值）
  password_hash TEXT NOT NULL,          -- pbkdf2 hex
  salt          TEXT NOT NULL,          -- hex
  expires_at    INTEGER,                -- epoch 秒；NULL = 永久
  status        TEXT NOT NULL DEFAULT 'active',  -- active | disabled
  created_at    INTEGER NOT NULL
)

sessions(
  token      TEXT PRIMARY KEY,          -- 我方不透明随机 token
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL           -- epoch 秒；会话 TTL（SESSION_TTL，默认 7 天）
)
```

导出（同步函数，SQLite 够用；FastAPI 里用 `run_in_threadpool` 包裹或直接短查询）：
- `init_db(path)` —— 建表（幂等）。
- `get_user_by_code(code) -> User | None`
- `create_user(code, password, expires_at) -> User`（内部调用 security 哈希）
- `delete_user(code) -> bool`
- `update_user(code, *, expires_at=..., status=..., password=...) -> bool`
- `list_users() -> list[User]`
- `create_session(user_id, ttl) -> token:str`
- `get_session(token) -> Session | None`
- `delete_session(token) -> None`（吊销/登出）
- `purge_expired_sessions() -> int`

### app/security.py —— 密码与 token

- `hash_password(password, salt=None) -> (hash_hex, salt_hex)`：`hashlib.pbkdf2_hmac("sha256", pw, salt, 200_000)`，salt 为 16 字节随机。
- `verify_password(password, salt_hex, hash_hex) -> bool`：重算并 `hmac.compare_digest` 恒定时间比较。
- `new_token() -> str`：`secrets.token_urlsafe(32)`。

### app/dayys_session.py —— data-ys 单账号会话

持有唯一 data-ys 账号（凭据来自配置，见 config），对外提供上游 token。

- 构造输入：`code`、`password`、`from_id`、上游 `client`（httpx.AsyncClient，复用 app.state.client）。
- `async get_token() -> str`：返回缓存 token；无缓存时触发 `login()`。用 `asyncio.Lock` 防并发重登风暴。
- `async login() -> str`：向上游 `POST /auth/login` 提交账号凭据，解析响应中的 token 字段并缓存。
- `invalidate()`：清掉缓存 token（下次请求会重登）。
- 失效判定：转发层发现上游响应表示 token 失效（HTTP 401，或 data-ys 业务码表示未登录/被踢）时，调用 `invalidate()` 并重试一次。

> 实现前置任务（见实现计划）：抓一次真实的 `POST /api/auth/login` 请求体与响应体，锁定
> ①登录请求字段名（软件编号/密码/fromId 的确切 key）②响应里 token 字段路径
> ③"token 失效/被踢"对应的 HTTP 状态或业务码。设计不臆测这些字面值。

### app/routes/auth.py —— 我方登录（拦截）

挂在 `local_router`（前缀 `/api`），因 FastAPI 显式路由优先于 catch-all，故会**拦截** `/api/auth/login`，不再转发上游。

- `POST /api/auth/login`：
  - 解析客户端登录请求体（字段同 data-ys 登录所用：软件编号 + 密码；确切 key 由前置任务锁定）。
  - `get_user_by_code` → `verify_password`。失败 / 用户 `disabled` / `expires_at` 已过 → 返回 **与 data-ys 登录失败同构**的错误响应（让客户端照常提示），HTTP 200 + 业务失败码或对应状态（由前置任务确定其登录失败响应形态）。
  - 成功 → `create_session` 得我方 token → 返回**与 data-ys 登录成功同构**的响应（至少含 token 字段；其它用户字段用占位/合理默认或从共享 data-ys 账号透传一次）。客户端会把该 token 存入 localStorage 并在后续请求头携带。

### app/main.py —— 转发层（鉴权 + 换 token）

改造现有 catch-all `/api/{path}`：

1. **预鉴权白名单**（无需我方 token 即可访问）：`auth/login`、`version`。命中则：`version` 直接透传上游（不鉴权、不换 token——该接口上游无需登录，启动时即被调用）；`auth/login` 已被 auth.py 拦截。
2. 其余路径：
   - 取客户端 `token` 头 → `get_session` → 有效？会话未过期？对应用户 `active` 且未到期？任一不满足 → 返回 **401 + data-ys 风格错误体**（客户端据此登出）。
   - 用 `dayys_session.get_token()` **替换**请求头里的 `token`（移除客户端我方 token，注入 data-ys token）。保留 `fromId` 等其它头。
   - `forward()` 打上游。
   - 若响应表示 data-ys token 失效 → `dayys_session.invalidate()` → 重登 → **重试一次**；仍失败则把上游响应原样返回。
   - 日志：沿用现有一行式（方法/路径/状态/耗时），token 一律 `mask_token`（既不暴露我方 token 也不暴露 data-ys token）。

### app/routes/admin.py —— 用户管理 API

挂在 `/admin`（**不**在 `/api` 下，故不被代理，也不被客户端触达）。每个请求需头 `X-Admin-Key: <ADMIN_KEY>`，否则 403。

- `POST /admin/users` body `{code, password, expires_at?}` → 建用户。
- `GET /admin/users` → 列表（不返回哈希）。
- `PATCH /admin/users/{code}` body `{expires_at?, status?, password?}` → 改到期/停用/改密。
- `DELETE /admin/users/{code}` → 删用户（连带删其会话）。

### manage.py —— 极简 CLI

直接操作 DB（不走 HTTP），供服务器本机维护：

```
python manage.py add <code> <password> [--expires YYYY-MM-DD]
python manage.py del <code>
python manage.py set-expiry <code> <YYYY-MM-DD|never>
python manage.py disable|enable <code>
python manage.py list
```

### 客户端改动

- `client/js/app.9ba1133b.js` 的 `apiURL`：`http://127.0.0.1:8000/api` → `https://lottery.jh8.ai/api`（编译进 bundle 的常量，改这一处）。
- 结果：客户端渲染进程直接访问 `lottery.jh8.ai`（`webSecurity:false` 允许跨源）。Electron 内嵌的本地 8000 代理（`boot-original.js` 启的）对数据请求不再需要——保留无害，清理为可选、不在本设计范围。

## 数据流

1. 启动（客户端）：加载前端 → `GET /api/version`（白名单，不鉴权）。
2. 登录：客户端 `POST /api/auth/login`（软件编号+密码）→ **中间层 auth.py** 校验本地用户库 → 签发我方 token → 返回。客户端存 token。
3. 业务请求：客户端带我方 token → 中间层校验会话/到期 → 换成 data-ys token → 打上游 → 原样返回。
4. data-ys token 失效/被踢：中间层自动重登上游并重试一次，客户端无感。
5. 我方用户到期/被停用：中间层返回 401 → 客户端登出。

## data-ys 登录与 token 生命周期

- 服务器启动后**懒加载**：首个需要上游的请求触发 data-ys 登录（或可选的启动时预热）。
- token 缓存于内存（单实例）；失效判定见 dayys_session。并发请求共享同一 token，重登由锁串行化。
- 单实例部署即可（少数人规模）；多实例会各持一份 data-ys 会话，可能触发单账号限制，故**本设计限定单实例**。

## 错误处理与可观测性

- 上游超时/不可达：沿用现有 502 结构化 JSON（`{error, detail}`）。
- 我方鉴权失败：401 + data-ys 风格错误体，客户端优雅登出。
- data-ys 登录失败（服务器账号本身失效/欠费）：中间层返回 502 + 明确原因（`dayys_login_failed`），并记日志告警；不把服务器账号密码写进响应或日志。
- 日志：请求一行式；所有 token（我方 + data-ys + 服务器账号）一律打码。
- 管理操作：记审计行（谁通过 admin 改了谁，不含密码明文）。

## 安全

- **传输**：`lottery.jh8.ai` 必须 HTTPS（反向代理 nginx/Caddy 终止 TLS → 本机 uvicorn）。账号密码仅在 TLS 下传输。
- **密码存储**：pbkdf2-sha256 + 每用户随机盐，恒定时间比较。
- **我方 token**：随机不透明、DB 存储、可吊销（删会话即踢人）；带 TTL。
- **data-ys 账号凭据**：仅存服务器环境变量（`DATA_YS_CODE`/`DATA_YS_PASSWORD`），绝不写进代码、仓库、响应或日志。
- **管理面**：`/admin/*` 用 `ADMIN_KEY` 保护且不经代理暴露；CLI 仅本机。
- **风险记录**：单个 data-ys 账号被多人高频共享，可能触发 data-ys 限流/风控/封号——不可控，使用者自担。

## 配置（app/config.py 扩展）

| 环境变量 | 含义 | 默认 |
|---|---|---|
| `UPSTREAM` | data-ys 上游 | `https://soft-api.data-ys.com/api` |
| `DATA_YS_CODE` | 服务器持有的 data-ys 账号 | （必填，无默认） |
| `DATA_YS_PASSWORD` | 该账号密码 | （必填，无默认） |
| `DATA_YS_FROM_ID` | 客户端 `fromId` 常量（登录/请求需要） | （由前置任务确认） |
| `ADMIN_KEY` | 管理 API 密钥 | （必填，无默认） |
| `DB_PATH` | SQLite 路径 | `backend/data/app.db` |
| `SESSION_TTL` | 我方会话有效期（秒） | `604800`（7 天） |
| `PORT` / `UPSTREAM_TIMEOUT` / `UPSTREAM_VERIFY_TLS` | 沿用现有 | 8000 / 15 / true |

## 测试策略

- **复用**：现有 `tests/`（转发、header 过滤、错误日志、配置）继续作回归。
- **security**：哈希/校验正确、错密码拒绝、恒定时间比较。
- **db**：建表幂等、用户 CRUD、会话创建/查询/删除、到期用户与过期会话判定。
- **auth.py**：登录成功签发 token；错密码/停用/到期用户返回失败；返回体结构符合客户端期望（用锁定的真实形态断言）。
- **dayys_session**：mock 上游登录 → token 缓存命中；`invalidate` 后重登；并发请求只重登一次（锁）；上游 401 触发重登 + 重试一次。
- **转发换 token**：客户端带我方 token → 断言**上游实际收到的是 data-ys token 而非客户端 token**；白名单路径（version）不鉴权、不换 token；无/错我方 token → 401。
- **admin**：增删改查 + 到期设置；无/错 `ADMIN_KEY` → 403。
- **约束**：所有测试用 mock 上游（httpx transport 注入），**绝不调用真实 data-ys**。

## 部署（lottery.jh8.ai）

- 反向代理（nginx 或 Caddy）终止 HTTPS → 转发到本机 `uvicorn app.main:app`（单实例）。
- 环境变量注入上表配置（尤其 `DATA_YS_CODE/PASSWORD`、`ADMIN_KEY`）。
- SQLite 文件持久化在服务器磁盘（`DB_PATH`）。
- 客户端 `apiURL` → `https://lottery.jh8.ai/api` 后重新打包分发。

## 后续工作项（非本设计）

- 清理 Electron 内嵌的本地 8000 代理（改远程后冗余）。
- 如需多实例/高可用：引入共享 token 存储与分布式锁（当前限定单实例）。
- 如 data-ys 限流明显：加本地缓存层（缓存可缓存的开奖类响应）。
- 管理网页前端（当前只有 API + CLI）。
