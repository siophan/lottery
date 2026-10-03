# 网页管理后台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给既有中间层后端加一个网页管理后台（独立管理员账号 + HttpOnly Cookie 会话，在单页 HTML 里对终端用户做增删改查；既有 `X-Admin-Key` API 保留，管理端点改为接受"管理员 cookie 或 X-Admin-Key"），并在根路径 `/` 加一个官网落地页，挂 Windows / Mac 安装包下载链接（后端静态托管，占位路径由运维后续放入实际安装包）。

**Architecture:** 全部并入既有 FastAPI 应用（`backend/app`），不新增进程、不引入前端框架或构建步骤。新增 `admins`/`admin_sessions` 两张 SQLite 表、一个 `admin_auth` 鉴权模块、`/admin` 前缀下的 login/logout/me/index 路由与一个自包含静态页面；`manage.py` 增 `admin-set` 引导命令；根路径 `/` 返回官网落地页，`/download/` 以 `StaticFiles` 托管安装包目录。

**Tech Stack:** Python 3.12、FastAPI、SQLite（stdlib sqlite3）、stdlib `hashlib`/`hmac`/`secrets`、pytest + `httpx.MockTransport`；页面为单文件 HTML + 原生 JS（无依赖）。

## Global Constraints

- 运行测试只用既有虚拟环境 `backend/.venv`（Python 3.12）：`cd backend && .venv/bin/python -m pytest -q`。系统 `python3` 为 3.9，会在 `X | None` 注解处 import 失败。不要重建/修改 venv（已存在、依赖已装）。
- 所有测试必须用 `httpx.MockTransport` 模拟上游，**绝不**访问真实 data-ys 主机。
- 秘密（`ADMIN_KEY`、管理员密码）只来自环境变量或运维命令行输入，绝不硬编码进代码或仓库。管理员密码只存 pbkdf2 哈希 + salt。
- 管理端点鉴权是"或"关系：**有效管理员 cookie 会话** 或 **头 `X-Admin-Key == settings.admin_key`（且 key 非空）**；两者都无一律拒绝；空 `admin_key` 不构成放行。
- Cookie 属性固定：`HttpOnly`、`SameSite=Lax`、`Secure=settings.admin_cookie_secure`、`Max-Age=settings.admin_session_ttl`。
- 既有 `/admin/users`（GET/POST/PATCH/DELETE）的请求/响应形状与行为保持不变，只换鉴权来源。
- 密码校验走既有 `security.verify_password`（内部 `hmac.compare_digest`）；会话 token 用既有 `security.new_token()`（`secrets.token_urlsafe(32)`）。
- 每个 commit message 结尾必须是（trailer 前空一行）：
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 本工作在分支 `feat/admin-web-console`（基于已合并的 main）上进行；复用当前 worktree，`backend/.venv` 已在位。

### 既有接口（本计划会用到，勿重复定义）

- `security.hash_password(password) -> (hash_hex, salt_hex)`；`security.verify_password(password, salt_hex, hash_hex) -> bool`（注意参数顺序：salt 在前、hash 在后）；`security.new_token() -> str`。
- `db.connect(path) -> sqlite3.Connection`（Row 工厂）；`db.init_db(conn)`；`db.create_user/list_users/update_user/delete_user/get_user_by_code`。
- `config.Settings`（dataclass）与 `config.load_settings(env)`。
- `main.create_app(settings=None, client=None, conn=None, dayys=None)`：已把 `admin_routes.router` 以 `prefix="/admin"` 挂载；`app.state.settings` / `app.state.db_conn` 已就绪。
- `routes/admin.py` 现有 `_check(request)`、`_forbidden()` 及 4 个 `/users` 端点。

---

### Task 1: Settings 增加管理后台配置

**Files:**
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Consumes: 无新增。
- Produces: `Settings.admin_session_ttl: int`（默认 86400）、`Settings.admin_cookie_secure: bool`（默认 True）、`Settings.admin_cookie_name: str`（默认 `"admin_session"`）；`load_settings` 分别读 `ADMIN_SESSION_TTL` / `ADMIN_COOKIE_SECURE` / `ADMIN_COOKIE_NAME`。

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_config.py` 末尾追加：

```python
def test_admin_console_settings_defaults():
    from app.config import load_settings
    s = load_settings({})
    assert s.admin_session_ttl == 86400
    assert s.admin_cookie_secure is True
    assert s.admin_cookie_name == "admin_session"

