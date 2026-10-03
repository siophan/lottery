# 中间层后端（自有用户体系 + 共享 data-ys 账号转发）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在客户端与 data-ys 之间插一个 FastAPI 中间层：提供我们自己的用户体系（登录/到期/管理），所有上游请求统一复用服务器持有的一个 data-ys 账号的 token。

**Architecture:** 扩展现有 `backend/`（已有透明代理 + 测试）。新增 SQLite 用户库、密码/会话工具、data-ys 单账号会话管理器、登录拦截路由、管理路由；改造 catch-all 转发为「校验我方 token → 换成 data-ys token → 打上游（失效自动重登重试）」。客户端仅改 `apiURL` 一处。

**Tech Stack:** Python 3 / FastAPI / httpx / SQLite（stdlib sqlite3）/ pytest。密码哈希用标准库 `hashlib.pbkdf2_hmac`，**不引入新的运行时依赖**。

## Global Constraints

以下为全局约束，每个任务都隐含适用（数值逐字取自 spec 与前端实测）：

- 运行时依赖**仅限**现有 `backend/requirements.txt`（fastapi/uvicorn/httpx/pytest）；哈希只用 Python 标准库，不加新依赖。
- 上游地址：`https://soft-api.data-ys.com/api`（`UPSTREAM`，去尾斜杠）。
- 所有上游请求必须带请求头 `fromId: 1004`（客户端转发的请求自带，服务器自身的登录请求需手动补）。
- data-ys 登录请求体：`{"username": <软件编号大写>, "password": <密码>, "device": "pc", "deviceId": <设备号>}`。
- data-ys 登录成功响应：`{"code": 0, "data": {"token": "...", "userInfo": {...}}}`；成功判据 `code == 0`；错误信息字段为 `msg`。
- data-ys 失效业务码：`10020`=未登录、`10021`=已在他处登录（被踢）、`10022`=账号已到期。上游返回 `10020/10021` → 服务器重登 data-ys 并**重试一次**；`10022` → 透传并记告警（重登无效）。
- 鉴权头：客户端用请求头 `token` 携带我方 token。
- 我方用户到期/会话失效 → 中间层返回 `{"code": 10022, ...}`（到期）或 `{"code": 10020, ...}`（会话失效），复用客户端现成的登出逻辑。
- 存储：SQLite 单文件；**仅支持单实例部署**（data-ys 单账号会话在内存）。
- 测试**必须 mock 上游**（`httpx.MockTransport`），**绝不调用真实 data-ys**。
- 密钥（`DATA_YS_CODE`/`DATA_YS_PASSWORD`/`ADMIN_KEY`）只从环境变量读，**绝不写进代码、仓库、响应或日志**；日志中所有 token 用 `mask_token` 打码。
- 部署：`lottery.jh8.ai` 走 HTTPS；客户端 `apiURL` = `https://lottery.jh8.ai/api`。

所有命令在 `backend/` 目录下、虚拟环境内运行（`cd backend && .venv/bin/python -m pytest ...`，或已激活 venv 时直接 `pytest`）。

---

### Task 1: 配置扩展（Settings 增字段）

**Files:**
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_config.py`（现有，追加用例）

**Interfaces:**
- Produces: `Settings` 新增字段 `dayys_code:str`、`dayys_password:str`、`dayys_device_id:str`、`from_id:str`、`admin_key:str`、`db_path:str`、`session_ttl:int`、`dayys_token_ttl:int`。`load_settings(env)` 从环境读取它们。

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_config.py` 追加：

```python
from app.config import load_settings

def test_load_settings_reads_middleware_fields():
    env = {
        "DATA_YS_CODE": "ABC1234", "DATA_YS_PASSWORD": "pw",
        "DATA_YS_DEVICE_ID": "srv-1", "DATA_YS_FROM_ID": "1004",
        "ADMIN_KEY": "k", "DB_PATH": "/tmp/x.db",
        "SESSION_TTL": "3600", "DATA_YS_TOKEN_TTL": "600",
    }
    s = load_settings(env)
    assert s.dayys_code == "ABC1234"
    assert s.dayys_password == "pw"
    assert s.dayys_device_id == "srv-1"
    assert s.from_id == "1004"
    assert s.admin_key == "k"
    assert s.db_path == "/tmp/x.db"
    assert s.session_ttl == 3600
    assert s.dayys_token_ttl == 600

def test_load_settings_defaults_for_middleware_fields():
    s = load_settings({})
    assert s.from_id == "1004"
    assert s.db_path.endswith("app.db")
    assert s.session_ttl == 604800
    assert s.dayys_token_ttl == 3600
    assert s.dayys_code == "" and s.dayys_password == ""
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_config.py -v`
Expected: FAIL（`Settings` 无 `dayys_code` 等字段 / `load_settings` 未设置）。

- [ ] **Step 3: 实现**

把 `backend/app/config.py` 改为：

```python
from dataclasses import dataclass
from typing import Mapping

@dataclass
class Settings:
    port: int = 8000
    upstream: str = "https://soft-api.data-ys.com/api"
    verify_tls: bool = True
    timeout: float = 15.0
    # 中间层新增
    dayys_code: str = ""
    dayys_password: str = ""
    dayys_device_id: str = "ys-middleware"
    from_id: str = "1004"
    admin_key: str = ""
    db_path: str = "data/app.db"
    session_ttl: int = 604800       # 我方会话 7 天
    dayys_token_ttl: int = 3600     # data-ys token 刷新间隔（秒）

def load_settings(env: Mapping[str, str]) -> Settings:
    def flag(v: str) -> bool:
        return v.strip().lower() not in ("false", "0", "no", "")
    return Settings(
        port=int(env.get("PORT", 8000)),
        upstream=env.get("UPSTREAM", "https://soft-api.data-ys.com/api").rstrip("/"),
        verify_tls=flag(env.get("UPSTREAM_VERIFY_TLS", "true")),
        timeout=float(env.get("UPSTREAM_TIMEOUT", 15.0)),
        dayys_code=env.get("DATA_YS_CODE", ""),
        dayys_password=env.get("DATA_YS_PASSWORD", ""),
        dayys_device_id=env.get("DATA_YS_DEVICE_ID", "ys-middleware"),
        from_id=env.get("DATA_YS_FROM_ID", "1004"),
        admin_key=env.get("ADMIN_KEY", ""),
        db_path=env.get("DB_PATH", "data/app.db"),
        session_ttl=int(env.get("SESSION_TTL", 604800)),
        dayys_token_ttl=int(env.get("DATA_YS_TOKEN_TTL", 3600)),
    )
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_config.py -v`
Expected: PASS（含现有用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/app/config.py backend/tests/test_config.py
git commit -m "feat(backend): extend Settings with middleware config fields"
```

---

### Task 2: 密码与 token 工具（security.py）

**Files:**
- Create: `backend/app/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Produces:
  - `hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]` → `(hash_hex, salt_hex)`
  - `verify_password(password: str, salt_hex: str, hash_hex: str) -> bool`
  - `new_token() -> str`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_security.py`：

```python
from app.security import hash_password, verify_password, new_token

