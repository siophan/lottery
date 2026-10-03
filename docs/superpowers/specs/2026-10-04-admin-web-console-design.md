# 网页管理后台（独立管理员账号）设计

**日期**：2026-10-04
**状态**：已批准设计，待写实现计划

## 目标

在既有的中间层后端（FastAPI + SQLite，见 `2026-10-04-backend-middleware-auth-proxy-design.md`）上，增加一个**网页管理后台**：管理员用**独立账号**登录（HttpOnly Cookie 会话），在网页里对终端用户做增删改查。既有的 `X-Admin-Key` 管理 API **保留**；管理端点的鉴权改为"接受 **有效管理员 cookie** 或 **有效 X-Admin-Key**"两者之一。

## 范围与非目标

**范围内**
- 单管理员账号，经命令行引导创建/重置密码。
- 管理员登录/登出，基于 HttpOnly Cookie 的会话。
- 单页静态 HTML + 原生 JS 的后台页面。
- 终端用户的全套操作：列表查看、新增、改到期、停用/启用、重置密码、删除。

**非目标（YAGNI，日后可独立增加）**
- 多管理员、角色/权限分级。
- 登录限流/锁定、验证码。
- 审计日志、操作历史。
- 后台中展示 data-ys 共享账号 token 健康状态。
- 搜索/分页（用户量小，现有 `list_users` 全量返回即可）。

## 架构总览

全部并入既有 FastAPI 应用（`backend/app`），不新增服务进程，不引入前端框架或构建步骤。页面与管理端点都挂在 `/admin` 前缀下，与 catch-all 代理 `/api/{path:path}` 不冲突（不同前缀）。

```
浏览器 ──(HTTPS, HttpOnly cookie)──▶ FastAPI /admin/*
                                      ├─ GET  /admin/            → admin.html（静态单文件）
                                      ├─ POST /admin/login       → 校验→建 admin_session→下发 cookie
                                      ├─ POST /admin/logout      → 删会话 + 清 cookie
                                      ├─ GET  /admin/me          → 当前管理员或 401
                                      └─ /admin/users (GET/POST/PATCH/DELETE)
                                            鉴权：管理员 cookie 或 X-Admin-Key
curl/脚本 ──(X-Admin-Key 头)──────────▶ /admin/users（同端点，另一条鉴权路径）
```

## 组件与接口

### 1. 数据库（`backend/app/db.py` 扩展）

新增两张表（`init_db` 中 `CREATE TABLE IF NOT EXISTS`）：

```sql
CREATE TABLE IF NOT EXISTS admins(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions(
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
```

新增 DB 函数（与现有 users/sessions 的风格一致，全部参数化查询）：
- `Admin` dataclass：`id, username, password_hash, salt, created_at`。
- `get_admin_by_username(conn, username) -> Admin | None`
- `upsert_admin(conn, username, password_hash, salt) -> Admin`：存在则更新哈希，不存在则插入（支撑幂等的 `admin-set`）。
- `create_admin_session(conn, token, admin_id, created_at, expires_at)`
- `get_admin_session(conn, token) -> AdminSession | None`
- `delete_admin_session(conn, token) -> bool`
- `purge_expired_admin_sessions(conn, now)`（与现有 `purge_expired_sessions` 对称）

### 2. 配置（`backend/app/config.py` 扩展 Settings）

新增字段（均可被环境变量覆盖，无秘密硬编码）：
- `admin_session_ttl: int`（默认 `86400`，秒）
- `admin_cookie_secure: bool`（默认 `True`；本地 http 调试用 `ADMIN_COOKIE_SECURE=false` 关闭，否则浏览器不会存 Secure cookie）
- `admin_cookie_name: str`（默认 `"admin_session"`）

### 3. 管理员鉴权模块（`backend/app/admin_auth.py`，新文件）

- `authenticate(conn, username, password) -> Admin | None`：取 admin、`verify_password`（`hmac.compare_digest`）。
- `issue_session(conn, settings, admin) -> (token, expires_at)`：`security.new_token()` + 写 `admin_sessions`。
- `current_admin(conn, settings, cookie_token) -> Admin | None`：校验 cookie 对应的未过期会话。
- `cookie_or_key_ok(request) -> bool`：有效管理员 cookie **或** 头 `X-Admin-Key == settings.admin_key`（非空）；供 `/admin/users` 端点复用。

### 4. 路由（`backend/app/routes/admin.py` 扩展）