def test_admin_console_settings_from_env():
    from app.config import load_settings
    s = load_settings({"ADMIN_SESSION_TTL": "60",
                       "ADMIN_COOKIE_SECURE": "false",
                       "ADMIN_COOKIE_NAME": "ac"})
    assert s.admin_session_ttl == 60
    assert s.admin_cookie_secure is False
    assert s.admin_cookie_name == "ac"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_config.py -v`
Expected: FAIL（`Settings` 无 `admin_session_ttl` 等属性）。

- [ ] **Step 3: 实现**

在 `backend/app/config.py` 的 `Settings` dataclass 字段末尾加三个字段：

```python
    admin_session_ttl: int = 86400     # 管理员会话 1 天
    admin_cookie_secure: bool = True   # 生产必开；本地 http 调试置 false
    admin_cookie_name: str = "admin_session"
```

在 `load_settings` 的 `return Settings(` 调用里，`dayys_token_ttl=...` 之后补：

```python
        admin_session_ttl=int(env.get("ADMIN_SESSION_TTL", 86400)),
        admin_cookie_secure=flag(env.get("ADMIN_COOKIE_SECURE", "true")),
        admin_cookie_name=env.get("ADMIN_COOKIE_NAME", "admin_session"),
```

（`flag()` 已在文件内定义：空串/false/0/no → False，其余 True。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_config.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/config.py backend/tests/test_config.py
git commit -m "feat(backend): add admin-console settings (session ttl, cookie secure/name)"
```

---

### Task 2: admins / admin_sessions 表与 DB 函数

**Files:**
- Modify: `backend/app/db.py`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Consumes: `security.hash_password`（db.py 顶部已 `from .security import hash_password, new_token`）。
- Produces:
  - `@dataclass Admin(id:int, username:str, password_hash:str, salt:str, created_at:int)`
  - `@dataclass AdminSession(token:str, admin_id:int, created_at:int, expires_at:int)`
  - `get_admin_by_username(conn, username) -> Admin | None`
  - `get_admin_by_id(conn, admin_id) -> Admin | None`
  - `upsert_admin(conn, username, password) -> Admin`（存在则更新哈希、复用 id/created_at；否则插入）
  - `create_admin_session(conn, token, admin_id, ttl) -> int`（返回 expires_at）
  - `get_admin_session(conn, token) -> AdminSession | None`
  - `delete_admin_session(conn, token) -> bool`
  - `purge_expired_admin_sessions(conn) -> int`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_db.py` 末尾追加：

```python
def test_admin_upsert_idempotent_and_lookup():
    from app import db
    conn = db.connect(":memory:"); db.init_db(conn)
    a1 = db.upsert_admin(conn, "root", "pw1")
    assert db.get_admin_by_username(conn, "root").id == a1.id
    assert db.get_admin_by_id(conn, a1.id).username == "root"
    old_hash = db.get_admin_by_username(conn, "root").password_hash
    a2 = db.upsert_admin(conn, "root", "pw2")
    assert a2.id == a1.id                      # 同一行
    assert db.get_admin_by_username(conn, "root").password_hash != old_hash
    assert len(conn.execute("SELECT 1 FROM admins").fetchall()) == 1

def test_admin_session_crud():
    from app import db
    conn = db.connect(":memory:"); db.init_db(conn)
    a = db.upsert_admin(conn, "root", "pw")
    exp = db.create_admin_session(conn, "TOK", a.id, 1000)
    s = db.get_admin_session(conn, "TOK")
    assert s.admin_id == a.id and s.expires_at == exp
    assert db.delete_admin_session(conn, "TOK") is True
    assert db.get_admin_session(conn, "TOK") is None
    assert db.delete_admin_session(conn, "TOK") is False

def test_purge_expired_admin_sessions():
    from app import db
    conn = db.connect(":memory:"); db.init_db(conn)
    a = db.upsert_admin(conn, "root", "pw")
    db.create_admin_session(conn, "OLD", a.id, -10)   # 立即过期
    db.create_admin_session(conn, "NEW", a.id, 1000)
    assert db.purge_expired_admin_sessions(conn) == 1
    assert db.get_admin_session(conn, "OLD") is None
    assert db.get_admin_session(conn, "NEW") is not None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_db.py -v`
Expected: FAIL（无 `upsert_admin` 等）。

- [ ] **Step 3: 实现**

在 `backend/app/db.py` 的 `Session` dataclass 之后、`connect` 之前，加两个 dataclass：

```python
@dataclass
class Admin:
    id: int
    username: str
    password_hash: str
    salt: str
    created_at: int

@dataclass
class AdminSession:
    token: str
    admin_id: int
    created_at: int
    expires_at: int
```

在 `init_db` 的 `executescript` 字符串里，`sessions` 表之后、结尾 `"""` 之前，追加两张表：

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

在文件末尾追加这些函数：

```python
def _row_to_admin(r: sqlite3.Row) -> Admin:
    return Admin(r["id"], r["username"], r["password_hash"], r["salt"], r["created_at"])

def get_admin_by_username(conn, username: str) -> Admin | None:
    r = conn.execute("SELECT * FROM admins WHERE username=?", (username,)).fetchone()
    return _row_to_admin(r) if r else None

def get_admin_by_id(conn, admin_id: int) -> Admin | None:
    r = conn.execute("SELECT * FROM admins WHERE id=?", (admin_id,)).fetchone()
    return _row_to_admin(r) if r else None

def upsert_admin(conn, username: str, password: str) -> Admin:
    h, salt = hash_password(password)
    existing = get_admin_by_username(conn, username)
    if existing:
        conn.execute("UPDATE admins SET password_hash=?, salt=? WHERE id=?",
                     (h, salt, existing.id))
        conn.commit()
        return Admin(existing.id, username, h, salt, existing.created_at)
    now = int(time.time())
    cur = conn.execute(
        "INSERT INTO admins(username,password_hash,salt,created_at) VALUES(?,?,?,?)",
        (username, h, salt, now),
    )
    conn.commit()
    return Admin(cur.lastrowid, username, h, salt, now)

def create_admin_session(conn, token: str, admin_id: int, ttl: int) -> int:
    now = int(time.time())
    expires_at = now + ttl
    conn.execute(
        "INSERT INTO admin_sessions(token,admin_id,created_at,expires_at) VALUES(?,?,?,?)",
        (token, admin_id, now, expires_at),
    )
    conn.commit()
    return expires_at

def get_admin_session(conn, token: str) -> AdminSession | None:
    r = conn.execute("SELECT * FROM admin_sessions WHERE token=?", (token,)).fetchone()
    return AdminSession(r["token"], r["admin_id"], r["created_at"], r["expires_at"]) if r else None

def delete_admin_session(conn, token: str) -> bool:
    cur = conn.execute("DELETE FROM admin_sessions WHERE token=?", (token,))
    conn.commit()
    return cur.rowcount > 0

def purge_expired_admin_sessions(conn) -> int:
    now = int(time.time())
    cur = conn.execute("DELETE FROM admin_sessions WHERE expires_at < ?", (now,))
    conn.commit()
    return cur.rowcount
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_db.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/db.py backend/tests/test_db.py
git commit -m "feat(backend): admins + admin_sessions tables and CRUD"
```

---

### Task 3: admin_auth 鉴权模块

**Files:**
- Create: `backend/app/admin_auth.py`
- Test: `backend/tests/test_admin_auth.py`

**Interfaces:**
- Consumes: Task 2 的 `db.get_admin_by_username/get_admin_by_id/get_admin_session/create_admin_session`、`security.verify_password/new_token`、`Settings.admin_session_ttl/admin_cookie_name/admin_key`。
- Produces:
  - `authenticate(conn, username, password) -> db.Admin | None`
  - `issue_session(conn, settings, admin) -> str`（返回 token）
  - `current_admin(conn, token) -> db.Admin | None`（token 空/不存在/过期 → None）
  - `cookie_or_key_ok(request) -> bool`（读 `request.cookies[settings.admin_cookie_name]` 走 `current_admin`，或头 `X-Admin-Key == settings.admin_key` 且非空）

- [ ] **Step 1: 写失败测试**

`backend/tests/test_admin_auth.py`：

```python
from app import db, admin_auth
from app.config import Settings

def _conn():
    c = db.connect(":memory:"); db.init_db(c); return c

def test_authenticate_ok_wrong_and_unknown():
    conn = _conn(); db.upsert_admin(conn, "root", "pw")
    assert admin_auth.authenticate(conn, "root", "pw") is not None
    assert admin_auth.authenticate(conn, "root", "bad") is None
    assert admin_auth.authenticate(conn, "nobody", "pw") is None

def test_issue_and_current_admin():
    conn = _conn(); a = db.upsert_admin(conn, "root", "pw")
    s = Settings(admin_session_ttl=1000)
    tok = admin_auth.issue_session(conn, s, a)
    assert admin_auth.current_admin(conn, tok).username == "root"
    assert admin_auth.current_admin(conn, "bad") is None
    assert admin_auth.current_admin(conn, "") is None
    assert admin_auth.current_admin(conn, None) is None

def test_current_admin_rejects_expired():
    conn = _conn(); a = db.upsert_admin(conn, "root", "pw")
    s = Settings(admin_session_ttl=-5)   # 立即过期
    tok = admin_auth.issue_session(conn, s, a)
    assert admin_auth.current_admin(conn, tok) is None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_auth.py -v`
Expected: FAIL（无 `app.admin_auth` 模块）。

- [ ] **Step 3: 实现**

`backend/app/admin_auth.py`：

```python
import time
from . import db, security

def authenticate(conn, username: str, password: str):
    admin = db.get_admin_by_username(conn, username)
    if not admin:
        return None
    if not security.verify_password(password, admin.salt, admin.password_hash):
        return None
    return admin

def issue_session(conn, settings, admin) -> str:
    token = security.new_token()
    db.create_admin_session(conn, token, admin.id, settings.admin_session_ttl)
    return token

def current_admin(conn, token):
    if not token:
        return None
    sess = db.get_admin_session(conn, token)
    if not sess or sess.expires_at < int(time.time()):
        return None
    return db.get_admin_by_id(conn, sess.admin_id)

def cookie_or_key_ok(request) -> bool:
    settings = request.app.state.settings
    conn = request.app.state.db_conn
    token = request.cookies.get(settings.admin_cookie_name)
    if current_admin(conn, token) is not None:
        return True
    key = settings.admin_key
    return bool(key) and request.headers.get("X-Admin-Key") == key
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_auth.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/admin_auth.py backend/tests/test_admin_auth.py
git commit -m "feat(backend): admin_auth (authenticate, session issue/lookup, cookie-or-key)"
```

---

### Task 4: 管理员登录路由 + /users 鉴权切换

**Files:**
- Modify: `backend/app/routes/admin.py`
- Test: `backend/tests/test_admin.py`

**Interfaces:**
- Consumes: Task 3 的 `admin_auth.authenticate/issue_session/current_admin/cookie_or_key_ok`；`db.delete_admin_session`。
- Produces（都在既有 `/admin` 前缀下）：`POST /admin/login`、`POST /admin/logout`、`GET /admin/me`；`_check(request)` 改为委托 `admin_auth.cookie_or_key_ok(request)`（4 个 `/users` 端点因此同时接受 cookie 或 key，形状不变）。

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_admin.py` 中：先把现有的 `build()` 里构造 `Settings(admin_key="SECRET")` 改为 `Settings(admin_key="SECRET", admin_cookie_secure=False)`（TestClient 走 http，Secure cookie 不会被存，必须关掉才能测 cookie 流）。然后追加：

```python
def test_admin_login_me_logout_cookie_flow():
    conn, tc = build()
    db.upsert_admin(conn, "root", "pw")
    assert tc.get("/admin/me").status_code == 401
    assert tc.post("/admin/login", json={"username": "root", "password": "bad"}).status_code == 401
    r = tc.post("/admin/login", json={"username": "root", "password": "pw"})
    assert r.status_code == 200 and r.json()["ok"] is True
    me = tc.get("/admin/me")
    assert me.status_code == 200 and me.json()["username"] == "root"
    assert tc.post("/admin/logout").json()["ok"] is True
    assert tc.get("/admin/me").status_code == 401

def test_users_auth_accepts_cookie_or_key():
    conn, tc = build()
    db.upsert_admin(conn, "root", "pw")
    assert tc.get("/admin/users").status_code == 403                               # 两者皆无
    assert tc.get("/admin/users", headers={"X-Admin-Key": "SECRET"}).status_code == 200  # key 路径
    tc.post("/admin/login", json={"username": "root", "password": "pw"})
    assert tc.get("/admin/users").status_code == 200                               # cookie 路径
```

（`build()` 已 `import` 了 `db`、`Settings`、`create_app`、`TestClient`、`DataYsSession`、`httpx`——沿用即可。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin.py -v`
Expected: FAIL（无 `/admin/login` 等路由；`/admin/users` 不认 cookie）。

- [ ] **Step 3: 实现**

把 `backend/app/routes/admin.py` 顶部 import 与 `_check` 改为：

```python
from fastapi import APIRouter, Request, Body, Response
from fastapi.responses import JSONResponse
from .. import db
from .. import admin_auth

router = APIRouter()

def _check(request: Request):
    return admin_auth.cookie_or_key_ok(request)
```

（`_forbidden()` 与 4 个 `/users` 端点保持不动。）在文件末尾追加三个路由：

```python
@router.post("/login")
async def admin_login(request: Request, response: Response, payload: dict = Body(...)):
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    admin = admin_auth.authenticate(conn, payload.get("username", ""), payload.get("password", ""))
    if not admin:
        return JSONResponse({"ok": False}, status_code=401)
    token = admin_auth.issue_session(conn, settings, admin)
    response.set_cookie(
        settings.admin_cookie_name, token,
        httponly=True, secure=settings.admin_cookie_secure,
        samesite="lax", max_age=settings.admin_session_ttl,
    )
    return {"ok": True}

@router.post("/logout")
async def admin_logout(request: Request, response: Response):
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    token = request.cookies.get(settings.admin_cookie_name)
    if token:
        db.delete_admin_session(conn, token)
    response.delete_cookie(settings.admin_cookie_name)
    return {"ok": True}

@router.get("/me")
async def admin_me(request: Request):
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    admin = admin_auth.current_admin(conn, request.cookies.get(settings.admin_cookie_name))
    if not admin:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"username": admin.username}
```

说明：登录成功返回 `dict` 的同时，FastAPI 会把注入的 `response` 上设置的 cookie 合并进最终响应（标准用法）。失败分支返回独立 `JSONResponse`，不带 cookie。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin.py -v`
Expected: PASS（含既有 4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/app/routes/admin.py backend/tests/test_admin.py
git commit -m "feat(backend): admin login/logout/me + cookie-or-key auth on /users"
```

---

### Task 5: 静态后台页面 + GET /admin/

**Files:**
- Create: `backend/app/static/admin.html`
- Modify: `backend/app/routes/admin.py`
- Test: `backend/tests/test_admin.py`

**Interfaces:**
- Consumes: 已有 `/admin/login`、`/admin/logout`、`/admin/me`、`/admin/users*`。
- Produces: `GET /admin/` → `FileResponse(admin.html)`（`text/html`）。

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_admin.py` 追加：

```python
def test_admin_index_served_as_html():
    conn, tc = build()
    r = tc.get("/admin/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "<html" in r.text.lower()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin.py::test_admin_index_served_as_html -v`
Expected: FAIL（无 `/admin/` 路由）。

- [ ] **Step 3a: 建静态页面**

创建 `backend/app/static/admin.html`（自包含，原生 JS，无外部依赖）：

```html
<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>用户管理后台</title>
<style>
  :root { font-family: -apple-system, system-ui, sans-serif; }
  body { max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.3rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border: 1px solid #ddd; padding: .4rem .6rem; text-align: left; font-size: .9rem; }
  th { background: #f5f5f5; }
  button { cursor: pointer; padding: .3rem .6rem; }
  input { padding: .3rem; }
  .row { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin: .5rem 0; }
  .hidden { display: none; }
  #msg { color: #b00; min-height: 1.2em; }
  .muted { color: #888; font-size: .85rem; }
</style>
</head>
<body>
<div id="login">
  <h1>管理员登录</h1>
  <div class="row">
    <input id="u" placeholder="用户名" autocomplete="username">
    <input id="p" type="password" placeholder="密码" autocomplete="current-password">
    <button onclick="doLogin()">登录</button>
  </div>
</div>

<div id="panel" class="hidden">
  <div class="row">
    <h1 style="margin:0">用户管理</h1>
    <span class="muted" id="who"></span>
    <button onclick="doLogout()" style="margin-left:auto">登出</button>
  </div>

  <div class="row">
    <input id="n_code" placeholder="新用户 code">
    <input id="n_pw" placeholder="初始密码">
    <input id="n_exp" placeholder="到期 YYYY-MM-DD 或留空">
    <button onclick="createUser()">新增用户</button>
  </div>

  <table>
    <thead><tr><th>code</th><th>状态</th><th>到期</th><th>创建</th><th>操作</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
</div>

<div id="msg"></div>

<script>
const J = {headers: {"Content-Type": "application/json"}, credentials: "same-origin"};
function msg(t) { document.getElementById("msg").textContent = t || ""; }
function fmt(ts) { return ts == null ? "never" : new Date(ts * 1000).toISOString().slice(0, 10); }
function toEpoch(s) {
  s = (s || "").trim();
  if (!s) return null;
  const t = Date.parse(s + "T00:00:00Z");
  if (isNaN(t)) throw new Error("日期格式应为 YYYY-MM-DD");
  return Math.floor(t / 1000);
}

async function api(method, path, body) {
  const opt = Object.assign({method}, J);
  if (body !== undefined) opt.body = JSON.stringify(body);
  const r = await fetch(path, opt);
  return r;
}

async function refresh() {
  const me = await fetch("/admin/me", {credentials: "same-origin"});
  if (me.status !== 200) { show(false); return; }
  document.getElementById("who").textContent = "（" + (await me.json()).username + "）";
  show(true);
  const r = await api("GET", "/admin/users");
  const users = (await r.json()).users || [];
  const tb = document.getElementById("rows");
  tb.innerHTML = "";
  for (const u of users) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${u.code}</td><td>${u.status}</td><td>${fmt(u.expires_at)}</td><td>${fmt(u.created_at)}</td>`;
    const td = document.createElement("td");
    td.className = "row";
    td.appendChild(btn(u.status === "active" ? "停用" : "启用",
      () => patch(u.code, {status: u.status === "active" ? "disabled" : "active"})));
    td.appendChild(btn("改到期", async () => {
      const v = prompt("新到期日 YYYY-MM-DD，留空表示 never", fmt(u.expires_at));
      if (v === null) return;
      patch(u.code, {expires_at: toEpoch(v)});
    }));
    td.appendChild(btn("重置密码", async () => {
      const v = prompt("输入新密码");
      if (!v) return;
      patch(u.code, {password: v});
    }));
    td.appendChild(btn("删除", () => delUser(u.code)));
    tr.appendChild(td);
    tb.appendChild(tr);
  }
}

function btn(label, fn) { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; return b; }
function show(loggedIn) {
  document.getElementById("panel").classList.toggle("hidden", !loggedIn);
  document.getElementById("login").classList.toggle("hidden", loggedIn);
}

async function doLogin() {
  msg("");
  const r = await api("POST", "/admin/login",
    {username: document.getElementById("u").value, password: document.getElementById("p").value});
  if (r.status === 200) { document.getElementById("p").value = ""; refresh(); }
  else msg("登录失败");
}
async function doLogout() { await api("POST", "/admin/logout"); show(false); }

async function createUser() {
  msg("");
  try {
    const body = {code: document.getElementById("n_code").value,
                  password: document.getElementById("n_pw").value,
                  expires_at: toEpoch(document.getElementById("n_exp").value)};
    const r = await api("POST", "/admin/users", body);
    if (r.status === 200) { document.getElementById("n_code").value = ""; document.getElementById("n_pw").value = ""; document.getElementById("n_exp").value = ""; refresh(); }
    else msg("新增失败（" + r.status + "）");
  } catch (e) { msg(e.message); }
}
async function patch(code, body) {
  msg("");
  const r = await api("PATCH", "/admin/users/" + encodeURIComponent(code), body);
  if (r.status === 200) refresh(); else msg("操作失败（" + r.status + "）");
}
async function delUser(code) {
  if (!confirm("确认删除用户 " + code + "？此操作不可撤销")) return;
  const r = await api("DELETE", "/admin/users/" + encodeURIComponent(code));
  if (r.status === 200) refresh(); else msg("删除失败（" + r.status + "）");
}

refresh();
</script>
</body>
</html>
```

- [ ] **Step 3b: 加路由**

在 `backend/app/routes/admin.py` 顶部 import 补：

```python
import os
from fastapi.responses import FileResponse
```

并在 `router = APIRouter()` 之后加一个模块常量与路由（放在 `/users` 路由之前或之后均可，路径不重叠）：

```python
_ADMIN_HTML = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "admin.html")

@router.get("/")
async def admin_index():
    return FileResponse(_ADMIN_HTML)
```

（`admin.py` 在 `app/routes/`，故 `dirname(dirname(__file__))` 指向 `app/`，再拼 `static/admin.html`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/static/admin.html backend/app/routes/admin.py backend/tests/test_admin.py
git commit -m "feat(backend): serve single-file admin console page at /admin/"
```

---

### Task 6: manage.py admin-set 引导命令 + README

**Files:**
- Modify: `backend/manage.py`
- Modify: `backend/README.md`
- Test: `backend/tests/test_manage.py`

**Interfaces:**
- Consumes: Task 2 的 `db.upsert_admin/get_admin_by_username`。
- Produces: 子命令 `admin-set <username> <password>`（幂等建/改唯一管理员），打印 `admin set: <username>`。

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_manage.py` 追加（沿用文件内已有的 `mem()` 助手）：

```python
def test_admin_set_creates_and_resets():
    conn = mem()
    assert manage.main(["admin-set", "root", "pw1"], conn=conn) == 0
    a = db.get_admin_by_username(conn, "root")
    assert a is not None
    h1 = a.password_hash
    manage.main(["admin-set", "root", "pw2"], conn=conn)
    assert db.get_admin_by_username(conn, "root").password_hash != h1
    assert len(conn.execute("SELECT 1 FROM admins").fetchall()) == 1
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_manage.py -v`
Expected: FAIL（无 `admin-set` 子命令，argparse 报错 → SystemExit）。

- [ ] **Step 3: 实现**

在 `backend/manage.py` 的子命令定义区（`sub.add_parser("list")` 一行附近）加：

```python
    ads = sub.add_parser("admin-set"); ads.add_argument("username"); ads.add_argument("password")
```

在命令分派链里（`elif args.cmd == "list":` 分支之前或之后）加：

```python
    elif args.cmd == "admin-set":
        db.upsert_admin(conn, args.username, args.password); print(f"admin set: {args.username}")
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_manage.py -v`
Expected: PASS。

- [ ] **Step 5: 更新 README**

在 `backend/README.md` 的「### 建用户」小节之后，追加一节：

````markdown
### 管理后台

引导管理员账号（幂等，重复执行即重置密码；凭据只在本机输入，不进仓库）：
```bash
.venv/bin/python manage.py admin-set admin 'your-strong-password'
```

然后访问 `https://lottery.jh8.ai/admin/` 登录。管理端点同时接受管理员 cookie
或 `X-Admin-Key`（供脚本自动化）。本地 http 调试需把 cookie Secure 关掉：
```bash
ADMIN_COOKIE_SECURE=false DATA_YS_CODE=xxx DATA_YS_PASSWORD=xxx ADMIN_KEY=xxx \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
相关环境变量：`ADMIN_SESSION_TTL`（默认 86400）、`ADMIN_COOKIE_SECURE`（默认 true）、
`ADMIN_COOKIE_NAME`（默认 admin_session）。
````

- [ ] **Step 6: 跑全量回归**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add backend/manage.py backend/README.md backend/tests/test_manage.py
git commit -m "feat(backend): manage.py admin-set + document admin console"
```

---

### Task 7: 官网落地页 + 安装包下载

**Files:**
- Create: `backend/app/static/index.html`
- Create: `backend/app/static/downloads/README.txt`（占位，说明放置安装包；避免提交二进制）
- Modify: `backend/app/main.py`（加 `GET /` 路由 + `/download` 静态挂载）
- Modify: `backend/README.md`（落地页/下载说明 + 部署提示）
- Test: `backend/tests/test_site.py`

**Interfaces:**
- Consumes: 无（独立于鉴权）。
- Produces: `GET /` → `FileResponse(index.html)`（`text/html`）；`/download/<file>` → `StaticFiles` 托管 `backend/app/static/downloads/`；下载按钮指向 `/download/ys-win.exe`、`/download/ys-mac.dmg`（占位，运维放入实际文件）。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_site.py`：

```python
import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": 0})))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004")
    app = create_app(Settings(admin_key="SECRET", admin_cookie_secure=False), client=client, conn=conn, dayys=dayys)
    return TestClient(app)

def test_landing_page_served():
    tc = build()
    r = tc.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "/download/ys-win.exe" in r.text
    assert "/download/ys-mac.dmg" in r.text

def test_download_dir_mounted():
    tc = build()
    r = tc.get("/download/README.txt")
    assert r.status_code == 200
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_site.py -v`
Expected: FAIL（无 `/` 与 `/download` 路由）。

- [ ] **Step 3a: 建落地页**

创建 `backend/app/static/index.html`（自包含官网页，原生 HTML/CSS，无依赖）：

```html
<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>彩票数据助手 · 官方下载</title>
<style>
  :root { font-family: -apple-system, system-ui, "PingFang SC", sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1a1a1a; background: #0f172a; }
  .hero { max-width: 760px; margin: 0 auto; padding: 5rem 1.25rem 3rem; text-align: center; color: #f8fafc; }
  h1 { font-size: 2.1rem; margin: 0 0 .75rem; }
  p.lead { font-size: 1.05rem; color: #cbd5e1; margin: 0 auto 2.5rem; max-width: 46ch; line-height: 1.6; }
  .downloads { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
  a.dl { display: inline-flex; flex-direction: column; align-items: center; gap: .25rem;
         background: #2563eb; color: #fff; text-decoration: none; padding: 1rem 1.75rem;
         border-radius: .75rem; font-size: 1.05rem; min-width: 190px; transition: background .15s; }
  a.dl:hover { background: #1d4ed8; }
  a.dl small { color: #bfdbfe; font-size: .8rem; font-weight: 400; }
  .foot { color: #64748b; font-size: .85rem; margin-top: 3rem; }
</style>
</head>
<body>
  <main class="hero">
    <h1>彩票数据助手</h1>
    <p class="lead">桌面客户端，支持 Windows 与 macOS。点击下方按钮下载对应版本，安装后登录即可使用。</p>
    <div class="downloads">
      <a class="dl" href="/download/ys-win.exe">下载 Windows 版<small>Windows 10/11 · .exe</small></a>
      <a class="dl" href="/download/ys-mac.dmg">下载 macOS 版<small>macOS 11+ · .dmg</small></a>
    </div>
    <p class="foot">下载遇到问题？请联系管理员。</p>
  </main>
</body>
</html>
```

- [ ] **Step 3b: 建下载目录占位**

创建 `backend/app/static/downloads/README.txt`：

```text
把实际安装包放到这个目录，文件名需与落地页链接一致：
  ys-win.exe   —— Windows 安装包
  ys-mac.dmg   —— macOS 安装包
生产环境建议由 nginx/Caddy 直接托管本目录（大文件不经 uvicorn）。
```

- [ ] **Step 3c: 装配路由与静态挂载**

在 `backend/app/main.py` 顶部 import 补：

```python
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
```

（已有 `from fastapi.responses import Response`，把它并到上面一行即可；勿重复导入。）

在 `create_app` 内、`app.include_router(admin_routes.router, prefix="/admin")` 之后、catch-all `@app.api_route("/api/{path:path}" ...)` 定义之前，加落地页路由与静态挂载：

```python
    _static_dir = os.path.join(os.path.dirname(__file__), "static")
    _downloads_dir = os.path.join(_static_dir, "downloads")
    os.makedirs(_downloads_dir, exist_ok=True)   # 确保挂载目录存在（测试/运行皆可）

    @app.get("/")
    async def landing():
        return FileResponse(os.path.join(_static_dir, "index.html"))

    app.mount("/download", StaticFiles(directory=_downloads_dir), name="download")
```

（`main.py` 在 `app/` 目录，故 `dirname(__file__)` 即 `app/`，拼 `static`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_site.py -v`
Expected: PASS。

- [ ] **Step 5: 更新 README**

在 `backend/README.md` 的「### 管理后台」小节之后，追加：

````markdown
### 官网落地页与下载

- 根路径 `https://lottery.jh8.ai/` 返回官网落地页（`backend/app/static/index.html`），含 Windows / macOS 下载按钮。
- 下载链接指向 `/download/ys-win.exe` 与 `/download/ys-mac.dmg`，由后端 `StaticFiles` 托管 `backend/app/static/downloads/`。
- 部署时把实际安装包按这两个文件名放入该目录；**生产建议 nginx/Caddy 直接 `alias` 到该目录**托管大文件，不经 uvicorn：
  ```nginx
  location /download/ { alias /srv/ys/backend/app/static/downloads/; }
  location / { proxy_pass http://127.0.0.1:8000; }   # 其余转给 uvicorn
  ```
````

- [ ] **Step 6: 跑全量回归**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add backend/app/static/index.html backend/app/static/downloads/README.txt backend/app/main.py backend/README.md backend/tests/test_site.py
git commit -m "feat(backend): landing page at / with Windows/macOS download links"
```

---

## 备注

- `backend/app/main.py` 会在 Task 7 改动：新增 `GET /`（落地页）与 `/download` 静态挂载；admin 路由在 Task 4/5 已挂 `/admin` 前缀，管理页经路由内 `FileResponse` 返回，无需额外挂载。
- `GET /admin`（无尾斜杠）会被 FastAPI 307 重定向到 `/admin/`；反代原样透传即可。
- 路由互不冲突：`/`（落地页）、`/download/*`（静态）、`/admin/*`（后台）、`/api/{path:path}`（代理）前缀各异。
- 下载按钮为占位路径，运维放入实际安装包前点击会 404，属预期。
- 本计划未加登录限流/锁定（单管理员小工具，YAGNI）；如需，后续独立任务。
- 本轮不执行线上部署；部署步骤见 `backend/README.md`，由运维在服务器执行。