def test_hash_then_verify_roundtrip():
    h, salt = hash_password("secret")
    assert verify_password("secret", salt, h) is True

def test_verify_rejects_wrong_password():
    h, salt = hash_password("secret")
    assert verify_password("nope", salt, h) is False

def test_same_password_different_salt_differs():
    h1, s1 = hash_password("secret")
    h2, s2 = hash_password("secret")
    assert s1 != s2 and h1 != h2

def test_new_token_is_unique_and_urlsafe():
    a, b = new_token(), new_token()
    assert a != b and len(a) >= 20
    assert all(c.isalnum() or c in "-_" for c in a)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_security.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`backend/app/security.py`：

```python
import hashlib
import hmac
import os
import secrets

_ITERATIONS = 200_000

def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    if salt is None:
        salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return dk.hex(), salt.hex()

def verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return hmac.compare_digest(dk.hex(), hash_hex)

def new_token() -> str:
    return secrets.token_urlsafe(32)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_security.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/security.py backend/tests/test_security.py
git commit -m "feat(backend): password hashing (pbkdf2) and token generation"
```

---

### Task 3: 用户/会话存储（db.py）

**Files:**
- Create: `backend/app/db.py`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Consumes: `security.hash_password`、`security.verify_password`、`security.new_token`（Task 2）。
- Produces（均接收显式 `conn: sqlite3.Connection`，同步函数）：
  - 数据类 `User(id:int, code:str, password_hash:str, salt:str, expires_at:int|None, status:str, created_at:int)`
  - 数据类 `Session(token:str, user_id:int, created_at:int, expires_at:int)`
  - `connect(path: str) -> sqlite3.Connection`（`check_same_thread=False`、`row_factory=sqlite3.Row`、WAL、busy_timeout）
  - `init_db(conn) -> None`（建表，幂等）
  - `get_user_by_code(conn, code: str) -> User | None`（code 不区分大小写，内部统一大写）
  - `create_user(conn, code: str, password: str, expires_at: int | None) -> User`
  - `delete_user(conn, code: str) -> bool`（连带删该用户的会话）
  - `update_user(conn, code: str, *, expires_at=_UNSET, status=_UNSET, password=_UNSET) -> bool`
  - `list_users(conn) -> list[User]`
  - `create_session(conn, user_id: int, ttl: int) -> str`
  - `get_session(conn, token: str) -> Session | None`
  - `delete_session(conn, token: str) -> None`
  - `purge_expired_sessions(conn) -> int`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_db.py`：

```python
import time
from app import db
from app.security import verify_password

def mem():
    conn = db.connect(":memory:")
    db.init_db(conn)
    return conn

def test_create_and_get_user_case_insensitive():
    conn = mem()
    u = db.create_user(conn, "abc1234", "pw", None)
    assert u.code == "ABC1234"
    got = db.get_user_by_code(conn, "AbC1234")
    assert got is not None and got.id == u.id
    assert verify_password("pw", got.salt, got.password_hash)

def test_get_missing_user_returns_none():
    assert db.get_user_by_code(mem(), "NOPE") is None

def test_delete_user_also_deletes_sessions():
    conn = mem()
    u = db.create_user(conn, "u1", "pw", None)
    tok = db.create_session(conn, u.id, 3600)
    assert db.get_session(conn, tok) is not None
    assert db.delete_user(conn, "u1") is True
    assert db.get_session(conn, tok) is None

def test_update_user_expiry_status_password():
    conn = mem()
    db.create_user(conn, "u1", "pw", None)
    assert db.update_user(conn, "u1", expires_at=123, status="disabled", password="new") is True
    u = db.get_user_by_code(conn, "u1")
    assert u.expires_at == 123 and u.status == "disabled"
    assert verify_password("new", u.salt, u.password_hash)

def test_session_create_get_and_expiry():
    conn = mem()
    u = db.create_user(conn, "u1", "pw", None)
    tok = db.create_session(conn, u.id, 3600)
    s = db.get_session(conn, tok)
    assert s.user_id == u.id and s.expires_at > int(time.time())
    db.delete_session(conn, tok)
    assert db.get_session(conn, tok) is None

def test_purge_expired_sessions():
    conn = mem()
    u = db.create_user(conn, "u1", "pw", None)
    db.create_session(conn, u.id, -1)   # 已过期
    fresh = db.create_session(conn, u.id, 3600)
    assert db.purge_expired_sessions(conn) == 1
    assert db.get_session(conn, fresh) is not None