- `GET /admin/`：`FileResponse` 返回 `backend/app/static/admin.html`。
- `POST /admin/login` `{username, password}`：成功 → `issue_session` → `response.set_cookie(name, token, httponly=True, secure=settings.admin_cookie_secure, samesite="lax", max_age=ttl)` → `{ok: true}`；失败 → `401 {ok: false}`（笼统，不区分用户名/密码）。
- `POST /admin/logout`：删会话行 + `delete_cookie` → `{ok: true}`。
- `GET /admin/me`：有有效 cookie 会话 → `{username}`；否则 `401`。
- `/admin/users`（GET/POST/PATCH/DELETE，已存在）：把现有 `_check`（仅 `X-Admin-Key`）替换为 `admin_auth.cookie_or_key_ok(request)`。端点的请求/响应形状与行为**保持不变**（重置密码、改到期、停用/启用仍走已有 PATCH 的 `password`/`expires_at`/`status` 字段）。

### 5. 页面（`backend/app/static/admin.html`，新文件，自包含）

单个 HTML 文件，内联 CSS 与 vanilla JS，无外部依赖、无构建：
- 加载时 `GET /admin/me`：401 显示登录表单；200 显示用户管理界面。
- 登录表单 → `POST /admin/login`（`credentials:"same-origin"`）→ 成功后刷新到用户界面。
- 用户界面：表格列出用户（code / status / expires_at / created_at）；按钮/表单完成"新增、改到期、停用启用、重置密码、删除（二次确认）"，均 `fetch` 调 `/admin/users*` 并带 cookie。
- 顶部有登出按钮 → `POST /admin/logout`。
- 所有写操作用 JSON body（`Content-Type: application/json`），配合 `SameSite=Lax` cookie，阻断跨站伪造请求。

### 6. 引导 CLI（`backend/manage.py` 扩展）

新增子命令 `admin-set <username> <password>`：`hash_password` 后 `upsert_admin`，打印 `admin set: <username>`。幂等——重复执行即重置密码。凭据由运维在本机输入，不进仓库。

## 数据流：管理员改一个用户的到期时间

1. 管理员已登录（浏览器持 `admin_session` cookie）。
2. 页面 JS `PATCH /admin/users/USER01`，body `{"expires_at": 1830000000}`，`credentials:"same-origin"`。
3. 端点 `cookie_or_key_ok(request)`：读 cookie → `current_admin` 命中未过期会话 → 放行。
4. 走既有 `db.update_user(conn, "USER01", expires_at=...)` → `{ok: true}`。
5. 页面刷新列表。

## 错误处理

- 登录失败：统一 `401 {ok:false}`，不泄露用户名是否存在。
- 未登录访问 `/admin/me` 或 `/admin/users`（且无 X-Admin-Key）：`401`（`/me`）/ `403`（`users`，沿用现有语义）。
- cookie 会话过期：`current_admin` 返回 None，页面回到登录态。
- 删除用户：页面二次确认后才发 DELETE。

## 安全

- Cookie：HttpOnly（防 XSS 窃取）、`SameSite=Lax`（防跨站 POST 带 cookie）、Secure 可配（生产必开）。
- 会话 token 高熵（`secrets.token_urlsafe(32)`），服务端存储，登出即失效。
- 密码：pbkdf2 哈希 + 每账号 salt；校验用 `hmac.compare_digest`。
- 秘密（`ADMIN_KEY`、管理员密码）仅来自环境/运维输入，绝不入库入仓。
- 两套鉴权只是"或"的关系，不放宽任一条：无有效 cookie 且无正确 X-Admin-Key 一律拒绝；空 `admin_key` 不构成放行。

## 测试（pytest，全程 `httpx.MockTransport`，绝不访问真实 data-ys）

- `db`：admins/admin_sessions 的 CRUD；`upsert_admin` 幂等（二次调用更新哈希、不新增行）；过期会话清理。
- `admin-set` CLI：建管理员；重复执行重置密码（行数不变、哈希变）。
- 登录：正确凭据 → `set-cookie` 且 `/admin/me` 返回用户名；错误密码 → 401 且无 cookie；登出 → 会话行删除、`/admin/me` 再访问 401。
- `/admin/users` 鉴权矩阵：仅 cookie 可访问；仅 X-Admin-Key 可访问；两者皆无 → 403。
- 端到端：后台"重置密码"后，终端用户用新密码能过 `/api/auth/login`（串起既有登录路由）。
- `GET /admin/` → 200 且为 HTML。

## 部署

与既有中间层一致：nginx/Caddy 终止 HTTPS，反代到本机 uvicorn。后台地址 `https://lottery.jh8.ai/admin/`。生产保持 `ADMIN_COOKIE_SECURE=true`。仍为单实例（data-ys 会话与管理员会话均在进程/SQLite 内）。

## 文件清单

- 改：`backend/app/db.py`（两表 + 函数）、`backend/app/config.py`（三配置）、`backend/app/routes/admin.py`（鉴权替换 + 4 个新路由）、`backend/manage.py`（`admin-set`）、`backend/app/main.py`（如需静态目录/路由装配微调）。
- 建：`backend/app/admin_auth.py`、`backend/app/static/admin.html`。
- 测试：`backend/tests/test_admin_auth.py`、扩展 `test_admin.py`、`test_db.py`、`test_manage.py`。
