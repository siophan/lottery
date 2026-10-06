# 后台角色、代理与账号编号段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理后台支持「最高权限者（唯一）/ 管理员 / 代理」三类登录身份并在服务端按角色与数据范围鉴权；新增代理资料（级别、上级、地区、资格状态、名称唯一与一年保留、改名授权）、7 位账号编号段（分配即建档、高级代理向直属下级划拨、取消资格后回收）、代理激活本人名下账号并记录上级关系链，全部操作写审计日志。

**Architecture:** FastAPI + SQLite 后端（`backend/app`）：`db.py` 统一建表与迁移；新增数据层模块 `db_agents.py`（代理与名称）、`db_staff.py`（管理员与授权）、`db_segments.py`（号段）；`admin_auth.py` 提供 `Principal` 与 FastAPI 依赖 `require_role(...)`，所有 `/admin/*` 接口经它鉴权（越权统一 403）；新增路由 `admin_agents.py`、`admin_staff.py`、`admin_segments.py`。React 管理后台（`backend/admin-ui`）按角色裁剪菜单并新增代理、号段、管理员与授权页面，构建产物提交到 `backend/app/static/admin-dist`。

**Tech Stack:** Python 3.12 / FastAPI 0.111 / Starlette 0.37 / SQLite 3.53 / pytest；React 18 + Ant Design Pro components + Vite 5 + TypeScript 5。

**Spec:** `docs/superpowers/specs/2026-10-06-agents-roles-segments-design.md`（规则以 spec 为准；本计划「关键决定」一节补齐了 spec 未写明的细节）。

## Global Constraints

- 角色取值 `super`（最高权限者）/ `admin`（管理员）/ `agent`（代理）；`X-Admin-Key` 视为 `super`；最高权限者全局唯一，只能由 `manage.py set-super <用户名>` 指定。
- 所有 `/admin/*` 业务接口必须通过依赖 `admin_auth.require_role(...)` 鉴权；未登录、角色不符、越权一律 HTTP 403 `{"error": "forbidden"}`（与现有形状一致）。业务校验失败 `{"ok": false, "error": "<中文提示>"}` + 400/404/409。
- 账号新号：7 位纯数字 `1000000`–`9999999`（不允许前导 0）；号段含两端，单次 ≤ 10000 个；存量账号不属于任何号段（`agent_id` 为空）。
- 代理字段取值：`region` = `province|city|vip`；`tier` = `senior|junior`；`status` = `active|paused|cancelled`。
- 代理名称：去首尾空格后 1–20 字符、不区分大小写全局唯一（规范化 `strip().casefold()`），改名 / 取消资格后旧名保留 `365*86400` 秒；冲突文案「该名称已被使用」。
- 资格变更原因必填（去空格后非空，≤200 字）。
- 初始密码固定 `123456`（`db.INITIAL_PASSWORD`）；后台创建/重置的管理员、代理登录密码 8–64 位。
- 每个写操作写审计（`audit_logs`）；`actor_type`：代理为 `agent`，最高权限者/管理员/运维密钥为 `admin`，服务器命令为 `system`；新审计 `detail` 不得含手机号明文（A 的脱敏规则继续适用）。
- 新增 users 列必须用独立迁移函数，**不得**并入 `_migrate_users`（它在缺列时会把全部账号回填为已激活）。
- 后端测试：`cd backend && .venv/bin/python -m pytest -q`（基线 324 passed）。前端：`cd backend/admin-ui && npx tsc --noEmit`、`npm run build`。
- 代码注释用中文、风格与周边一致；commit message 英文，结尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不得修改 `backend/data/`、`backend/app/static/downloads/`；不部署、不推送。
- `backend/app/static/admin-dist/` 是生成产物：随 Task 6 提交，但评审 diff 时排除（`git diff <base> -- . ':(exclude)backend/app/static/admin-dist'`）。

## 关键决定（spec 未写明处，计划已定，实施者不得自行改动）