def test_list_users():
    conn = mem()
    db.create_user(conn, "u1", "pw", None)
    db.create_user(conn, "u2", "pw", 999)
    codes = sorted(u.code for u in db.list_users(conn))
    assert codes == ["U1", "U2"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_db.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`backend/app/db.py`：

```python
import sqlite3
import time
from dataclasses import dataclass
from .security import hash_password, new_token

_UNSET = object()

@dataclass
class User:
    id: int
    code: str
    password_hash: str
    salt: str
    expires_at: int | None
    status: str
    created_at: int

@dataclass
class Session:
    token: str
    user_id: int
    created_at: int
    expires_at: int

def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          expires_at INTEGER,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions(
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        """
    )
    conn.commit()

def _row_to_user(r: sqlite3.Row) -> User:
    return User(r["id"], r["code"], r["password_hash"], r["salt"],
                r["expires_at"], r["status"], r["created_at"])

def get_user_by_code(conn, code: str) -> User | None:
    r = conn.execute("SELECT * FROM users WHERE code=?", (code.upper(),)).fetchone()
    return _row_to_user(r) if r else None

def create_user(conn, code: str, password: str, expires_at: int | None) -> User:
    h, salt = hash_password(password)
    now = int(time.time())
    cur = conn.execute(
        "INSERT INTO users(code,password_hash,salt,expires_at,status,created_at)"
        " VALUES(?,?,?,?, 'active', ?)",
        (code.upper(), h, salt, expires_at, now),
    )
    conn.commit()
    return User(cur.lastrowid, code.upper(), h, salt, expires_at, "active", now)

def delete_user(conn, code: str) -> bool:
    u = get_user_by_code(conn, code)
    if not u:
        return False
    conn.execute("DELETE FROM sessions WHERE user_id=?", (u.id,))
    conn.execute("DELETE FROM users WHERE id=?", (u.id,))
    conn.commit()
    return True

def update_user(conn, code: str, *, expires_at=_UNSET, status=_UNSET, password=_UNSET) -> bool:
    u = get_user_by_code(conn, code)
    if not u:
        return False
    sets, vals = [], []
    if expires_at is not _UNSET:
        sets.append("expires_at=?"); vals.append(expires_at)
    if status is not _UNSET:
        sets.append("status=?"); vals.append(status)
    if password is not _UNSET:
        h, salt = hash_password(password)
        sets.append("password_hash=?"); vals.append(h)
        sets.append("salt=?"); vals.append(salt)
    if not sets:
        return True
    vals.append(u.id)
    conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", vals)
    conn.commit()
    return True

def list_users(conn) -> list[User]:
    return [_row_to_user(r) for r in conn.execute("SELECT * FROM users ORDER BY id").fetchall()]

def create_session(conn, user_id: int, ttl: int) -> str:
    tok = new_token()
    now = int(time.time())
    conn.execute(
        "INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)",
        (tok, user_id, now, now + ttl),
    )
    conn.commit()
    return tok

def get_session(conn, token: str) -> Session | None:
    r = conn.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
    return Session(r["token"], r["user_id"], r["created_at"], r["expires_at"]) if r else None

def delete_session(conn, token: str) -> None:
    conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    conn.commit()

def purge_expired_sessions(conn) -> int:
    now = int(time.time())
    cur = conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
    conn.commit()
    return cur.rowcount
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_db.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/db.py backend/tests/test_db.py
git commit -m "feat(backend): SQLite users/sessions store with CRUD"
```

---

### Task 4: data-ys 单账号会话管理（dayys_session.py）

**Files:**
- Create: `backend/app/dayys_session.py`
- Test: `backend/tests/test_dayys_session.py`

**Interfaces:**
- Consumes: `httpx.AsyncClient`（上游 client，base_url 为 `UPSTREAM`）。
- Produces: `class DataYsSession`
  - `__init__(self, client, code, password, device_id, from_id, token_ttl)`
  - `async get_token() -> str`（缓存未过 `token_ttl` 则直接返回；否则加锁登录）
  - `async get_user_info() -> dict`（确保已登录，返回登录时拿到的 `userInfo`）
  - `async login() -> str`（POST `/auth/login`，带头 `fromId`，体为 Global Constraints 的登录体；解析 `res["data"]["token"]`/`["userInfo"]`，缓存并记时间戳）
  - `def invalidate() -> None`（清缓存 token）
  - 失败时抛 `DataYsLoginError`（含上游 `msg`）。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_dayys_session.py`：

```python
import asyncio, httpx, time
from app.dayys_session import DataYsSession, DataYsLoginError

def make(handler):
    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=transport)
    return client, DataYsSession(client, "ABC1234", "pw", "dev-1", "1004", token_ttl=3600)

def test_login_posts_correct_body_and_header_and_caches():
    seen = {}
    def handler(req):
        import json
        seen["path"] = req.url.path
        seen["fromId"] = req.headers.get("fromId")
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {"vip": 1}}})
    client, s = make(handler)
    async def run():
        t = await s.get_token()
        ui = await s.get_user_info()
        await client.aclose()
        return t, ui
    tok, ui = asyncio.run(run())
    assert tok == "DYTOK" and ui == {"vip": 1}
    assert seen["path"].endswith("/auth/login")
    assert seen["fromId"] == "1004"
    assert seen["body"] == {"username": "ABC1234", "password": "pw", "device": "pc", "deviceId": "dev-1"}

def test_get_token_caches_within_ttl():
    calls = {"n": 0}
    def handler(req):
        calls["n"] += 1
        return httpx.Response(200, json={"code": 0, "data": {"token": "T", "userInfo": {}}})
    client, s = make(handler)
    async def run():
        await s.get_token(); await s.get_token()
        await client.aclose()
    asyncio.run(run())
    assert calls["n"] == 1   # 第二次命中缓存

def test_invalidate_forces_relogin():
    calls = {"n": 0}
    def handler(req):
        calls["n"] += 1
        return httpx.Response(200, json={"code": 0, "data": {"token": f"T{calls['n']}", "userInfo": {}}})
    client, s = make(handler)
    async def run():
        a = await s.get_token(); s.invalidate(); b = await s.get_token()
        await client.aclose(); return a, b
    a, b = asyncio.run(run())
    assert a == "T1" and b == "T2" and calls["n"] == 2

def test_concurrent_get_token_logs_in_once():
    calls = {"n": 0}
    def handler(req):
        calls["n"] += 1
        return httpx.Response(200, json={"code": 0, "data": {"token": "T", "userInfo": {}}})
    client, s = make(handler)
    async def run():
        await asyncio.gather(*[s.get_token() for _ in range(10)])
        await client.aclose()
    asyncio.run(run())
    assert calls["n"] == 1   # 锁串行化，只登录一次

def test_login_failure_raises():
    def handler(req):
        return httpx.Response(200, json={"code": 10022, "msg": "软件已到期"})
    client, s = make(handler)
    async def run():
        try:
            await s.get_token(); return None
        except DataYsLoginError as e:
            return str(e)
        finally:
            await client.aclose()
    msg = asyncio.run(run())
    assert msg and "到期" in msg
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dayys_session.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`backend/app/dayys_session.py`：

```python
import asyncio
import time
import httpx

class DataYsLoginError(Exception):
    pass

class DataYsSession:
    def __init__(self, client: httpx.AsyncClient, code: str, password: str,
                 device_id: str, from_id: str, token_ttl: int = 3600):
        self._client = client
        self._code = code
        self._password = password
        self._device_id = device_id
        self._from_id = from_id
        self._token_ttl = token_ttl
        self._token: str | None = None
        self._user_info: dict = {}
        self._logged_at: float = 0.0
        self._lock = asyncio.Lock()

    def invalidate(self) -> None:
        self._token = None

    def _fresh(self) -> bool:
        return self._token is not None and (time.monotonic() - self._logged_at) < self._token_ttl

    async def get_token(self) -> str:
        if self._fresh():
            return self._token
        async with self._lock:
            if self._fresh():
                return self._token
            return await self.login()

    async def get_user_info(self) -> dict:
        await self.get_token()
        return self._user_info

    async def login(self) -> str:
        body = {"username": self._code, "password": self._password,
                "device": "pc", "deviceId": self._device_id}
        resp = await self._client.post("/auth/login", json=body,
                                       headers={"fromId": self._from_id})
        try:
            data = resp.json()
        except Exception:
            raise DataYsLoginError(f"data-ys login: non-JSON response ({resp.status_code})")
        if data.get("code") != 0:
            raise DataYsLoginError(f"data-ys login failed: {data.get('msg')!r} (code={data.get('code')})")
        inner = data.get("data") or {}
        self._token = inner.get("token")
        self._user_info = inner.get("userInfo") or {}
        self._logged_at = time.monotonic()
        if not self._token:
            raise DataYsLoginError("data-ys login: token missing in response")
        return self._token
```

> 注意：`get_token` 用 `_lock` 的双检锁保证并发只登录一次。`login` 本身在锁内调用，不重复加锁。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dayys_session.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/dayys_session.py backend/tests/test_dayys_session.py
git commit -m "feat(backend): data-ys single-account session (token cache + relogin)"
```

---

### Task 5: 我方登录拦截 + 应用装配（auth.py + create_app 接线）

**Files:**
- Create: `backend/app/routes/auth.py`
- Modify: `backend/app/main.py`（装配 db / dayys_session 到 app.state，挂载 auth 路由）
- Test: `backend/tests/test_auth_login.py`

**Interfaces:**
- Consumes: `db`（Task 3）、`security.verify_password`（Task 2）、`DataYsSession`（Task 4）、`Settings`（Task 1）。
- Produces:
  - `backend/app/routes/auth.py` 暴露 `router: APIRouter`，含 `POST /auth/login`。
  - `create_app(settings, client=None, conn=None, dayys=None)` 新增可注入 `conn`、`dayys`（测试用）；在 `app.state` 放 `db_conn`、`settings`、`dayys`；挂载 `auth.router`（前缀 `/api`）。
  - 登录成功返回 `{"code":0,"data":{"token":<我方token>,"userInfo":<data-ys userInfo>}}`；
    凭据错误返回 `{"code":1,"msg":"账号或密码错误"}`；用户停用/到期返回 `{"code":10022,"msg":"账号已停用或已到期"}`。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_auth_login.py`：

```python
import time, httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

def upstream_ok(req):
    return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {"vip": 1}}})

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(upstream_ok))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    settings = Settings(session_ttl=3600)
    app = create_app(settings, client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app)

def test_login_success_returns_our_token_and_dayys_userinfo():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    r = tc.post("/api/auth/login", json={"username": "user01", "password": "pw",
                                         "device": "pc", "deviceId": "x"})
    body = r.json()
    assert body["code"] == 0
    assert body["data"]["userInfo"] == {"vip": 1}
    tok = body["data"]["token"]
    assert db.get_session(conn, tok) is not None        # 是我方会话 token
    assert tok != "DYTOK"                                 # 不是 data-ys 的 token

def test_login_wrong_password():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "bad"})
    assert r.json()["code"] == 1

def test_login_unknown_user():
    conn, tc = build()
    r = tc.post("/api/auth/login", json={"username": "NOPE", "password": "x"})
    assert r.json()["code"] == 1

def test_login_expired_user_rejected():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", int(time.time()) - 10)  # 已过期
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"})
    assert r.json()["code"] == 10022

def test_login_disabled_user_rejected():
    conn, tc = build()
    db.create_user(conn, "USER01", "pw", None)
    db.update_user(conn, "USER01", status="disabled")
    r = tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"})
    assert r.json()["code"] == 10022
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_login.py -v`
Expected: FAIL（`create_app` 不接受 `conn`/`dayys`；`auth.router` 不存在）。

- [ ] **Step 3: 实现**

`backend/app/routes/auth.py`：

```python
import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from .. import db
from ..security import verify_password
from ..dayys_session import DataYsLoginError

router = APIRouter()

@router.post("/auth/login")
async def login(request: Request):
    payload = await request.json()
    username = (payload.get("username") or "").upper()
    password = payload.get("password") or ""
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    dayys = request.app.state.dayys

    user = db.get_user_by_code(conn, username)
    if user is None or not verify_password(password, user.salt, user.password_hash):
        return JSONResponse({"code": 1, "msg": "账号或密码错误"})
    if user.status != "active" or (user.expires_at is not None and user.expires_at < int(time.time())):
        return JSONResponse({"code": 10022, "msg": "账号已停用或已到期"})

    # 取共享 data-ys 账号的 userInfo（确保服务端已登录上游）
    try:
        user_info = await dayys.get_user_info()
    except DataYsLoginError as e:
        return JSONResponse({"code": 502, "msg": f"上游账号不可用: {e}"}, status_code=502)

    token = db.create_session(conn, user.id, settings.session_ttl)
    return JSONResponse({"code": 0, "data": {"token": token, "userInfo": user_info}})
```

在 `backend/app/main.py` 顶部 import 增加：

```python
from .db import connect, init_db
from .dayys_session import DataYsSession
from .routes import auth as auth_routes
```

把 `create_app` 签名与装配改为（保留原有 CORS、catch-all 代理不变——下个任务再改代理）：

```python
def create_app(settings: Settings = None, client=None, conn=None, dayys=None) -> FastAPI:
    settings = settings or load_settings(os.environ)
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_methods=["*"], allow_headers=["*"], allow_credentials=True,
    )
    app.state.settings = settings
    app.state.client = client or build_client(settings)
    if conn is not None:
        app.state.db_conn = conn
    else:
        d = os.path.dirname(settings.db_path)
        if d:
            os.makedirs(d, exist_ok=True)      # 确保 DB 目录存在
        app.state.db_conn = connect(settings.db_path)
        init_db(app.state.db_conn)
    app.state.dayys = dayys or DataYsSession(
        app.state.client, settings.dayys_code, settings.dayys_password,
        settings.dayys_device_id, settings.from_id, settings.dayys_token_ttl,
    )

    app.include_router(auth_routes.router, prefix="/api")   # 先于 catch-all
    app.include_router(local_router, prefix="/api")
    # ... 保留现有 @app.api_route("/api/{path:path}") 代理 ...
```