1. **号段建档共用一次哈希**：`create_user(pending=True)` 每行调用 `hash_password`（PBKDF2-SHA256 20 万次，约 0.1–0.2 秒），1 万行需 20–30 分钟且长时间持有写锁。`assign_segment` 只计算一次 `hash_password("123456")`，整段共用同一 `(hash, salt)`。可接受：待激活号的密码本来就是公开的 123456，共用盐只暴露「这些号密码相同」这一已公开事实；`activate_user` / `reset_user_password` 会用新随机盐重新哈希，共用盐不会延续到激活后。其余语义与 `create_user(pending=True)` 完全一致（`first_activated_at/activated_at/onboarded_at` 为 NULL、`status='active'`），`expires_at` 为 NULL（永久）。
2. **已取消代理名称一年后的释放**：取消时写保留（一年）。保留期内无人可用；过期后若有人新建/改名使用该名称，则在同一事务里「释放」：原代理 `name_key` 置 NULL、登录名改为 `名称#id`，此后不能再恢复资格。因此名称不得包含 `#`，`agents.name_key` 允许 NULL（UNIQUE 允许多个 NULL）。
3. **新增 `agents.recycled_at`**（spec 数据模型未列）：实现「回收前可恢复」——回收后恢复资格返回 409「该代理已回收，不能恢复」；重复回收 409「该代理已回收」。
4. **名称命名空间**：代理名称与后台人员（super/admin）用户名共用唯一性检查（不区分大小写），因为代理名称就是 `admins.username`。新建管理员同样走该检查。
5. **代理登录密码**由后台人员新建时设置、可由后台人员重置（重置会清掉该代理的后台会话）；本期不做代理自助改密。
6. **资格状态转换**：`active↔paused`、`active/paused→cancelled`、`cancelled→active`（须未回收且名称未被释放）；`cancelled→paused` 不允许。恢复时只删除本人**当前名称**的保留记录（改名留下的旧名保留照常到期）。
7. **改名**：已取消资格的代理不能改名；改回本人保留期内的旧名允许（并解除该保留）；仅大小写变化不写保留。授权只能授予 `role='admin'` 的管理员，只有最高权限者能授权/撤销（因此被授权者无法转授）。
8. **分配 / 划拨对象必须资格激活**；高级→低级时「有下级」指任何状态的下级。
9. **关系链**：首次激活时取账号**归属代理**（`users.agent_id`）及其上级、上上级，记为 `agent_chain_json=[直接, 间接, 次间接]`（不足三层就短）；无归属账号为 NULL。`activated_by_agent_id` 只有代理本人操作时有值，后台人员激活为 NULL。
10. **代理越权按不存在处理**：代理激活非本人名下账号返回 404「账号不存在」；`GET /admin/users` 对代理强制只返回本人名下（忽略 `agent_id` 参数）；`GET /admin/agents` 对代理只返回其直属下级（划拨对象）；`GET /admin/segment-ops` 对代理只返回与其相关的流水。
11. **登录**：暂停/取消的代理只有在密码正确后才返回 403 + 具体文案；密码错误仍是 401 `{"ok": false}`。已有会话在 `current_principal` 中逐请求检查资格，资格非激活即视为未登录（若同时带正确 `X-Admin-Key`，按运维密钥放行）。
12. **编号状态**：无归属的待激活账号（含 A 阶段后台手工新建、未分配号段的待激活账号）一律显示「未分配」，且 7 位纯数字的这类账号可以被号段分配吸收（spec「回收后的号可再次分配」的同一规则）。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/app/db.py` | 改 | 新表 DDL、`_migrate_users_agents` / `_migrate_admins`、`User`/`Admin` 新字段、`set_super`、`list_active_grants`（T1）；`agent_chain`、`activate_user(by_agent_id)`、`list_users_with_agent`、`number_status`（T5） |
| `backend/app/db_agents.py` | 新建 | `Agent` 读写（T1 仅读取），名称规则与保留、上级/级别校验、资格状态、密码、列表统计（T2），改名（T3）；`BizError`、`begin_write` 供其他数据模块复用 |
| `backend/app/db_staff.py` | 新建 | 管理员账号增删改密、授权增撤查（T3） |
| `backend/app/db_segments.py` | 新建 | 号段校验、分配建档、划拨、回收、流水（T4） |
| `backend/app/admin_auth.py` | 改 | `Principal`、`current_principal`、`require_role`、`AdminDenied`、代理登录拦截（T1） |
| `backend/app/main.py` | 改 | 注册 `AdminDenied` 异常处理（T1）；挂新路由（T2/T3/T4） |
| `backend/app/routes/admin.py` | 改 | 换用 `require_role`；登录拦截与 `/me` 返回角色（T1）；账号列表与激活按代理范围（T5） |
| `backend/app/routes/admin_datasources.py` | 改 | 换用 `require_role`（仅后台人员）（T1） |
| `backend/app/routes/admin_agents.py` | 新建 | 代理增改、资格、重置密码、列表（T2）；改名（T3） |
| `backend/app/routes/admin_staff.py` | 新建 | 管理员与授权（仅最高权限者）（T3） |
| `backend/app/routes/admin_segments.py` | 新建 | 分配、划拨、回收、流水（T4） |
| `backend/manage.py` | 改 | `set-super` 子命令（T1） |
| `backend/tests/agent_helpers.py` | 新建 | B 的测试公共工具（T1） |
| `backend/tests/test_roles.py` / `test_agents.py` / `test_staff.py` / `test_segments.py` / `test_agent_accounts.py` | 新建 | 各任务测试 |
| `backend/tests/test_admin_audit.py` | 改 | 账号列表字段集合增加三列（T5） |
| `backend/README.md`、`backend/DEPLOY.md` | 改 | 角色与 `set-super` 部署后步骤（T1）；代理与号段说明（T5） |
| `backend/admin-ui/src/**` | 改/新建 | 角色菜单、登录文案、代理/号段/管理员页、账号表（T6） |
| `backend/app/static/admin-dist/**` | 生成 | `npm run build` 产物（T6） |

## 接口总览

| 接口 | 角色 | 任务 |
|---|---|---|
| `POST /admin/login`（暂停/取消代理 → 403 + 文案）、`GET /admin/me` → `{username, role, grants, agent}` | 公开 / 已登录 | T1 |
| `POST/PATCH/DELETE /admin/users…`、`POST /admin/users/{code}/reset-password`、`GET /admin/audit-logs`、`/admin/data-sources…` | super, admin | T1 |
| `GET /admin/users?agent_id=`、`POST /admin/users/{code}/activate` | super, admin, agent（代理限本人名下） | T5 |
| `GET /admin/agents` | super, admin（全部）；agent（直属下级） | T2 |
| `POST /admin/agents`、`PATCH /admin/agents/{id}`、`POST /admin/agents/{id}/status`、`POST /admin/agents/{id}/password` | super, admin | T2 |
| `POST /admin/agents/{id}/rename` | super；admin 需 `agent.rename` 授权 | T3 |
| `GET/POST /admin/admins`、`POST /admin/admins/{id}/password`、`DELETE /admin/admins/{id}`、`GET/POST /admin/grants`、`DELETE /admin/grants/{admin_id}/{grant}` | super | T3 |
| `POST /admin/segments/assign`、`POST /admin/agents/{id}/recycle` | super, admin | T4 |
| `POST /admin/segments/transfer` | agent（高级） | T4 |
| `GET /admin/segment-ops` | 全部角色（代理限本人相关） | T4 |

---

### Task 1: 角色迁移、唯一最高权限者与角色守卫

**Files:**
- Modify: `backend/app/db.py`（dataclass `User`/`Admin`、`init_db` 的 DDL 与迁移调用、`_row_to_user`、`_row_to_admin`、`upsert_admin`，新增 `_migrate_users_agents`、`_migrate_admins`、`set_super`、`list_active_grants`）
- Create: `backend/app/db_agents.py`（本任务只含 `Agent` 读取部分）
- Modify: `backend/app/admin_auth.py`（整文件替换）、`backend/app/main.py`、`backend/app/routes/admin.py`（整文件替换）、`backend/app/routes/admin_datasources.py`、`backend/manage.py`
- Modify: `backend/README.md`、`backend/DEPLOY.md`
- Test: `backend/tests/agent_helpers.py`（新建）、`backend/tests/test_roles.py`（新建）

**Interfaces:**
- Consumes: 现有 `db.upsert_admin(conn, username, password) -> Admin`、`db.get_admin_by_id/get_admin_by_username`、`db._audit_nocommit(conn, actor_type, actor, action, target, detail, now=None)`、`db.list_audit(conn, limit, offset, target=None) -> (rows, total)`、`admin_auth.authenticate / issue_session / current_admin`。
- Produces:
  - `db.User` 末尾追加 `agent_id: int|None=None, activated_by_agent_id: int|None=None, agent_chain_json: str|None=None`；`db.Admin` 末尾追加 `role: str = "admin"`。
  - 表 `agents`（含 `recycled_at`、`name_key` 可空 UNIQUE）、`agent_name_reservations`、`segment_ops`、`admin_grants`（部分唯一索引：同一管理员同一授权项只能有一条未撤销记录）；`users` 新列 + 索引 `idx_users_agent`；`admins.role` + 部分唯一索引 `idx_admins_one_super`。
  - `db.set_super(conn, username) -> "ok"|"not_found"|"is_agent"`；`db.list_active_grants(conn, admin_id: int|None) -> list[str]`。
  - `db_agents.Agent` dataclass（字段与 `agents` 表列一一对应）、`db_agents.get_agent(conn, agent_id) -> Agent|None`、`db_agents.get_agent_by_admin_id(conn, admin_id) -> Agent|None`、`db_agents.agent_to_dict(a) -> dict`（去掉 `admin_id`、`name_key`）。
  - `admin_auth.STAFF = ("super","admin")`、`ALL_ROLES = ("super","admin","agent")`、`class AdminDenied(Exception)`、`@dataclass Principal(role, username, admin_id, agent_id=None)` + 属性 `actor_type`、`agent_login_problem(conn, admin) -> str|None`、`principal_for_admin(conn, admin) -> Principal|None`、`current_principal(request) -> Principal|None`、`require_role(*roles) -> FastAPI 依赖（返回 Principal，否则抛 AdminDenied）`。删除 `cookie_or_key_ok`、`actor_of`。
  - `/admin/me` → `{"username", "role", "grants": [...], "agent": dict|None}`；`/admin/login` 对暂停/取消代理返回 403 `{"ok": false, "error": "代理资格已暂停，无法登录" | "代理资格已取消，无法登录"}`。
  - 测试工具 `tests/agent_helpers.py`：`H`、`build_app() -> (conn, app)`、`key_client(app)`、`login_client(app, username, password="pw")`、`mk_admin(conn, username, password="pw", role="admin") -> admin_id`、`mk_agent_raw(conn, name, password="pw", *, tier="senior", parent=None, status="active", region="city") -> agent_id`、`set_agent_status_raw(conn, agent_id, status)`、`audit(conn, action) -> list[dict]`。

- [ ] **Step 1: 写测试工具与失败测试**

`backend/tests/agent_helpers.py`：

```python
# 子项目 B（角色 / 代理 / 号段）测试共用的造数据与客户端工具。
import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db
from app.dayys_session import DataYsSession

H = {"X-Admin-Key": "SECRET"}

def build_app():
    """返回 (conn, app)。需要多个登录身份时，每个身份各开一个 TestClient（各自的 cookie）。"""
    conn = db.connect(":memory:"); db.init_db(conn)
    client = httpx.AsyncClient(base_url="https://up.example/api",
                               transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": 0})))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004")
    app = create_app(Settings(admin_key="SECRET", admin_cookie_secure=False),
                     client=client, conn=conn, dayys=dayys)
    return conn, app

def key_client(app) -> TestClient:
    return TestClient(app, headers=H)

def login_client(app, username: str, password: str = "pw") -> TestClient:
    tc = TestClient(app)
    r = tc.post("/admin/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return tc

def mk_admin(conn, username: str, password: str = "pw", role: str = "admin") -> int:
    a = db.upsert_admin(conn, username, password)
    conn.execute("UPDATE admins SET role=? WHERE id=?", (role, a.id))
    conn.commit()
    return a.id

def mk_agent_raw(conn, name: str, password: str = "pw", *, tier: str = "senior",
                 parent: int | None = None, status: str = "active", region: str = "city") -> int:
    """绕过业务校验直接落库一个代理（仅测试造数据用），返回 agent_id。"""
    admin_id = mk_admin(conn, name, password, role="agent")
    cur = conn.execute(
        "INSERT INTO agents(admin_id,name,name_key,region,tier,parent_agent_id,status,created_at)"
        " VALUES(?,?,?,?,?,?,?,0)",
        (admin_id, name, name.strip().casefold(), region, tier, parent, status))
    conn.commit()
    return cur.lastrowid

def set_agent_status_raw(conn, agent_id: int, status: str) -> None:
    conn.execute("UPDATE agents SET status=? WHERE id=?", (status, agent_id))
    conn.commit()

def audit(conn, action: str) -> list[dict]:
    rows, _ = db.list_audit(conn, 200, 0)
    return [r for r in rows if r["action"] == action]
```

`backend/tests/test_roles.py`：

```python
import sqlite3
import pytest
from app import db
import manage
from tests.agent_helpers import (H, audit, build_app, key_client, login_client, mk_admin,
                                 mk_agent_raw, set_agent_status_raw)

LEGACY_ADMINS = """
CREATE TABLE admins(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
"""

A_ERA_USERS = """
CREATE TABLE users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  first_activated_at INTEGER,
  activated_at INTEGER,
  phone TEXT,
  onboarded_at INTEGER
)
"""

def _cols(conn, table):
    return {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}

# ---------------- 迁移 ----------------

def test_migration_existing_admins_become_admin_role():
    conn = db.connect(":memory:")
    conn.execute(LEGACY_ADMINS)
    conn.execute("INSERT INTO admins(username,password_hash,salt,created_at) VALUES('root','h','s',1)")
    conn.commit()
    db.init_db(conn)
    assert "role" in _cols(conn, "admins")
    assert db.get_admin_by_username(conn, "root").role == "admin"
    db.init_db(conn)                                     # 幂等
    assert db.get_admin_by_username(conn, "root").role == "admin"

def test_migration_from_a_era_keeps_pending_users_pending():
    # A 之后的库：users 已有 A 的 4 列，只缺 B 的 3 列 → 只加列，绝不回填为已激活
    conn = db.connect(":memory:")
    conn.execute(A_ERA_USERS)
    conn.execute("INSERT INTO users(code,password_hash,salt,status,created_at) VALUES('P1','h','s','active',5)")
    conn.commit()
    db.init_db(conn)
    assert {"agent_id", "activated_by_agent_id", "agent_chain_json"} <= _cols(conn, "users")
    u = db.get_user_by_code(conn, "P1")
    assert u.first_activated_at is None and u.onboarded_at is None
    assert u.agent_id is None and u.activated_by_agent_id is None and u.agent_chain_json is None

def test_init_db_creates_b_tables():
    conn = db.connect(":memory:"); db.init_db(conn)
    names = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"agents", "agent_name_reservations", "segment_ops", "admin_grants"} <= names
    assert {"recycled_at", "name_key", "parent_agent_id"} <= _cols(conn, "agents")

# ---------------- 唯一最高权限者 ----------------

def test_set_super_demotes_previous_atomically_and_audits():
    conn, _ = build_app()
    mk_admin(conn, "a1"); mk_admin(conn, "a2")
    assert db.set_super(conn, "a1") == "ok"
    assert db.get_admin_by_username(conn, "a1").role == "super"
    assert db.set_super(conn, "a2") == "ok"
    assert db.get_admin_by_username(conn, "a1").role == "admin"
    assert db.get_admin_by_username(conn, "a2").role == "super"
    assert conn.execute("SELECT COUNT(*) FROM admins WHERE role='super'").fetchone()[0] == 1
    e = audit(conn, "admin.set_super")[0]
    assert e["actor_type"] == "system" and e["actor"] == "manage.py"
    assert e["target"] == "a2" and e["detail"] == {"previous": "a1"}

def test_set_super_rejects_unknown_and_agent():
    conn, _ = build_app()
    mk_agent_raw(conn, "ag1")
    assert db.set_super(conn, "nobody") == "not_found"
    assert db.set_super(conn, "ag1") == "is_agent"
    assert conn.execute("SELECT COUNT(*) FROM admins WHERE role='super'").fetchone()[0] == 0

def test_second_super_blocked_by_unique_index():
    conn, _ = build_app()
    mk_admin(conn, "a1", role="super")
    a2 = mk_admin(conn, "a2")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE admins SET role='super' WHERE id=?", (a2,))
    conn.rollback()

def test_manage_set_super(capsys):
    conn, _ = build_app()
    mk_admin(conn, "root")
    assert manage.main(["set-super", "root"], conn=conn) == 0
    assert "super set: root" in capsys.readouterr().out
    assert db.get_admin_by_username(conn, "root").role == "super"
    assert manage.main(["set-super", "ghost"], conn=conn) == 1
    assert "not found" in capsys.readouterr().out

# ---------------- 角色守卫 ----------------

STAFF_ENDPOINTS = [
    ("POST", "/admin/users"), ("GET", "/admin/audit-logs"), ("GET", "/admin/data-sources"),
    ("POST", "/admin/users/U1/reset-password"), ("DELETE", "/admin/users/U1"),
]

def test_agent_forbidden_on_staff_endpoints():
    conn, app = build_app()
    db.create_user(conn, "U1", "pw", None)
    mk_agent_raw(conn, "ag1")
    tc = login_client(app, "ag1")
    for method, path in STAFF_ENDPOINTS:
        r = tc.request(method, path)
        assert r.status_code == 403 and r.json() == {"error": "forbidden"}, path
    assert db.get_user_by_code(conn, "U1") is not None

def test_admin_cookie_and_key_pass_staff_guard():
    conn, app = build_app()
    mk_admin(conn, "adm")
    assert login_client(app, "adm").get("/admin/users").status_code == 200
    assert key_client(app).get("/admin/data-sources").status_code == 200

# ---------------- 登录与 /me ----------------

def test_me_reports_role_grants_and_agent():
    conn, app = build_app()
    mk_admin(conn, "boss", role="super")
    me = login_client(app, "boss").get("/admin/me").json()
    assert me == {"username": "boss", "role": "super", "grants": [], "agent": None}
    aid = mk_agent_raw(conn, "ag1", tier="junior", region="vip")
    me = login_client(app, "ag1").get("/admin/me").json()
    assert me["role"] == "agent" and me["agent"]["id"] == aid
    assert me["agent"]["tier"] == "junior" and me["agent"]["region"] == "vip"
    assert "admin_id" not in me["agent"] and "name_key" not in me["agent"]

@pytest.mark.parametrize("status,msg", [("paused", "代理资格已暂停，无法登录"),
                                        ("cancelled", "代理资格已取消，无法登录")])
def test_inactive_agent_cannot_login(status, msg):
    conn, app = build_app()
    mk_agent_raw(conn, "ag1", status=status)
    from fastapi.testclient import TestClient
    r = TestClient(app).post("/admin/login", json={"username": "ag1", "password": "pw"})
    assert r.status_code == 403 and r.json() == {"ok": False, "error": msg}
    # 密码错误仍是笼统的 401，不暴露资格状态
    r = TestClient(app).post("/admin/login", json={"username": "ag1", "password": "bad"})
    assert r.status_code == 401 and r.json() == {"ok": False}

def test_existing_agent_session_rejected_after_pause():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag1")
    tc = login_client(app, "ag1")
    assert tc.get("/admin/me").status_code == 200
    set_agent_status_raw(conn, aid, "paused")
    assert tc.get("/admin/me").status_code == 401
    set_agent_status_raw(conn, aid, "active")           # 恢复后未过期会话重新可用
    assert tc.get("/admin/me").status_code == 200

def test_key_actor_type_admin_and_agent_cookie_falls_back_to_key():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag1")
    tc = login_client(app, "ag1")
    set_agent_status_raw(conn, aid, "paused")
    # 失效的代理 cookie + 正确运维密钥：按运维密钥（最高权限者）放行
    assert tc.get("/admin/users", headers=H).status_code == 200
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_roles.py`
Expected: FAIL（`AttributeError: module 'app.db' has no attribute 'set_super'`、`no such table: agents` 等）。

- [ ] **Step 3: 实现数据层（`backend/app/db.py`）**

3a. `User` dataclass：在 `onboarded_at` 字段之后追加：

```python
    agent_id: int | None = None             # 当前归属代理；None = 无归属（存量账号 / 回收后的号）
    activated_by_agent_id: int | None = None  # 首次激活操作者为代理时记其 id；后台人员激活为 None
    agent_chain_json: str | None = None     # 首次激活时的 [直接, 间接, 次间接] 上级代理 id（JSON）
```

3b. `Admin` dataclass：在 `created_at: int` 之后追加：

```python
    role: str = "admin"                     # super 最高权限者 | admin 管理员 | agent 代理
```

3c. `init_db` 的 `executescript` 中，在 `CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target, id);` 之后、结束的 `"""` 之前追加：

```sql
        CREATE TABLE IF NOT EXISTS agents(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_id INTEGER UNIQUE NOT NULL,
          name TEXT NOT NULL,
          name_key TEXT UNIQUE,
          region TEXT NOT NULL,
          tier TEXT NOT NULL,
          parent_agent_id INTEGER,
          status TEXT NOT NULL DEFAULT 'active',
          status_by TEXT,
          status_at INTEGER,
          status_reason TEXT,
          created_at INTEGER NOT NULL,
          recycled_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_agent_id);
        CREATE TABLE IF NOT EXISTS agent_name_reservations(
          name_key TEXT PRIMARY KEY,
          agent_id INTEGER NOT NULL,
          reserved_until INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS segment_ops(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          op TEXT NOT NULL,
          start_no INTEGER,
          end_no INTEGER,
          count INTEGER NOT NULL,
          from_agent_id INTEGER,
          to_agent_id INTEGER,
          actor TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS admin_grants(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_id INTEGER NOT NULL,
          grant TEXT NOT NULL,
          granted_by TEXT NOT NULL,
          granted_at INTEGER NOT NULL,
          revoked_at INTEGER
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_grants_active
          ON admin_grants(admin_id, grant) WHERE revoked_at IS NULL;
```

（`grant` 在 SQLite 3.53 中不是保留字，已验证可作列名。）

3d. `init_db` 中把

```python
    _migrate_users(conn)
    _migrate_sms_send_log(conn)
```

改为

```python
    _migrate_users(conn)
    _migrate_sms_send_log(conn)
    _migrate_users_agents(conn)
    _migrate_admins(conn)
```

3e. 在 `def mask_phone(` 之前插入：

```python
def _migrate_users_agents(conn) -> None:
    # 子项目 B 的 users 新列。必须与 _migrate_users 分开：那里「缺列即回填为已激活」，
    # 若把这三列塞进去，A 之后的库升级时会把所有待激活账号误回填成已激活。这里只加列、不回填。
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    for name, ddl in (("agent_id", "INTEGER"), ("activated_by_agent_id", "INTEGER"),
                      ("agent_chain_json", "TEXT")):
        if name not in cols:
            conn.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl}")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_agent ON users(agent_id)")
    conn.commit()

def _migrate_admins(conn) -> None:
    # 现有管理员一律迁移为普通管理员（列默认值）；最高权限者由 manage.py set-super 指定
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(admins)")}
    if "role" not in cols:
        conn.execute("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'")
    # 最高权限者唯一：部分唯一索引在库层兜底
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_one_super ON admins(role) WHERE role='super'")
    conn.commit()
```

3f. `_row_to_user` 改为：

```python
def _row_to_user(r: sqlite3.Row) -> User:
    return User(r["id"], r["code"], r["password_hash"], r["salt"],
                r["expires_at"], r["status"], r["created_at"],
                r["first_activated_at"], r["activated_at"], r["phone"], r["onboarded_at"],
                r["agent_id"], r["activated_by_agent_id"], r["agent_chain_json"])
```

3g. `_row_to_admin` 改为：

```python
def _row_to_admin(r: sqlite3.Row) -> Admin:
    return Admin(r["id"], r["username"], r["password_hash"], r["salt"], r["created_at"], r["role"])
```

3h. `upsert_admin`：已存在分支的返回改为 `return Admin(existing.id, username, h, salt, existing.created_at, existing.role)`；新建分支的返回改为 `return Admin(cur.lastrowid, username, h, salt, now, "admin")`。

3i. 在 `upsert_admin` 之后（`create_admin_session` 之前）插入：

```python
def set_super(conn, username: str) -> str:
    """指定唯一的最高权限者，原最高权限者同一事务内降为管理员。
    返回 ok | not_found | is_agent（代理身份不能成为最高权限者）。"""
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    try:
        r = conn.execute("SELECT id, role FROM admins WHERE username=?", (username,)).fetchone()
        if r is None or r["role"] == "agent":
            conn.rollback()
            return "not_found" if r is None else "is_agent"
        prev = conn.execute("SELECT username FROM admins WHERE role='super'").fetchone()
        conn.execute("UPDATE admins SET role='admin' WHERE role='super'")
        conn.execute("UPDATE admins SET role='super' WHERE id=?", (r["id"],))
        _audit_nocommit(conn, "system", "manage.py", "admin.set_super", username,
                        {"previous": prev["username"] if prev else None})
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return "ok"

def list_active_grants(conn, admin_id: int | None) -> list[str]:
    """该后台账号当前有效的授权项（如 agent.rename）；X-Admin-Key（admin_id=None）返回空。"""
    if admin_id is None:
        return []
    return [r["grant"] for r in conn.execute(
        "SELECT grant FROM admin_grants WHERE admin_id=? AND revoked_at IS NULL ORDER BY grant",
        (admin_id,))]
```

- [ ] **Step 4: 新建 `backend/app/db_agents.py`（本任务只放读取部分，Task 2 扩充）**

```python
# 代理资料（子项目 B）：数据层。表结构在 db.init_db 中统一创建。
import sqlite3
from dataclasses import dataclass, asdict, fields

@dataclass
class Agent:
    id: int
    admin_id: int             # 登录身份：admins.id（role='agent'）
    name: str
    name_key: str | None      # 规范化名称（去首尾空格 + casefold）；名称被他人认领后为 None
    region: str               # province | city | vip
    tier: str                 # senior 高级 | junior 低级
    parent_agent_id: int | None
    status: str               # active 激活 | paused 暂停 | cancelled 取消
    status_by: str | None
    status_at: int | None
    status_reason: str | None
    created_at: int
    recycled_at: int | None   # 资格取消后执行回收的时间；回收后不可再恢复

_AGENT_FIELDS = tuple(f.name for f in fields(Agent))

def _row_to_agent(r: sqlite3.Row) -> Agent:
    # 只取 agents 表列：联表查询多出的列（parent_name、统计）忽略
    return Agent(**{k: r[k] for k in _AGENT_FIELDS})

def get_agent(conn, agent_id: int) -> Agent | None:
    r = conn.execute("SELECT * FROM agents WHERE id=?", (agent_id,)).fetchone()
    return _row_to_agent(r) if r else None

def get_agent_by_admin_id(conn, admin_id: int) -> Agent | None:
    r = conn.execute("SELECT * FROM agents WHERE admin_id=?", (admin_id,)).fetchone()
    return _row_to_agent(r) if r else None

def agent_to_dict(a: Agent) -> dict:
    d = asdict(a)
    del d["admin_id"], d["name_key"]
    return d
```

- [ ] **Step 5: 角色守卫（`backend/app/admin_auth.py` 整文件替换）**

```python
import hmac
import time
from dataclasses import dataclass
from fastapi import Request
from . import db, db_agents, security

STAFF = ("super", "admin")      # 后台人员：最高权限者 + 管理员
ALL_ROLES = ("super", "admin", "agent")
AGENT_BLOCKED_MSG = {
    "paused": "代理资格已暂停，无法登录",
    "cancelled": "代理资格已取消，无法登录",
}

class AdminDenied(Exception):
    """未登录、角色不符或越权：main.py 统一转成 403 {"error": "forbidden"}。"""

@dataclass
class Principal:
    role: str                   # super | admin | agent（X-Admin-Key 视为 super）
    username: str               # 审计操作者；X-Admin-Key 为 "admin-key"
    admin_id: int | None        # X-Admin-Key 为 None
    agent_id: int | None = None # 仅代理身份有值

    @property
    def actor_type(self) -> str:
        return "agent" if self.role == "agent" else "admin"

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

def agent_login_problem(conn, admin) -> str | None:
    """代理身份资格非激活（暂停/取消）时返回提示文案；可登录或非代理返回 None。"""
    if admin.role != "agent":
        return None
    agent = db_agents.get_agent_by_admin_id(conn, admin.id)
    if agent is None:
        return "代理资料不存在，无法登录"
    return AGENT_BLOCKED_MSG.get(agent.status)

def principal_for_admin(conn, admin) -> Principal | None:
    """把已登录的后台账号转成当前身份；代理资格非激活时返回 None（已有会话逐请求拒绝）。"""
    if admin.role != "agent":
        return Principal(admin.role, admin.username, admin.id)
    agent = db_agents.get_agent_by_admin_id(conn, admin.id)
    if agent is None or agent.status != "active":
        return None
    return Principal("agent", admin.username, admin.id, agent.id)

def current_principal(request: Request) -> Principal | None:
    settings = request.app.state.settings
    conn = request.app.state.db_conn
    admin = current_admin(conn, request.cookies.get(settings.admin_cookie_name))
    if admin is not None:
        p = principal_for_admin(conn, admin)
        if p is not None:
            return p
    key = settings.admin_key
    header = request.headers.get("X-Admin-Key") or ""
    # encode to bytes: compare_digest raises TypeError on non-ASCII str
    if key and hmac.compare_digest(header.encode("utf-8"), key.encode("utf-8")):
        return Principal("super", "admin-key", None)      # 运维密钥视为最高权限者
    return None

def require_role(*roles: str):
    """FastAPI 依赖工厂：当前身份不在 roles 内（含未登录）→ AdminDenied（403）。"""
    def dep(request: Request) -> Principal:
        p = current_principal(request)
        if p is None or p.role not in roles:
            raise AdminDenied()
        return p
    return dep
```

- [ ] **Step 6: 注册 403 处理（`backend/app/main.py`）**

- `from fastapi.responses import Response, FileResponse` 改为 `from fastapi.responses import Response, FileResponse, JSONResponse`。
- 在 `from .collector import Collector` 之后加 `from .admin_auth import AdminDenied`。
- 在 `app = FastAPI(lifespan=lifespan)` 之后紧接着插入：

```python

    @app.exception_handler(AdminDenied)
    async def _admin_denied(request: Request, exc: AdminDenied):
        # 后台接口统一的未登录 / 越权响应（与原 _forbidden() 形状一致）
        return JSONResponse({"error": "forbidden"}, status_code=403)
```

- [ ] **Step 7: 账号与登录路由（`backend/app/routes/admin.py` 整文件替换）**

要点：去掉 `_check/_forbidden`，每个业务端点加 `p: Principal = STAFF_ONLY`；审计改用 `p.actor_type / p.username`；登录拦截暂停/取消的代理；`/me` 返回角色、授权与代理资料。依赖在解析请求体之前执行，未登录带非法 body 仍是 403。

```python
import os
import sqlite3
import time
from fastapi import APIRouter, Request, Body, Response, Depends
from fastapi.responses import JSONResponse, FileResponse
from .. import db
from .. import admin_auth, db_agents
from ..admin_auth import Principal

router = APIRouter()
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))

ALLOWED_STATUS = ("active", "disabled", "banned")   # 使用控制：正常 / 暂停 / 封禁

_ADMIN_INDEX = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "static", "admin-dist", "index.html"
)

@router.get("/")
async def admin_index():
    # Ant Design Pro（Vite 构建）单页应用入口；静态资源由 main.py 挂在 /admin/assets。
    return FileResponse(_ADMIN_INDEX)

def _err(error: str, status: int):
    return JSONResponse({"ok": False, "error": error}, status_code=status)

def _not_found():
    return _err("账号不存在", 404)

def _password_rejected(payload: dict):
    # 管理员不得设置任意密码：显式报错而不是静默忽略，避免调用方误以为已设置成功
    if "password" in payload:
        return _err("不支持设置密码，请使用激活或重置密码", 400)
    return None

MAX_INT = 2 ** 62      # SQLite INTEGER 为 64 位有符号；留足余量，避免 OverflowError 变 500

def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)

def _valid_expires(v) -> bool:
    # 到期时间：null（永不过期）或 0 <= v < 2**62 的整数
    return v is None or (_is_int(v) and 0 <= v < MAX_INT)

def _audit(request: Request, p: Principal, action: str, target: str, detail: dict) -> None:
    db.add_audit(request.app.state.db_conn, p.actor_type, p.username, action, target, detail)

@router.post("/users")
async def create_user(request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    rejected = _password_rejected(payload)
    if rejected is not None:
        return rejected
    code = payload.get("code")
    # 编号不能为空，否则会产生无法通过 /users/{code} 路由删除的脏数据
    if not isinstance(code, str) or not code.strip():
        return JSONResponse({"ok": False, "error": "code required"}, status_code=400)
    expires_at = payload.get("expires_at")
    if not _valid_expires(expires_at):
        return _err("到期时间无效", 400)
    conn = request.app.state.db_conn
    code = code.strip()
    if db.get_user_by_code(conn, code):
        return _err("账号已存在", 409)
    # 只建待激活账号，密码预置为初始密码
    try:
        u = db.create_user(conn, code, db.INITIAL_PASSWORD, expires_at, pending=True)
    except sqlite3.IntegrityError:      # 并发下同编号抢先插入
        return _err("账号已存在", 409)
    _audit(request, p, "user.create", u.code, {"expires_at": expires_at})
    return {"ok": True, "code": u.code}

@router.get("/users")
async def list_users(request: Request, p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    return {"users": [
        {"code": u.code, "status": u.status, "expires_at": u.expires_at, "created_at": u.created_at,
         "activated": u.first_activated_at is not None,
         "first_activated_at": u.first_activated_at,
         "phone": db.mask_phone(u.phone),
         "onboarded": u.onboarded_at is not None}
        for u in db.list_users(conn)
    ]}

@router.post("/users/{code}/activate")
async def activate_user(code: str, request: Request, p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    res = db.activate_user(conn, code, int(time.time()))
    if res == "not_found":
        return _not_found()
    if res == "already":
        return _err("账号已激活", 409)
    _audit(request, p, "user.activate", code.upper(), {})
    return {"ok": True}

@router.post("/users/{code}/reset-password")
async def reset_password(code: str, request: Request, p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    res = db.reset_user_password(conn, code)
    if res == "not_found":
        return _not_found()
    if res == "pending":
        return _err("账号未激活", 409)
    _audit(request, p, "user.reset_password", code.upper(), {})
    return {"ok": True}

@router.patch("/users/{code}")
async def patch_user(code: str, request: Request, payload: dict = Body(...),
                     p: Principal = STAFF_ONLY):
    rejected = _password_rejected(payload)
    if rejected is not None:
        return rejected
    conn = request.app.state.db_conn
    u = db.get_user_by_code(conn, code)
    if not u:
        return _not_found()
    # 先校验再落库：任何一项非法都不产生部分修改
    kwargs = {}
    if "status" in payload:
        status = payload["status"]
        if not isinstance(status, str) or status not in ALLOWED_STATUS:
            return _err("状态取值无效", 400)
        kwargs["status"] = status
    if "expires_at" in payload:
        exp = payload["expires_at"]
        if not _valid_expires(exp):
            return _err("到期时间无效", 400)
        kwargs["expires_at"] = exp
    # 状态/到期更新与审计同一事务；暂停/封禁不删会话，由 gate 按状态逐请求拒绝
    if kwargs:
        db.apply_user_changes(conn, u, actor_type=p.actor_type, actor=p.username,
                              now=int(time.time()), **kwargs)
    return {"ok": True}

@router.delete("/users/{code}")
async def delete_user(code: str, request: Request, p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    if not db.delete_user(conn, code):
        return _not_found()
    _audit(request, p, "user.delete", code.upper(), {})
    return {"ok": True}

@router.get("/audit-logs")
async def audit_logs(request: Request, p: Principal = STAFF_ONLY):
    q = request.query_params
    try:
        limit = int(q.get("limit", 50))
        offset = int(q.get("offset", 0))
    except ValueError:
        return _err("参数无效", 400)
    if not 0 <= offset <= MAX_INT:      # 负数/超出 SQLite 整数范围（会 OverflowError）一律 400
        return _err("参数无效", 400)
    limit = max(1, min(limit, 200))
    target = q.get("target")
    target = target.strip().upper() if target and target.strip() else None
    rows, total = db.list_audit(request.app.state.db_conn, limit, offset, target)
    return {"logs": rows, "total": total}

@router.post("/login")
async def admin_login(request: Request, response: Response, payload: dict = Body(...)):
    conn = request.app.state.db_conn
    settings = request.app.state.settings
    username = payload.get("username", "")
    password = payload.get("password", "")
    if not isinstance(username, str) or not isinstance(password, str):
        return JSONResponse({"ok": False}, status_code=401)
    admin = admin_auth.authenticate(conn, username, password)
    if not admin:
        return JSONResponse({"ok": False}, status_code=401)
    # 密码正确后才区分代理资格：暂停/取消的代理不能登录后台
    blocked = admin_auth.agent_login_problem(conn, admin)
    if blocked:
        return JSONResponse({"ok": False, "error": blocked}, status_code=403)
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
    p = admin_auth.principal_for_admin(conn, admin) if admin else None
    if p is None:       # 未登录，或代理资格已暂停/取消（已有会话同样失效）
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    agent = db_agents.get_agent(conn, p.agent_id) if p.agent_id is not None else None
    return {"username": p.username, "role": p.role,
            "grants": db.list_active_grants(conn, p.admin_id),
            "agent": db_agents.agent_to_dict(agent) if agent else None}
```

- [ ] **Step 8: 数据源路由改用依赖（`backend/app/routes/admin_datasources.py`）**

- `from fastapi import APIRouter, Request, Body` 改为 `from fastapi import APIRouter, Request, Body, Depends`。
- 在 `router = APIRouter()` 之后加：

```python
# 数据源只对后台人员开放（代理不可见）
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))
```

- 删除 `_forbidden()` 函数，以及 6 个端点里的两行 `if not admin_auth.cookie_or_key_ok(request):` / `return _forbidden()`。
- 6 个端点签名依次改为：

```python
async def list_sources(request: Request, _p=STAFF_ONLY):
async def create_source(request: Request, payload: dict = Body(...), _p=STAFF_ONLY):
async def update_source(source_id: int, request: Request, payload: dict = Body(...), _p=STAFF_ONLY):
async def toggle_source(source_id: int, request: Request, payload: dict = Body(...), _p=STAFF_ONLY):
async def delete_source(source_id: int, request: Request, _p=STAFF_ONLY):
async def latest_draws(source_id: int, request: Request, code: str = "", rows: int = 20,
                       _p=STAFF_ONLY):
```

确认 `grep -rn "cookie_or_key_ok\|actor_of\|_check(" backend/app` 无输出。

- [ ] **Step 9: `manage.py set-super`**

在 `sub.add_parser("list")` 之前加：

```python
    ss = sub.add_parser("set-super"); ss.add_argument("username")
```

在 `elif args.cmd == "list":` 之前加：

```python
    elif args.cmd == "set-super":
        res = db.set_super(conn, args.username)
        if res != "ok":
            print({"not_found": "not found", "is_agent": "agent cannot be super"}[res])
            return 1
        print(f"super set: {args.username}")
```

- [ ] **Step 10: 文档（部署后必须执行 set-super）**

`backend/README.md`：在「### 管理后台」一节末尾（以「`ADMIN_COOKIE_NAME`（默认 admin_session）。」结尾的那一行之后、`## 多数据源采集` 之前）插入：

````markdown
### 后台角色（最高权限者 / 管理员 / 代理）

- 三类身份统一登录 `/admin/`：最高权限者（全局唯一）、管理员、代理（用户名即代理名称）。
  菜单按角色显示，但**所有 `/admin/*` 接口都在服务端校验角色与数据范围**；`X-Admin-Key` 视为最高权限者。
- 最高权限者只能用服务器命令指定，原最高权限者在同一事务内自动降为管理员；后台界面不能转让：
  ```bash
  .venv/bin/python manage.py set-super <用户名>
  ```
- **升级到本版本后，现有管理员全部是普通管理员。部署后必须执行一次 `set-super`**，
  否则没有人能在后台管理管理员账号与授权（`X-Admin-Key` 仍可调用全部接口）。
- 资格暂停 / 取消的代理不能登录后台（提示「代理资格已暂停/已取消，无法登录」），已登录的会话在下一次请求即失效。
````

`backend/DEPLOY.md`：「## 4. 引导管理员账号」中 `（admin-set 幂等……）` 段落之后插入：

````markdown
指定唯一的最高权限者（**首次部署本版本时必做**；以后要更换最高权限者也用它，原最高权限者自动降为管理员）：
```bash
.venv/bin/python manage.py set-super admin
```
````

`backend/DEPLOY.md`：「## 升级」代码块之后插入：

````markdown
> 从「无角色」旧版本升级（含代理与号段功能）后：现有管理员全部迁移为普通管理员，
> 重启后执行一次 `.venv/bin/python manage.py set-super <用户名>` 指定最高权限者（见第 4 节）。
````

- [ ] **Step 11: 运行测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部通过（基线 324 + 本任务 14 个；现有 `test_admin*.py` 不需改动）。

- [ ] **Step 12: Commit**

```bash
git add backend/app/db.py backend/app/db_agents.py backend/app/admin_auth.py backend/app/main.py \
  backend/app/routes/admin.py backend/app/routes/admin_datasources.py backend/manage.py \
  backend/README.md backend/DEPLOY.md backend/tests/agent_helpers.py backend/tests/test_roles.py
git commit -m "feat(backend): admin roles, unique super and role-guarded admin endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 代理资料（名称唯一与保留、级别/上级、资格状态、列表统计）

**Files:**
- Modify: `backend/app/db_agents.py`（整文件替换为下方内容，包含 Task 1 的读取部分）
- Create: `backend/app/routes/admin_agents.py`
- Modify: `backend/app/main.py`（挂路由）
- Test: `backend/tests/test_agents.py`（新建）

**Interfaces:**
- Consumes: Task 1 的 `db_agents.Agent/get_agent/get_agent_by_admin_id/agent_to_dict`、`admin_auth.require_role/STAFF/ALL_ROLES/Principal`、`db._audit_nocommit`、`security.hash_password`、测试工具 `tests/agent_helpers.py`。
- Produces（`app/db_agents.py`）:
  - 常量 `REGIONS`、`TIERS`、`AGENT_STATUSES`、`STATUS_TRANSITIONS`、`NAME_RESERVE_SEC = 365*86400`、`NAME_TAKEN = "该名称已被使用"`。
  - `class BizError(Exception)`：属性 `msg: str`、`status: int`（默认 400）——后续 `db_staff`、`db_segments` 与全部新路由复用。
  - `begin_write(conn) -> None`（commit 遗留事务后 `BEGIN IMMEDIATE`，供其他数据模块复用）。
  - `name_key(name) -> str`、`normalize_name(raw) -> str`、`check_password(pw) -> str`、`ensure_name_available(conn, key, now, self_agent_id: int|None) -> None`（须在写事务内调用；保留期已过的已取消代理会被释放名称）。
  - `create_agent(conn, *, name, password, region, tier, parent_agent_id, actor_type, actor, now) -> Agent`
  - `update_agent(conn, agent_id, *, actor_type, actor, now, region=_UNSET, tier=_UNSET, parent_agent_id=_UNSET) -> Agent`
  - `set_agent_status(conn, agent_id, status, reason, *, actor_type, actor, now) -> Agent`
  - `set_agent_password(conn, agent_id, password, *, actor_type, actor, now) -> None`
  - `list_agents(conn, *, parent_id: int|None = None) -> list[dict]`：`agent_to_dict` + `parent_name, total, activated, unactivated, children`。
  - 审计动作：`agent.create`、`agent.update`（detail 为各字段 `{"from","to"}`）、`agent.status`（`{"from","to","reason"}`）、`agent.password`；target 为代理名称。
- Produces（HTTP）: `GET /admin/agents`、`POST /admin/agents`、`PATCH /admin/agents/{agent_id}`、`POST /admin/agents/{agent_id}/status`、`POST /admin/agents/{agent_id}/password`（见接口总览）。路由模块内 `STAFF_ONLY`、`ANY_ROLE`、`_err(e: BizError)` 供 Task 3 追加改名路由使用。

- [ ] **Step 1: 写失败测试 `backend/tests/test_agents.py`**

```python
import pytest
from fastapi.testclient import TestClient
from app import db, db_agents
from app.db_agents import BizError, NAME_RESERVE_SEC
from tests.agent_helpers import (audit, build_app, key_client, login_client, mk_admin,
                                 mk_agent_raw)

NOW = 1_800_000_000

def new_agent(conn, name, *, tier="senior", parent=None, region="city", now=NOW):
    return db_agents.create_agent(conn, name=name, password="Passw0rd!", region=region, tier=tier,
                                  parent_agent_id=parent, actor_type="admin", actor="root", now=now)

def status(conn, agent_id, to, reason="测试", now=NOW):
    return db_agents.set_agent_status(conn, agent_id, to, reason, actor_type="admin",
                                      actor="root", now=now)

def biz(fn, *a, **k) -> BizError:
    with pytest.raises(BizError) as ei:
        fn(*a, **k)
    return ei.value

# ---------------- 新建与名称 ----------------

def test_create_agent_creates_login_identity_and_audits():
    conn, app = build_app()
    a = new_agent(conn, "  华东一号 ", region="province")
    assert a.name == "华东一号" and a.name_key == "华东一号" and a.status == "active"
    adm = db.get_admin_by_id(conn, a.admin_id)
    assert adm.username == "华东一号" and adm.role == "agent"
    e = audit(conn, "agent.create")[0]
    assert e["target"] == "华东一号" and e["detail"] == {"region": "province", "tier": "senior",
                                                       "parent_agent_id": None}
    assert login_client(app, "华东一号", "Passw0rd!").get("/admin/me").json()["role"] == "agent"

@pytest.mark.parametrize("bad,msg", [("", "名称需为 1–20 个字符"), ("   ", "名称需为 1–20 个字符"),
                                     ("x" * 21, "名称需为 1–20 个字符"), (5, "名称需为 1–20 个字符"),
                                     ("a#b", "名称不能包含 #")])
def test_name_format(bad, msg):
    conn, _ = build_app()
    assert biz(new_agent, conn, bad).msg == msg

def test_name_unique_case_insensitive_and_vs_staff_usernames():
    conn, _ = build_app()
    new_agent(conn, "Alpha")
    e = biz(new_agent, conn, " alpha ")
    assert e.msg == "该名称已被使用" and e.status == 409
    mk_admin(conn, "Boss")
    assert biz(new_agent, conn, "BOSS").msg == "该名称已被使用"

def test_create_validates_region_tier_password():
    conn, _ = build_app()
    assert biz(db_agents.create_agent, conn, name="a", password="Passw0rd!", region="mars",
               tier="senior", parent_agent_id=None, actor_type="admin", actor="r", now=NOW).msg == "地区标签无效"
    assert biz(db_agents.create_agent, conn, name="a", password="Passw0rd!", region="city",
               tier="boss", parent_agent_id=None, actor_type="admin", actor="r", now=NOW).msg == "级别无效"
    assert biz(db_agents.create_agent, conn, name="a", password="short", region="city",
               tier="senior", parent_agent_id=None, actor_type="admin", actor="r", now=NOW).msg == "密码长度需为 8–64 位"
    assert conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM admins").fetchone()[0] == 0

# ---------------- 上级与级别 ----------------

def test_parent_rules():
    conn, _ = build_app()
    top = new_agent(conn, "top")
    junior = new_agent(conn, "jr", tier="junior", parent=top.id)
    assert biz(new_agent, conn, "x1", parent=999).msg == "上级代理不存在"
    assert biz(new_agent, conn, "x2", parent=junior.id).msg == "上级必须是高级代理"
    status(conn, top.id, "paused")
    assert biz(new_agent, conn, "x3", parent=top.id).msg == "上级代理资格不是激活状态"

def test_parent_cannot_be_self_or_descendant():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    b = new_agent(conn, "b", parent=a.id)
    c = new_agent(conn, "c", parent=b.id)
    upd = lambda aid, pid: db_agents.update_agent(conn, aid, actor_type="admin", actor="r",
                                                 now=NOW, parent_agent_id=pid)
    assert biz(upd, a.id, a.id).msg == "上级不能是自己"
    assert biz(upd, a.id, c.id).msg == "不能把自己的下级设为上级"
    assert biz(upd, a.id, b.id).msg == "不能把自己的下级设为上级"
    assert upd(c.id, a.id).parent_agent_id == a.id          # 合法改挂
    assert upd(c.id, None).parent_agent_id is None          # 解除上级

def test_senior_to_junior_blocked_while_has_children():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    b = new_agent(conn, "b", parent=a.id)
    e = biz(db_agents.update_agent, conn, a.id, actor_type="admin", actor="r", now=NOW, tier="junior")
    assert e.msg == "该代理仍有下级，不能改为低级代理" and e.status == 409
    db_agents.update_agent(conn, b.id, actor_type="admin", actor="r", now=NOW, parent_agent_id=None)
    assert db_agents.update_agent(conn, a.id, actor_type="admin", actor="r", now=NOW,
                                  tier="junior").tier == "junior"

def test_update_audits_only_changes():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    db_agents.update_agent(conn, a.id, actor_type="admin", actor="r", now=NOW, region="city")
    assert audit(conn, "agent.update") == []
    db_agents.update_agent(conn, a.id, actor_type="admin", actor="r", now=NOW, region="vip")
    assert audit(conn, "agent.update")[0]["detail"] == {"region": {"from": "city", "to": "vip"}}

# ---------------- 资格状态 ----------------

def test_status_requires_reason_and_valid_transition():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    assert biz(status, conn, a.id, "paused", reason="  ").msg == "请填写变更原因"
    assert biz(status, conn, a.id, "paused", reason="x" * 201).msg == "变更原因不能超过200字"
    assert biz(status, conn, a.id, "frozen").msg == "资格状态无效"
    assert biz(status, conn, a.id, "active").msg == "资格状态未变化"
    status(conn, a.id, "cancelled")
    assert biz(status, conn, a.id, "paused").msg == "已取消的代理只能恢复为激活"

def test_status_change_records_who_when_why_and_audits():
    conn, _ = build_app()
    a = new_agent(conn, "a")
    a = db_agents.set_agent_status(conn, a.id, "paused", " 违规 ", actor_type="admin",
                                   actor="boss", now=NOW + 5)
    assert (a.status, a.status_by, a.status_at, a.status_reason) == ("paused", "boss", NOW + 5, "违规")
    assert audit(conn, "agent.status")[0]["detail"] == {"from": "active", "to": "paused",
                                                        "reason": "违规"}

def test_cancel_reserves_name_for_one_year_then_releases():
    conn, app = build_app()
    a = new_agent(conn, "alpha")
    status(conn, a.id, "cancelled", now=NOW)
    r = conn.execute("SELECT * FROM agent_name_reservations WHERE name_key='alpha'").fetchone()
    assert r["agent_id"] == a.id and r["reserved_until"] == NOW + NAME_RESERVE_SEC
    assert biz(new_agent, conn, "ALPHA", now=NOW + NAME_RESERVE_SEC - 1).msg == "该名称已被使用"
    b = new_agent(conn, "ALPHA", now=NOW + NAME_RESERVE_SEC + 1)          # 保留期已过：可被他人使用
    assert b.name == "ALPHA"
    old = db_agents.get_agent(conn, a.id)
    assert old.name_key is None and db.get_admin_by_id(conn, old.admin_id).username == f"alpha#{a.id}"
    e = biz(status, conn, a.id, "active", now=NOW + NAME_RESERVE_SEC + 2)
    assert e.msg == "该代理的名称已被他人使用，不能恢复"

def test_restore_before_recycle_keeps_name_and_drops_reservation():
    conn, _ = build_app()
    a = new_agent(conn, "alpha")
    status(conn, a.id, "cancelled")
    assert status(conn, a.id, "active").status == "active"
    assert conn.execute("SELECT COUNT(*) FROM agent_name_reservations").fetchone()[0] == 0
    assert biz(new_agent, conn, "alpha").msg == "该名称已被使用"     # 名称仍归本人

def test_restore_blocked_after_recycle():
    conn, _ = build_app()
    a = new_agent(conn, "alpha")
    status(conn, a.id, "cancelled")
    conn.execute("UPDATE agents SET recycled_at=? WHERE id=?", (NOW, a.id)); conn.commit()
    assert biz(status, conn, a.id, "active").msg == "该代理已回收，不能恢复"

# ---------------- 路由 ----------------

def test_routes_create_patch_status_password_and_list():
    conn, app = build_app()
    tc = key_client(app)
    r = tc.post("/admin/agents", json={"name": "top", "password": "Passw0rd!", "region": "city",
                                        "tier": "senior"})
    assert r.status_code == 200 and r.json()["agent"]["name"] == "top"
    top = r.json()["agent"]["id"]
    r = tc.post("/admin/agents", json={"name": "kid", "password": "Passw0rd!", "region": "vip",
                                        "tier": "junior", "parent_agent_id": top})
    kid = r.json()["agent"]["id"]
    r = tc.post("/admin/agents", json={"name": "TOP", "password": "Passw0rd!", "region": "city",
                                        "tier": "senior"})
    assert r.status_code == 409 and r.json() == {"ok": False, "error": "该名称已被使用"}
    assert tc.patch(f"/admin/agents/{kid}", json={"region": "province"}).json()["agent"]["region"] == "province"
    r = tc.patch(f"/admin/agents/{kid}", json={"name": "x"})
    assert r.status_code == 400 and r.json()["error"] == "改名请使用「改名」功能"
    r = tc.patch(f"/admin/agents/{kid}", json={"parent_agent_id": True})
    assert r.status_code == 400
    assert tc.patch("/admin/agents/999", json={"region": "vip"}).status_code == 404
    r = tc.post(f"/admin/agents/{kid}/status", json={"status": "paused"})
    assert r.status_code == 400 and r.json()["error"] == "请填写变更原因"
    assert tc.post(f"/admin/agents/{kid}/status",
                   json={"status": "paused", "reason": "x"}).json()["agent"]["status"] == "paused"
    assert tc.post(f"/admin/agents/{top}/password", json={"password": "NewPassw0rd"}).json() == {"ok": True}
    login_client(app, "top", "NewPassw0rd")
    agents = {a["name"]: a for a in tc.get("/admin/agents").json()["agents"]}
    assert agents["kid"]["parent_name"] == "top" and agents["top"]["children"] == 1
    assert agents["top"]["total"] == 0 and agents["top"]["unactivated"] == 0

def test_list_stats_count_owned_accounts():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag1")
    for code, activated in (("1000001", False), ("1000002", True), ("1000003", True)):
        u = db.create_user(conn, code, "pw", None, pending=not activated)
        conn.execute("UPDATE users SET agent_id=? WHERE id=?", (aid, u.id))
    conn.commit()
    a = key_client(app).get("/admin/agents").json()["agents"][0]
    assert (a["total"], a["activated"], a["unactivated"]) == (3, 2, 1)

def test_agent_sees_only_direct_children_and_cannot_mutate():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me")
    mk_agent_raw(conn, "kid", tier="junior", parent=me)
    mk_agent_raw(conn, "other")
    tc = login_client(app, "me")
    assert [a["name"] for a in tc.get("/admin/agents").json()["agents"]] == ["kid"]
    r = tc.post("/admin/agents", json={"name": "z", "password": "Passw0rd!", "region": "city",
                                        "tier": "senior"})
    assert r.status_code == 403 and r.json() == {"error": "forbidden"}
    assert tc.patch(f"/admin/agents/{me}", json={"region": "vip"}).status_code == 403
    assert tc.post(f"/admin/agents/{me}/status", json={"status": "paused", "reason": "x"}).status_code == 403
    assert TestClient(app).get("/admin/agents").status_code == 403

def test_paused_agent_login_blocked_end_to_end():
    conn, app = build_app()
    tc = key_client(app)
    aid = tc.post("/admin/agents", json={"name": "ag", "password": "Passw0rd!", "region": "city",
                                          "tier": "junior"}).json()["agent"]["id"]
    agent_tc = login_client(app, "ag", "Passw0rd!")
    tc.post(f"/admin/agents/{aid}/status", json={"status": "paused", "reason": "x"})
    assert agent_tc.get("/admin/agents").status_code == 403          # 已有会话被逐请求拒绝
    r = TestClient(app).post("/admin/login", json={"username": "ag", "password": "Passw0rd!"})
    assert r.status_code == 403 and r.json()["error"] == "代理资格已暂停，无法登录"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_agents.py`
Expected: FAIL（`ImportError: cannot import name 'BizError' from 'app.db_agents'`）。

- [ ] **Step 3: 实现数据层（`backend/app/db_agents.py` 整文件替换）**

```python
# 代理资料（子项目 B）：数据层。表结构在 db.init_db 中统一创建。
import sqlite3
from dataclasses import dataclass, asdict, fields
from . import db
from .security import hash_password

REGIONS = ("province", "city", "vip")
TIERS = ("senior", "junior")
AGENT_STATUSES = ("active", "paused", "cancelled")
# 允许的资格变更；已取消只能恢复为激活（且须未回收）
STATUS_TRANSITIONS = {("active", "paused"), ("paused", "active"), ("active", "cancelled"),
                      ("paused", "cancelled"), ("cancelled", "active")}
NAME_RESERVE_SEC = 365 * 86400       # 改名 / 取消资格后旧名保留一年
NAME_MAX = 20
REASON_MAX = 200
NAME_TAKEN = "该名称已被使用"
_UNSET = object()

class BizError(Exception):
    """业务校验失败：msg 为中文提示，status 为 HTTP 状态码。数据层抛出，路由层转成 {"ok":false,"error":msg}。"""
    def __init__(self, msg: str, status: int = 400):
        super().__init__(msg)
        self.msg = msg
        self.status = status

@dataclass
class Agent:
    id: int
    admin_id: int             # 登录身份：admins.id（role='agent'）
    name: str
    name_key: str | None      # 规范化名称（去首尾空格 + casefold）；名称被他人认领后为 None
    region: str               # province | city | vip
    tier: str                 # senior 高级 | junior 低级
    parent_agent_id: int | None
    status: str               # active 激活 | paused 暂停 | cancelled 取消
    status_by: str | None
    status_at: int | None
    status_reason: str | None
    created_at: int
    recycled_at: int | None   # 资格取消后执行回收的时间；回收后不可再恢复

_AGENT_FIELDS = tuple(f.name for f in fields(Agent))

def _row_to_agent(r: sqlite3.Row) -> Agent:
    # 只取 agents 表列：联表查询多出的列（parent_name、统计）忽略
    return Agent(**{k: r[k] for k in _AGENT_FIELDS})

def get_agent(conn, agent_id: int) -> Agent | None:
    r = conn.execute("SELECT * FROM agents WHERE id=?", (agent_id,)).fetchone()
    return _row_to_agent(r) if r else None

def get_agent_by_admin_id(conn, admin_id: int) -> Agent | None:
    r = conn.execute("SELECT * FROM agents WHERE admin_id=?", (admin_id,)).fetchone()
    return _row_to_agent(r) if r else None

def agent_to_dict(a: Agent) -> dict:
    d = asdict(a)
    del d["admin_id"], d["name_key"]
    return d

# ---------------- 名称 ----------------

def name_key(name: str) -> str:
    return name.strip().casefold()

def normalize_name(raw) -> str:
    """去首尾空格后 1–20 个字符；不得含 #（# 用于被释放名称的旧登录名，见 _release_name）。"""
    if not isinstance(raw, str) or not 1 <= len(raw.strip()) <= NAME_MAX:
        raise BizError("名称需为 1–20 个字符")
    name = raw.strip()
    if "#" in name:
        raise BizError("名称不能包含 #")
    return name

def check_password(pw) -> str:
    if not isinstance(pw, str) or not 8 <= len(pw) <= 64:
        raise BizError("密码长度需为 8–64 位")
    return pw

def _release_name(conn, holder: sqlite3.Row) -> None:
    """已取消且保留期已过的代理：让出名称。其登录名改为「名称#id」，之后不能再恢复资格。"""
    conn.execute("UPDATE agents SET name_key=NULL WHERE id=?", (holder["id"],))
    conn.execute("UPDATE admins SET username=? WHERE id=?",
                 (f"{holder['name']}#{holder['id']}", holder["admin_id"]))
    conn.execute("DELETE FROM agent_name_reservations WHERE name_key=?", (holder["name_key"],))

def ensure_name_available(conn, key: str, now: int, self_agent_id: int | None) -> None:
    """名称全局唯一（不区分大小写）：与后台人员用户名、在用代理名称、保留期内旧名冲突 → 409。
    self_agent_id 为改名的代理本人（本人当前名 / 本人保留中的旧名不算冲突）；新建时为 None。
    须在调用方的写事务内执行。"""
    for r in conn.execute("SELECT username FROM admins WHERE role!='agent'"):
        if name_key(r["username"]) == key:
            raise BizError(NAME_TAKEN, 409)
    r = conn.execute("SELECT agent_id FROM agent_name_reservations WHERE name_key=? AND reserved_until>?",
                     (key, now)).fetchone()
    if r is not None and r["agent_id"] != self_agent_id:
        raise BizError(NAME_TAKEN, 409)
    holder = conn.execute("SELECT * FROM agents WHERE name_key=?", (key,)).fetchone()
    if holder is None or holder["id"] == self_agent_id:
        return
    if holder["status"] != "cancelled":
        raise BizError(NAME_TAKEN, 409)
    _release_name(conn, holder)      # 已取消且保留期已过（否则上面的保留检查已拦下）

def begin_write(conn) -> None:
    conn.commit()                    # 确保没有遗留的隐式事务
    conn.execute("BEGIN IMMEDIATE")

# ---------------- 级别 / 上级 ----------------

def _check_parent(conn, self_id: int | None, parent_id: int) -> None:
    """上级必须是资格激活的高级代理，不能是自己或自己的下级（禁止成环）。"""
    p = get_agent(conn, parent_id)
    if p is None:
        raise BizError("上级代理不存在")
    if p.id == self_id:
        raise BizError("上级不能是自己")
    if p.tier != "senior":
        raise BizError("上级必须是高级代理")
    if p.status != "active":
        raise BizError("上级代理资格不是激活状态")
    cur, hops = p.parent_agent_id, 0
    while cur is not None and hops < 10000:          # hops 只防脏数据死循环
        if cur == self_id:
            raise BizError("不能把自己的下级设为上级")
        nxt = conn.execute("SELECT parent_agent_id FROM agents WHERE id=?", (cur,)).fetchone()
        cur, hops = (nxt["parent_agent_id"] if nxt else None), hops + 1

def _count_children(conn, agent_id: int) -> int:
    return conn.execute("SELECT COUNT(*) FROM agents WHERE parent_agent_id=?", (agent_id,)).fetchone()[0]

# ---------------- 增改 ----------------

def create_agent(conn, *, name, password, region, tier, parent_agent_id, actor_type: str,
                 actor: str, now: int) -> Agent:
    name = normalize_name(name)
    check_password(password)
    if region not in REGIONS:
        raise BizError("地区标签无效")
    if tier not in TIERS:
        raise BizError("级别无效")
    h, salt = hash_password(password)     # PBKDF2 放在写锁外
    begin_write(conn)
    try:
        key = name_key(name)
        ensure_name_available(conn, key, now, None)
        if parent_agent_id is not None:
            _check_parent(conn, None, parent_agent_id)
        cur = conn.execute("INSERT INTO admins(username,password_hash,salt,created_at,role)"
                           " VALUES(?,?,?,?,'agent')", (name, h, salt, now))
        cur = conn.execute(
            "INSERT INTO agents(admin_id,name,name_key,region,tier,parent_agent_id,status,created_at)"
            " VALUES(?,?,?,?,?,?,'active',?)",
            (cur.lastrowid, name, key, region, tier, parent_agent_id, now))
        agent_id = cur.lastrowid
        db._audit_nocommit(conn, actor_type, actor, "agent.create", name,
                           {"region": region, "tier": tier, "parent_agent_id": parent_agent_id}, now)
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise BizError(NAME_TAKEN, 409)
    except Exception:
        conn.rollback()
        raise
    return get_agent(conn, agent_id)

def update_agent(conn, agent_id: int, *, actor_type: str, actor: str, now: int,
                 region=_UNSET, tier=_UNSET, parent_agent_id=_UNSET) -> Agent:
    """改地区标签 / 级别 / 上级（parent_agent_id=None 表示解除上级）。只审计真实变化的字段。"""
    if region is not _UNSET and region not in REGIONS:
        raise BizError("地区标签无效")
    if tier is not _UNSET and tier not in TIERS:
        raise BizError("级别无效")
    begin_write(conn)
    try:
        a = get_agent(conn, agent_id)
        if a is None:
            raise BizError("代理不存在", 404)
        diff = {}
        if region is not _UNSET and region != a.region:
            diff["region"] = {"from": a.region, "to": region}
        if tier is not _UNSET and tier != a.tier:
            if tier == "junior" and _count_children(conn, a.id) > 0:
                raise BizError("该代理仍有下级，不能改为低级代理", 409)
            diff["tier"] = {"from": a.tier, "to": tier}
        if parent_agent_id is not _UNSET and parent_agent_id != a.parent_agent_id:
            if parent_agent_id is not None:
                _check_parent(conn, a.id, parent_agent_id)
            diff["parent_agent_id"] = {"from": a.parent_agent_id, "to": parent_agent_id}
        for field, d in diff.items():          # field 只来自上面三个固定列名
            conn.execute(f"UPDATE agents SET {field}=? WHERE id=?", (d["to"], a.id))
        if diff:
            db._audit_nocommit(conn, actor_type, actor, "agent.update", a.name, diff, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return get_agent(conn, agent_id)

def set_agent_status(conn, agent_id: int, status, reason, *, actor_type: str, actor: str,
                     now: int) -> Agent:
    """资格变更（原因必填）。取消：当前名称进入一年保留期；恢复：删除本人当前名称的保留。"""
    if status not in AGENT_STATUSES:
        raise BizError("资格状态无效")
    if not isinstance(reason, str) or not reason.strip():
        raise BizError("请填写变更原因")
    reason = reason.strip()
    if len(reason) > REASON_MAX:
        raise BizError("变更原因不能超过200字")
    begin_write(conn)
    try:
        a = get_agent(conn, agent_id)
        if a is None:
            raise BizError("代理不存在", 404)
        if status == a.status:
            raise BizError("资格状态未变化", 409)
        if (a.status, status) not in STATUS_TRANSITIONS:
            raise BizError("已取消的代理只能恢复为激活", 409)
        if a.status == "cancelled":
            if a.recycled_at is not None:
                raise BizError("该代理已回收，不能恢复", 409)
            if a.name_key is None:
                raise BizError("该代理的名称已被他人使用，不能恢复", 409)
            conn.execute("DELETE FROM agent_name_reservations WHERE name_key=? AND agent_id=?",
                         (a.name_key, a.id))
        if status == "cancelled":
            conn.execute("INSERT OR REPLACE INTO agent_name_reservations(name_key,agent_id,reserved_until)"
                         " VALUES(?,?,?)", (a.name_key, a.id, now + NAME_RESERVE_SEC))
        conn.execute("UPDATE agents SET status=?, status_by=?, status_at=?, status_reason=? WHERE id=?",
                     (status, actor, now, reason, a.id))
        db._audit_nocommit(conn, actor_type, actor, "agent.status", a.name,
                           {"from": a.status, "to": status, "reason": reason}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return get_agent(conn, agent_id)

def set_agent_password(conn, agent_id: int, password, *, actor_type: str, actor: str,
                       now: int) -> None:
    """后台人员重置代理登录密码；同时清掉该代理的后台会话。"""
    check_password(password)
    a = get_agent(conn, agent_id)
    if a is None:
        raise BizError("代理不存在", 404)
    h, salt = hash_password(password)
    try:
        conn.execute("UPDATE admins SET password_hash=?, salt=? WHERE id=?", (h, salt, a.admin_id))
        conn.execute("DELETE FROM admin_sessions WHERE admin_id=?", (a.admin_id,))
        db._audit_nocommit(conn, actor_type, actor, "agent.password", a.name, {}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

# ---------------- 列表与统计 ----------------

def list_agents(conn, *, parent_id: int | None = None) -> list[dict]:
    """代理列表 + 统计（总配额=名下账号数、已激活、未激活=总配额−已激活、下级数）。
    parent_id 不为 None 时只列该代理的直属下级。"""
    sql = ("SELECT a.*, p.name AS parent_name, COALESCE(s.total,0) AS total,"
           " COALESCE(s.activated,0) AS activated,"
           " (SELECT COUNT(*) FROM agents c WHERE c.parent_agent_id=a.id) AS children"
           " FROM agents a LEFT JOIN agents p ON p.id=a.parent_agent_id"
           " LEFT JOIN (SELECT agent_id, COUNT(*) AS total,"
           "            SUM(first_activated_at IS NOT NULL) AS activated"
           "            FROM users WHERE agent_id IS NOT NULL GROUP BY agent_id) s ON s.agent_id=a.id")
    args = []
    if parent_id is not None:
        sql += " WHERE a.parent_agent_id=?"
        args.append(parent_id)
    out = []
    for r in conn.execute(sql + " ORDER BY a.id", args).fetchall():
        d = agent_to_dict(_row_to_agent(r))
        d.update(parent_name=r["parent_name"], total=r["total"], activated=r["activated"],
                 unactivated=r["total"] - r["activated"], children=r["children"])
        out.append(d)
    return out
```

- [ ] **Step 4: 路由 `backend/app/routes/admin_agents.py`**

```python
# 管理后台：代理资料（新建、改地区/级别/上级、资格状态、重置密码、列表与统计）。
import time
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import admin_auth, db_agents
from ..admin_auth import Principal
from ..db_agents import BizError

router = APIRouter()
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))
ANY_ROLE = Depends(admin_auth.require_role(*admin_auth.ALL_ROLES))

def _err(e: BizError):
    return JSONResponse({"ok": False, "error": e.msg}, status_code=e.status)

def _is_id_or_none(v) -> bool:
    return v is None or (isinstance(v, int) and not isinstance(v, bool))

@router.get("/agents")
async def list_agents(request: Request, p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    if p.role == "agent":          # 代理只看到自己的直属下级（划拨对象）
        return {"agents": db_agents.list_agents(conn, parent_id=p.agent_id)}
    return {"agents": db_agents.list_agents(conn)}

@router.post("/agents")
async def create_agent(request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    parent = payload.get("parent_agent_id")
    if not _is_id_or_none(parent):
        return _err(BizError("上级代理不存在"))
    try:
        a = db_agents.create_agent(
            request.app.state.db_conn, name=payload.get("name"), password=payload.get("password"),
            region=payload.get("region"), tier=payload.get("tier"), parent_agent_id=parent,
            actor_type=p.actor_type, actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "agent": db_agents.agent_to_dict(a)}

@router.patch("/agents/{agent_id}")
async def update_agent(agent_id: int, request: Request, payload: dict = Body(...),
                       p: Principal = STAFF_ONLY):
    if "name" in payload:
        return _err(BizError("改名请使用「改名」功能"))
    if "status" in payload:
        return _err(BizError("资格变更请使用「资格状态」功能"))
    kwargs = {k: payload[k] for k in ("region", "tier", "parent_agent_id") if k in payload}
    if "parent_agent_id" in kwargs and not _is_id_or_none(kwargs["parent_agent_id"]):
        return _err(BizError("上级代理不存在"))
    try:
        a = db_agents.update_agent(request.app.state.db_conn, agent_id, actor_type=p.actor_type,
                                   actor=p.username, now=int(time.time()), **kwargs)
    except BizError as e:
        return _err(e)
    return {"ok": True, "agent": db_agents.agent_to_dict(a)}

@router.post("/agents/{agent_id}/status")
async def set_status(agent_id: int, request: Request, payload: dict = Body(...),
                     p: Principal = STAFF_ONLY):
    try:
        a = db_agents.set_agent_status(request.app.state.db_conn, agent_id, payload.get("status"),
                                       payload.get("reason"), actor_type=p.actor_type,
                                       actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "agent": db_agents.agent_to_dict(a)}

@router.post("/agents/{agent_id}/password")
async def set_password(agent_id: int, request: Request, payload: dict = Body(...),
                       p: Principal = STAFF_ONLY):
    try:
        db_agents.set_agent_password(request.app.state.db_conn, agent_id, payload.get("password"),
                                     actor_type=p.actor_type, actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}
```

`backend/app/main.py`：在 `from .routes import admin_datasources as admin_ds_routes` 之后加 `from .routes import admin_agents as admin_agents_routes`；在 `app.include_router(admin_ds_routes.router, prefix="/admin")` 之后加 `app.include_router(admin_agents_routes.router, prefix="/admin")`。

- [ ] **Step 5: 运行测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add backend/app/db_agents.py backend/app/routes/admin_agents.py backend/app/main.py backend/tests/test_agents.py
git commit -m "feat(backend): agent profiles with tier/parent rules, status changes and name reservation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 代理改名授权与管理员管理（仅最高权限者）

**Files:**
- Modify: `backend/app/db_agents.py`（文件末尾追加 `rename_agent`）
- Create: `backend/app/db_staff.py`、`backend/app/routes/admin_staff.py`
- Modify: `backend/app/routes/admin_agents.py`（追加改名路由）、`backend/app/main.py`
- Test: `backend/tests/test_staff.py`（新建）

**Interfaces:**
- Consumes: Task 2 的 `BizError`、`begin_write`、`check_password`、`ensure_name_available`、`name_key`、`normalize_name`、`get_agent`、`NAME_RESERVE_SEC`、`NAME_TAKEN`；Task 1 的 `db.list_active_grants`、`admin_auth.AdminDenied`。
- Produces:
  - `db_agents.rename_agent(conn, agent_id, new_name, *, actor_type, actor, now) -> Agent`（审计 `agent.rename`，detail `{"from","to"}`，target 为新名称）。
  - `db_staff.GRANTS = ("agent.rename",)`；`has_grant(conn, admin_id, grant) -> bool`；`list_admins(conn) -> list[dict]`（`id, username, role, created_at, grants`，仅 super/admin）；`create_staff_admin(conn, username, password, *, actor, now) -> int`；`set_admin_password(conn, admin_id, password, *, actor, now)`；`delete_admin(conn, admin_id, *, actor, now)`；`add_grant(conn, admin_id, grant, *, actor, now)`；`revoke_grant(conn, admin_id, grant, *, actor, now)`；`list_grants(conn) -> list[dict]`。审计动作 `admin.create`、`admin.password`、`admin.delete`、`grant.add`、`grant.revoke`（target 为管理员用户名）。
  - HTTP：`POST /admin/agents/{agent_id}/rename`；`GET/POST /admin/admins`、`POST /admin/admins/{admin_id}/password`、`DELETE /admin/admins/{admin_id}`、`GET/POST /admin/grants`、`DELETE /admin/grants/{admin_id}/{grant}`。

- [ ] **Step 1: 写失败测试 `backend/tests/test_staff.py`**

```python
from fastapi.testclient import TestClient
from app import db, db_agents, db_staff
from app.db_agents import NAME_RESERVE_SEC
from tests.agent_helpers import audit, build_app, key_client, login_client, mk_admin, mk_agent_raw

NOW = 1_800_000_000

# ---------------- 改名 ----------------

def test_super_and_key_can_rename_and_old_name_reserved():
    conn, app = build_app()
    mk_admin(conn, "boss", role="super")
    aid = mk_agent_raw(conn, "alpha")
    r = login_client(app, "boss").post(f"/admin/agents/{aid}/rename", json={"name": "beta"})
    assert r.status_code == 200 and r.json()["agent"]["name"] == "beta"
    assert db.get_admin_by_id(conn, db_agents.get_agent(conn, aid).admin_id).username == "beta"
    login_client(app, "beta")                                  # 登录名随之改变
    e = audit(conn, "agent.rename")[0]
    assert e["actor"] == "boss" and e["detail"] == {"from": "alpha", "to": "beta"}
    tc = key_client(app)
    r = tc.post("/admin/agents", json={"name": "Alpha", "password": "Passw0rd!", "region": "city",
                                        "tier": "junior"})
    assert r.status_code == 409 and r.json()["error"] == "该名称已被使用"
    assert tc.post(f"/admin/agents/{aid}/rename", json={"name": "ALPHA"}).status_code == 200   # 本人改回旧名
    assert conn.execute("SELECT name_key FROM agent_name_reservations").fetchall()[0]["name_key"] == "beta"

def test_case_only_rename_writes_no_reservation():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "alpha")
    assert key_client(app).post(f"/admin/agents/{aid}/rename", json={"name": "Alpha"}).status_code == 200
    assert conn.execute("SELECT COUNT(*) FROM agent_name_reservations").fetchone()[0] == 0
    r = key_client(app).post(f"/admin/agents/{aid}/rename", json={"name": "Alpha"})
    assert r.status_code == 409 and r.json()["error"] == "名称未变化"

def test_rename_reservation_expires_after_one_year():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "alpha")
    db_agents.rename_agent(conn, aid, "beta", actor_type="admin", actor="r", now=NOW)
    other = mk_agent_raw(conn, "other")
    import pytest
    with pytest.raises(db_agents.BizError):
        db_agents.rename_agent(conn, other, "alpha", actor_type="admin", actor="r",
                               now=NOW + NAME_RESERVE_SEC - 1)
    assert db_agents.rename_agent(conn, other, "alpha", actor_type="admin", actor="r",
                                  now=NOW + NAME_RESERVE_SEC + 1).name == "alpha"

def test_cancelled_agent_cannot_be_renamed():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "alpha", status="cancelled")
    r = key_client(app).post(f"/admin/agents/{aid}/rename", json={"name": "beta"})
    assert r.status_code == 409 and r.json()["error"] == "已取消资格的代理不能改名"

def test_admin_needs_grant_to_rename_and_revoke_takes_effect():
    conn, app = build_app()
    adm = mk_admin(conn, "adm")
    aid = mk_agent_raw(conn, "alpha")
    tc = login_client(app, "adm")
    r = tc.post(f"/admin/agents/{aid}/rename", json={"name": "beta"})
    assert r.status_code == 403 and r.json() == {"error": "forbidden"}
    key = key_client(app)
    assert key.post("/admin/grants", json={"admin_id": adm, "grant": "agent.rename"}).json() == {"ok": True}
    assert tc.get("/admin/me").json()["grants"] == ["agent.rename"]
    assert tc.post(f"/admin/agents/{aid}/rename", json={"name": "beta"}).status_code == 200
    assert key.delete(f"/admin/grants/{adm}/agent.rename").json() == {"ok": True}
    assert tc.post(f"/admin/agents/{aid}/rename", json={"name": "gamma"}).status_code == 403
    assert [e["action"] for e in audit(conn, "grant.add") + audit(conn, "grant.revoke")] == [
        "grant.add", "grant.revoke"]

def test_agent_cannot_rename():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "alpha")
    assert login_client(app, "alpha").post(f"/admin/agents/{aid}/rename",
                                           json={"name": "beta"}).status_code == 403

# ---------------- 授权管理 ----------------

def test_only_super_manages_grants_and_no_regrant():
    conn, app = build_app()
    a1 = mk_admin(conn, "a1"); a2 = mk_admin(conn, "a2")
    key_client(app).post("/admin/grants", json={"admin_id": a1, "grant": "agent.rename"})
    tc = login_client(app, "a1")                    # 被授权的管理员也不能转授
    r = tc.post("/admin/grants", json={"admin_id": a2, "grant": "agent.rename"})
    assert r.status_code == 403
    assert tc.get("/admin/grants").status_code == 403
    assert not db_staff.has_grant(conn, a2, "agent.rename")

def test_grant_validation():
    conn, app = build_app()
    a1 = mk_admin(conn, "a1")
    boss = mk_admin(conn, "boss", role="super")
    ag = mk_agent_raw(conn, "ag")
    ag_admin = db_agents.get_agent(conn, ag).admin_id
    tc = key_client(app)
    assert tc.post("/admin/grants", json={"admin_id": a1, "grant": "x.y"}).json()["error"] == "授权项无效"
    assert tc.post("/admin/grants", json={"admin_id": boss, "grant": "agent.rename"}).status_code == 409
    assert tc.post("/admin/grants", json={"admin_id": ag_admin, "grant": "agent.rename"}).status_code == 404
    assert tc.post("/admin/grants", json={"admin_id": "1", "grant": "agent.rename"}).status_code == 404
    tc.post("/admin/grants", json={"admin_id": a1, "grant": "agent.rename"})
    r = tc.post("/admin/grants", json={"admin_id": a1, "grant": "agent.rename"})
    assert r.status_code == 409 and r.json()["error"] == "已授权"
    assert tc.delete(f"/admin/grants/{a1}/agent.rename").status_code == 200
    assert tc.delete(f"/admin/grants/{a1}/agent.rename").status_code == 404
    g = tc.get("/admin/grants").json()["grants"][0]
    assert g["username"] == "a1" and g["revoked_at"] is not None and g["granted_by"] == "admin-key"

# ---------------- 管理员账号 ----------------

def test_super_manages_admin_accounts():
    conn, app = build_app()
    mk_admin(conn, "boss", role="super")
    mk_agent_raw(conn, "ag")
    tc = login_client(app, "boss")
    r = tc.post("/admin/admins", json={"username": "ops1", "password": "Passw0rd!"})
    assert r.status_code == 200
    ops1 = r.json()["id"]
    assert db.get_admin_by_id(conn, ops1).role == "admin"
    assert tc.post("/admin/admins", json={"username": "AG", "password": "Passw0rd!"}).status_code == 409
    assert tc.post("/admin/admins", json={"username": "x", "password": "short"}).status_code == 400
    ops_tc = login_client(app, "ops1", "Passw0rd!")
    assert tc.post(f"/admin/admins/{ops1}/password", json={"password": "NewPassw0rd"}).json() == {"ok": True}
    assert ops_tc.get("/admin/me").status_code == 401                 # 重置密码后旧会话失效
    login_client(app, "ops1", "NewPassw0rd")
    admins = tc.get("/admin/admins").json()["admins"]
    assert [(a["username"], a["role"]) for a in admins] == [("boss", "super"), ("ops1", "admin")]
    boss_id = admins[0]["id"]
    assert tc.post(f"/admin/admins/{boss_id}/password", json={"password": "Passw0rd!"}).status_code == 409
    assert tc.delete(f"/admin/admins/{boss_id}").status_code == 409
    assert tc.delete(f"/admin/admins/{ops1}").json() == {"ok": True}
    assert db.get_admin_by_id(conn, ops1) is None
    assert [e["action"] for e in audit(conn, "admin.create") + audit(conn, "admin.password")
            + audit(conn, "admin.delete")] == ["admin.create", "admin.password", "admin.delete"]

def test_admin_cannot_manage_admins():
    conn, app = build_app()
    mk_admin(conn, "adm")
    tc = login_client(app, "adm")
    assert tc.get("/admin/admins").status_code == 403
    assert tc.post("/admin/admins", json={"username": "x", "password": "Passw0rd!"}).status_code == 403
    assert TestClient(app).get("/admin/admins").status_code == 403
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_staff.py`
Expected: FAIL（`ImportError: cannot import name 'db_staff' from 'app'`）。

- [ ] **Step 3: 改名（追加到 `backend/app/db_agents.py` 末尾）**

```python
# ---------------- 改名 ----------------

def rename_agent(conn, agent_id: int, new_name, *, actor_type: str, actor: str, now: int) -> Agent:
    """改名：旧名进入一年保留期（仅大小写变化时规范化名称不变，不写保留）；登录名同步改为新名。
    改回本人保留期内的旧名允许，并解除该保留。已取消资格的代理不能改名。"""
    new_name = normalize_name(new_name)
    key = name_key(new_name)
    begin_write(conn)
    try:
        a = get_agent(conn, agent_id)
        if a is None:
            raise BizError("代理不存在", 404)
        if a.status == "cancelled":
            raise BizError("已取消资格的代理不能改名", 409)
        if new_name == a.name:
            raise BizError("名称未变化", 409)
        if key != a.name_key:
            ensure_name_available(conn, key, now, a.id)
            conn.execute("DELETE FROM agent_name_reservations WHERE name_key=? AND agent_id=?",
                         (key, a.id))
            conn.execute("INSERT OR REPLACE INTO agent_name_reservations(name_key,agent_id,reserved_until)"
                         " VALUES(?,?,?)", (a.name_key, a.id, now + NAME_RESERVE_SEC))
        conn.execute("UPDATE agents SET name=?, name_key=? WHERE id=?", (new_name, key, a.id))
        conn.execute("UPDATE admins SET username=? WHERE id=?", (new_name, a.admin_id))
        db._audit_nocommit(conn, actor_type, actor, "agent.rename", new_name,
                           {"from": a.name, "to": new_name}, now)
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise BizError(NAME_TAKEN, 409)
    except Exception:
        conn.rollback()
        raise
    return get_agent(conn, agent_id)
```

- [ ] **Step 4: 管理员与授权数据层 `backend/app/db_staff.py`**

```python
# 后台人员管理（最高权限者专用）：管理员账号增删、重置密码；授权（本期只有 agent.rename）。
from . import db
from .db_agents import BizError, begin_write, check_password, ensure_name_available, name_key, normalize_name
from .security import hash_password

GRANTS = ("agent.rename",)

def _staff_admin(conn, admin_id: int):
    """取目标管理员；只有 role='admin' 可被管理（最高权限者 / 代理不在此处管理）。"""
    a = db.get_admin_by_id(conn, admin_id)
    if a is None or a.role == "agent":
        raise BizError("管理员不存在", 404)
    if a.role != "admin":
        raise BizError("不能在后台修改最高权限者", 409)
    return a

def has_grant(conn, admin_id: int | None, grant: str) -> bool:
    return grant in db.list_active_grants(conn, admin_id)

def list_admins(conn) -> list[dict]:
    rows = conn.execute("SELECT id, username, role, created_at FROM admins"
                        " WHERE role IN ('super','admin') ORDER BY id").fetchall()
    return [dict(id=r["id"], username=r["username"], role=r["role"], created_at=r["created_at"],
                 grants=db.list_active_grants(conn, r["id"])) for r in rows]

def create_staff_admin(conn, username, password, *, actor: str, now: int) -> int:
    username = normalize_name(username)
    check_password(password)
    h, salt = hash_password(password)
    begin_write(conn)
    try:
        ensure_name_available(conn, name_key(username), now, None)
        cur = conn.execute("INSERT INTO admins(username,password_hash,salt,created_at,role)"
                           " VALUES(?,?,?,?,'admin')", (username, h, salt, now))
        db._audit_nocommit(conn, "admin", actor, "admin.create", username, {}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return cur.lastrowid

def set_admin_password(conn, admin_id: int, password, *, actor: str, now: int) -> None:
    check_password(password)
    a = _staff_admin(conn, admin_id)
    h, salt = hash_password(password)
    try:
        conn.execute("UPDATE admins SET password_hash=?, salt=? WHERE id=?", (h, salt, a.id))
        conn.execute("DELETE FROM admin_sessions WHERE admin_id=?", (a.id,))
        db._audit_nocommit(conn, "admin", actor, "admin.password", a.username, {}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def delete_admin(conn, admin_id: int, *, actor: str, now: int) -> None:
    """删除管理员：同时清会话、撤销其全部授权。"""
    a = _staff_admin(conn, admin_id)
    try:
        conn.execute("DELETE FROM admin_sessions WHERE admin_id=?", (a.id,))
        conn.execute("UPDATE admin_grants SET revoked_at=? WHERE admin_id=? AND revoked_at IS NULL",
                     (now, a.id))
        conn.execute("DELETE FROM admins WHERE id=?", (a.id,))
        db._audit_nocommit(conn, "admin", actor, "admin.delete", a.username, {}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def add_grant(conn, admin_id: int, grant, *, actor: str, now: int) -> None:
    if grant not in GRANTS:
        raise BizError("授权项无效")
    a = _staff_admin(conn, admin_id)
    if has_grant(conn, a.id, grant):
        raise BizError("已授权", 409)
    try:
        conn.execute("INSERT INTO admin_grants(admin_id,grant,granted_by,granted_at) VALUES(?,?,?,?)",
                     (a.id, grant, actor, now))
        db._audit_nocommit(conn, "admin", actor, "grant.add", a.username, {"grant": grant}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def revoke_grant(conn, admin_id: int, grant, *, actor: str, now: int) -> None:
    a = db.get_admin_by_id(conn, admin_id)
    if a is None or not has_grant(conn, a.id, grant):
        raise BizError("未授权", 404)
    try:
        conn.execute("UPDATE admin_grants SET revoked_at=? WHERE admin_id=? AND grant=? AND revoked_at IS NULL",
                     (now, a.id, grant))
        db._audit_nocommit(conn, "admin", actor, "grant.revoke", a.username, {"grant": grant}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def list_grants(conn) -> list[dict]:
    """授权流水（含已撤销），新的在前。"""
    rows = conn.execute("SELECT g.*, a.username FROM admin_grants g LEFT JOIN admins a ON a.id=g.admin_id"
                        " ORDER BY g.id DESC").fetchall()
    return [dict(id=r["id"], admin_id=r["admin_id"], username=r["username"], grant=r["grant"],
                 granted_by=r["granted_by"], granted_at=r["granted_at"], revoked_at=r["revoked_at"])
            for r in rows]
```

- [ ] **Step 5: 路由**

`backend/app/routes/admin_staff.py`：

```python
# 管理后台：管理员账号与授权管理（仅最高权限者；X-Admin-Key 视为最高权限者）。
import time
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import admin_auth, db_staff
from ..admin_auth import Principal
from ..db_agents import BizError

router = APIRouter()
SUPER_ONLY = Depends(admin_auth.require_role("super"))

def _err(e: BizError):
    return JSONResponse({"ok": False, "error": e.msg}, status_code=e.status)

@router.get("/admins")
async def list_admins(request: Request, p: Principal = SUPER_ONLY):
    return {"admins": db_staff.list_admins(request.app.state.db_conn)}

@router.post("/admins")
async def create_admin(request: Request, payload: dict = Body(...), p: Principal = SUPER_ONLY):
    try:
        admin_id = db_staff.create_staff_admin(request.app.state.db_conn, payload.get("username"),
                                               payload.get("password"), actor=p.username,
                                               now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "id": admin_id}

@router.post("/admins/{admin_id}/password")
async def set_admin_password(admin_id: int, request: Request, payload: dict = Body(...),
                             p: Principal = SUPER_ONLY):
    try:
        db_staff.set_admin_password(request.app.state.db_conn, admin_id, payload.get("password"),
                                    actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}

@router.delete("/admins/{admin_id}")
async def delete_admin(admin_id: int, request: Request, p: Principal = SUPER_ONLY):
    try:
        db_staff.delete_admin(request.app.state.db_conn, admin_id, actor=p.username,
                              now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}

@router.get("/grants")
async def list_grants(request: Request, p: Principal = SUPER_ONLY):
    return {"grants": db_staff.list_grants(request.app.state.db_conn)}

@router.post("/grants")
async def add_grant(request: Request, payload: dict = Body(...), p: Principal = SUPER_ONLY):
    admin_id = payload.get("admin_id")
    if not isinstance(admin_id, int) or isinstance(admin_id, bool):
        return _err(BizError("管理员不存在", 404))
    try:
        db_staff.add_grant(request.app.state.db_conn, admin_id, payload.get("grant"),
                           actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}

@router.delete("/grants/{admin_id}/{grant}")
async def revoke_grant(admin_id: int, grant: str, request: Request, p: Principal = SUPER_ONLY):
    try:
        db_staff.revoke_grant(request.app.state.db_conn, admin_id, grant, actor=p.username,
                              now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True}
```

`backend/app/routes/admin_agents.py`：首行注释改为 `# 管理后台：代理资料（新建、改地区/级别/上级、资格状态、重置密码、改名、列表与统计）。`；`from .. import admin_auth, db_agents` 改为 `from .. import admin_auth, db_agents, db_staff`；文件末尾追加：

```python

@router.post("/agents/{agent_id}/rename")
async def rename(agent_id: int, request: Request, payload: dict = Body(...),
                 p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    # 改名：最高权限者（含 X-Admin-Key）直接可用；管理员需持有 agent.rename 授权
    if p.role != "super" and not db_staff.has_grant(conn, p.admin_id, "agent.rename"):
        raise admin_auth.AdminDenied()
    try:
        a = db_agents.rename_agent(conn, agent_id, payload.get("name"), actor_type=p.actor_type,
                                   actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, "agent": db_agents.agent_to_dict(a)}
```

`backend/app/main.py`：在 `from .routes import admin_agents as admin_agents_routes` 之后加 `from .routes import admin_staff as admin_staff_routes`；在 `app.include_router(admin_agents_routes.router, prefix="/admin")` 之后加 `app.include_router(admin_staff_routes.router, prefix="/admin")`。

- [ ] **Step 6: 运行测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部通过。

- [ ] **Step 7: Commit**

```bash
git add backend/app/db_agents.py backend/app/db_staff.py backend/app/routes/admin_agents.py \
  backend/app/routes/admin_staff.py backend/app/main.py backend/tests/test_staff.py
git commit -m "feat(backend): agent rename grant and super-only admin management

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 账号编号段（分配即建档、划拨、回收、流水）

**Files:**
- Create: `backend/app/db_segments.py`、`backend/app/routes/admin_segments.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_segments.py`（新建）

**Interfaces:**
- Consumes: Task 2 的 `BizError`、`begin_write`、`get_agent`、`set_agent_status`（测试用）；`db.INITIAL_PASSWORD`、`db._audit_nocommit`、`db.activate_user(conn, code, now)`（测试用，现有签名）；`security.hash_password`。
- Produces:
  - `db_segments.NO_MIN = 1_000_000`、`NO_MAX = 9_999_999`、`MAX_BATCH = 10_000`；`parse_range(start, end) -> (int, int)`（抛 `BizError`）。
  - `assign_segment(conn, agent_id, start, end, *, actor_type, actor, now) -> {"count","created","reassigned"}`（审计 `segment.assign`，target `"start-end"`）。
  - `transfer_segment(conn, from_agent_id, to_agent_id, start, end, *, actor, now) -> {"count"}`（审计 `segment.transfer`，actor_type 固定 `agent`）。
  - `recycle_agent(conn, agent_id, *, actor_type, actor, now) -> {"count","children"}`（审计 `agent.recycle`，detail `{"count", "children": [下级 id]}`；写 `recycled_at`）。
  - `list_segment_ops(conn, limit, offset, agent_id=None) -> (rows, total)`：行含 `segment_ops` 全部列 + `from_name`、`to_name`。
  - HTTP：`POST /admin/segments/assign`、`POST /admin/segments/transfer`、`POST /admin/agents/{agent_id}/recycle`、`GET /admin/segment-ops?limit=&offset=&agent_id=` → `{"ops": [...], "total": n}`。

- [ ] **Step 1: 写失败测试 `backend/tests/test_segments.py`**

```python
import pytest
from app import db, db_agents, db_segments
from app.db_agents import BizError
from app.security import verify_password
from tests.agent_helpers import (audit, build_app, key_client, login_client, mk_agent_raw,
                                 set_agent_status_raw)

NOW = 1_800_000_000

def assign(conn, agent_id, start, end):
    return db_segments.assign_segment(conn, agent_id, start, end, actor_type="admin", actor="root",
                                      now=NOW)

def owned(conn, agent_id):
    return [r["code"] for r in conn.execute("SELECT code FROM users WHERE agent_id=? ORDER BY code",
                                            (agent_id,))]

def biz(fn, *a, **k) -> BizError:
    with pytest.raises(BizError) as ei:
        fn(*a, **k)
    return ei.value

# ---------------- 号段校验 ----------------

@pytest.mark.parametrize("start,end,msg", [
    (999_999, 1_000_000, "编号必须是 1000000–9999999 之间的整数"),
    (9_999_999, 10_000_000, "编号必须是 1000000–9999999 之间的整数"),
    ("1000000", 1_000_001, "编号必须是 1000000–9999999 之间的整数"),
    (True, 1_000_001, "编号必须是 1000000–9999999 之间的整数"),
    (1_000_005, 1_000_004, "起始编号不能大于结束编号"),
    (1_000_000, 1_010_000, "单次最多 10000 个编号"),
])
def test_parse_range_rejects(start, end, msg):
    assert biz(db_segments.parse_range, start, end).msg == msg

def test_parse_range_accepts_bounds():
    assert db_segments.parse_range(1_000_000, 1_009_999) == (1_000_000, 1_009_999)
    assert db_segments.parse_range(9_999_999, 9_999_999) == (9_999_999, 9_999_999)

# ---------------- 分配 ----------------

def test_assign_creates_pending_accounts_with_initial_password():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag")
    assert assign(conn, aid, 1_000_000, 1_000_002) == {"count": 3, "created": 3, "reassigned": 0}
    assert owned(conn, aid) == ["1000000", "1000001", "1000002"]
    u = db.get_user_by_code(conn, "1000001")
    assert u.first_activated_at is None and u.activated_at is None and u.onboarded_at is None
    assert u.status == "active" and u.expires_at is None
    assert verify_password(db.INITIAL_PASSWORD, u.salt, u.password_hash)
    op = conn.execute("SELECT * FROM segment_ops").fetchone()
    assert (op["op"], op["start_no"], op["end_no"], op["count"], op["to_agent_id"], op["actor"]) == (
        "assign", 1_000_000, 1_000_002, 3, aid, "root")
    e = audit(conn, "segment.assign")[0]
    assert e["target"] == "1000000-1000002" and e["detail"] == {
        "agent": "ag", "count": 3, "created": 3, "reassigned": 0}

def test_assign_10000_in_one_go_shares_one_hash():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag")
    assert assign(conn, aid, 2_000_000, 2_009_999)["created"] == 10_000
    assert conn.execute("SELECT COUNT(DISTINCT salt) FROM users WHERE agent_id=?", (aid,)).fetchone()[0] == 1

def test_assign_conflict_rejects_whole_batch():
    conn, _ = build_app()
    a1 = mk_agent_raw(conn, "a1"); a2 = mk_agent_raw(conn, "a2")
    assign(conn, a1, 1_000_005, 1_000_006)
    db.create_user(conn, "1000008", "pw", None)               # 存量已激活的 7 位编号
    e = biz(assign, conn, a2, 1_000_000, 1_000_009)
    assert e.status == 409 and e.msg == "以下编号已存在，不能分配：1000005、1000006、1000008"
    assert owned(conn, a2) == []
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 3     # 无任何新建
    assert conn.execute("SELECT COUNT(*) FROM segment_ops").fetchone()[0] == 1

def test_assign_conflict_message_truncates():
    conn, _ = build_app()
    a1 = mk_agent_raw(conn, "a1"); a2 = mk_agent_raw(conn, "a2")
    assign(conn, a1, 1_000_000, 1_000_011)
    assert biz(assign, conn, a2, 1_000_000, 1_000_011).msg.endswith("1000009 等 12 个")

def test_assign_ignores_non_numeric_legacy_codes():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag")
    db.create_user(conn, "100000A", "pw", None)             # 字典序落在区间内但不是 7 位数字
    assert assign(conn, aid, 1_000_000, 1_009_999)["created"] == 10_000
    assert db.get_user_by_code(conn, "100000A").agent_id is None

def test_assign_reuses_unowned_pending_numbers():
    conn, _ = build_app()
    a1 = mk_agent_raw(conn, "a1"); a2 = mk_agent_raw(conn, "a2")
    assign(conn, a1, 1_000_000, 1_000_001)
    conn.execute("UPDATE users SET agent_id=NULL"); conn.commit()   # 模拟回收后的号
    assert assign(conn, a2, 1_000_000, 1_000_002) == {"count": 3, "created": 1, "reassigned": 2}
    assert owned(conn, a2) == ["1000000", "1000001", "1000002"]

def test_assign_requires_active_agent():
    conn, _ = build_app()
    aid = mk_agent_raw(conn, "ag", status="paused")
    e = biz(assign, conn, aid, 1_000_000, 1_000_000)
    assert e.status == 409 and e.msg == "代理资格不是激活状态，不能分配"
    assert biz(assign, conn, 999, 1_000_000, 1_000_000).status == 404

def test_assign_route_staff_only():
    conn, app = build_app()
    aid = mk_agent_raw(conn, "ag")
    r = key_client(app).post("/admin/segments/assign", json={"agent_id": aid, "start": 1_000_000,
                                                               "end": 1_000_009})
    assert r.status_code == 200 and r.json() == {"ok": True, "count": 10, "created": 10, "reassigned": 0}
    r = key_client(app).post("/admin/segments/assign", json={"agent_id": aid, "start": 1, "end": 2})
    assert r.status_code == 400 and r.json()["error"] == "编号必须是 1000000–9999999 之间的整数"
    r = login_client(app, "ag").post("/admin/segments/assign",
                                     json={"agent_id": aid, "start": 1_000_100, "end": 1_000_100})
    assert r.status_code == 403

# ---------------- 划拨 ----------------

def setup_tree(conn):
    top = mk_agent_raw(conn, "top")
    kid = mk_agent_raw(conn, "kid", tier="senior", parent=top)
    grand = mk_agent_raw(conn, "grand", tier="junior", parent=kid)
    assign(conn, top, 1_000_000, 1_000_009)
    return top, kid, grand

def test_senior_transfers_own_pending_range_to_direct_child():
    conn, app = build_app()
    top, kid, _ = setup_tree(conn)
    r = login_client(app, "top").post("/admin/segments/transfer",
                                      json={"to_agent_id": kid, "start": 1_000_002, "end": 1_000_004})
    assert r.status_code == 200 and r.json() == {"ok": True, "count": 3}
    assert owned(conn, kid) == ["1000002", "1000003", "1000004"]
    op = conn.execute("SELECT * FROM segment_ops WHERE op='transfer'").fetchone()
    assert (op["from_agent_id"], op["to_agent_id"], op["count"], op["actor"]) == (top, kid, 3, "top")
    e = audit(conn, "segment.transfer")[0]
    assert e["actor_type"] == "agent" and e["actor"] == "top"
    assert e["detail"] == {"from": "top", "to": "kid", "count": 3}

def test_transfer_scope_rules():
    conn, app = build_app()
    top, kid, grand = setup_tree(conn)
    tc = login_client(app, "top")
    body = lambda to, s, e: {"to_agent_id": to, "start": s, "end": e}
    r = tc.post("/admin/segments/transfer", json=body(grand, 1_000_000, 1_000_000))
    assert r.status_code == 400 and r.json()["error"] == "只能划拨给自己的直属下级"
    r = tc.post("/admin/segments/transfer", json=body(kid, 1_000_008, 1_000_011))
    assert r.status_code == 409 and r.json()["error"] == "以下编号不在你名下或已激活，不能划拨：1000010、1000011"
    db.activate_user(conn, "1000005", NOW)
    r = tc.post("/admin/segments/transfer", json=body(kid, 1_000_005, 1_000_005))
    assert r.status_code == 409
    set_agent_status_raw(conn, kid, "paused")
    r = tc.post("/admin/segments/transfer", json=body(kid, 1_000_000, 1_000_000))
    assert r.status_code == 409 and r.json()["error"] == "下级代理资格不是激活状态，不能划拨"
    assert owned(conn, kid) == []

def test_transfer_irreversible_and_junior_cannot_transfer():
    conn, app = build_app()
    top, kid, grand = setup_tree(conn)
    login_client(app, "top").post("/admin/segments/transfer",
                                  json={"to_agent_id": kid, "start": 1_000_000, "end": 1_000_001})
    kid_tc = login_client(app, "kid")
    r = kid_tc.post("/admin/segments/transfer", json={"to_agent_id": top, "start": 1_000_000,
                                                       "end": 1_000_001})
    assert r.status_code == 400                                   # 上级不是自己的下级：划不回去
    kid_tc.post("/admin/segments/transfer", json={"to_agent_id": grand, "start": 1_000_000,
                                                   "end": 1_000_000})
    r = login_client(app, "grand").post("/admin/segments/transfer",
                                        json={"to_agent_id": kid, "start": 1_000_000, "end": 1_000_000})
    assert r.status_code == 403 and r.json()["error"] == "只有高级代理可以划拨编号"

def test_staff_cannot_transfer():
    conn, app = build_app()
    top, kid, _ = setup_tree(conn)
    r = key_client(app).post("/admin/segments/transfer",
                             json={"to_agent_id": kid, "start": 1_000_000, "end": 1_000_000})
    assert r.status_code == 403 and r.json() == {"error": "forbidden"}

# ---------------- 回收 ----------------

def test_recycle_only_cancelled_and_effects():
    conn, app = build_app()
    top, kid, grand = setup_tree(conn)
    db.activate_user(conn, "1000000", NOW)
    tc = key_client(app)
    r = tc.post(f"/admin/agents/{top}/recycle")
    assert r.status_code == 409 and r.json()["error"] == "只能回收资格已取消的代理"
    db_agents.set_agent_status(conn, top, "cancelled", "退出", actor_type="admin", actor="r", now=NOW)
    r = tc.post(f"/admin/agents/{top}/recycle")
    assert r.status_code == 200 and r.json() == {"ok": True, "count": 9, "children": 1}
    assert owned(conn, top) == ["1000000"]                         # 已激活的保持原归属
    assert db.get_user_by_code(conn, "1000001").agent_id is None
    assert db_agents.get_agent(conn, kid).parent_agent_id is None
    assert db_agents.get_agent(conn, top).recycled_at is not None
    op = conn.execute("SELECT * FROM segment_ops WHERE op='recycle'").fetchone()
    assert (op["start_no"], op["end_no"], op["count"], op["from_agent_id"]) == (1_000_001, 1_000_009, 9, top)
    assert audit(conn, "agent.recycle")[0]["detail"] == {"count": 9, "children": [kid]}
    assert tc.post(f"/admin/agents/{top}/recycle").json()["error"] == "该代理已回收"
    r = tc.post(f"/admin/agents/{top}/status", json={"status": "active", "reason": "回来"})
    assert r.status_code == 409 and r.json()["error"] == "该代理已回收，不能恢复"
    assert assign(conn, kid, 1_000_001, 1_000_009)["reassigned"] == 9     # 回收后的号可再分配

def test_recycle_forbidden_for_agent():
    conn, app = build_app()
    top, kid, _ = setup_tree(conn)
    assert login_client(app, "top").post(f"/admin/agents/{kid}/recycle").status_code == 403

# ---------------- 流水 ----------------

def test_segment_ops_scope():
    conn, app = build_app()
    top, kid, _ = setup_tree(conn)
    other = mk_agent_raw(conn, "other")
    assign(conn, other, 3_000_000, 3_000_000)
    login_client(app, "top").post("/admin/segments/transfer",
                                  json={"to_agent_id": kid, "start": 1_000_000, "end": 1_000_000})
    all_ops = key_client(app).get("/admin/segment-ops").json()
    assert all_ops["total"] == 3 and all_ops["ops"][0]["op"] == "transfer"
    assert all_ops["ops"][0]["from_name"] == "top" and all_ops["ops"][0]["to_name"] == "kid"
    assert key_client(app).get("/admin/segment-ops", params={"agent_id": other}).json()["total"] == 1
    mine = login_client(app, "kid").get("/admin/segment-ops", params={"agent_id": other}).json()
    assert mine["total"] == 1 and mine["ops"][0]["op"] == "transfer"
    assert key_client(app).get("/admin/segment-ops", params={"agent_id": "x"}).status_code == 400
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_segments.py`
Expected: FAIL（`ImportError: cannot import name 'db_segments' from 'app'`）。

- [ ] **Step 3: 数据层 `backend/app/db_segments.py`**

说明：`users.code` 是 TEXT，7 位纯数字之间字符串序与数值序一致；`GLOB` 保证存量字母编号（如 `100000A`，字典序落在区间内）不会被当成段内编号。分配冲突列出前 10 个编号。

```python
# 账号编号段（子项目 B）：分配即建档、划拨、回收、流水。归属只看 users.agent_id；segment_ops 只是流水。
from . import db
from .db_agents import BizError, begin_write, get_agent
from .security import hash_password

NO_MIN, NO_MAX = 1_000_000, 9_999_999     # 新号统一 7 位纯数字，不允许前导 0
MAX_BATCH = 10_000                        # 单次分配 / 划拨上限
_SEVEN_DIGITS = "[0-9]" * 7               # GLOB：只匹配 7 位纯数字编号，存量字母编号不会落入区间

def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)

def parse_range(start, end) -> tuple[int, int]:
    if not (_is_int(start) and _is_int(end) and NO_MIN <= start <= NO_MAX and NO_MIN <= end <= NO_MAX):
        raise BizError("编号必须是 1000000–9999999 之间的整数")
    if start > end:
        raise BizError("起始编号不能大于结束编号")
    if end - start + 1 > MAX_BATCH:
        raise BizError("单次最多 10000 个编号")
    return start, end

def _rows_in_range(conn, start: int, end: int) -> dict:
    rs = conn.execute(
        f"SELECT id, code, agent_id, first_activated_at FROM users"
        f" WHERE code GLOB '{_SEVEN_DIGITS}' AND code BETWEEN ? AND ?",
        (str(start), str(end))).fetchall()
    return {int(r["code"]): r for r in rs}

def _fmt_codes(nums: list[int]) -> str:
    head = "、".join(str(n) for n in nums[:10])
    return head + (f" 等 {len(nums)} 个" if len(nums) > 10 else "")

def _log_op(conn, op, start, end, count, from_id, to_id, actor, now) -> None:
    conn.execute("INSERT INTO segment_ops(op,start_no,end_no,count,from_agent_id,to_agent_id,actor,created_at)"
                 " VALUES(?,?,?,?,?,?,?,?)", (op, start, end, count, from_id, to_id, actor, now))

def assign_segment(conn, agent_id: int, start, end, *, actor_type: str, actor: str, now: int) -> dict:
    """分配即建档：段内每个编号建为待激活账号（初始密码 123456）归属该代理，整段一个事务。
    段内已存在且不是「无归属的待激活账号」的编号 → 整次拒绝；无归属待激活号（回收后的号）直接改归属。"""
    start, end = parse_range(start, end)
    # 整段共用一次 PBKDF2：所有待激活号的初始密码相同且公开，共用盐不泄露任何秘密；
    # 激活 / 重置时 activate_user / reset_user_password 会用新盐重新哈希。逐行哈希 1 万次约需半小时。
    h, salt = hash_password(db.INITIAL_PASSWORD)
    begin_write(conn)
    try:
        ag = get_agent(conn, agent_id)
        if ag is None:
            raise BizError("代理不存在", 404)
        if ag.status != "active":
            raise BizError("代理资格不是激活状态，不能分配", 409)
        existing = _rows_in_range(conn, start, end)
        bad = sorted(n for n, r in existing.items()
                     if r["agent_id"] is not None or r["first_activated_at"] is not None)
        if bad:
            raise BizError("以下编号已存在，不能分配：" + _fmt_codes(bad), 409)
        conn.executemany("UPDATE users SET agent_id=? WHERE id=?",
                         [(ag.id, r["id"]) for r in existing.values()])
        new = [n for n in range(start, end + 1) if n not in existing]
        conn.executemany(
            "INSERT INTO users(code,password_hash,salt,expires_at,status,created_at,agent_id)"
            " VALUES(?,?,?,NULL,'active',?,?)",
            [(str(n), h, salt, now, ag.id) for n in new])
        count = end - start + 1
        _log_op(conn, "assign", start, end, count, None, ag.id, actor, now)
        detail = {"agent": ag.name, "count": count, "created": len(new), "reassigned": len(existing)}
        db._audit_nocommit(conn, actor_type, actor, "segment.assign", f"{start}-{end}", detail, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"count": count, "created": len(new), "reassigned": len(existing)}

def transfer_segment(conn, from_agent_id: int, to_agent_id, start, end, *, actor: str,
                     now: int) -> dict:
    """高级代理把本人名下、从未激活的连续编号划拨给直属下级；不可撤回（没有反向接口）。"""
    start, end = parse_range(start, end)
    if not _is_int(to_agent_id):
        raise BizError("只能划拨给自己的直属下级")
    begin_write(conn)
    try:
        me = get_agent(conn, from_agent_id)
        if me is None or me.tier != "senior":
            raise BizError("只有高级代理可以划拨编号", 403)
        to = get_agent(conn, to_agent_id)
        if to is None or to.parent_agent_id != me.id:
            raise BizError("只能划拨给自己的直属下级")
        if to.status != "active":
            raise BizError("下级代理资格不是激活状态，不能划拨", 409)
        existing = _rows_in_range(conn, start, end)
        bad = [n for n in range(start, end + 1)
               if n not in existing or existing[n]["agent_id"] != me.id
               or existing[n]["first_activated_at"] is not None]
        if bad:
            raise BizError("以下编号不在你名下或已激活，不能划拨：" + _fmt_codes(bad), 409)
        conn.executemany("UPDATE users SET agent_id=? WHERE id=?",
                         [(to.id, r["id"]) for r in existing.values()])
        count = end - start + 1
        _log_op(conn, "transfer", start, end, count, me.id, to.id, actor, now)
        db._audit_nocommit(conn, "agent", actor, "segment.transfer", f"{start}-{end}",
                           {"from": me.name, "to": to.name, "count": count}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"count": count}

def recycle_agent(conn, agent_id: int, *, actor_type: str, actor: str, now: int) -> dict:
    """回收（仅资格已取消的代理）：名下未激活账号变为无归属待激活号，下级代理解除上级关系；
    已激活账号保持原归属。回收后该代理不能再恢复资格。"""
    begin_write(conn)
    try:
        a = get_agent(conn, agent_id)
        if a is None:
            raise BizError("代理不存在", 404)
        if a.status != "cancelled":
            raise BizError("只能回收资格已取消的代理", 409)
        if a.recycled_at is not None:
            raise BizError("该代理已回收", 409)
        nums = sorted(int(r["code"]) for r in conn.execute(
            "SELECT code FROM users WHERE agent_id=? AND first_activated_at IS NULL", (a.id,)))
        conn.execute("UPDATE users SET agent_id=NULL WHERE agent_id=? AND first_activated_at IS NULL",
                     (a.id,))
        children = [r["id"] for r in conn.execute("SELECT id FROM agents WHERE parent_agent_id=?",
                                                  (a.id,))]
        conn.execute("UPDATE agents SET parent_agent_id=NULL WHERE parent_agent_id=?", (a.id,))
        conn.execute("UPDATE agents SET recycled_at=? WHERE id=?", (now, a.id))
        _log_op(conn, "recycle", nums[0] if nums else None, nums[-1] if nums else None, len(nums),
                a.id, None, actor, now)
        db._audit_nocommit(conn, actor_type, actor, "agent.recycle", a.name,
                           {"count": len(nums), "children": children}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"count": len(nums), "children": len(children)}

def list_segment_ops(conn, limit: int, offset: int, agent_id: int | None = None) -> tuple[list[dict], int]:
    where, args = ("WHERE o.from_agent_id=? OR o.to_agent_id=?", [agent_id, agent_id]) \
        if agent_id is not None else ("", [])
    total = conn.execute(f"SELECT COUNT(*) FROM segment_ops o {where}", args).fetchone()[0]
    rs = conn.execute(
        "SELECT o.*, f.name AS from_name, t.name AS to_name FROM segment_ops o"
        " LEFT JOIN agents f ON f.id=o.from_agent_id LEFT JOIN agents t ON t.id=o.to_agent_id"
        f" {where} ORDER BY o.id DESC LIMIT ? OFFSET ?", args + [limit, offset]).fetchall()
    return [dict(r) for r in rs], total
```

- [ ] **Step 4: 路由 `backend/app/routes/admin_segments.py`**

```python
# 管理后台：编号段分配（后台人员）、划拨（高级代理）、回收（后台人员）、流水。
import time
from fastapi import APIRouter, Request, Body, Depends
from fastapi.responses import JSONResponse
from .. import admin_auth, db_segments
from ..admin_auth import Principal
from ..db_agents import BizError

router = APIRouter()
STAFF_ONLY = Depends(admin_auth.require_role(*admin_auth.STAFF))
AGENT_ONLY = Depends(admin_auth.require_role("agent"))
ANY_ROLE = Depends(admin_auth.require_role(*admin_auth.ALL_ROLES))
MAX_INT = 2 ** 62

def _err(e: BizError):
    return JSONResponse({"ok": False, "error": e.msg}, status_code=e.status)

@router.post("/segments/assign")
async def assign(request: Request, payload: dict = Body(...), p: Principal = STAFF_ONLY):
    agent_id = payload.get("agent_id")
    if not isinstance(agent_id, int) or isinstance(agent_id, bool):
        return _err(BizError("代理不存在", 404))
    try:
        res = db_segments.assign_segment(request.app.state.db_conn, agent_id, payload.get("start"),
                                         payload.get("end"), actor_type=p.actor_type,
                                         actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

@router.post("/segments/transfer")
async def transfer(request: Request, payload: dict = Body(...), p: Principal = AGENT_ONLY):
    try:
        res = db_segments.transfer_segment(request.app.state.db_conn, p.agent_id,
                                           payload.get("to_agent_id"), payload.get("start"),
                                           payload.get("end"), actor=p.username,
                                           now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

@router.post("/agents/{agent_id}/recycle")
async def recycle(agent_id: int, request: Request, p: Principal = STAFF_ONLY):
    try:
        res = db_segments.recycle_agent(request.app.state.db_conn, agent_id, actor_type=p.actor_type,
                                        actor=p.username, now=int(time.time()))
    except BizError as e:
        return _err(e)
    return {"ok": True, **res}

@router.get("/segment-ops")
async def segment_ops(request: Request, p: Principal = ANY_ROLE):
    q = request.query_params
    try:
        limit = int(q.get("limit", 50))
        offset = int(q.get("offset", 0))
        agent_id = int(q["agent_id"]) if q.get("agent_id") else None
    except ValueError:
        return JSONResponse({"ok": False, "error": "参数无效"}, status_code=400)
    if not 0 <= offset <= MAX_INT or (agent_id is not None and not 0 <= agent_id <= MAX_INT):
        return JSONResponse({"ok": False, "error": "参数无效"}, status_code=400)
    if p.role == "agent":            # 代理只看与自己有关的流水
        agent_id = p.agent_id
    rows, total = db_segments.list_segment_ops(request.app.state.db_conn, max(1, min(limit, 200)),
                                               offset, agent_id)
    return {"ops": rows, "total": total}
```

`backend/app/main.py`：在 `from .routes import admin_staff as admin_staff_routes` 之后加 `from .routes import admin_segments as admin_segments_routes`；在 `app.include_router(admin_staff_routes.router, prefix="/admin")` 之后加 `app.include_router(admin_segments_routes.router, prefix="/admin")`。

- [ ] **Step 5: 运行测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部通过（`test_assign_10000_in_one_go_shares_one_hash` 应在 1 秒量级完成；若明显变慢，说明误用了逐行哈希）。

- [ ] **Step 6: Commit**

```bash
git add backend/app/db_segments.py backend/app/routes/admin_segments.py backend/app/main.py backend/tests/test_segments.py
git commit -m "feat(backend): account number segments with assign, transfer and recycle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 账号与代理（代理视角、编号状态、首次激活关系链）

**Files:**
- Modify: `backend/app/db.py`（新增 `agent_chain`、`list_users_with_agent`、`number_status`；替换 `activate_user`）
- Modify: `backend/app/routes/admin.py`（`list_users`、`activate_user` 两个端点 + `ANY_ROLE`）
- Modify: `backend/tests/test_admin_audit.py`（列表字段集合）
- Modify: `backend/README.md`（代理与号段说明）
- Test: `backend/tests/test_agent_accounts.py`（新建）

**Interfaces:**
- Consumes: Task 1 的 `User.agent_id/activated_by_agent_id/agent_chain_json`、`Principal`、`require_role`、`ALL_ROLES`；Task 2 的 `set_agent_status`（测试用）；Task 4 的 `db_segments.assign_segment`（测试用）。
- Produces:
  - `db.agent_chain(conn, agent_id: int|None) -> list[int]`（最多 3 个）。
  - `db.activate_user(conn, code, now, *, by_agent_id: int|None = None) -> "ok"|"not_found"|"already"`：`by_agent_id` 非空时只能激活 `agent_id == by_agent_id` 的账号，否则 `not_found`；首次激活写 `activated_by_agent_id`、`agent_chain_json`。旧调用 `activate_user(conn, code, now)` 行为不变。
  - `db.list_users_with_agent(conn, agent_id: int|None = None) -> list[tuple[User, agent_name|None, agent_status|None]]`。
  - `db.number_status(u: User, agent_status: str|None) -> "pending"|"activated"|"arrears"|"to_recycle"|"unassigned"`（本期不会返回 `arrears`，C 实现余额后再接入）。
  - `GET /admin/users[?agent_id=N]` 每行新增 `agent_id`、`agent_name`、`number_status`；代理身份强制只返回本人名下。`POST /admin/users/{code}/activate` 对代理开放（限本人名下，审计 `actor_type="agent"`）。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_agent_accounts.py`：

```python
import json
from app import db, db_agents, db_segments
from tests.agent_helpers import (audit, build_app, key_client, login_client, mk_agent_raw)

NOW = 1_800_000_000

def assign(conn, agent_id, start, end):
    db_segments.assign_segment(conn, agent_id, start, end, actor_type="admin", actor="root", now=NOW)

def users(tc, **params):
    r = tc.get("/admin/users", params=params)
    assert r.status_code == 200, r.text
    return {u["code"]: u for u in r.json()["users"]}

# ---------------- 列表：归属代理、编号状态、筛选 ----------------

def test_users_list_agent_fields_and_number_status():
    conn, app = build_app()
    live = mk_agent_raw(conn, "live")
    gone = mk_agent_raw(conn, "gone")
    assign(conn, live, 1_000_000, 1_000_001)
    assign(conn, gone, 1_000_002, 1_000_002)
    db.activate_user(conn, "1000001", NOW)
    db_agents.set_agent_status(conn, gone, "cancelled", "退出", actor_type="admin", actor="r", now=NOW)
    db.create_user(conn, "OLD1", "pw", None)                          # 存量已激活
    db.create_user(conn, "1000003", "x", None, pending=True)          # 无归属待激活
    us = users(key_client(app))
    assert (us["1000000"]["agent_name"], us["1000000"]["number_status"]) == ("live", "pending")
    assert us["1000000"]["agent_id"] == live
    assert us["1000001"]["number_status"] == "activated"
    assert (us["1000002"]["agent_name"], us["1000002"]["number_status"]) == ("gone", "to_recycle")
    assert (us["OLD1"]["agent_id"], us["OLD1"]["number_status"]) == (None, "activated")
    assert us["1000003"]["number_status"] == "unassigned"

def test_staff_filter_by_agent():
    conn, app = build_app()
    a1 = mk_agent_raw(conn, "a1"); a2 = mk_agent_raw(conn, "a2")
    assign(conn, a1, 1_000_000, 1_000_001)
    assign(conn, a2, 1_000_002, 1_000_002)
    tc = key_client(app)
    assert set(users(tc, agent_id=a1)) == {"1000000", "1000001"}
    assert tc.get("/admin/users", params={"agent_id": "abc"}).status_code == 400
    assert tc.get("/admin/users", params={"agent_id": str(2 ** 63)}).status_code == 400

def test_agent_reads_only_own_accounts():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me"); other = mk_agent_raw(conn, "other")
    assign(conn, me, 1_000_000, 1_000_001)
    assign(conn, other, 1_000_002, 1_000_002)
    db.create_user(conn, "OLD1", "pw", None)
    tc = login_client(app, "me")
    assert set(users(tc)) == {"1000000", "1000001"}
    assert set(users(tc, agent_id=other)) == {"1000000", "1000001"}       # 传别人的 id 也只看自己

# ---------------- 代理激活本人名下账号 ----------------

def test_agent_activates_own_account_and_records_chain():
    conn, app = build_app()
    a = mk_agent_raw(conn, "a")
    b = mk_agent_raw(conn, "b", parent=a)
    c = mk_agent_raw(conn, "c", parent=b)
    d = mk_agent_raw(conn, "d", tier="junior", parent=c)
    assign(conn, d, 1_000_000, 1_000_000)
    tc = login_client(app, "d")
    r = tc.post("/admin/users/1000000/activate")
    assert r.status_code == 200 and r.json() == {"ok": True}
    u = db.get_user_by_code(conn, "1000000")
    assert u.first_activated_at is not None and u.activated_by_agent_id == d
    assert json.loads(u.agent_chain_json) == [d, c, b]                   # 最多三层
    e = audit(conn, "user.activate")[0]
    assert e["actor_type"] == "agent" and e["actor"] == "d" and e["target"] == "1000000"
    r = tc.post("/admin/users/1000000/activate")
    assert r.status_code == 409 and r.json()["error"] == "账号已激活"

def test_agent_cannot_activate_others_or_legacy():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me"); other = mk_agent_raw(conn, "other")
    assign(conn, other, 1_000_000, 1_000_000)
    db.create_user(conn, "P1", "x", None, pending=True)
    tc = login_client(app, "me")
    for code in ("1000000", "P1", "NOPE"):
        r = tc.post(f"/admin/users/{code}/activate")
        assert r.status_code == 404 and r.json() == {"ok": False, "error": "账号不存在"}
    assert db.get_user_by_code(conn, "1000000").first_activated_at is None
    assert audit(conn, "user.activate") == []

def test_staff_activation_of_agent_account_records_chain_without_agent_actor():
    conn, app = build_app()
    top = mk_agent_raw(conn, "top")
    kid = mk_agent_raw(conn, "kid", tier="junior", parent=top)
    assign(conn, kid, 1_000_000, 1_000_000)
    assert key_client(app).post("/admin/users/1000000/activate").status_code == 200
    u = db.get_user_by_code(conn, "1000000")
    assert u.activated_by_agent_id is None and json.loads(u.agent_chain_json) == [kid, top]
    db.create_user(conn, "P1", "x", None, pending=True)
    key_client(app).post("/admin/users/P1/activate")
    assert db.get_user_by_code(conn, "P1").agent_chain_json is None

def test_agent_other_account_ops_forbidden():
    conn, app = build_app()
    me = mk_agent_raw(conn, "me")
    assign(conn, me, 1_000_000, 1_000_000)
    tc = login_client(app, "me")
    assert tc.post("/admin/users", json={"code": "X1"}).status_code == 403
    assert tc.patch("/admin/users/1000000", json={"status": "banned"}).status_code == 403
    assert tc.post("/admin/users/1000000/reset-password").status_code == 403
    assert tc.delete("/admin/users/1000000").status_code == 403
    assert db.get_user_by_code(conn, "1000000").status == "active"
```

`backend/tests/test_admin_audit.py` 的 `test_list_users_new_fields_mask_phone` 中，把

```python
    assert set(a) == {"code", "status", "expires_at", "created_at", "activated",
                      "first_activated_at", "phone", "onboarded"}
```

改为

```python
    assert set(a) == {"code", "status", "expires_at", "created_at", "activated",
                      "first_activated_at", "phone", "onboarded",
                      "agent_id", "agent_name", "number_status"}
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_agent_accounts.py tests/test_admin_audit.py`
Expected: FAIL（`KeyError: 'agent_name'`、代理访问 `/admin/users` 得到 403、`activate_user() got an unexpected keyword argument 'by_agent_id'` 等）。

- [ ] **Step 3: 数据层（`backend/app/db.py`）**

3a. 把现有 `activate_user` 整个函数替换为：

```python
def agent_chain(conn, agent_id: int | None) -> list[int]:
    """从归属代理起沿上级链取最多三层：[直接, 间接, 次间接]。"""
    chain, cur = [], agent_id
    while cur is not None and len(chain) < 3:
        chain.append(cur)
        r = conn.execute("SELECT parent_agent_id FROM agents WHERE id=?", (cur,)).fetchone()
        cur = r["parent_agent_id"] if r else None
    return chain

def activate_user(conn, code: str, now: int, *, by_agent_id: int | None = None) -> str:
    """首次激活。by_agent_id 不为 None 表示代理本人操作：只能激活归属自己的账号，
    否则按 not_found 处理（不暴露他人账号是否存在）。
    首次激活时记录归属代理的关系链（直接/间接/次间接上级）与操作代理。"""
    u = get_user_by_code(conn, code)
    if not u or (by_agent_id is not None and u.agent_id != by_agent_id):
        return "not_found"
    h, salt = hash_password(INITIAL_PASSWORD)
    chain = json.dumps(agent_chain(conn, u.agent_id)) if u.agent_id is not None else None
    # 条件更新保证并发下只有一次激活成功；归属在检查后被划走则不激活
    cur = conn.execute(
        "UPDATE users SET password_hash=?, salt=?, first_activated_at=?, activated_at=?,"
        " status='active', onboarded_at=NULL, activated_by_agent_id=?, agent_chain_json=?"
        " WHERE id=? AND first_activated_at IS NULL AND agent_id IS ?",
        (h, salt, now, now, by_agent_id, chain, u.id, u.agent_id),
    )
    conn.commit()
    if cur.rowcount == 1:
        return "ok"
    again = get_user_by_code(conn, code)      # 并发下可能已被他人激活、划走或删除
    return "already" if again and again.first_activated_at is not None else "not_found"
```

3b. 在 `def list_users(conn) -> list[User]:` 函数之后插入：

```python
def list_users_with_agent(conn, agent_id: int | None = None) -> list[tuple[User, str | None, str | None]]:
    """账号 + 归属代理名称 + 归属代理资格状态；agent_id 不为 None 时只列该代理名下账号。"""
    sql = ("SELECT u.*, a.name AS agent_name, a.status AS agent_status FROM users u"
           " LEFT JOIN agents a ON a.id=u.agent_id")
    args = []
    if agent_id is not None:
        sql += " WHERE u.agent_id=?"
        args.append(agent_id)
    return [(_row_to_user(r), r["agent_name"], r["agent_status"])
            for r in conn.execute(sql + " ORDER BY u.id", args).fetchall()]

def number_status(u: User, agent_status: str | None) -> str:
    """编号五态（由数据推导，不另存）：pending 待激活 | activated 已激活 | arrears 已欠费 |
    to_recycle 待回收 | unassigned 未分配。余额在子项目 C 实现，此前已激活一律为 activated。"""
    if u.first_activated_at is not None:
        return "activated"
    if u.agent_id is None:
        return "unassigned"
    return "to_recycle" if agent_status == "cancelled" else "pending"
```

- [ ] **Step 4: 路由（`backend/app/routes/admin.py`）**

在 `STAFF_ONLY = ...` 之后加：

```python
ANY_ROLE = Depends(admin_auth.require_role(*admin_auth.ALL_ROLES))
```

把 `list_users` 与 `activate_user` 两个端点（从 `@router.get("/users")` 到 `activate_user` 里 `res = db.activate_user(...)` 这一行）替换为：

```python
@router.get("/users")
async def list_users(request: Request, p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    raw = request.query_params.get("agent_id")
    try:
        agent_id = int(raw) if raw else None
    except ValueError:
        return _err("参数无效", 400)
    if agent_id is not None and not 0 <= agent_id <= MAX_INT:
        return _err("参数无效", 400)
    if p.role == "agent":            # 代理只读本人名下账号，忽略传入的 agent_id
        agent_id = p.agent_id
    return {"users": [
        {"code": u.code, "status": u.status, "expires_at": u.expires_at, "created_at": u.created_at,
         "activated": u.first_activated_at is not None,
         "first_activated_at": u.first_activated_at,
         "phone": db.mask_phone(u.phone),
         "onboarded": u.onboarded_at is not None,
         "agent_id": u.agent_id, "agent_name": agent_name,
         "number_status": db.number_status(u, agent_status)}
        for u, agent_name, agent_status in db.list_users_with_agent(conn, agent_id)
    ]}

@router.post("/users/{code}/activate")
async def activate_user(code: str, request: Request, p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    # 代理只能激活本人名下账号（他人账号按不存在处理）；后台人员不限
    by_agent = p.agent_id if p.role == "agent" else None
    res = db.activate_user(conn, code, int(time.time()), by_agent_id=by_agent)
```

（`activate_user` 其余部分——`not_found`/`already` 分支与 `_audit(request, p, "user.activate", code.upper(), {})`——保持不变；代理激活时 `p.actor_type` 即为 `agent`。`MAX_INT` 已在本模块定义。）

- [ ] **Step 5: 文档**

`backend/README.md`：在 Task 1 加的「### 后台角色（最高权限者 / 管理员 / 代理）」一节之后插入：

```markdown
### 代理与账号编号段

- **代理**：后台「代理管理」新建（名称全局唯一、不区分大小写、1–20 字符，同时是登录用户名；登录密码由后台设置，8–64 位）。
  级别高级/低级：只有高级代理可以做上级、向下划拨；上级必须是资格激活的高级代理，禁止成环；仍有下级时不能改为低级。
  资格激活/暂停/取消，每次变更必须填原因（记录变更人、时间、原因）。
- **名称保留**：改名（需最高权限者，或被授予「代理改名」的管理员）或取消资格时，旧名保留一年；
  一年后他人可使用该名称，此时原（已取消的）代理登录名变为「名称#id」且不能再恢复资格。
- **编号段**：新号统一 7 位纯数字 `1000000`–`9999999`，单次最多 10000 个。
  - 分配（后台人员）：段内每个编号立即建为「待激活」账号（初始密码 123456）归属该代理，整段一个事务；
    段内已存在且不是「无归属待激活号」的编号 → 整次拒绝并列出冲突编号。存量账号不属于任何号段。
  - 划拨（高级代理）：只能把本人名下、从未激活的连续编号划给直属下级，不可撤回。
  - 回收（后台人员，仅资格已取消的代理）：名下未激活账号变为「未分配」可再分配，下级代理解除上级关系；回收后不能再恢复资格。
- **代理视角**：只读本人名下账号，唯一操作是激活待激活账号；首次激活时记录直接/间接/次间接上级。
- 账号列表的「编号状态」由数据推导：待激活 / 已激活 / 已欠费（子项目 C 后生效）/ 待回收 / 未分配。
```

- [ ] **Step 6: 运行测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部通过。

- [ ] **Step 7: Commit**

```bash
git add backend/app/db.py backend/app/routes/admin.py backend/README.md \
  backend/tests/test_agent_accounts.py backend/tests/test_admin_audit.py
git commit -m "feat(backend): agent-scoped accounts, derived number status and activation chain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 管理后台前端（按角色菜单、代理 / 号段 / 管理员与授权页、代理视角「我的账号」）

**Files:**
- Modify: `backend/admin-ui/src/api.ts`、`src/util.ts`、`src/App.tsx`（整文件）、`src/LoginPage.tsx`、`src/MainLayout.tsx`（整文件）、`src/pages/UsersTable.tsx`（整文件）、`src/pages/AuditLogs.tsx`
- Create: `backend/admin-ui/src/pages/Agents.tsx`、`src/pages/Segments.tsx`、`src/pages/Staff.tsx`
- Rebuild: `backend/app/static/admin-dist/`（`npm run build` 生成，**评审时排除**）

**Interfaces:**
- Consumes: Task 1–5 的全部 HTTP 接口与字段（见「接口总览」）；`/admin/me` 的 `{username, role, grants, agent}`；`/admin/login` 失败时的 `{ok:false, error}`。
- Produces: `api.ts` 导出 `Role`、`AgentRow`、`Me`、`getMe(): Promise<Me|null>`、`login(): Promise<ApiResult>`、`listUsers(agentId?)`、`UserRow` 新字段 `agent_id/agent_name/number_status`、代理/号段/管理员与授权的请求函数；`util.ts` 导出 `NUMBER_STATUS_LABEL`、`REGION_LABEL`、`TIER_LABEL`、`AGENT_STATUS_LABEL`、`ROLE_LABEL`、`toValueEnum()`；`MainLayout` 改收 `me: Me`；`UsersTable`、`Agents`、`Segments` 收 `me: Me`。
- 菜单：最高权限者 = 概览、用户管理、代理管理、号段管理、数据源、操作日志、管理员与授权；管理员 = 同上但无「管理员与授权」；代理 = 我的账号、编号划拨（高级）/ 编号流水（低级）。菜单裁剪只是辅助，权限以服务端为准。

- [ ] **Step 1: `src/api.ts`**

1a. `UserRow` 接口在 `onboarded: boolean ...` 之后追加：

```ts
  agent_id: number | null // 归属代理；null = 无归属
  agent_name: string | null
  number_status: string // pending 待激活 | activated 已激活 | arrears 已欠费 | to_recycle 待回收 | unassigned 未分配
```

1b. 把现有 `getMe` 与 `login` 两个函数替换为：

```ts
export type Role = 'super' | 'admin' | 'agent'

export interface AgentRow {
  id: number
  name: string
  region: string // province | city | vip
  tier: string // senior 高级 | junior 低级
  parent_agent_id: number | null
  status: string // active 激活 | paused 暂停 | cancelled 取消
  status_by: string | null
  status_at: number | null
  status_reason: string | null
  created_at: number
  recycled_at: number | null
  // 以下仅列表接口返回
  parent_name?: string | null
  total?: number
  activated?: number
  unactivated?: number
  children?: number
}

export interface Me {
  username: string
  role: Role
  grants: string[] // 如 agent.rename
  agent: AgentRow | null // 代理身份时为本人资料
}

export async function getMe(): Promise<Me | null> {
  const r = await req('/me')
  if (r.status === 200) return r.json()
  return null
}

// 登录失败时带回后端文案（如「代理资格已暂停，无法登录」）；密码错误时后端不给文案。
export async function login(username: string, password: string): Promise<ApiResult> {
  return result(
    await req('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  )
}
```

1c. `listUsers` 改为带可选代理筛选：

```ts
export async function listUsers(agentId?: number): Promise<UserRow[]> {
  const r = await req('/users' + (agentId != null ? '?agent_id=' + agentId : ''))
```

（函数体其余不变。）

1d. 文件末尾追加：

```ts
// ---------------- 代理 ----------------

function post(path: string, body?: unknown): Promise<Response> {
  return req(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}

export async function listAgents(): Promise<AgentRow[]> {
  const r = await req('/agents')
  if (r.status !== 200) throw new Error('list agents failed: ' + r.status)
  return (await r.json()).agents as AgentRow[]
}

export interface AgentInput {
  name: string
  password: string
  region: string
  tier: string
  parent_agent_id: number | null
}

export async function createAgent(input: AgentInput): Promise<ApiResult> {
  return result(await post('/agents', input))
}

export async function updateAgent(
  id: number,
  patch: { region?: string; tier?: string; parent_agent_id?: number | null },
): Promise<ApiResult> {
  return result(await req('/agents/' + id, { method: 'PATCH', body: JSON.stringify(patch) }))
}

export async function setAgentStatus(id: number, status: string, reason: string): Promise<ApiResult> {
  return result(await post(`/agents/${id}/status`, { status, reason }))
}

export async function renameAgent(id: number, name: string): Promise<ApiResult> {
  return result(await post(`/agents/${id}/rename`, { name }))
}

export async function setAgentPassword(id: number, password: string): Promise<ApiResult> {
  return result(await post(`/agents/${id}/password`, { password }))
}

export async function recycleAgent(id: number): Promise<ApiResult> {
  return result(await post(`/agents/${id}/recycle`))
}

// ---------------- 号段 ----------------

export interface SegmentOpRow {
  id: number
  op: string // assign 分配 | transfer 划拨 | recycle 回收
  start_no: number | null
  end_no: number | null
  count: number
  from_agent_id: number | null
  to_agent_id: number | null
  from_name: string | null
  to_name: string | null
  actor: string
  created_at: number
}

export async function assignSegment(agentId: number, start: number, end: number): Promise<ApiResult> {
  return result(await post('/segments/assign', { agent_id: agentId, start, end }))
}

export async function transferSegment(toAgentId: number, start: number, end: number): Promise<ApiResult> {
  return result(await post('/segments/transfer', { to_agent_id: toAgentId, start, end }))
}

export async function listSegmentOps(
  limit: number,
  offset: number,
): Promise<{ ops: SegmentOpRow[]; total: number }> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const r = await req('/segment-ops?' + qs.toString())
  if (r.status !== 200) throw new Error('list segment ops failed: ' + r.status)
  return r.json()
}

// ---------------- 管理员与授权（仅最高权限者） ----------------

export interface AdminRow {
  id: number
  username: string
  role: Role
  created_at: number
  grants: string[]
}

export async function listAdmins(): Promise<AdminRow[]> {
  const r = await req('/admins')
  if (r.status !== 200) throw new Error('list admins failed: ' + r.status)
  return (await r.json()).admins as AdminRow[]
}

export async function createAdmin(username: string, password: string): Promise<ApiResult> {
  return result(await post('/admins', { username, password }))
}

export async function setAdminPassword(id: number, password: string): Promise<ApiResult> {
  return result(await post(`/admins/${id}/password`, { password }))
}

export async function deleteAdmin(id: number): Promise<ApiResult> {
  return result(await req('/admins/' + id, { method: 'DELETE' }))
}

export async function addGrant(adminId: number, grant: string): Promise<ApiResult> {
  return result(await post('/grants', { admin_id: adminId, grant }))
}

export async function revokeGrant(adminId: number, grant: string): Promise<ApiResult> {
  return result(await req(`/grants/${adminId}/${encodeURIComponent(grant)}`, { method: 'DELETE' }))
}
```

- [ ] **Step 2: `src/util.ts` 末尾追加**

```ts
// 编号状态（后端 number_status，由数据推导）→ 中文。
export const NUMBER_STATUS_LABEL: Record<string, string> = {
  pending: '待激活',
  activated: '已激活',
  arrears: '已欠费',
  to_recycle: '待回收',
  unassigned: '未分配',
}

export const REGION_LABEL: Record<string, string> = { province: '省级', city: '市级', vip: 'VIP' }
export const TIER_LABEL: Record<string, string> = { senior: '高级', junior: '低级' }
export const AGENT_STATUS_LABEL: Record<string, string> = {
  active: '激活',
  paused: '暂停',
  cancelled: '取消',
}
export const ROLE_LABEL: Record<string, string> = { super: '最高权限者', admin: '管理员', agent: '代理' }

// Record → ProTable / ProFormSelect 的 valueEnum。
export function toValueEnum(labels: Record<string, string>): Record<string, { text: string }> {
  return Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, { text: v }]))
}
```

- [ ] **Step 3: `src/App.tsx`（整文件）**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Spin } from 'antd'
import { getMe, Me } from './api'
import LoginPage from './LoginPage'
import MainLayout from './MainLayout'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<Me | null>(null)

  const refreshMe = useCallback(async () => {
    setMe(await getMe())
    setLoading(false)
  }, [])

  useEffect(() => {
    refreshMe()
  }, [refreshMe])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!me) {
    return <LoginPage onSuccess={refreshMe} />
  }

  return <MainLayout me={me} onLoggedOut={() => setMe(null)} />
}
```

- [ ] **Step 4: `src/LoginPage.tsx`**

把 `onFinish` 内部改为：

```tsx
            const r = await login(values.username, values.password)
            if (r.ok) {
              message.success('登录成功')
              onSuccess()
            } else {
              message.error(r.error || '用户名或密码错误')
            }
            return r.ok
```

用户名输入框 `placeholder="管理员用户名"` 改为 `placeholder="用户名（代理请输入代理名称）"`。

- [ ] **Step 5: `src/MainLayout.tsx`（整文件）**

```tsx
import { ReactNode, useState } from 'react'
import { PageContainer, ProLayout } from '@ant-design/pro-components'
import { App, Dropdown } from 'antd'
import {
  ApartmentOutlined,
  ApiOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  LogoutOutlined,
  PartitionOutlined,
  SafetyOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { logout, Me } from './api'
import { BRAND, Logo } from './branding'
import Agents from './pages/Agents'
import AuditLogs from './pages/AuditLogs'
import Dashboard from './pages/Dashboard'
import DataSources from './pages/DataSources'
import Segments from './pages/Segments'
import Staff from './pages/Staff'
import UsersTable from './pages/UsersTable'
import { ROLE_LABEL } from './util'

interface MenuRoute {
  path: string
  name: string
  icon: ReactNode
}

// 菜单按角色裁剪（只是辅助：权限以服务端校验为准）。
function routesFor(me: Me): MenuRoute[] {
  if (me.role === 'agent') {
    return [
      { path: '/users', name: '我的账号', icon: <TeamOutlined /> },
      {
        path: '/segments',
        name: me.agent?.tier === 'senior' ? '编号划拨' : '编号流水',
        icon: <PartitionOutlined />,
      },
    ]
  }
  const routes: MenuRoute[] = [
    { path: '/dashboard', name: '概览', icon: <DashboardOutlined /> },
    { path: '/users', name: '用户管理', icon: <TeamOutlined /> },
    { path: '/agents', name: '代理管理', icon: <ApartmentOutlined /> },
    { path: '/segments', name: '号段管理', icon: <PartitionOutlined /> },
    { path: '/data-sources', name: '数据源', icon: <ApiOutlined /> },
    { path: '/audit-logs', name: '操作日志', icon: <FileSearchOutlined /> },
  ]
  if (me.role === 'super') {
    routes.push({ path: '/staff', name: '管理员与授权', icon: <SafetyOutlined /> })
  }
  return routes
}

function renderPage(pathname: string, me: Me): ReactNode {
  switch (pathname) {
    case '/dashboard':
      return <Dashboard />
    case '/users':
      return <UsersTable me={me} />
    case '/agents':
      return <Agents me={me} />
    case '/segments':
      return <Segments me={me} />
    case '/data-sources':
      return <DataSources />
    case '/audit-logs':
      return <AuditLogs />
    case '/staff':
      return <Staff />
    default:
      return null
  }
}

export default function MainLayout({ me, onLoggedOut }: { me: Me; onLoggedOut: () => void }) {
  const { message } = App.useApp()
  const routes = routesFor(me)
  const [pathname, setPathname] = useState(routes[0].path)
  const title = routes.find((r) => r.path === pathname)?.name

  const handleLogout = async () => {
    await logout()
    message.success('已退出登录')
    onLoggedOut()
  }

  return (
    <ProLayout
      title={BRAND}
      logo={<Logo />}
      layout="mix"
      fixedHeader
      fixSiderbar
      route={{ path: '/', routes }}
      location={{ pathname }}
      menuItemRender={(item, dom) => (
        <a onClick={() => item.path && setPathname(item.path)}>{dom}</a>
      )}
      avatarProps={{
        icon: <UserOutlined />,
        size: 'small',
        title: `${me.username}（${ROLE_LABEL[me.role] ?? me.role}）`,
        render: (_, dom) => (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: handleLogout,
                },
              ],
            }}
          >
            {dom}
          </Dropdown>
        ),
      }}
    >
      <PageContainer header={{ title }}>{renderPage(pathname, me)}</PageContainer>
    </ProLayout>
  )
}
```

- [ ] **Step 6: `src/pages/UsersTable.tsx`（整文件）**

代理身份：隐藏「新增用户」与「归属代理」列/筛选，操作列只剩「激活」；后台人员：增加「编号状态」「归属代理」列，归属代理筛选走服务端 `?agent_id=`。

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormDatePicker,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button, Dropdown, Popconfirm } from 'antd'
import { DownOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  activateUser,
  ApiResult,
  createUser,
  deleteUser,
  listAgents,
  listUsers,
  Me,
  patchUser,
  resetUserPassword,
  UserRow,
} from '../api'
import { fmtDate, fmtDateTime, NUMBER_STATUS_LABEL, STATUS_LABEL, toEpoch, toValueEnum } from '../util'

// 后台人员：全部账号 + 全部操作；代理：只读本人名下账号，唯一操作是激活待激活账号。
export default function UsersTable({ me }: { me: Me }) {
  const { message, modal } = App.useApp()
  const actionRef = useRef<ActionType>()
  const reload = () => actionRef.current?.reload()
  const isAgent = me.role === 'agent'
  const [agentEnum, setAgentEnum] = useState<Record<string, { text: string }>>({})

  useEffect(() => {
    if (isAgent) return
    listAgents()
      .then((rows) => setAgentEnum(Object.fromEntries(rows.map((a) => [String(a.id), { text: a.name }]))))
      .catch(() => setAgentEnum({}))
  }, [isAgent])

  // 统一处理接口结果：成功提示并刷新，失败优先显示后端 error 文案。
  const run = async (p: Promise<ApiResult>, okMsg: string, failMsg: string) => {
    const r = await p
    if (r.ok) {
      message.success(okMsg)
      reload()
    } else {
      message.error(r.error || failMsg)
    }
    return r.ok
  }

  const setStatus = (code: string, status: string, okMsg: string) =>
    run(patchUser(code, { status }), okMsg, '操作失败')

  const columns: ProColumns<UserRow>[] = [
    {
      title: '编号',
      dataIndex: 'code',
      copyable: true,
      fieldProps: { placeholder: '按编号搜索' },
    },
    {
      title: '编号状态',
      dataIndex: 'number_status',
      valueType: 'select',
      valueEnum: toValueEnum(NUMBER_STATUS_LABEL),
    },
    {
      title: '归属代理',
      dataIndex: 'agent_id',
      valueType: 'select',
      valueEnum: agentEnum,
      hideInTable: isAgent,
      hideInSearch: isAgent,
      fieldProps: { showSearch: true },
      render: (_, r) => r.agent_name || '—',
    },
    {
      title: '激活状态',
      dataIndex: 'activated',
      valueType: 'select',
      valueEnum: {
        false: { text: '待激活', status: 'Default' },
        true: { text: '已激活', status: 'Success' },
      },
    },
    {
      title: '使用控制',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: {
        active: { text: STATUS_LABEL.active, status: 'Success' },
        disabled: { text: STATUS_LABEL.disabled, status: 'Warning' },
        banned: { text: STATUS_LABEL.banned, status: 'Error' },
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      hideInSearch: true,
      render: (_, r) => r.phone || '—',
    },
    {
      title: '首登',
      dataIndex: 'onboarded',
      hideInSearch: true,
      render: (_, r) => (r.onboarded ? '已完成' : '未完成'),
    },
    {
      title: '到期',
      dataIndex: 'expires_at',
      hideInSearch: true,
      render: (_, r) => fmtDate(r.expires_at),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      hideInSearch: true,
      render: (_, r) => fmtDateTime(r.created_at),
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, record) => {
        const activate = !record.activated && (
          <Popconfirm
            key="activate"
            title="激活后初始密码为 123456，确认激活？"
            okText="激活"
            cancelText="取消"
            onConfirm={() => run(activateUser(record.code), '已激活', '激活失败')}
          >
            <a>激活</a>
          </Popconfirm>
        )
        if (isAgent) return [activate]
        // 不常用 / 有风险的操作收进「更多」，确认走 modal.confirm（Dropdown 内无法嵌 Popconfirm）。
        const more = [
          record.status !== 'banned' && {
            key: 'ban',
            label: '封禁',
            danger: true,
            onClick: () =>
              modal.confirm({
                title: `确认封禁账号 ${record.code}？`,
                content: '封禁后该账号立即下线且无法登录，可通过「恢复」解除。',
                okText: '封禁',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => setStatus(record.code, 'banned', '已封禁'),
              }),
          },
          record.activated && {
            key: 'reset',
            label: '重置密码',
            onClick: () =>
              modal.confirm({
                title: `重置账号 ${record.code} 的密码？`,
                content: '密码将重置为 123456，用户下次登录需重新修改密码并验证手机号，确认？',
                okText: '确认重置',
                cancelText: '取消',
                onOk: () => run(resetUserPassword(record.code), '密码已重置为初始密码', '重置失败'),
              }),
          },
          {
            key: 'del',
            label: '删除',
            danger: true,
            onClick: () =>
              modal.confirm({
                title: `确认删除用户 ${record.code}？`,
                okText: '删除',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => run(deleteUser(record.code), '已删除', '删除失败'),
              }),
          },
        ].filter(Boolean) as { key: string; label: string; danger?: boolean; onClick: () => void }[]

        return [
          activate,
          record.status === 'active' ? (
            <a key="pause" onClick={() => setStatus(record.code, 'disabled', '已暂停')}>
              暂停
            </a>
          ) : (
            <a key="resume" onClick={() => setStatus(record.code, 'active', '已恢复')}>
              恢复
            </a>
          ),
          <ModalForm
            key="expire"
            title={`改到期 · ${record.code}`}
            trigger={<a>改到期</a>}
            width={360}
            modalProps={{ destroyOnClose: true }}
            initialValues={{
              expires: record.expires_at ? dayjs.unix(record.expires_at) : undefined,
            }}
            onFinish={async (v: { expires?: unknown }) =>
              run(patchUser(record.code, { expires_at: toEpoch(v.expires) }), '到期时间已更新', '更新失败')
            }
          >
            <ProFormDatePicker
              name="expires"
              label="到期日"
              extra="留空表示永久"
              fieldProps={{ style: { width: '100%' } }}
            />
          </ModalForm>,
          <Dropdown key="more" menu={{ items: more }} trigger={['click']}>
            <a onClick={(e) => e.preventDefault()}>
              更多 <DownOutlined />
            </a>
          </Dropdown>,
        ]
      },
    },
  ]

  return (
    <ProTable<UserRow>
      rowKey="code"
      actionRef={actionRef}
      columns={columns}
      cardBordered
      search={{ labelWidth: 'auto' }}
      options={{ reload: true, density: false, setting: true }}
      pagination={{ pageSize: 10, showSizeChanger: true }}
      request={async (params) => {
        const all = await listUsers(!isAgent && params.agent_id ? Number(params.agent_id) : undefined)
        let rows = all
        if (params.code) {
          const kw = String(params.code).toLowerCase()
          rows = rows.filter((u) => u.code.toLowerCase().includes(kw))
        }
        if (params.status) {
          rows = rows.filter((u) => u.status === params.status)
        }
        if (params.activated) {
          rows = rows.filter((u) => String(u.activated) === params.activated)
        }
        if (params.number_status) {
          rows = rows.filter((u) => u.number_status === params.number_status)
        }
        const current = params.current ?? 1
        const pageSize = params.pageSize ?? 10
        const start = (current - 1) * pageSize
        return { data: rows.slice(start, start + pageSize), total: rows.length, success: true }
      }}
      toolBarRender={() => [
        !isAgent && (
          <ModalForm
            key="create"
            title="新增用户"
            width={400}
            modalProps={{ destroyOnClose: true }}
            trigger={
              <Button type="primary" icon={<PlusOutlined />}>
                新增用户
              </Button>
            }
            onFinish={async (v: { code: string; expires?: unknown }) =>
              run(
                createUser((v.code || '').trim().toUpperCase(), toEpoch(v.expires)),
                '已新增用户（待激活）',
                '新增失败',
              )
            }
          >
            <ProFormText
              name="code"
              label="编号"
              placeholder="如 USER01（自动转大写）"
              rules={[{ required: true, message: '请输入编号' }]}
              extra="新建账号为待激活状态，激活后初始密码为 123456"
            />
            <ProFormDatePicker
              name="expires"
              label="到期日"
              extra="留空表示永久"
              fieldProps={{ style: { width: '100%' } }}
            />
          </ModalForm>
        ),
      ]}
    />
  )
}
```

- [ ] **Step 7: `src/pages/Agents.tsx`（新建）**

```tsx
import { useRef, useState } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button, Popconfirm, Tooltip } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  AgentInput,
  AgentRow,
  ApiResult,
  createAgent,
  listAgents,
  Me,
  recycleAgent,
  renameAgent,
  setAgentPassword,
  setAgentStatus,
  updateAgent,
} from '../api'
import {
  AGENT_STATUS_LABEL,
  fmtDateTime,
  REGION_LABEL,
  TIER_LABEL,
  toValueEnum,
} from '../util'

const PASSWORD_RULES = [
  { required: true, message: '请输入密码' },
  { min: 8, max: 64, message: '密码长度需为 8–64 位' },
]

export default function Agents({ me }: { me: Me }) {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()
  const [all, setAll] = useState<AgentRow[]>([])
  const reload = () => actionRef.current?.reload()
  const canRename = me.role === 'super' || me.grants.includes('agent.rename')

  const run = async (p: Promise<ApiResult>, okMsg: string) => {
    const r = await p
    if (r.ok) {
      message.success(okMsg)
      reload()
    } else {
      message.error(r.error || '操作失败')
    }
    return r.ok
  }

  // 可做上级的代理：资格激活的高级代理（排除自己）
  const parentOptions = (selfId?: number) =>
    all
      .filter((a) => a.tier === 'senior' && a.status === 'active' && a.id !== selfId)
      .map((a) => ({ label: a.name, value: a.id }))

  const columns: ProColumns<AgentRow>[] = [
    { title: '名称', dataIndex: 'name', fieldProps: { placeholder: '按名称搜索' } },
    { title: '地区', dataIndex: 'region', valueType: 'select', valueEnum: toValueEnum(REGION_LABEL) },
    { title: '级别', dataIndex: 'tier', valueType: 'select', valueEnum: toValueEnum(TIER_LABEL) },
    { title: '上级', dataIndex: 'parent_name', hideInSearch: true, render: (_, r) => r.parent_name || '—' },
    {
      title: '资格',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: {
        active: { text: AGENT_STATUS_LABEL.active, status: 'Success' },
        paused: { text: AGENT_STATUS_LABEL.paused, status: 'Warning' },
        cancelled: { text: AGENT_STATUS_LABEL.cancelled, status: 'Error' },
      },
      render: (dom, r) =>
        r.status_reason ? (
          <Tooltip
            title={`${r.status_by ?? ''} ${r.status_at ? fmtDateTime(r.status_at) : ''}：${r.status_reason}`}
          >
            <span>
              {dom}
              {r.recycled_at ? '（已回收）' : ''}
            </span>
          </Tooltip>
        ) : (
          dom
        ),
    },
    { title: '总配额', dataIndex: 'total', hideInSearch: true },
    { title: '已激活', dataIndex: 'activated', hideInSearch: true },
    { title: '未激活', dataIndex: 'unactivated', hideInSearch: true },
    { title: '下级数', dataIndex: 'children', hideInSearch: true },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, r) => [
        <ModalForm
          key="edit"
          title={`编辑代理 · ${r.name}`}
          trigger={<a>编辑</a>}
          width={400}
          modalProps={{ destroyOnClose: true }}
          initialValues={{ region: r.region, tier: r.tier, parent_agent_id: r.parent_agent_id ?? undefined }}
          onFinish={async (v: { region: string; tier: string; parent_agent_id?: number }) =>
            run(
              updateAgent(r.id, { region: v.region, tier: v.tier, parent_agent_id: v.parent_agent_id ?? null }),
              '已保存',
            )
          }
        >
          <ProFormSelect name="region" label="地区标签" valueEnum={REGION_LABEL} rules={[{ required: true }]} />
          <ProFormSelect
            name="tier"
            label="级别"
            valueEnum={TIER_LABEL}
            rules={[{ required: true }]}
            extra="只有高级代理可以有下级、向下划拨编号"
          />
          <ProFormSelect
            name="parent_agent_id"
            label="上级代理"
            options={parentOptions(r.id)}
            fieldProps={{ allowClear: true }}
            extra="留空表示无上级"
          />
        </ModalForm>,
        <ModalForm
          key="status"
          title={`资格变更 · ${r.name}`}
          trigger={<a>资格</a>}
          width={400}
          modalProps={{ destroyOnClose: true }}
          onFinish={async (v: { status: string; reason: string }) =>
            run(setAgentStatus(r.id, v.status, v.reason), '资格已变更')
          }
        >
          <ProFormSelect
            name="status"
            label="新资格状态"
            options={Object.entries(AGENT_STATUS_LABEL)
              .filter(([k]) => k !== r.status)
              .map(([value, label]) => ({ value, label }))}
            rules={[{ required: true, message: '请选择资格状态' }]}
            extra="暂停/取消后该代理不能登录后台；取消后名称保留一年，回收前可恢复"
          />
          <ProFormTextArea
            name="reason"
            label="原因"
            rules={[{ required: true, whitespace: true, message: '请填写变更原因' }, { max: 200 }]}
          />
        </ModalForm>,
        canRename && r.status !== 'cancelled' && (
          <ModalForm
            key="rename"
            title={`改名 · ${r.name}`}
            trigger={<a>改名</a>}
            width={400}
            modalProps={{ destroyOnClose: true }}
            onFinish={async (v: { name: string }) => run(renameAgent(r.id, v.name), '已改名')}
          >
            <ProFormText
              name="name"
              label="新名称"
              rules={[{ required: true, whitespace: true, message: '请输入新名称' }, { max: 20 }]}
              extra="旧名称保留一年，期间他人不能使用；登录用户名同步改为新名称"
            />
          </ModalForm>
        ),
        <ModalForm
          key="password"
          title={`重置登录密码 · ${r.name}`}
          trigger={<a>重置密码</a>}
          width={400}
          modalProps={{ destroyOnClose: true }}
          onFinish={async (v: { password: string }) => run(setAgentPassword(r.id, v.password), '密码已重置')}
        >
          <ProFormText.Password name="password" label="新密码" rules={PASSWORD_RULES} />
        </ModalForm>,
        r.status === 'cancelled' && !r.recycled_at && (
          <Popconfirm
            key="recycle"
            title="回收后：名下未激活编号变为未分配，下级代理解除上级关系，且该代理不能再恢复。确认回收？"
            okText="回收"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => run(recycleAgent(r.id), '已回收')}
          >
            <a style={{ color: '#ff4d4f' }}>回收</a>
          </Popconfirm>
        ),
      ],
    },
  ]

  return (
    <ProTable<AgentRow>
      rowKey="id"
      actionRef={actionRef}
      columns={columns}
      cardBordered
      search={{ labelWidth: 'auto' }}
      options={{ reload: true, density: false, setting: true }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
      request={async (params) => {
        const rows = await listAgents()
        setAll(rows)
        const kw = params.name ? String(params.name).toLowerCase() : ''
        const data = rows.filter(
          (a) =>
            (!kw || a.name.toLowerCase().includes(kw)) &&
            (!params.region || a.region === params.region) &&
            (!params.tier || a.tier === params.tier) &&
            (!params.status || a.status === params.status),
        )
        return { data, total: data.length, success: true }
      }}
      toolBarRender={() => [
        <ModalForm
          key="create"
          title="新建代理"
          width={420}
          modalProps={{ destroyOnClose: true }}
          trigger={
            <Button type="primary" icon={<PlusOutlined />}>
              新建代理
            </Button>
          }
          onFinish={async (v: AgentInput & { parent_agent_id?: number }) =>
            run(createAgent({ ...v, parent_agent_id: v.parent_agent_id ?? null }), '已新建代理')
          }
        >
          <ProFormText
            name="name"
            label="代理名称"
            rules={[{ required: true, whitespace: true, message: '请输入名称' }, { max: 20 }]}
            extra="全局唯一（不区分大小写），同时作为后台登录用户名"
          />
          <ProFormText.Password name="password" label="登录密码" rules={PASSWORD_RULES} />
          <ProFormSelect name="region" label="地区标签" valueEnum={REGION_LABEL} rules={[{ required: true }]} />
          <ProFormSelect name="tier" label="级别" valueEnum={TIER_LABEL} rules={[{ required: true }]} />
          <ProFormSelect
            name="parent_agent_id"
            label="上级代理"
            options={parentOptions()}
            fieldProps={{ allowClear: true }}
            extra="可选；必须是资格激活的高级代理"
          />
        </ModalForm>,
      ]}
    />
  )
}
```

- [ ] **Step 8: `src/pages/Segments.tsx`（新建）**

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormDigit,
  ProFormSelect,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button } from 'antd'
import { PlusOutlined, SwapOutlined } from '@ant-design/icons'
import {
  AgentRow,
  ApiResult,
  assignSegment,
  listAgents,
  listSegmentOps,
  Me,
  SegmentOpRow,
  transferSegment,
} from '../api'
import { fmtDateTime } from '../util'

const OP_LABEL: Record<string, string> = { assign: '分配', transfer: '划拨', recycle: '回收' }
const NO_RULES = [{ required: true, message: '请输入编号' }]
const NO_PROPS = { min: 1000000, max: 9999999, precision: 0 }

export default function Segments({ me }: { me: Me }) {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()
  // 后台人员：全部代理（分配对象）；代理：本人直属下级（划拨对象）
  const [agents, setAgents] = useState<AgentRow[]>([])
  const isStaff = me.role !== 'agent'
  const canTransfer = me.role === 'agent' && me.agent?.tier === 'senior'

  useEffect(() => {
    if (isStaff || canTransfer) listAgents().then(setAgents).catch(() => setAgents([]))
  }, [isStaff, canTransfer])

  const targets = agents
    .filter((a) => a.status === 'active')
    .map((a) => ({ label: a.name, value: a.id }))

  const run = async (p: Promise<ApiResult>, okMsg: string) => {
    const r = await p
    if (r.ok) {
      message.success(okMsg)
      actionRef.current?.reload()
    } else {
      message.error(r.error || '操作失败')
    }
    return r.ok
  }

  const columns: ProColumns<SegmentOpRow>[] = [
    { title: '时间', dataIndex: 'created_at', width: 160, render: (_, r) => fmtDateTime(r.created_at) },
    { title: '类型', dataIndex: 'op', width: 80, render: (_, r) => OP_LABEL[r.op] ?? r.op },
    {
      title: '编号区间',
      dataIndex: 'start_no',
      render: (_, r) => (r.start_no == null ? '—' : `${r.start_no} – ${r.end_no}`),
    },
    { title: '数量', dataIndex: 'count', width: 90 },
    { title: '划出方', dataIndex: 'from_name', render: (_, r) => r.from_name || '—' },
    { title: '接收方', dataIndex: 'to_name', render: (_, r) => r.to_name || '—' },
    { title: '操作者', dataIndex: 'actor' },
  ]

  const rangeFields = (
    <>
      <ProFormDigit name="start" label="起始编号" rules={NO_RULES} fieldProps={NO_PROPS} />
      <ProFormDigit
        name="end"
        label="结束编号"
        rules={NO_RULES}
        fieldProps={NO_PROPS}
        extra="7 位数字，含两端，单次最多 10000 个"
      />
    </>
  )

  return (
    <ProTable<SegmentOpRow>
      rowKey="id"
      actionRef={actionRef}
      columns={columns}
      cardBordered
      search={false}
      headerTitle="号段流水"
      options={{ reload: true, density: false, setting: false }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
      request={async (params) => {
        const current = params.current ?? 1
        const pageSize = params.pageSize ?? 20
        const { ops, total } = await listSegmentOps(pageSize, (current - 1) * pageSize)
        return { data: ops, total, success: true }
      }}
      toolBarRender={() => [
        isStaff && (
          <ModalForm
            key="assign"
            title="分配号段"
            width={420}
            modalProps={{ destroyOnClose: true }}
            trigger={
              <Button type="primary" icon={<PlusOutlined />}>
                分配号段
              </Button>
            }
            onFinish={async (v: { agent_id: number; start: number; end: number }) =>
              run(assignSegment(v.agent_id, v.start, v.end), '已分配，段内编号已建为待激活账号')
            }
          >
            <ProFormSelect
              name="agent_id"
              label="代理"
              options={targets}
              rules={[{ required: true, message: '请选择代理' }]}
              showSearch
            />
            {rangeFields}
          </ModalForm>
        ),
        canTransfer && (
          <ModalForm
            key="transfer"
            title="划拨编号给直属下级"
            width={420}
            modalProps={{ destroyOnClose: true }}
            trigger={
              <Button type="primary" icon={<SwapOutlined />}>
                划拨编号
              </Button>
            }
            onFinish={async (v: { to_agent_id: number; start: number; end: number }) =>
              run(transferSegment(v.to_agent_id, v.start, v.end), '已划拨')
            }
          >
            <ProFormSelect
              name="to_agent_id"
              label="直属下级"
              options={targets}
              rules={[{ required: true, message: '请选择下级代理' }]}
              extra="只能划拨本人名下、从未激活的编号；划拨后不可撤回"
            />
            {rangeFields}
          </ModalForm>
        ),
      ]}
    />
  )
}
```

- [ ] **Step 9: `src/pages/Staff.tsx`（新建）**

```tsx
import { useRef } from 'react'
import { ActionType, ModalForm, ProColumns, ProFormText, ProTable } from '@ant-design/pro-components'
import { App, Button, Popconfirm, Switch } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  AdminRow,
  addGrant,
  ApiResult,
  createAdmin,
  deleteAdmin,
  listAdmins,
  revokeGrant,
  setAdminPassword,
} from '../api'
import { fmtDateTime, ROLE_LABEL } from '../util'

const RENAME = 'agent.rename'
const PASSWORD_RULES = [
  { required: true, message: '请输入密码' },
  { min: 8, max: 64, message: '密码长度需为 8–64 位' },
]

// 仅最高权限者可见：管理员账号管理 + 「代理改名」授权（被授权者不能转授）。
export default function Staff() {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()

  const run = async (p: Promise<ApiResult>, okMsg: string) => {
    const r = await p
    if (r.ok) {
      message.success(okMsg)
      actionRef.current?.reload()
    } else {
      message.error(r.error || '操作失败')
    }
    return r.ok
  }

  const columns: ProColumns<AdminRow>[] = [
    { title: '用户名', dataIndex: 'username' },
    { title: '角色', dataIndex: 'role', render: (_, r) => ROLE_LABEL[r.role] ?? r.role },
    { title: '创建时间', dataIndex: 'created_at', render: (_, r) => fmtDateTime(r.created_at) },
    {
      title: '代理改名授权',
      dataIndex: 'grants',
      render: (_, r) =>
        r.role === 'super' ? (
          '（固有）'
        ) : (
          <Switch
            checked={r.grants.includes(RENAME)}
            onChange={(on) =>
              run(on ? addGrant(r.id, RENAME) : revokeGrant(r.id, RENAME), on ? '已授权' : '已撤销授权')
            }
          />
        ),
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, r) =>
        r.role === 'super'
          ? ['最高权限者由服务器命令指定']
          : [
              <ModalForm
                key="pw"
                title={`重置密码 · ${r.username}`}
                trigger={<a>重置密码</a>}
                width={400}
                modalProps={{ destroyOnClose: true }}
                onFinish={async (v: { password: string }) => run(setAdminPassword(r.id, v.password), '密码已重置')}
              >
                <ProFormText.Password name="password" label="新密码" rules={PASSWORD_RULES} />
              </ModalForm>,
              <Popconfirm
                key="del"
                title={`确认删除管理员 ${r.username}？`}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={() => run(deleteAdmin(r.id), '已删除')}
              >
                <a style={{ color: '#ff4d4f' }}>删除</a>
              </Popconfirm>,
            ],
    },
  ]

  return (
    <ProTable<AdminRow>
      rowKey="id"
      actionRef={actionRef}
      columns={columns}
      cardBordered
      search={false}
      headerTitle="管理员"
      options={{ reload: true, density: false, setting: false }}
      pagination={false}
      request={async () => {
        const data = await listAdmins()
        return { data, total: data.length, success: true }
      }}
      toolBarRender={() => [
        <ModalForm
          key="create"
          title="新建管理员"
          width={400}
          modalProps={{ destroyOnClose: true }}
          trigger={
            <Button type="primary" icon={<PlusOutlined />}>
              新建管理员
            </Button>
          }
          onFinish={async (v: { username: string; password: string }) =>
            run(createAdmin(v.username, v.password), '已新建管理员')
          }
        >
          <ProFormText
            name="username"
            label="用户名"
            rules={[{ required: true, whitespace: true, message: '请输入用户名' }, { max: 20 }]}
          />
          <ProFormText.Password name="password" label="密码" rules={PASSWORD_RULES} />
        </ModalForm>,
      ]}
    />
  )
}
```

- [ ] **Step 10: `src/pages/AuditLogs.tsx`**

10a. import 改为 `import { AGENT_STATUS_LABEL, fmtDate, fmtDateTime, STATUS_LABEL } from '../util'`。

10b. `ACTION_LABEL` 在 `'user.onboard': '首登改密绑定',` 之后追加：

```ts
  'agent.create': '新建代理',
  'agent.update': '修改代理',
  'agent.status': '代理资格变更',
  'agent.rename': '代理改名',
  'agent.password': '重置代理密码',
  'agent.recycle': '回收编号',
  'segment.assign': '分配号段',
  'segment.transfer': '划拨编号',
  'admin.create': '新建管理员',
  'admin.password': '重置管理员密码',
  'admin.delete': '删除管理员',
  'admin.set_super': '指定最高权限者',
  'grant.add': '授权',
  'grant.revoke': '撤销授权',
```

10c. `fmtDetail` 中 `if (r.action === 'user.expires') {` 之前插入：

```ts
  if (r.action === 'agent.status') {
    const f = String(d.from)
    const t = String(d.to)
    return `${AGENT_STATUS_LABEL[f] ?? f} → ${AGENT_STATUS_LABEL[t] ?? t}（${String(d.reason ?? '')}）`
  }
  if (r.action === 'agent.rename') {
    return `${String(d.from)} → ${String(d.to)}`
  }
```

10d. 「对象」搜索框 placeholder 改为 `'按对象（账号编号 / 代理名称）搜索'`。

- [ ] **Step 11: 类型检查**

Run: `cd backend/admin-ui && npx tsc --noEmit`
Expected: 无输出、退出码 0。

- [ ] **Step 12: 构建产物**

Run: `cd backend/admin-ui && npm run build`
Expected: `✓ built`，`backend/app/static/admin-dist/index.html` 与 `assets/index-*.js|css` 更新（旧哈希文件被 `emptyOutDir` 清掉）。产物体积告警（chunk > 500 kB）为既有现象，可忽略。

- [ ] **Step 13: 后端测试仍全绿（`test_site.py`、`test_admin.py::test_admin_index_served_as_html` 依赖 admin-dist）**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部通过。

- [ ] **Step 14: 手工冒烟（本地，不部署）**

```bash
cd backend
export DB_PATH=/tmp/ys-b-smoke.db ADMIN_COOKIE_SECURE=false ADMIN_KEY=dev COLLECTOR_ENABLED=false
.venv/bin/python manage.py admin-set boss 'Passw0rd!'
.venv/bin/python manage.py set-super boss
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

浏览器打开 `http://127.0.0.1:8000/admin/`：以 boss 登录 → 菜单含「管理员与授权」；新建高级代理 A、其下级 B（低级）；号段管理给 A 分配 `1000000–1000009`；用 A 登录 → 只有「我的账号」「编号划拨」，能看到 10 个待激活号、能激活其中一个、能把 `1000005–1000009` 划给 B；把 A 资格改为暂停 → A 的页面刷新后回到登录页，再登录提示「代理资格已暂停，无法登录」。冒烟后删除 `/tmp/ys-b-smoke.db*`。

- [ ] **Step 15: Commit**

```bash
git add backend/admin-ui/src backend/app/static/admin-dist
git commit -m "feat(admin-ui): role-based menus with agents, segments and staff pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

评审本任务时用 `git show --stat HEAD` 确认产物只在 `backend/app/static/admin-dist/`，并以 `git show HEAD -- . ':(exclude)backend/app/static/admin-dist'` 查看源码 diff。

---

## Self-Review

**Spec 覆盖（逐条对照 spec → 任务）：**

| Spec 条目 | 任务 |
|---|---|
| §1 三类登录身份统一登录同一后台，按角色显示菜单与数据 | T1（`require_role`、`/me`、登录）、T5（数据范围）、T6（菜单） |
| §1/§4 代理资料：名称全局唯一、改名或取消后旧名保留一年 | T2（`ensure_name_available`、取消写保留、过期释放）、T3（改名写保留） |
| §1/§4 地区标签 province/city/vip、级别 senior/junior、上级、资格状态含变更人/时间/原因 | T2 |
| §1/§2 编号段分配（管理员→代理）、划拨（高级→直属下级，不可撤回）、回收；总配额/已激活/未激活统计 | T4（分配/划拨/回收/流水）、T2（`list_agents` 统计） |
| §1/§5 代理激活本人名下账号，首次激活记录直接/间接/次间接上级（界面只展示直接上级） | T5（`activate_user(by_agent_id)`、`agent_chain`）；T6 只展示「归属代理」 |
| §1/§3 授权：最高权限者把「代理改名」授予指定管理员，可撤销，不得转授 | T3 |
| §1 所有操作写审计日志 | T1（set_super）、T2、T3、T4、T5（沿用 user.activate），审计动作清单见各任务 Interfaces；T6 日志页中文映射 |
| §2 新号 7 位纯数字 1000000–9999999、存量账号不改不入段、`agent_id` 为空 | T4（`parse_range`、GLOB 过滤）、T1 迁移只加列不回填 |
| §2 起止表示、单次 ≤10000 | T4 |
| §2 分配即建档（123456、pending）；冲突整次拒绝并提示冲突编号；回收后的号可再分配直接改归属 | T4（共用哈希见「关键决定 1」） |
| §2 归属以 `users.agent_id` 为准，`segment_ops` 只是流水 | T4/T5（判定只查 users） |
| §3 权限表：账号激活/暂停/封禁/重置/删除（后台全量，代理仅激活与只读本人） | T1（STAFF_ONLY）、T5 |
| §3 新建代理、改地区/级别/上级；资格变更；分配、回收（super/admin） | T2、T4 |
| §3 编号划拨仅高级代理 | T4（`AGENT_ONLY` + `tier` 检查） |
| §3 代理改名：super ✓、admin 需授权、agent ✗ | T3 |
| §3 授权管理、管理员账号管理仅 super | T3 |
| §3 操作日志：super/admin 全部、代理 ✗ | T1（audit-logs STAFF_ONLY） |
| §3 服务端校验角色与数据范围；`X-Admin-Key` 视为最高权限者 | T1 |
| §3 最高权限者唯一，`manage.py set-super` 指定、原最高权限者降级、界面不能转让；升级后现有管理员为普通管理员，部署后需执行一次 | T1（`set_super` 单事务 + 部分唯一索引 + README/DEPLOY）；T3 不提供转让接口、不能改/删 super |
| §4 代理是 `admins.role='agent'`，用户名即代理名称，只能登录后台 | T1（role）、T2（create_agent 建 admins 行）、T3（改名同步 username）；客户端登录走 `users` 表，与 admins 无关 |
| §4 只有高级可做上级/划拨；低级不能有下级；高改低有下级则拒绝；上级必须激活的高级代理、非自己、非下级 | T2（`_check_parent`、`update_agent`）、T4 |
| §4 暂停：不能登录、名下账号不受影响 | T1（登录 + 逐请求拒绝）；不改动 users |
| §4 取消：不能登录、未激活编号显示待回收、名称保留一年、回收前可恢复且恢复后名称仍归本人 | T1、T5（`to_recycle`）、T2（保留与恢复）、T4（`recycled_at` 阻止恢复） |
| §4 每次资格变更记录变更人、时间、原因（必填） | T2 |
| §4 名称规范化：不区分大小写、去首尾空格、1–20 字符；冲突「该名称已被使用」；本人恢复时删除自己的旧名保留 | T2 |
| §4 回收：仅已取消代理；未激活账号 `agent_id` 置空；下级 `parent_agent_id` 置空；已激活保持 | T4 |
| §5 编号五态由数据推导 | T5（`number_status`；已欠费待 C） |
| §5 使用控制仍为独立 `status` | 未改动 A 的 status 逻辑 |
| §6 数据模型（admins.role、agents、agent_name_reservations、segment_ops、users 三列、admin_grants） | T1（另加 `agents.recycled_at`，见关键决定 3） |
| §6 按代理统计 | T2 |
| §8 实施划分 1–5 | T1 / T2+T3 / T4 / T5 / T6 |

**Placeholder 扫描：** 全文无 TBD/TODO/“类似 Task N”；所有代码步骤给出完整代码或精确的替换前后文本。

**类型与命名一致性：** `BizError(msg, status)`、`begin_write`、`ensure_name_available(conn, key, now, self_agent_id)`、`Principal(role, username, admin_id, agent_id)`、`require_role(*roles)`、`STAFF`/`ALL_ROLES`、`activate_user(conn, code, now, *, by_agent_id=None)`、`list_users_with_agent`、`number_status` 在定义处与使用处一致；前端 `Me`/`AgentRow`/`UserRow` 字段与后端返回一致（`agent_to_dict` 去掉 `admin_id`、`name_key`；列表追加 `parent_name/total/activated/unactivated/children`）。

**验证记录：** 计划中的后端代码与测试已在仓库副本中逐任务验证：Task 1 完成后全量 338 passed；全部完成后 398 passed（基线 324）。前端代码已通过 `tsc --noEmit` 与 `vite build`。