> 测试注入内存 conn；生产时用 `settings.db_path` 打开并 `init_db`（自动建目录）。
> 显式 `/api/auth/login` 路由优先于 catch-all，故登录被本地拦截、不转发上游。
> `main.py` 顶部已 `import os`，无需再加。

- [ ] **Step 4: 删除被登录拦截作废的两条旧集成测试（保持套件绿）**

登录现在被 auth 路由拦截、不再经代理转发/打日志，故这两条旧测试已不成立；本步删除，
Task 6 会以最终形态整体重写这两个文件：

- 删 `backend/tests/test_proxy.py` 里的 `test_post_body_and_token_forwarded`（它测的是转发 `/api/auth/login`）。
- 删 `backend/tests/test_errors_logging.py` 里的 `test_request_logged_with_masked_token`（它依赖 `/api/auth/login` 经代理打日志）。

保留的其余旧用例（`test_get_forwarded_with_status_and_body`、`test_gzip_*`、`test_upstream_timeout_returns_502`）走 `/api/user/info` 非拦截路径、此时尚无鉴权门，仍通过。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全绿（新 `test_auth_login.py` + 删减后的旧集成测试 + 其余单元测试）。

- [ ] **Step 6: 提交**

```bash
git add backend/app/routes/auth.py backend/app/main.py backend/tests/test_auth_login.py \
        backend/tests/test_proxy.py backend/tests/test_errors_logging.py
git commit -m "feat(backend): local login interceptor issuing our token + dayys userInfo"
```

---

### Task 6: 转发层鉴权 + 换 token + 失效重试（main.py 代理改造）

**Files:**
- Modify: `backend/app/main.py`（catch-all 代理）
- Create: `backend/app/gate.py`（鉴权与换头辅助，保持 main.py 精简）
- Create: `backend/tests/test_gate_proxy.py`
- Modify: `backend/tests/test_proxy.py`、`backend/tests/test_errors_logging.py`（**适配新鉴权语义**：这两个现有测试编码的是旧的"无 token 透明转发"和"转发 /api/auth/login"行为，被本任务故意改变，必须同步重写）

**Interfaces:**
- Consumes: `db.get_session`/`get_user_by_code`（Task 3）、`DataYsSession.get_token`/`invalidate`（Task 4）。
- Produces:
  - `backend/app/gate.py`：
    - `PREAUTH_PATHS = {"auth/login", "version"}`
    - `INVALID_TOKEN_CODES = {10020, 10021}`
    - `authorize(conn, token_header: str) -> tuple[bool, dict | None]`：返回 `(ok, error_body)`；无效会话→`(False,{"code":10020,...})`；用户停用/到期→`(False,{"code":10022,...})`；有效→`(True, None)`。
    - `response_signals_invalid(content: bytes) -> bool`：响应体 JSON `code` ∈ `INVALID_TOKEN_CODES` 则 True（非 JSON 返回 False）。
  - 改造后的 catch-all：预鉴权白名单放行；其余校验我方 token→换 data-ys token→转发→若失效则重登重试一次。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_gate_proxy.py`：

```python
import time, httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

def build(handler, dayys_token_seq=("DYTOK",)):
    conn = db.connect(":memory:"); db.init_db(conn)
    seq = list(dayys_token_seq); state = {"i": 0}
    def login_handler(req):
        # data-ys 登录：按序列发 token
        i = min(state["i"], len(seq) - 1); state["i"] += 1
        return httpx.Response(200, json={"code": 0, "data": {"token": seq[i], "userInfo": {}}})
    def router(req):
        if req.url.path.endswith("/auth/login"):
            return login_handler(req)
        return handler(req)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(router))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app)

def _session_for(conn, code="U1", expires_at=None):
    u = db.create_user(conn, code, "pw", expires_at)
    return db.create_session(conn, u.id, 3600)

def test_proxy_swaps_our_token_for_dayys_token():
    seen = {}
    def handler(req):
        seen["token"] = req.headers.get("token")
        return httpx.Response(200, json={"code": 0, "data": "ok"})
    conn, tc = build(handler)
    tok = _session_for(conn)
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.status_code == 200
    assert seen["token"] == "DYTOK"      # 上游收到的是 data-ys token
    assert seen["token"] != tok          # 不是客户端的我方 token

def test_proxy_rejects_missing_or_bad_token():
    conn, tc = build(lambda req: httpx.Response(200, json={"code": 0}))
    r = tc.post("/api/lotteryNumber/topRows", json={})
    assert r.json()["code"] == 10020
    r2 = tc.post("/api/lotteryNumber/topRows", headers={"token": "garbage"}, json={})
    assert r2.json()["code"] == 10020

def test_proxy_rejects_expired_user():
    conn, tc = build(lambda req: httpx.Response(200, json={"code": 0}))
    tok = _session_for(conn, expires_at=int(time.time()) - 10)
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.json()["code"] == 10022

def test_version_passes_through_without_auth():
    def handler(req):
        assert req.url.path.endswith("/version")
        return httpx.Response(200, json={"code": 0, "data": {"v": "1"}})
    conn, tc = build(handler)
    r = tc.get("/api/version")               # 无 token 也放行
    assert r.status_code == 200 and r.json()["data"]["v"] == "1"

def test_relogin_and_retry_once_on_invalid_code():
    calls = {"n": 0}
    def handler(req):   # 业务接口：第一次报 10020，重登后第二次成功
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json={"code": 10020, "msg": "未登录"})
        return httpx.Response(200, json={"code": 0, "data": "ok"})
    conn, tc = build(handler, dayys_token_seq=("DYTOK1", "DYTOK2"))
    tok = _session_for(conn)
    r = tc.post("/api/lotteryNumber/topRows", headers={"token": tok}, json={})
    assert r.json()["code"] == 0        # 重试后成功，客户端无感
    assert calls["n"] == 2              # 业务接口被打了两次
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_gate_proxy.py -v`
Expected: FAIL（`gate` 不存在；代理未换 token/未鉴权）。

- [ ] **Step 3: 实现**

`backend/app/gate.py`：

```python
import json
import time
from . import db

PREAUTH_PATHS = {"auth/login", "version"}
INVALID_TOKEN_CODES = {10020, 10021}

def authorize(conn, token_header: str):
    if not token_header:
        return False, {"code": 10020, "msg": "未登录"}
    sess = db.get_session(conn, token_header)
    if sess is None or sess.expires_at < int(time.time()):
        return False, {"code": 10020, "msg": "登录已失效，请重新登录"}
    user = None
    for u in db.list_users(conn):
        if u.id == sess.user_id:
            user = u
            break
    if user is None or user.status != "active" or (
        user.expires_at is not None and user.expires_at < int(time.time())
    ):
        return False, {"code": 10022, "msg": "账号已停用或已到期"}
    return True, None

def response_signals_invalid(content: bytes) -> bool:
    try:
        return json.loads(content).get("code") in INVALID_TOKEN_CODES
    except Exception:
        return False
```

> `authorize` 里遍历 `list_users` 找 user 简单够用（少数人规模）；若日后用户多，加一个
> `db.get_user_by_id` 直查（本任务不需要）。

改造 `backend/app/main.py` 的 catch-all 为：

```python
@app.api_route("/api/{path:path}", methods=METHODS)
async def proxy(path: str, request: Request):
    import time
    from .upstream import mask_token
    from fastapi.responses import JSONResponse
    from . import gate

    body = await request.body()
    headers = dict(request.headers)

    if path not in gate.PREAUTH_PATHS:
        ok, err = gate.authorize(app.state.db_conn, headers.get("token", ""))
        if not ok:
            return JSONResponse(err)
        headers["token"] = await app.state.dayys.get_token()   # 换成 data-ys token
    headers["fromId"] = app.state.settings.from_id             # 确保带 fromId

    async def do_forward():
        return await forward(app.state.client, request.method, "/" + path,
                             headers, body, dict(request.query_params))

    t0 = time.monotonic()
    masked = mask_token(headers.get("token", ""))
    try:
        resp = await do_forward()
        if path not in gate.PREAUTH_PATHS and gate.response_signals_invalid(resp.content):
            app.state.dayys.invalidate()
            headers["token"] = await app.state.dayys.get_token()
            resp = await do_forward()
    except (httpx.TimeoutException, httpx.RequestError) as e:
        print(f"{request.method} /api/{path} -> ERR {int((time.monotonic()-t0)*1000)}ms token={masked} ({e})")
        return JSONResponse(status_code=502, content={"error": "upstream_unreachable", "detail": str(e)})
    print(f"{request.method} /api/{path} -> {resp.status_code} {int((time.monotonic()-t0)*1000)}ms token={masked}")
    return Response(content=resp.content, status_code=resp.status_code,
                    headers=filter_response_headers(dict(resp.headers)))
```

> 注意：`headers` 里保留客户端其它头（含上游需要的业务头），只覆盖 `token` 与 `fromId`；
> `forward` 内部已用 `filter_request_headers` 去掉 hop-by-hop 头（含 `host`/`content-length`）。

- [ ] **Step 4: 重写受影响的现有集成测试（新鉴权语义）**

加门后，旧 `test_proxy.py`/`test_errors_logging.py` 里"无 token 直接转发"和"转发 `/api/auth/login`"的断言已不成立。用下面内容**整体替换**两个文件（转发机制的覆盖——状态/体透传、gzip 解码、502、日志打码——仍保留，只是改成带合法我方 token 走非拦截路径）。

`backend/tests/test_proxy.py`（整体替换）：

```python
import gzip, httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

def build(handler):
    conn = db.connect(":memory:"); db.init_db(conn)
    def router(req):
        if req.url.path.endswith("/auth/login"):
            return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {}}})
        return handler(req)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(router))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    u = db.create_user(conn, "U1", "pw", None)
    return db.create_session(conn, u.id, 3600), TestClient(app)

def test_get_forwarded_with_status_and_body():
    def handler(req):
        assert str(req.url) == "https://up.example/api/user/info"
        return httpx.Response(201, json={"ok": True})
    tok, tc = build(handler)
    r = tc.get("/api/user/info", headers={"token": tok})
    assert r.status_code == 201 and r.json() == {"ok": True}

def test_post_body_forwarded_with_swapped_token():
    def handler(req):
        assert req.method == "POST"
        assert req.content == b'{"a":1}'
        assert req.headers.get("token") == "DYTOK"        # token 已换成 data-ys 的
        return httpx.Response(200, json={"code": 0})
    tok, tc = build(handler)
    r = tc.post("/api/user/updateInfo", content=b'{"a":1}',
                headers={"token": tok, "content-type": "application/json"})
    assert r.status_code == 200

def test_gzip_upstream_response_decoded_and_content_encoding_dropped():
    def handler(req):
        return httpx.Response(200,
            headers={"content-encoding": "gzip", "content-type": "application/json"},
            content=gzip.compress(b'{"ok":true}'))
    tok, tc = build(handler)
    r = tc.get("/api/user/info", headers={"token": tok})
    assert r.content == b'{"ok":true}'
    assert "content-encoding" not in {k.lower() for k in r.headers}
```

`backend/tests/test_errors_logging.py`（整体替换）：

```python
import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

def build(handler):
    conn = db.connect(":memory:"); db.init_db(conn)
    def router(req):
        if req.url.path.endswith("/auth/login"):
            return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOKEN12345", "userInfo": {}}})
        return handler(req)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(router))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    u = db.create_user(conn, "U1", "pw", None)
    return db.create_session(conn, u.id, 3600), TestClient(app)

def test_upstream_timeout_returns_502():
    def handler(req):
        raise httpx.ConnectTimeout("boom", request=req)
    tok, tc = build(handler)
    r = tc.get("/api/user/info", headers={"token": tok})
    assert r.status_code == 502 and r.json()["error"] == "upstream_unreachable"

def test_request_logged_with_masked_token(capsys):
    def handler(req):
        return httpx.Response(200, json={"code": 0})
    tok, tc = build(handler)
    tc.get("/api/user/info", headers={"token": tok})
    out = capsys.readouterr().out
    assert "/api/user/info -> 200" in out
    assert "DYTOKEN12345" not in out      # data-ys token 不明文
    assert tok not in out                  # 我方 token 不明文
```

> 说明：`mask_token` 的单元测试在 `test_headers.py`、`forward()` 单元测试在 `test_forward.py`，
> 都不经过网关，**无需改动**。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全绿（新 `test_gate_proxy.py` + 重写后的 `test_proxy.py`/`test_errors_logging.py` + `test_auth_login.py` + 其余单元测试）。

- [ ] **Step 6: 提交**

```bash
git add backend/app/gate.py backend/app/main.py backend/tests/test_gate_proxy.py \
        backend/tests/test_proxy.py backend/tests/test_errors_logging.py
git commit -m "feat(backend): auth gate + token swap + relogin-retry in proxy"
```

---

### Task 7: 用户管理 API（admin.py）

**Files:**
- Create: `backend/app/routes/admin.py`
- Modify: `backend/app/main.py`（挂载 admin 路由，前缀 `/admin`，不经代理）
- Test: `backend/tests/test_admin.py`

**Interfaces:**
- Consumes: `db`（Task 3）、`Settings.admin_key`（Task 1）。
- Produces: `admin.router`（`APIRouter`），端点均要求头 `X-Admin-Key == settings.admin_key`，否则 403：
  - `POST /admin/users` body `{code, password, expires_at?}` → `{ok, code}`
  - `GET /admin/users` → `{users:[{code, status, expires_at, created_at}]}`（不含哈希）
  - `PATCH /admin/users/{code}` body `{expires_at?, status?, password?}` → `{ok}`
  - `DELETE /admin/users/{code}` → `{ok}`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_admin.py`：

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
    app = create_app(Settings(admin_key="SECRET"), client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app)

H = {"X-Admin-Key": "SECRET"}

def test_requires_admin_key():
    _, tc = build()
    assert tc.get("/admin/users").status_code == 403
    assert tc.get("/admin/users", headers={"X-Admin-Key": "wrong"}).status_code == 403

def test_create_list_delete_user():
    conn, tc = build()
    r = tc.post("/admin/users", headers=H, json={"code": "u1", "password": "pw", "expires_at": 999})
    assert r.json()["ok"] is True and r.json()["code"] == "U1"
    lst = tc.get("/admin/users", headers=H).json()["users"]
    assert any(u["code"] == "U1" and u["expires_at"] == 999 for u in lst)
    assert "password_hash" not in lst[0]
    assert tc.request("DELETE", "/admin/users/u1", headers=H).json()["ok"] is True
    assert all(u["code"] != "U1" for u in tc.get("/admin/users", headers=H).json()["users"])

def test_patch_user():
    conn, tc = build()
    tc.post("/admin/users", headers=H, json={"code": "u1", "password": "pw"})
    r = tc.patch("/admin/users/u1", headers=H, json={"expires_at": 555, "status": "disabled"})
    assert r.json()["ok"] is True
    u = db.get_user_by_code(conn, "u1")
    assert u.expires_at == 555 and u.status == "disabled"

def test_patch_missing_user_returns_false():
    _, tc = build()
    assert tc.patch("/admin/users/nope", headers=H, json={"status": "disabled"}).json()["ok"] is False
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin.py -v`
Expected: FAIL（admin 路由不存在）。

- [ ] **Step 3: 实现**

`backend/app/routes/admin.py`：

```python
from fastapi import APIRouter, Request, Body
from fastapi.responses import JSONResponse
from .. import db

router = APIRouter()

def _check(request: Request):
    key = request.app.state.settings.admin_key
    return bool(key) and request.headers.get("X-Admin-Key") == key

def _forbidden():
    return JSONResponse({"error": "forbidden"}, status_code=403)

@router.post("/users")
async def create_user(request: Request, payload: dict = Body(...)):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    u = db.create_user(conn, payload["code"], payload["password"], payload.get("expires_at"))
    return {"ok": True, "code": u.code}

@router.get("/users")
async def list_users(request: Request):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    return {"users": [
        {"code": u.code, "status": u.status, "expires_at": u.expires_at, "created_at": u.created_at}
        for u in db.list_users(conn)
    ]}

@router.patch("/users/{code}")
async def patch_user(code: str, request: Request, payload: dict = Body(...)):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    kwargs = {}
    for k in ("expires_at", "status", "password"):
        if k in payload:
            kwargs[k] = payload[k]
    return {"ok": db.update_user(conn, code, **kwargs)}

@router.delete("/users/{code}")
async def delete_user(code: str, request: Request):
    if not _check(request):
        return _forbidden()
    conn = request.app.state.db_conn
    return {"ok": db.delete_user(conn, code)}
```

在 `backend/app/main.py` 装配处增加（import + 挂载，`/admin` 前缀，**不**在 `/api` 下）：

```python
from .routes import admin as admin_routes
# create_app 内，include auth/local 之后：
app.include_router(admin_routes.router, prefix="/admin")
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/routes/admin.py backend/app/main.py backend/tests/test_admin.py
git commit -m "feat(backend): admin user-management API (ADMIN_KEY protected)"
```

---

### Task 8: 本机管理 CLI（manage.py）

**Files:**
- Create: `backend/manage.py`
- Test: `backend/tests/test_manage.py`

**Interfaces:**
- Consumes: `db`（Task 3）、`load_settings`（Task 1，取 `db_path`）。
- Produces: `main(argv: list[str], conn=None) -> int`（可注入 conn 便于测试）；子命令
  `add <code> <password> [--expires YYYY-MM-DD]`、`del <code>`、
  `set-expiry <code> <YYYY-MM-DD|never>`、`disable <code>`、`enable <code>`、`list`。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_manage.py`：

```python
import time, calendar
from app import db
import manage

def mem():
    conn = db.connect(":memory:"); db.init_db(conn); return conn

def test_add_and_list(capsys):
    conn = mem()
    assert manage.main(["add", "u1", "pw"], conn=conn) == 0
    assert db.get_user_by_code(conn, "u1") is not None
    manage.main(["list"], conn=conn)
    assert "U1" in capsys.readouterr().out

def test_add_with_expiry_parses_date():
    conn = mem()
    manage.main(["add", "u1", "pw", "--expires", "2030-01-01"], conn=conn)
    u = db.get_user_by_code(conn, "u1")
    assert u.expires_at == calendar.timegm(time.strptime("2030-01-01", "%Y-%m-%d"))

def test_set_expiry_never_clears():
    conn = mem()
    manage.main(["add", "u1", "pw", "--expires", "2030-01-01"], conn=conn)
    manage.main(["set-expiry", "u1", "never"], conn=conn)
    assert db.get_user_by_code(conn, "u1").expires_at is None

def test_disable_enable():
    conn = mem()
    manage.main(["add", "u1", "pw"], conn=conn)
    manage.main(["disable", "u1"], conn=conn)
    assert db.get_user_by_code(conn, "u1").status == "disabled"
    manage.main(["enable", "u1"], conn=conn)
    assert db.get_user_by_code(conn, "u1").status == "active"

def test_del():
    conn = mem()
    manage.main(["add", "u1", "pw"], conn=conn)
    manage.main(["del", "u1"], conn=conn)
    assert db.get_user_by_code(conn, "u1") is None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_manage.py -v`
Expected: FAIL（manage 不存在）。

- [ ] **Step 3: 实现**

`backend/manage.py`：

```python
import argparse
import calendar
import os
import sys
import time
from app import db
from app.config import load_settings

def _parse_date(s: str) -> int | None:
    if s.lower() == "never":
        return None
    return calendar.timegm(time.strptime(s, "%Y-%m-%d"))

def main(argv: list[str], conn=None) -> int:
    p = argparse.ArgumentParser(prog="manage.py")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add"); a.add_argument("code"); a.add_argument("password"); a.add_argument("--expires", default="never")
    d = sub.add_parser("del"); d.add_argument("code")
    se = sub.add_parser("set-expiry"); se.add_argument("code"); se.add_argument("date")
    di = sub.add_parser("disable"); di.add_argument("code")
    en = sub.add_parser("enable"); en.add_argument("code")
    sub.add_parser("list")
    args = p.parse_args(argv)

    if conn is None:
        settings = load_settings(os.environ)
        conn = db.connect(settings.db_path); db.init_db(conn)

    if args.cmd == "add":
        db.create_user(conn, args.code, args.password, _parse_date(args.expires)); print(f"added {args.code.upper()}")
    elif args.cmd == "del":
        print("deleted" if db.delete_user(conn, args.code) else "not found")
    elif args.cmd == "set-expiry":
        print("ok" if db.update_user(conn, args.code, expires_at=_parse_date(args.date)) else "not found")
    elif args.cmd == "disable":
        print("ok" if db.update_user(conn, args.code, status="disabled") else "not found")
    elif args.cmd == "enable":
        print("ok" if db.update_user(conn, args.code, status="active") else "not found")
    elif args.cmd == "list":
        for u in db.list_users(conn):
            exp = "never" if u.expires_at is None else time.strftime("%Y-%m-%d", time.gmtime(u.expires_at))
            print(f"{u.code}\t{u.status}\texpires={exp}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_manage.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/manage.py backend/tests/test_manage.py
git commit -m "feat(backend): manage.py CLI for user administration"
```

---

### Task 9: 客户端指向服务器 + 部署说明

**Files:**
- Modify: `client/js/app.9ba1133b.js`（`apiURL` 常量）
- Modify: `backend/README.md`（部署与运行说明）
- Test: 手动 grep 校验（无单元测试）。

**Interfaces:**
- Consumes: 全部前序任务（后端已可运行）。
- Produces: 客户端 `apiURL` = `https://lottery.jh8.ai/api`；README 写明 env、运行、反代、建用户。

- [ ] **Step 1: 改 apiURL**

```bash
cd /Users/ezreal/Documents/www/ys/ys-mac
perl -pi -e 's#apiURL: "http://127\.0\.0\.1:8000/api"#apiURL: "https://lottery.jh8.ai/api"#' client/js/app.9ba1133b.js
```

- [ ] **Step 2: 校验改动唯一且正确**

Run:
```bash
grep -oE 'apiURL: "[^"]+"' client/js/app.9ba1133b.js
```
Expected: 仅输出 `apiURL: "https://lottery.jh8.ai/api"`（无残留 127.0.0.1:8000）。

- [ ] **Step 3: 写 README 部署段**

在 `backend/README.md` 增补（覆盖/追加）：

````markdown
## 中间层后端（自有用户体系 + 共享 data-ys 账号）

### 环境变量（必填项无默认）
- `DATA_YS_CODE` / `DATA_YS_PASSWORD`：服务器持有的那个 data-ys 账号（软件编号 + 密码）
- `DATA_YS_DEVICE_ID`：服务器固定设备号（任意稳定字符串，默认 `ys-middleware`）
- `ADMIN_KEY`：管理 API 密钥
- `DB_PATH`：SQLite 路径（默认 `data/app.db`）
- 可选：`SESSION_TTL`（默认 604800）、`DATA_YS_TOKEN_TTL`（默认 3600）、`UPSTREAM_TIMEOUT`

### 运行
```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
mkdir -p data
DATA_YS_CODE=xxx DATA_YS_PASSWORD=xxx ADMIN_KEY=xxx \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 建用户
```bash
.venv/bin/python manage.py add USER01 theirpassword --expires 2027-01-01
.venv/bin/python manage.py list
```

### 部署（lottery.jh8.ai）
用 nginx/Caddy 终止 HTTPS，反代到本机 uvicorn（127.0.0.1:8000）。SQLite 文件放持久化磁盘。**仅单实例**（data-ys 会话在内存）。

### 测试
```bash
.venv/bin/python -m pytest -q
```
````

- [ ] **Step 4: 跑全量后端测试回归**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全绿（含现有 + 新增全部用例）。

- [ ] **Step 5: 提交**

```bash
git add client/js/app.9ba1133b.js backend/README.md
git commit -m "feat: point client apiURL to lottery.jh8.ai; document middleware deploy"
```

---

## 备注

- `requirements.txt` 无需改动（未引入新依赖）。若实现者的 venv 尚未建，Task 1 前先
  `cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt`。
- data-ys 真实账号凭据与 `ADMIN_KEY` 由使用者在部署环境注入，**不进仓库**。
- Task 3 起测试与运行会在 `backend/data/` 生成 SQLite 文件；在 Task 3 的提交里顺手把
  `backend/data/` 加进根 `.gitignore`（与 `backend/.venv/` 同处），避免 DB 文件入库。
- 本计划不改 Electron 外壳；改 `apiURL` 后内嵌本地 8000 代理对数据请求冗余，清理为后续独立工作项。
