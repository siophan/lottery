# 子项目 D：客户端用户信息区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 客户端首页左上角显示头像、昵称与积分余额，用户可改头像昵称；默认值由后台按账号编号生成；后台列表显示昵称并可重置。

**Architecture:** 后端新增 `app/profile.py`（默认值生成 + 校验），`users.nickname` 列与 `user_avatars` 表，客户端接口 `routes/user.py`（经 `gate` 同一套拦截），后台接口与页面扩展。客户端新增纯 DOM 脚本 `client/user-profile.js`（`window.dsProfile`），由 `scripts/patch-ds-client.js` 的新补丁层 `profile v1` 在首页挂载、在登录时保存余额。

**Tech Stack:** FastAPI + SQLite（pytest）；React + Ant Design Pro + Vite（tsc + build）；Electron 中编译后的 Vue 2 页面 + 字符串补丁（node --test）。

**Spec:** `docs/superpowers/specs/2026-10-07-user-profile-design.md`

## Global Constraints

- 回复用户用中文；代码、命令、commit message 用英文；每个 commit message 以空行 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 结尾。
- 不要提交 `docs/接口文档(1).docx`、`docs/第011章_K线走势图表与多屏布局.docx`、`docs/第017章_账号积分与代理后台管理_正式版.docx`；不要改动 `backend/data/`。`git add` 只加本任务列出的文件。
- 不推送、不部署。
- 测试命令：后端 `cd backend && .venv/bin/python -m pytest -q`；客户端（仓库根）`npm test`；后台前端 `cd backend/admin-ui && npx tsc --noEmit && npm run build`（产物在 `backend/app/static/admin-dist`，需一并提交）。
- 客户端 `client/js/*` 只能通过 `node scripts/patch-ds-client.js` 修改（补丁分层、幂等），不得手改。
- 昵称：去首尾空白后 1–12 个字符（按 Unicode 码点计，Python `len` / JS `Array.from(s).length`），不得含 Unicode 类别 `Cc` `Cf`（U+200D 零宽连接符除外）`Cs` `Co` `Cn` `Zl` `Zp` 的字符；不要求唯一。
- 头像：客户端居中裁正方形、缩放 128×128、`image/jpeg` 质量 0.85；服务端只接受 `data:image/(jpeg|png|webp);base64,`，解码后 ≤ 100 KB（102400 字节），文件头魔数与声明类型一致；拒绝 SVG 及其他类型。
- 文案（逐字）：「昵称不能为空」「昵称最多 12 个字」「昵称包含不支持的字符」「头像格式不支持」「头像图片过大」「参数错误」「请选择图片文件」「保存失败，请稍后重试」「网络异常，请稍后重试」「修改头像和昵称」「更换头像」「恢复默认」「取消」「保存」「保存中…」、余额显示「积分：N」（未知时「积分：—」）。
- 客户端接口：`GET /api/user/profile`、`GET /api/user/points`、`POST /api/user/profile`，请求头 `token`，拦截与 `gate.authorize` 一致（10020/10022/10024/10025）；成功 `{"code":0,"msg":"成功","data":...}`，校验失败 `{"code":1,"msg":文案}`。
- 后台接口：`GET /admin/users/{code}/profile`（全部角色，代理限本人名下）、`POST /admin/users/{code}/profile/reset`（仅最高权限者与管理员），审计动作 `user.profile_reset`，后台日志标签「重置头像昵称」。
- 余额刷新间隔 60000 ms；首页头像 44px 圆形。

---

### Task 1: 后端头像昵称核心（默认值、校验、存储）

**Files:**
- Create: `backend/app/profile.py`
- Modify: `backend/app/db.py`（`User` 数据类、`_row_to_user`、`init_db` 调用、新迁移 `_migrate_profile`、`delete_user`、新增 `get_user_avatar` / `set_user_profile`）
- Test: `backend/tests/test_profile_core.py`

**Interfaces:**
- Produces（后续任务使用）：
  - `profile.NICK_MAX = 12`、`profile.AVATAR_MAX_BYTES = 102400`
  - 文案常量 `profile.NICK_EMPTY` `NICK_TOO_LONG` `NICK_BAD` `AVATAR_BAD` `AVATAR_TOO_BIG`
  - `profile.default_nickname(code: str) -> str`、`profile.default_avatar(code: str) -> str`（`data:image/svg+xml;base64,...`）
  - `profile.clean_nickname(v) -> tuple[str | None, str | None]`、`profile.clean_avatar(v) -> tuple[str | None, str | None]`（`(值, None)` 或 `(None, 错误文案)`）
  - `profile.display_nickname(u: db.User) -> str`
  - `db.User.nickname: str | None`（数据类最后一个字段，默认 None）
  - `db.get_user_avatar(conn, user_id: int) -> str | None`
  - `db.set_user_profile(conn, user_id: int, *, nickname=_UNSET, avatar=_UNSET, now: int | None = None) -> None`（传 None = 恢复默认，不传 = 不改）

- [ ] **Step 1: 写失败测试** `backend/tests/test_profile_core.py`

```python
import base64
import xml.etree.ElementTree as ET
import pytest
from app import db, profile

JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 60
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 60
WEBP = b"RIFF\0\0\0\0WEBPVP8 " + b"\0" * 60

def data_url(kind: str, raw: bytes) -> str:
    return f"data:image/{kind};base64," + base64.b64encode(raw).decode()

def fresh():
    conn = db.connect(":memory:"); db.init_db(conn)
    return conn

def test_messages_are_verbatim():
    assert (profile.NICK_EMPTY, profile.NICK_TOO_LONG, profile.NICK_BAD) == (
        "昵称不能为空", "昵称最多 12 个字", "昵称包含不支持的字符")
    assert (profile.AVATAR_BAD, profile.AVATAR_TOO_BIG) == ("头像格式不支持", "头像图片过大")
    assert (profile.NICK_MAX, profile.AVATAR_MAX_BYTES) == (12, 102400)

def test_word_lists_are_large_and_unique():
    for words in (profile.ADJECTIVES, profile.NOUNS):
        assert len(words) >= 30 and len(set(words)) == len(words)

def test_default_nickname_is_stable_case_insensitive_and_varied():
    assert profile.default_nickname("abc123") == profile.default_nickname("ABC123")
    n = profile.default_nickname("1000001")
    assert n == profile.default_nickname("1000001")
    assert "的" in n and 1 <= len(n) <= profile.NICK_MAX
    assert len({profile.default_nickname(str(1000000 + i)) for i in range(200)}) >= 100

def test_default_avatar_is_valid_svg_stable_and_varied():
    prefix = "data:image/svg+xml;base64,"
    a = profile.default_avatar("1000001")
    assert a == profile.default_avatar("1000001") == profile.default_avatar("1000001".lower())
    assert a.startswith(prefix)
    root = ET.fromstring(base64.b64decode(a[len(prefix):]))
    assert root.tag.endswith("svg")
    assert len({profile.default_avatar(str(1000000 + i)) for i in range(50)}) >= 45

@pytest.mark.parametrize("raw,expected", [
    ("小明", "小明"), ("  小明  ", "小明"), ("a" * 12, "a" * 12), ("好运的海豚🐬", "好运的海豚🐬"),
    ("👨‍👩", "👨‍👩"),
])
def test_clean_nickname_accepts(raw, expected):
    assert profile.clean_nickname(raw) == (expected, None)

@pytest.mark.parametrize("raw,err", [
    (None, "昵称不能为空"), ("", "昵称不能为空"), ("   ", "昵称不能为空"),
    ("a" * 13, "昵称最多 12 个字"), ("a\nb", "昵称包含不支持的字符"), ("a\x00b", "昵称包含不支持的字符"),
    ("a‮b", "昵称包含不支持的字符"), ("a b", "昵称包含不支持的字符"), (123, "昵称包含不支持的字符"),
])
def test_clean_nickname_rejects(raw, err):
    assert profile.clean_nickname(raw) == (None, err)

@pytest.mark.parametrize("kind,raw", [("jpeg", JPEG), ("png", PNG), ("webp", WEBP)])
def test_clean_avatar_accepts_matching_magic(kind, raw):
    v = data_url(kind, raw)
    assert profile.clean_avatar(v) == (v, None)

def test_clean_avatar_size_limit_is_inclusive():
    ok = data_url("jpeg", JPEG + b"\0" * (profile.AVATAR_MAX_BYTES - len(JPEG)))
    assert profile.clean_avatar(ok) == (ok, None)
    big = data_url("jpeg", JPEG + b"\0" * (profile.AVATAR_MAX_BYTES - len(JPEG) + 1))
    assert profile.clean_avatar(big) == (None, "头像图片过大")
    huge = data_url("jpeg", JPEG + b"\0" * (5 * profile.AVATAR_MAX_BYTES))
    assert profile.clean_avatar(huge) == (None, "头像图片过大")

@pytest.mark.parametrize("v", [
    None, 1, "", "http://x/a.jpg", data_url("svg+xml", b"<svg/>"), data_url("gif", b"GIF89a"),
    data_url("png", JPEG), data_url("jpeg", PNG), "data:image/jpeg;base64,", "data:image/jpeg;base64,@@@@",
    "data:image/jpeg;base64,abc",
])
def test_clean_avatar_rejects(v):
    assert profile.clean_avatar(v) == (None, "头像格式不支持")

def test_migration_is_idempotent_and_creates_storage():
    conn = fresh()
    db.init_db(conn)                                   # 第二次初始化不报错
    assert "nickname" in {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    assert {r["name"] for r in conn.execute("PRAGMA table_info(user_avatars)")} == {"user_id", "data", "updated_at"}

def test_set_and_clear_profile():
    conn = fresh()
    u = db.create_user(conn, "U1", "pw", None)
    assert u.nickname is None and db.get_user_avatar(conn, u.id) is None
    db.set_user_profile(conn, u.id, nickname="小明", avatar="data:x", now=5)
    assert db.get_user_by_id(conn, u.id).nickname == "小明"
    assert db.get_user_avatar(conn, u.id) == "data:x"
    db.set_user_profile(conn, u.id, avatar="data:y", now=6)          # 覆盖头像，昵称不变
    assert db.get_user_avatar(conn, u.id) == "data:y"
    assert conn.execute("SELECT updated_at FROM user_avatars WHERE user_id=?", (u.id,)).fetchone()[0] == 6
    assert db.get_user_by_id(conn, u.id).nickname == "小明"
    db.set_user_profile(conn, u.id, nickname=None, avatar=None)
    assert db.get_user_by_id(conn, u.id).nickname is None and db.get_user_avatar(conn, u.id) is None

def test_delete_user_removes_avatar():
    conn = fresh()
    u = db.create_user(conn, "U1", "pw", None)
    db.set_user_profile(conn, u.id, avatar="data:x")
    assert db.delete_user(conn, "U1")
    assert conn.execute("SELECT COUNT(*) FROM user_avatars").fetchone()[0] == 0

def test_display_nickname_falls_back_to_default():
    conn = fresh()
    u = db.create_user(conn, "U1", "pw", None)
    assert profile.display_nickname(u) == profile.default_nickname("U1")
    db.set_user_profile(conn, u.id, nickname="小明")
    assert profile.display_nickname(db.get_user_by_id(conn, u.id)) == "小明"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_profile_core.py`
Expected: FAIL（`ImportError: cannot import name 'profile'`）

- [ ] **Step 3: 新建 `backend/app/profile.py`**

```python
# 子项目 D：用户头像与昵称。默认值由账号编号确定性生成（不落库，同一账号永远相同）；自定义值的校验。
import base64
import binascii
import colorsys
import hashlib
import re
import unicodedata

NICK_MAX = 12
AVATAR_MAX_BYTES = 100 * 1024

NICK_EMPTY = "昵称不能为空"
NICK_TOO_LONG = "昵称最多 12 个字"
NICK_BAD = "昵称包含不支持的字符"
AVATAR_BAD = "头像格式不支持"
AVATAR_TOO_BIG = "头像图片过大"

ADJECTIVES = (
    "好运", "快乐", "闪亮", "勇敢", "机智", "温柔", "阳光", "安静", "活泼", "聪明",
    "可爱", "淡定", "热情", "自在", "灵动", "沉稳", "开朗", "优雅", "欢乐", "清新",
    "敏捷", "神秘", "幸运", "乐观", "悠闲", "纯真", "坚定", "灿烂", "睿智", "爽朗",
    "温暖", "轻盈", "明亮", "欢喜", "耐心", "豪爽", "潇洒", "专注", "勤奋", "从容",
)
NOUNS = (
    "海豚", "星星", "熊猫", "狮子", "老虎", "白鹤", "雄鹰", "松鼠", "兔子", "小鹿",
    "海鸥", "鲸鱼", "企鹅", "考拉", "狐狸", "骏马", "孔雀", "蝴蝶", "萤火虫", "向日葵",
    "月亮", "太阳", "彩虹", "云朵", "流星", "山峰", "大树", "小溪", "浪花", "风筝",
    "灯塔", "帆船", "蒲公英", "银杏", "竹子", "梅花", "锦鲤", "麒麟", "凤凰", "青龙",
)

def _digest(code: str) -> bytes:
    return hashlib.sha256(code.upper().encode("utf-8")).digest()

def default_nickname(code: str) -> str:
    d = _digest(code)
    adj = ADJECTIVES[int.from_bytes(d[0:4], "big") % len(ADJECTIVES)]
    noun = NOUNS[int.from_bytes(d[4:8], "big") % len(NOUNS)]
    return f"{adj}的{noun}"

def _hex(h: float, l: float, s: float) -> str:
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))

def default_avatar(code: str) -> str:
    """5×5 左右对称的几何图案（左 3 列由哈希取位，右 2 列镜像），前景色色相由哈希决定、背景同色相浅色。"""
    d = _digest(code)
    hue = int.from_bytes(d[8:10], "big") % 360 / 360
    fg, bg = _hex(hue, 0.5, 0.55), _hex(hue, 0.93, 0.4)
    bits = int.from_bytes(d[10:12], "big")
    on = [(x, y) for y in range(5) for x in range(3) if bits >> (y * 3 + x) & 1] or [(2, 2)]
    cells = "".join(f'<rect x="{cx * 10 + 5}" y="{y * 10 + 5}" width="10" height="10"/>'
                    for x, y in on for cx in sorted({x, 4 - x}))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="128" height="128">'
           f'<rect width="60" height="60" fill="{bg}"/><g fill="{fg}">{cells}</g></svg>')
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")

_BAD_CATEGORIES = {"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"}
_ZWJ = "‍"      # 零宽连接符：组合 emoji 需要，放行

def clean_nickname(v) -> tuple[str | None, str | None]:
    if v is None:
        return None, NICK_EMPTY
    if not isinstance(v, str):
        return None, NICK_BAD
    v = v.strip()
    if not v:
        return None, NICK_EMPTY
    if len(v) > NICK_MAX:
        return None, NICK_TOO_LONG
    if any(ch != _ZWJ and unicodedata.category(ch) in _BAD_CATEGORIES for ch in v):
        return None, NICK_BAD
    return v, None

_AVATAR_RE = re.compile(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})")
_B64_MAX = (AVATAR_MAX_BYTES + 2) // 3 * 4       # 解码前先按长度挡掉明显过大的
_MAGIC = {
    "jpeg": lambda b: b[:3] == b"\xff\xd8\xff",
    "png": lambda b: b[:8] == b"\x89PNG\r\n\x1a\n",
    "webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}

def clean_avatar(v) -> tuple[str | None, str | None]:
    if not isinstance(v, str):
        return None, AVATAR_BAD
    m = _AVATAR_RE.fullmatch(v)
    if m is None:
        return None, AVATAR_BAD
    kind, b64 = m.groups()
    if len(b64) > _B64_MAX:
        return None, AVATAR_TOO_BIG
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        return None, AVATAR_BAD
    if len(raw) > AVATAR_MAX_BYTES:
        return None, AVATAR_TOO_BIG
    if not _MAGIC[kind](raw):
        return None, AVATAR_BAD
    return v, None

def display_nickname(u) -> str:
    return u.nickname if u.nickname is not None else default_nickname(u.code)
```

- [ ] **Step 4: 修改 `backend/app/db.py`**

在 `User` 数据类末尾（`trial_granted_at` 之后）加：

```python
    nickname: str | None = None             # 自定义昵称；None = 使用默认昵称（子项目 D）
```

`_row_to_user` 末尾参数追加 `r["nickname"]`：

```python
                r["points"], r["charge_anchor_at"], r["next_charge_at"], r["trial_granted_at"],
                r["nickname"])
```

`init_db` 中 `_migrate_points(conn)` 之后加 `_migrate_profile(conn)`，并在 `_migrate_points` 定义之后新增：

```python
def _migrate_profile(conn) -> None:
    # 子项目 D：头像与昵称。独立于 _migrate_users（不得触发其「缺列即回填已激活」）；只加列 / 建表、不回填。
    # 头像单独存表：gate 每次请求与后台账号列表都会整行读取 users，头像放在 users 里会被反复读出。
    if "nickname" not in {r["name"] for r in conn.execute("PRAGMA table_info(users)")}:
        conn.execute("ALTER TABLE users ADD COLUMN nickname TEXT")
    conn.execute("CREATE TABLE IF NOT EXISTS user_avatars(user_id INTEGER PRIMARY KEY,"
                 " data TEXT NOT NULL, updated_at INTEGER NOT NULL)")
    conn.commit()
```

`delete_user` 在删除 sessions 之后、删除 users 之前加：

```python
    conn.execute("DELETE FROM user_avatars WHERE user_id=?", (u.id,))
```

（用 `grep -n "DELETE FROM users" backend/app/*.py` 确认没有其他删除账号的地方；若有，同样补上删除头像。）

在 `delete_user` 之后新增：

```python
def get_user_avatar(conn, user_id: int) -> str | None:
    r = conn.execute("SELECT data FROM user_avatars WHERE user_id=?", (user_id,)).fetchone()
    return r["data"] if r else None

def set_user_profile(conn, user_id: int, *, nickname=_UNSET, avatar=_UNSET, now: int | None = None) -> None:
    """头像昵称（子项目 D）：传 None 表示恢复默认（昵称置空 / 删除头像记录），不传表示不改；同一事务写入。"""
    ts = int(time.time()) if now is None else now
    try:
        if nickname is not _UNSET:
            conn.execute("UPDATE users SET nickname=? WHERE id=?", (nickname, user_id))
        if avatar is None:
            conn.execute("DELETE FROM user_avatars WHERE user_id=?", (user_id,))
        elif avatar is not _UNSET:
            conn.execute("INSERT INTO user_avatars(user_id,data,updated_at) VALUES(?,?,?)"
                         " ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                         (user_id, avatar, ts))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
```

- [ ] **Step 5: 运行本任务测试与全量后端测试**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_profile_core.py && .venv/bin/python -m pytest -q`
Expected: 全部 PASS（全量此前为 496 passed）

- [ ] **Step 6: 提交**

```bash
git add backend/app/profile.py backend/app/db.py backend/tests/test_profile_core.py
git commit -m "feat(backend): user nickname/avatar storage, defaults and validation"
```

---

### Task 2: 客户端头像昵称与余额接口

**Files:**
- Modify: `backend/app/gate.py`（新增 `authorize_user`，`authorize` 委托给它）
- Create: `backend/app/routes/user.py`
- Modify: `backend/app/main.py`（在兜底转发之前注册路由）
- Modify: `backend/README.md`（「积分」小节之后新增「用户信息区」小节）
- Test: `backend/tests/test_user_profile_api.py`

**Interfaces:**
- Consumes: Task 1 的 `profile.*`、`db.get_user_avatar`、`db.set_user_profile`、`db.User.nickname`
- Produces:
  - `gate.authorize_user(conn, token_header: str) -> tuple[db.User | None, dict | None]`
  - `GET /api/user/profile` → `{"code":0,"msg":"成功","data":{"code","nickname","avatar","defaultAvatar","points","nicknameIsDefault","avatarIsDefault"}}`
  - `GET /api/user/points` → `{"code":0,"msg":"成功","data":{"points"}}`
  - `POST /api/user/profile`（body 可含 `nickname`、`avatar`；`avatar: null` = 恢复默认）→ 与 GET profile 相同；错误 `{"code":1,"msg":...}`

- [ ] **Step 1: 写失败测试** `backend/tests/test_user_profile_api.py`

```python
import base64
import httpx
import pytest
from fastapi.testclient import TestClient
from app import db, profile
from app.config import Settings
from app.dayys_session import DataYsSession
from app.main import create_app
from tests.points_helpers import set_points_raw

EMPTY = {"code": 10025, "msg": "无积分，无权操作，请充值积分后自动恢复使用！"}
JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 60
JPEG_URL = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()
SVG_URL = "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode()

def build():
    """返回 (conn, TestClient, calls)：calls["n"] 记录触达上游（data-ys）的次数。"""
    conn = db.connect(":memory:"); db.init_db(conn)
    calls = {"n": 0}
    def upstream(req):
        calls["n"] += 1
        return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {"vip": 1}}})
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(upstream))
    dayys = DataYsSession(client, "SRV0001", "srvpw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    return conn, TestClient(app), calls

def logged_in(points=5):
    conn, tc, calls = build()
    db.create_user(conn, "USER01", "pw", None)
    set_points_raw(conn, "USER01", points)
    body = tc.post("/api/auth/login", json={"username": "USER01", "password": "pw"}).json()
    assert body["code"] == 0
    return conn, tc, calls, {"token": body["data"]["token"]}

def test_profile_returns_defaults_and_balance_without_upstream():
    conn, tc, calls, h = logged_in(5)
    n = calls["n"]
    body = tc.get("/api/user/profile", headers=h).json()
    avatar = profile.default_avatar("USER01")
    assert body == {"code": 0, "msg": "成功", "data": {
        "code": "USER01", "nickname": profile.default_nickname("USER01"), "avatar": avatar,
        "defaultAvatar": avatar, "points": 5, "nicknameIsDefault": True, "avatarIsDefault": True}}
    assert calls["n"] == n

def test_points_endpoint_reflects_current_balance():
    conn, tc, calls, h = logged_in(5)
    set_points_raw(conn, "USER01", 3)
    assert tc.get("/api/user/points", headers=h).json() == {"code": 0, "msg": "成功", "data": {"points": 3}}

def test_save_nickname_and_avatar_then_restore_default_avatar():
    conn, tc, calls, h = logged_in()
    d = tc.post("/api/user/profile", headers=h, json={"nickname": " 小明 ", "avatar": JPEG_URL}).json()["data"]
    assert (d["nickname"], d["avatar"], d["nicknameIsDefault"], d["avatarIsDefault"]) == ("小明", JPEG_URL, False, False)
    assert d["defaultAvatar"] == profile.default_avatar("USER01")
    assert tc.get("/api/user/profile", headers=h).json()["data"] == d
    d2 = tc.post("/api/user/profile", headers=h, json={"avatar": None}).json()["data"]
    assert (d2["nickname"], d2["avatar"], d2["avatarIsDefault"]) == ("小明", profile.default_avatar("USER01"), True)
    assert tc.post("/api/user/profile", headers=h, json={}).json()["data"] == d2   # 未出现的字段不改

@pytest.mark.parametrize("payload,msg", [
    ({"nickname": ""}, "昵称不能为空"),
    ({"nickname": "a" * 13}, "昵称最多 12 个字"),
    ({"nickname": "a\nb"}, "昵称包含不支持的字符"),
    ({"avatar": SVG_URL}, "头像格式不支持"),
    ({"avatar": "data:image/jpeg;base64," + base64.b64encode(JPEG + b"\0" * 102400).decode()}, "头像图片过大"),
    ({"nickname": "新名", "avatar": SVG_URL}, "头像格式不支持"),
])
def test_invalid_input_is_rejected_without_partial_write(payload, msg):
    conn, tc, calls, h = logged_in()
    assert tc.post("/api/user/profile", headers=h, json=payload).json() == {"code": 1, "msg": msg}
    d = tc.get("/api/user/profile", headers=h).json()["data"]
    assert d["nicknameIsDefault"] and d["avatarIsDefault"]

@pytest.mark.parametrize("raw", [b"[1]", b"{", b"\"x\""])
def test_non_object_body_is_parameter_error(raw):
    conn, tc, calls, h = logged_in()
    r = tc.post("/api/user/profile", headers={**h, "Content-Type": "application/json"}, content=raw)
    assert r.json() == {"code": 1, "msg": "参数错误"}

def test_endpoints_share_gate_interception():
    conn, tc, calls, h = logged_in()
    n = calls["n"]
    for method, url in (("get", "/api/user/profile"), ("get", "/api/user/points"), ("post", "/api/user/profile")):
        kw = {"json": {"nickname": "x"}} if method == "post" else {}
        assert getattr(tc, method)(url, **kw).json()["code"] == 10020
        set_points_raw(conn, "USER01", 0)
        assert getattr(tc, method)(url, headers=h, **kw).json() == EMPTY
        set_points_raw(conn, "USER01", 5)
        db.update_user(conn, "USER01", status="banned")
        assert getattr(tc, method)(url, headers=h, **kw).json()["code"] == 10024
        db.update_user(conn, "USER01", status="active")
    assert calls["n"] == n
    assert db.get_user_by_code(conn, "USER01").nickname is None      # 被拦截的保存没有写入
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_user_profile_api.py`
Expected: FAIL（请求被兜底转发到上游，返回体不符）

- [ ] **Step 3: 重构 `backend/app/gate.py`**

把现有 `authorize` 的函数体改名为 `authorize_user`，校验与文案完全不变，只是通过时返回用户；`authorize` 委托给它：

```python
def authorize_user(conn, token_header: str):
    """与 authorize 相同的校验；通过 → (User, None)，否则 (None, 错误响应)。"""
    if not token_header:
        return None, {"code": 10020, "msg": "未登录"}
    sess = db.get_session(conn, token_header)
    if sess is None or sess.expires_at < int(time.time()):
        return None, {"code": 10020, "msg": "登录已失效，请重新登录"}
    user = db.get_user_by_id(conn, sess.user_id)
    if user is not None and user.status == "banned":
        return None, {"code": 10024, "msg": "账号已封禁，无法登录"}
    # 待激活 / 暂停 / 到期 / 未完成首登：旧会话一律视为无效，防止绕过
    if (user is None or user.first_activated_at is None or user.status != "active"
            or user.onboarded_at is None
            or (user.expires_at is not None and user.expires_at < int(time.time()))):
        return None, {"code": 10022, "msg": "账号已停用或已到期"}
    if user.points <= 0:        # 积分暂停（余额为 0）：优先级最低，排在封禁 / 暂停 / 到期 / 未完成首登之后
        return None, dict(POINTS_EMPTY)
    return user, None

def authorize(conn, token_header: str):
    user, err = authorize_user(conn, token_header)
    return user is not None, err
```

- [ ] **Step 4: 新建 `backend/app/routes/user.py`**

```python
# 客户端用户信息区（子项目 D）：头像、昵称与积分余额。以请求头 token 认证，
# 拦截规则与其他业务请求一致（gate.authorize_user：10020 / 10022 / 10024 / 10025）。
import json
from fastapi import APIRouter, Request
from .. import db, gate, profile

router = APIRouter()

def _ok(data: dict) -> dict:
    return {"code": 0, "msg": "成功", "data": data}

def _fail(msg: str) -> dict:
    return {"code": 1, "msg": msg}

def _profile(conn, u: db.User) -> dict:
    avatar = db.get_user_avatar(conn, u.id)
    default_avatar = profile.default_avatar(u.code)
    return _ok({"code": u.code, "nickname": profile.display_nickname(u),
                "avatar": avatar if avatar is not None else default_avatar,
                "defaultAvatar": default_avatar, "points": u.points,
                "nicknameIsDefault": u.nickname is None, "avatarIsDefault": avatar is None})

def _auth(request: Request):
    return gate.authorize_user(request.app.state.db_conn, request.headers.get("token", ""))

@router.get("/user/profile")
async def get_profile(request: Request):
    u, err = _auth(request)
    if err:
        return err
    return _profile(request.app.state.db_conn, u)

@router.get("/user/points")
async def get_points(request: Request):
    u, err = _auth(request)
    if err:
        return err
    return _ok({"points": u.points})

@router.post("/user/profile")
async def save_profile(request: Request):
    u, err = _auth(request)
    if err:
        return err
    try:
        payload = json.loads(await request.body() or b"{}")
    except ValueError:
        return _fail("参数错误")
    if not isinstance(payload, dict):
        return _fail("参数错误")
    # 先全部校验再落库：任何一项非法都不产生部分修改
    changes = {}
    if "nickname" in payload:
        v, e = profile.clean_nickname(payload["nickname"])
        if e:
            return _fail(e)
        changes["nickname"] = v
    if "avatar" in payload:
        if payload["avatar"] is None:
            changes["avatar"] = None
        else:
            v, e = profile.clean_avatar(payload["avatar"])
            if e:
                return _fail(e)
            changes["avatar"] = v
    conn = request.app.state.db_conn
    if changes:
        db.set_user_profile(conn, u.id, **changes)
    return _profile(conn, db.get_user_by_id(conn, u.id))
```

- [ ] **Step 5: 在 `backend/app/main.py` 注册路由**

在 `from .routes import ds as ds_routes` 旁加 `from .routes import user as user_routes`；在 `app.include_router(ds_routes.router, prefix="/api")` 之后加：

```python
    app.include_router(user_routes.router, prefix="/api")   # 用户信息区，先于 catch-all
```

- [ ] **Step 6: 更新 `backend/README.md`**

在「### 积分」小节结束、「## 多数据源采集」之前插入：

```markdown
### 用户信息区（头像、昵称、余额）

客户端首页左上角显示头像、昵称与积分余额（子项目 D）。接口均以请求头 `token` 认证，拦截与其他业务请求一致（余额为 0 → 10025）：

- `GET /api/user/profile`：`nickname`/`avatar` 为实际显示值（未设置时为按账号编号生成的默认昵称与几何图案头像），另含 `defaultAvatar`、`points`、`nicknameIsDefault`、`avatarIsDefault`。
- `GET /api/user/points`：只返回余额，客户端每 60 秒刷新一次。
- `POST /api/user/profile`：`{"nickname": "...", "avatar": "data:image/jpeg;base64,..."}`，字段可省略；`avatar: null` 恢复默认头像。昵称 1–12 字；头像仅 JPEG/PNG/WebP、≤ 100KB（客户端已缩放为 128×128）。

头像存于 `user_avatars` 表，昵称存于 `users.nickname`；后台可在账号列表点击昵称查看，并由最高权限者 / 管理员重置为默认（审计 `user.profile_reset`）。
```

- [ ] **Step 7: 运行测试**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_user_profile_api.py && .venv/bin/python -m pytest -q`
Expected: 全部 PASS

- [ ] **Step 8: 提交**

```bash
git add backend/app/gate.py backend/app/routes/user.py backend/app/main.py backend/README.md backend/tests/test_user_profile_api.py
git commit -m "feat(backend): client profile and balance endpoints behind the session gate"
```

---

### Task 3: 后台昵称列、查看与重置头像昵称

**Files:**
- Modify: `backend/app/routes/admin.py`（列表加 `nickname`；新增两个接口）
- Test: `backend/tests/test_admin_profile.py`
- Modify: `backend/admin-ui/src/api.ts`（`UserRow.nickname`、`UserProfile`、`getUserProfile`、`resetUserProfile`）
- Create: `backend/admin-ui/src/pages/UserProfileLink.tsx`
- Modify: `backend/admin-ui/src/pages/UsersTable.tsx`（昵称列 + 筛选）
- Modify: `backend/admin-ui/src/pages/AuditLogs.tsx`（动作标签与详情）
- Rebuild: `backend/app/static/admin-dist/`

**Interfaces:**
- Consumes: Task 1 的 `profile.display_nickname`、`profile.default_avatar`、`db.get_user_avatar`、`db.set_user_profile`
- Produces:
  - `/admin/users` 每行多 `"nickname"`（实际显示值）
  - `GET /admin/users/{code}/profile` → `{"ok": true, "code", "nickname", "avatar", "nickname_is_default", "avatar_is_default"}`；代理只能看本人名下账号，否则 404 `{"ok": false, "error": "账号不存在"}`
  - `POST /admin/users/{code}/profile/reset` → `{"ok": true}`；仅后台人员（代理 403）；审计 `user.profile_reset`，`detail = {"nickname_custom": bool, "avatar_custom": bool}`（重置前是否为自定义）

- [ ] **Step 1: 写失败测试** `backend/tests/test_admin_profile.py`

```python
from app import db, profile
from tests.agent_helpers import audit, build_app, key_client, login_client, mk_admin, mk_agent_raw

def own(conn, code: str, agent_id: int | None) -> db.User:
    u = db.create_user(conn, code, "pw", None)
    conn.execute("UPDATE users SET agent_id=? WHERE id=?", (agent_id, u.id)); conn.commit()
    return u

def rows_by_code(tc) -> dict:
    return {r["code"]: r for r in tc.get("/admin/users").json()["users"]}

def test_user_list_includes_display_nickname():
    conn, app = build_app()
    a = own(conn, "U1", None); own(conn, "U2", None)
    db.set_user_profile(conn, a.id, nickname="小明")
    rows = rows_by_code(key_client(app))
    assert rows["U1"]["nickname"] == "小明"
    assert rows["U2"]["nickname"] == profile.default_nickname("U2")
    assert "avatar" not in rows["U1"]

def test_profile_view_for_staff_and_agent_scope():
    conn, app = build_app()
    ag = mk_agent_raw(conn, "代理甲")
    mine = own(conn, "U1", ag); own(conn, "U2", None)
    db.set_user_profile(conn, mine.id, avatar="data:image/jpeg;base64,/9j/")
    body = key_client(app).get("/admin/users/u1/profile").json()
    assert body == {"ok": True, "code": "U1", "nickname": profile.default_nickname("U1"),
                    "avatar": "data:image/jpeg;base64,/9j/", "nickname_is_default": True, "avatar_is_default": False}
    agent = login_client(app, "代理甲")
    assert agent.get("/admin/users/U1/profile").json()["ok"] is True
    r = agent.get("/admin/users/U2/profile")
    assert r.status_code == 404 and r.json() == {"ok": False, "error": "账号不存在"}
    assert key_client(app).get("/admin/users/NOPE/profile").status_code == 404
    assert rows_by_code(agent)["U1"]["nickname"] == profile.default_nickname("U1")

def test_reset_restores_defaults_with_audit_staff_only():
    conn, app = build_app()
    ag = mk_agent_raw(conn, "代理甲")
    u = own(conn, "U1", ag)
    db.set_user_profile(conn, u.id, nickname="坏名字", avatar="data:image/jpeg;base64,/9j/")
    assert login_client(app, "代理甲").post("/admin/users/U1/profile/reset").status_code == 403
    mk_admin(conn, "管理员乙")
    assert login_client(app, "管理员乙").post("/admin/users/u1/profile/reset").json() == {"ok": True}
    assert db.get_user_by_code(conn, "U1").nickname is None and db.get_user_avatar(conn, u.id) is None
    [e] = audit(conn, "user.profile_reset")
    assert (e["actor"], e["target"], e["detail"]) == ("管理员乙", "U1", {"nickname_custom": True, "avatar_custom": True})
    assert key_client(app).post("/admin/users/U1/profile/reset").json() == {"ok": True}
    assert audit(conn, "user.profile_reset")[0]["detail"] == {"nickname_custom": False, "avatar_custom": False}
    assert key_client(app).post("/admin/users/NOPE/profile/reset").status_code == 404
```

（`audit()` 按 id 倒序返回，`detail` 已解析为 dict。）

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_admin_profile.py`
Expected: FAIL（`KeyError: 'nickname'` / 404）

- [ ] **Step 3: 修改 `backend/app/routes/admin.py`**

`from .. import db` 改为 `from .. import db, profile`。`list_users` 每行字典末尾加 `"nickname": profile.display_nickname(u)`。在 `activate_user` 路由之前新增：

```python
@router.get("/users/{code}/profile")
async def user_profile(code: str, request: Request, p: Principal = ANY_ROLE):
    conn = request.app.state.db_conn
    u = db.get_user_by_code(conn, code)
    # 代理只能查看本人名下账号（他人账号按不存在处理）
    if u is None or (p.role == "agent" and u.agent_id != p.agent_id):
        return _not_found()
    avatar = db.get_user_avatar(conn, u.id)
    return {"ok": True, "code": u.code, "nickname": profile.display_nickname(u),
            "avatar": avatar if avatar is not None else profile.default_avatar(u.code),
            "nickname_is_default": u.nickname is None, "avatar_is_default": avatar is None}

@router.post("/users/{code}/profile/reset")
async def reset_user_profile(code: str, request: Request, p: Principal = STAFF_ONLY):
    conn = request.app.state.db_conn
    u = db.get_user_by_code(conn, code)
    if u is None:
        return _not_found()
    detail = {"nickname_custom": u.nickname is not None,
              "avatar_custom": db.get_user_avatar(conn, u.id) is not None}
    db.set_user_profile(conn, u.id, nickname=None, avatar=None)
    _audit(request, p, "user.profile_reset", u.code, detail)
    return {"ok": True}
```

- [ ] **Step 4: 运行后端测试**

Run: `cd backend && .venv/bin/python -m pytest -q tests/test_admin_profile.py && .venv/bin/python -m pytest -q`
Expected: 全部 PASS

- [ ] **Step 5: `backend/admin-ui/src/api.ts`**

`UserRow` 末尾（`points` 之后）加：

```ts
  nickname: string // 实际显示昵称（未设置时为默认昵称）
```

在 `deleteUser` 之后加：

```ts
export interface UserProfile {
  code: string
  nickname: string
  avatar: string // data URL（未设置时为默认几何图案头像）
  nickname_is_default: boolean
  avatar_is_default: boolean
}

export async function getUserProfile(code: string): Promise<UserProfile> {
  const r = await req('/users/' + encodeURIComponent(code) + '/profile')
  if (r.status !== 200) throw new Error('get profile failed: ' + r.status)
  return (await r.json()) as UserProfile
}

export async function resetUserProfile(code: string): Promise<ApiResult> {
  return result(await req('/users/' + encodeURIComponent(code) + '/profile/reset', { method: 'POST' }))
}
```

- [ ] **Step 6: 新建 `backend/admin-ui/src/pages/UserProfileLink.tsx`**

```tsx
import { useState } from 'react'
import { App, Avatar, Button, Modal, Space, Spin, Tag } from 'antd'
import { getUserProfile, resetUserProfile, UserProfile } from '../api'

// 账号列表的昵称单元格：点击查看实际显示的头像与昵称；后台人员可重置为默认（二次确认，写审计）。
export default function UserProfileLink({
  code,
  nickname,
  canReset,
  onReset,
}: {
  code: string
  nickname: string
  canReset: boolean
  onReset: () => void
}) {
  const { message, modal } = App.useApp()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<UserProfile | null>(null)

  const load = () => {
    setData(null)
    getUserProfile(code)
      .then(setData)
      .catch(() => {
        message.error('加载失败')
        setOpen(false)
      })
  }
  const show = () => {
    setOpen(true)
    load()
  }
  const reset = () =>
    modal.confirm({
      title: `重置账号 ${code} 的头像和昵称？`,
      content: '将恢复为系统随机生成的默认头像和昵称，用户之后仍可自行修改。',
      okText: '重置',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const r = await resetUserProfile(code)
        if (!r.ok) {
          message.error(r.error || '重置失败')
          return
        }
        message.success('已重置为默认')
        load()
        onReset()
      },
    })
  const allDefault = !data || (data.nickname_is_default && data.avatar_is_default)

  return (
    <>
      <a onClick={show}>{nickname}</a>
      <Modal
        title={`头像昵称 · ${code}`}
        open={open}
        onCancel={() => setOpen(false)}
        width={360}
        destroyOnClose
        footer={[
          canReset && (
            <Button key="reset" danger disabled={allDefault} onClick={reset}>
              重置为默认
            </Button>
          ),
          <Button key="close" onClick={() => setOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        {data ? (
          <Space direction="vertical" align="center" style={{ width: '100%' }}>
            <Avatar src={data.avatar} size={96} />
            <div style={{ fontSize: 16 }}>{data.nickname}</div>
            <Space>
              {data.avatar_is_default && <Tag>默认头像</Tag>}
              {data.nickname_is_default && <Tag>默认昵称</Tag>}
            </Space>
          </Space>
        ) : (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        )}
      </Modal>
    </>
  )
}
```

- [ ] **Step 7: `backend/admin-ui/src/pages/UsersTable.tsx`**

导入 `import UserProfileLink from './UserProfileLink'`。在「编号」列之后插入：

```tsx
    {
      title: '昵称',
      dataIndex: 'nickname',
      ellipsis: true,
      fieldProps: { placeholder: '按昵称搜索' },
      render: (_, r) => (
        <UserProfileLink code={r.code} nickname={r.nickname} canReset={!isAgent} onReset={reload} />
      ),
    },
```

在 `request` 中 `if (params.code) {...}` 之后加：

```tsx
        if (params.nickname) {
          const kw = String(params.nickname).trim().toLowerCase()
          rows = rows.filter((u) => u.nickname.toLowerCase().includes(kw))
        }
```

- [ ] **Step 8: `backend/admin-ui/src/pages/AuditLogs.tsx`**

`ACTION_LABEL` 中 `'user.onboard'` 之后加 `'user.profile_reset': '重置头像昵称',`；在 `fmtDetail` 中 `if (r.action === 'user.expires') {...}` 之后加：

```ts
  if (r.action === 'user.profile_reset') {
    const parts = [d.nickname_custom ? '自定义昵称' : null, d.avatar_custom ? '自定义头像' : null].filter(Boolean)
    return parts.length ? `重置前：${parts.join('、')}` : '重置前已是默认'
  }
```

- [ ] **Step 9: 类型检查与构建**

Run: `cd backend/admin-ui && npx tsc --noEmit && npm run build`
Expected: 无类型错误，构建成功（产物写入 `backend/app/static/admin-dist`）

- [ ] **Step 10: 提交**

```bash
git add backend/app/routes/admin.py backend/tests/test_admin_profile.py backend/admin-ui/src backend/app/static/admin-dist
git commit -m "feat(admin): show nicknames, view and reset user avatar/nickname"
```

（`git add backend/app/static/admin-dist` 会同时记录旧产物的删除；提交前用 `git status` 确认没有带上 docx。）

---

### Task 4: 客户端用户信息区脚本 `client/user-profile.js`

**Files:**
- Create: `client/user-profile.js`
- Modify: `client/index.html`（在 `account-onboard.js` 的 `<script>` 之后加一行）
- Test: `electron/user-profile.test.js`

**Interfaces:**
- Consumes: Task 2 的三个客户端接口（数据形状见 Task 2 Produces）
- Produces（Task 5 的补丁调用）：
  - `window.dsProfile.mount(el, { request, apiURL, points, doc?, setInterval?, clearInterval?, readImage? }) -> { refresh(points?), destroy(), openEditor() }`
    - `request(config)`：首页的 axios 实例，`config = { url, method, data? }`，Promise 兑现为响应体；被统一拦截时兑现为 `undefined`
    - `points`：`localStorage.dsPoints` 的字符串（可能为 `null` 或 `""`）
  - 导出（Node 测试用）：`mount`、`nicknameProblem`、`fmtPoints`、`cropBox`、`squareDataURL`、`readImage`、`NICK_MAX`、`AVATAR_SIZE`、`AVATAR_QUALITY`、`POLL_MS`、`MSG`

- [ ] **Step 1: 写失败测试** `electron/user-profile.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const up = require('../client/user-profile.js');

const API = 'https://lottery.jh8.ai/api';
const tick = () => new Promise((r) => setImmediate(r));

// ---- 极简假 DOM：只实现 user-profile.js 用到的部分 ----
function makeEl(tag) {
  const style = { setProperty(k, v) { this[k] = v; } };
  return {
    tagName: tag, style, attributes: {}, children: [], parentNode: null, listeners: {},
    value: '', textContent: '', disabled: false, src: '', files: null, clicks: 0,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
    dispatch(t, ev) { (this.listeners[t] || []).slice().forEach((f) => f(ev || { target: this })); },
    click() { this.clicks++; },
  };
}
function find(root, role) {
  for (const c of root.children) {
    if (c.attributes['data-role'] === role) return c;
    const r = find(c, role);
    if (r) return r;
  }
  return null;
}
function makeDoc() {
  const doc = makeEl('document');
  doc.body = makeEl('body');
  doc.createElement = (tag) => makeEl(tag);
  return doc;
}

// request 桩：按 url 后缀取预置回复（函数 / 值 / Error 实例 = reject），记录每次调用
function harness({ points = '5', replies = {}, readImage } = {}) {
  const doc = makeDoc();
  const el = makeEl('div');
  const calls = [];
  const timers = [];
  const cleared = [];
  const request = (cfg) => {
    calls.push(cfg);
    const key = cfg.method + ' ' + cfg.url.slice(API.length);
    let r = replies[key];
    if (typeof r === 'function') r = r(cfg);
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const ctl = up.mount(el, {
    request, apiURL: API, points, doc,
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return 7; },
    clearInterval: (id) => cleared.push(id),
    readImage,
  });
  const q = (role) => find(el, role) || find(doc.body, role);
  return { doc, el, calls, timers, cleared, ctl, q };
}
const PROFILE = {
  code: 0, data: { code: 'U1', nickname: '好运的海豚', avatar: 'data:A', defaultAvatar: 'data:D', points: 9,
                   nicknameIsDefault: true, avatarIsDefault: true },
};

test('fmtPoints / nicknameProblem / cropBox', () => {
  assert.strictEqual(up.fmtPoints(5), '积分：5');
  assert.strictEqual(up.fmtPoints('12'), '积分：12');
  for (const v of [null, '', undefined, 'x']) assert.strictEqual(up.fmtPoints(v), '积分：—');
  assert.strictEqual(up.nicknameProblem('  '), '昵称不能为空');
  assert.strictEqual(up.nicknameProblem('a'.repeat(13)), '昵称最多 12 个字');
  assert.strictEqual(up.nicknameProblem('🐬'.repeat(12)), null);           // 按码点计数
  assert.deepStrictEqual(up.cropBox(200, 100), { sx: 50, sy: 0, s: 100 });
  assert.deepStrictEqual(up.cropBox(80, 120), { sx: 0, sy: 20, s: 80 });
  assert.deepStrictEqual([up.NICK_MAX, up.AVATAR_SIZE, up.AVATAR_QUALITY, up.POLL_MS], [12, 128, 0.85, 60000]);
});

test('squareDataURL：居中裁剪缩放到 size，白底 JPEG', () => {
  const ops = [];
  const canvas = {
    getContext: () => ({ fillRect: (...a) => ops.push(['fillRect', ...a]), drawImage: (...a) => ops.push(['drawImage', ...a.slice(1)]),
                         set fillStyle(v) { ops.push(['fillStyle', v]); } }),
    toDataURL: (type, q) => `data:${type};q=${q}`,
  };
  const doc = { createElement: (t) => (assert.strictEqual(t, 'canvas'), canvas) };
  const url = up.squareDataURL({ naturalWidth: 300, naturalHeight: 200 }, doc, 128);
  assert.strictEqual(url, 'data:image/jpeg;q=0.85');
  assert.deepStrictEqual([canvas.width, canvas.height], [128, 128]);
  assert.deepStrictEqual(ops, [['fillStyle', '#ffffff'], ['fillRect', 0, 0, 128, 128], ['drawImage', 50, 0, 200, 200, 0, 0, 128, 128]]);
});

test('mount：先显示登录余额，再拉取头像昵称；no-drag', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE } });
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：5');
  assert.strictEqual(h.q('ds-profile').style['-webkit-app-region'], 'no-drag');
  assert.deepStrictEqual(h.calls.map((c) => [c.method, c.url]), [['get', API + '/user/profile']]);
  await tick();
  assert.strictEqual(h.q('ds-profile-nick').textContent, '好运的海豚');
  assert.strictEqual(h.q('ds-profile-avatar').src, 'data:A');
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：9');
});

test('refresh：请求进行中不重复；可先显示传入的余额', async () => {
  const h = harness({ points: null, replies: { 'get /user/profile': PROFILE } });
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：—');
  h.ctl.refresh('3');
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：3');
  assert.strictEqual(h.calls.length, 1);
  await tick();
  h.ctl.refresh();
  assert.strictEqual(h.calls.length, 2);
});

test('每 60 秒刷新余额；失败 / 被拦截 / 非 0 时保留上次显示', async () => {
  let reply = { code: 0, data: { points: 4 } };
  const h = harness({ replies: { 'get /user/profile': PROFILE, 'get /user/points': () => reply } });
  await tick();
  assert.deepStrictEqual(h.timers.map((t) => t.ms), [60000]);
  await h.timers[0].fn(); await tick();
  assert.strictEqual(h.calls.at(-1).url, API + '/user/points');
  assert.strictEqual(h.q('ds-profile-points').textContent, '积分：4');
  for (reply of [undefined, { code: 1, msg: 'x' }, new Error('net')]) {
    await h.timers[0].fn(); await tick();
    assert.strictEqual(h.q('ds-profile-points').textContent, '积分：4');
  }
});

test('编辑：打开弹窗预填昵称；未改动直接关闭不请求', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE } });
  await tick();
  h.q('ds-profile').dispatch('click');
  const editor = find(h.doc.body, 'ds-profile-editor');
  assert.ok(editor);
  assert.strictEqual(find(editor, 'nick-input').value, '好运的海豚');
  assert.strictEqual(find(editor, 'preview').src, 'data:A');
  find(editor, 'save').dispatch('click');
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
  assert.strictEqual(h.calls.length, 1);
});

test('编辑：保存昵称与新头像，成功后关闭并更新左上角', async () => {
  const saved = { code: 0, data: { ...PROFILE.data, nickname: '新名字', avatar: 'data:image/jpeg;NEW', avatarIsDefault: false } };
  const h = harness({
    replies: { 'get /user/profile': PROFILE, 'post /user/profile': saved },
    readImage: (f) => Promise.resolve('data:image/jpeg;NEW'),
  });
  await tick();
  h.q('ds-profile').dispatch('click');
  const ed = find(h.doc.body, 'ds-profile-editor');
  find(ed, 'pick').dispatch('click');
  assert.strictEqual(find(ed, 'file').clicks, 1);
  find(ed, 'file').files = [{ type: 'image/png' }];
  find(ed, 'file').dispatch('change');
  await tick();
  assert.strictEqual(find(ed, 'preview').src, 'data:image/jpeg;NEW');
  find(ed, 'nick-input').value = ' 新名字 ';
  find(ed, 'save').dispatch('click');
  assert.deepStrictEqual(h.calls.at(-1), { url: API + '/user/profile', method: 'post', data: { nickname: '新名字', avatar: 'data:image/jpeg;NEW' } });
  await tick();
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
  assert.strictEqual(h.q('ds-profile-nick').textContent, '新名字');
  assert.strictEqual(h.q('ds-profile-avatar').src, 'data:image/jpeg;NEW');
});

test('编辑：恢复默认头像发送 avatar:null 并预览默认头像', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE, 'post /user/profile': PROFILE } });
  await tick();
  h.q('ds-profile').dispatch('click');
  const ed = find(h.doc.body, 'ds-profile-editor');
  find(ed, 'reset').dispatch('click');
  assert.strictEqual(find(ed, 'preview').src, 'data:D');
  find(ed, 'save').dispatch('click');
  assert.deepStrictEqual(h.calls.at(-1).data, { avatar: null });
});

test('编辑：本地校验、非图片、解码失败', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE }, readImage: () => Promise.reject(new Error('bad')) });
  await tick();
  h.q('ds-profile').dispatch('click');
  const ed = find(h.doc.body, 'ds-profile-editor');
  const err = () => find(ed, 'error').textContent;
  find(ed, 'nick-input').value = '   ';
  find(ed, 'save').dispatch('click');
  assert.strictEqual(err(), '昵称不能为空');
  find(ed, 'nick-input').value = 'a'.repeat(13);
  find(ed, 'save').dispatch('click');
  assert.strictEqual(err(), '昵称最多 12 个字');
  assert.strictEqual(h.calls.length, 1);
  find(ed, 'file').files = [{ type: 'text/plain' }];
  find(ed, 'file').dispatch('change');
  assert.strictEqual(err(), '请选择图片文件');
  find(ed, 'file').files = [{ type: 'image/png' }];
  find(ed, 'file').dispatch('change');
  await tick();
  assert.strictEqual(err(), '请选择图片文件');
});

test('编辑：服务端报错留在弹窗；网络失败；被统一拦截则关闭', async () => {
  let reply = { code: 1, msg: '头像图片过大' };
  const h = harness({ replies: { 'get /user/profile': PROFILE, 'post /user/profile': () => reply } });
  await tick();
  const attempt = async () => {
    h.q('ds-profile').dispatch('click');
    const ed = find(h.doc.body, 'ds-profile-editor');
    find(ed, 'nick-input').value = '别的名字';
    find(ed, 'save').dispatch('click');
    assert.strictEqual(find(ed, 'save').disabled, true);
    assert.strictEqual(find(ed, 'save').textContent, '保存中…');
    await tick(); await tick();
    return ed;
  };
  let ed = await attempt();
  assert.strictEqual(find(ed, 'error').textContent, '头像图片过大');
  assert.strictEqual(find(ed, 'save').disabled, false);
  assert.strictEqual(find(ed, 'save').textContent, '保存');
  reply = new Error('net');
  find(ed, 'save').dispatch('click'); await tick(); await tick();
  assert.strictEqual(find(ed, 'error').textContent, '网络异常，请稍后重试');
  reply = { code: 1 };
  find(ed, 'save').dispatch('click'); await tick(); await tick();
  assert.strictEqual(find(ed, 'error').textContent, '保存失败，请稍后重试');
  reply = undefined;
  find(ed, 'save').dispatch('click'); await tick(); await tick();
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
});

test('编辑：点遮罩或取消关闭', async () => {
  const h = harness({ replies: { 'get /user/profile': PROFILE } });
  await tick();
  h.q('ds-profile').dispatch('click');
  let ed = find(h.doc.body, 'ds-profile-editor');
  ed.dispatch('click', { target: find(ed, 'nick-input') });
  assert.ok(find(h.doc.body, 'ds-profile-editor'));
  ed.dispatch('click', { target: ed });
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
  h.q('ds-profile').dispatch('click');
  ed = find(h.doc.body, 'ds-profile-editor');
  find(ed, 'cancel').dispatch('click');
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
});

test('destroy：停止刷新、移除信息区与弹窗，迟到的响应被忽略', async () => {
  let resolve;
  const h = harness({ replies: { 'get /user/profile': () => new Promise((r) => { resolve = r; }) } });
  h.ctl.openEditor();
  h.ctl.destroy();
  assert.deepStrictEqual(h.cleared, [7]);
  assert.strictEqual(h.el.children.length, 0);
  assert.strictEqual(find(h.doc.body, 'ds-profile-editor'), null);
  resolve(PROFILE); await tick();
  assert.strictEqual(find(h.el, 'ds-profile-nick'), null);
});

test('index.html 在业务脚本之前加载 user-profile.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.html'), 'utf8');
  const i = html.indexOf('<script src=app://./user-profile.js></script>');
  assert.ok(i > html.indexOf('<script src=app://./account-onboard.js></script>'));
  assert.ok(i < html.indexOf('app://./js/app.9ba1133b.js></script>'));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test electron/user-profile.test.js`
Expected: FAIL（`Cannot find module '../client/user-profile.js'`）

- [ ] **Step 3: 新建 `client/user-profile.js`**

```js
// 首页左上角用户信息区（子项目 D）：头像 + 昵称，昵称下显示积分余额；点击打开头像昵称编辑弹窗。
// 纯 DOM 实现，不依赖 Vue（首页是编译后的产物）。由 index.html 先于业务脚本加载，挂到 window.dsProfile；
// 首页（app chunk 的 profile v1 补丁）在 mounted 时调用 mount(el, { request, apiURL, points })。
// request 为首页的 axios 实例：令牌注入与 10020/10022/10024/10025 拦截（提示并退回登录）都由它统一处理，
// 被拦截时 Promise 以 undefined 兑现，这里一律当作「无数据」忽略。
(function (root, factory) {
  var api = factory();
  // Electron nodeIntegration 同时暴露 module 和 window，必须两边都赋值
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.dsProfile = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var NICK_MAX = 12;
  var AVATAR_SIZE = 128;
  var AVATAR_QUALITY = 0.85;
  var POLL_MS = 60000;
  var MSG = {
    nickEmpty: '昵称不能为空',
    nickTooLong: '昵称最多 12 个字',
    pickImage: '请选择图片文件',
    saveFailed: '保存失败，请稍后重试',
    network: '网络异常，请稍后重试',
  };

  // 按码点计数，与后端 len(str) 一致（emoji 算 1 个）
  function charLen(s) {
    return Array.from(s).length;
  }

  // 与后端 profile.clean_nickname 的前两条规则一致；字符类别由后端判定
  function nicknameProblem(v) {
    v = v == null ? '' : String(v).trim();
    if (!v) return MSG.nickEmpty;
    if (charLen(v) > NICK_MAX) return MSG.nickTooLong;
    return null;
  }

  function fmtPoints(p) {
    var n = typeof p === 'number' ? p : (p == null || p === '' ? NaN : Number(p));
    return '积分：' + (isFinite(n) ? String(n) : '—');
  }

  // 居中裁成正方形：返回源图上的裁剪区域
  function cropBox(w, h) {
    var s = Math.min(w, h);
    return { sx: (w - s) / 2, sy: (h - s) / 2, s: s };
  }

  function squareDataURL(img, doc, size) {
    var c = doc.createElement('canvas');
    c.width = size;
    c.height = size;
    var ctx = c.getContext('2d');
    var b = cropBox(img.naturalWidth || img.width, img.naturalHeight || img.height);
    ctx.fillStyle = '#ffffff'; // 透明 PNG 转 JPEG 时底色为白
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, b.sx, b.sy, b.s, b.s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', AVATAR_QUALITY);
  }

  // 浏览器里读取用户选的图片文件 → 128×128 JPEG data URL；无法解码则 reject
  function readImage(file, doc) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          resolve(squareDataURL(img, doc, AVATAR_SIZE));
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('decode failed'));
      };
      img.src = url;
    });
  }

  function setStyle(e, style) {
    for (var k in style) e.style[k] = style[k];
  }

  function btnStyle(primary) {
    return {
      padding: '5px 12px', margin: '0 4px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer',
      border: '1px solid ' + (primary ? '#409eff' : '#dcdfe6'),
      background: primary ? '#409eff' : '#ffffff', color: primary ? '#ffffff' : '#606266',
    };
  }

  function mount(el, options) {
    var o = options || {};
    var doc = o.doc || document;
    var request = o.request;
    var apiURL = o.apiURL || '';
    var setIntervalFn = o.setInterval || setInterval;
    var clearIntervalFn = o.clearInterval || clearInterval;
    var readImageFn = o.readImage || function (file) { return readImage(file, doc); };
    var state = { nickname: '', avatar: '', defaultAvatar: '' };
    var inflight = false;
    var destroyed = false;
    var editor = null;

    function make(tag, role, style, text) {
      var e = doc.createElement(tag);
      if (role) e.setAttribute('data-role', role);
      if (style) setStyle(e, style);
      if (text != null) e.textContent = text;
      return e;
    }

    var box = make('div', 'ds-profile', {
      position: 'absolute', top: '8px', left: '8px', zIndex: '10', display: 'flex', alignItems: 'center',
      maxWidth: '180px', cursor: 'pointer',
    });
    box.style.setProperty('-webkit-app-region', 'no-drag'); // 顶部是窗口拖动区，不设置则点不到
    var avatarImg = make('img', 'ds-profile-avatar', {
      width: '44px', height: '44px', flex: '0 0 44px', borderRadius: '50%', objectFit: 'cover',
      boxSizing: 'border-box', border: '2px solid rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.3)',
    });
    avatarImg.setAttribute('alt', '');
    var textCol = make('div', null, {
      marginLeft: '8px', minWidth: '0', color: '#ffffff', lineHeight: '20px', textShadow: '0 1px 2px rgba(0,0,0,0.6)',
    });
    var nickEl = make('div', 'ds-profile-nick', {
      fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }, '');
    var pointsEl = make('div', 'ds-profile-points', { fontSize: '12px' }, fmtPoints(o.points));
    textCol.appendChild(nickEl);
    textCol.appendChild(pointsEl);
    box.appendChild(avatarImg);
    box.appendChild(textCol);
    el.appendChild(box);

    function setPoints(p) {
      pointsEl.textContent = fmtPoints(p);
    }

    function apply(d) {
      if (!d) return;
      if (typeof d.nickname === 'string') {
        state.nickname = d.nickname;
        nickEl.textContent = d.nickname;
      }
      if (typeof d.avatar === 'string') {
        state.avatar = d.avatar;
        avatarImg.src = d.avatar;
      }
      if (typeof d.defaultAvatar === 'string') state.defaultAvatar = d.defaultAvatar;
      if (typeof d.points === 'number') setPoints(d.points);
    }

    function call(method, path, data) {
      var cfg = { url: apiURL + path, method: method };
      if (data !== undefined) cfg.data = data;
      return Promise.resolve().then(function () { return request(cfg); });
    }

    // 拉取头像昵称与余额；points 为登录时存下的余额，先行显示。请求进行中时不重复发起
    function refresh(points) {
      if (points != null && points !== '') setPoints(points);
      if (inflight || destroyed) return Promise.resolve();
      inflight = true;
      return call('get', '/user/profile').then(function (res) {
        if (!destroyed && res && res.code == 0) apply(res.data);
      }, function () {}).then(function () { inflight = false; });
    }

    function pollPoints() {
      return call('get', '/user/points').then(function (res) {
        if (!destroyed && res && res.code == 0 && res.data && typeof res.data.points === 'number') {
          setPoints(res.data.points);
        }
      }, function () {});
    }

    function openEditor() {
      if (editor || destroyed) return;
      var pending; // undefined = 头像未改；null = 恢复默认；字符串 = 新头像 data URL
      var overlay = make('div', 'ds-profile-editor', {
        position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', zIndex: '3000',
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      });
      overlay.style.setProperty('-webkit-app-region', 'no-drag');
      var panel = make('div', null, {
        width: '230px', boxSizing: 'border-box', padding: '14px', borderRadius: '6px', background: '#ffffff',
        color: '#333333', fontSize: '13px', textAlign: 'center',
      });
      var title = make('div', null, { fontSize: '15px', fontWeight: 'bold', marginBottom: '10px' }, '修改头像和昵称');
      var preview = make('img', 'preview', {
        width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', background: '#eeeeee',
      });
      preview.setAttribute('alt', '');
      if (state.avatar) preview.src = state.avatar;
      var row = make('div', null, { margin: '8px 0' });
      var pick = make('button', 'pick', btnStyle(false), '更换头像');
      var reset = make('button', 'reset', btnStyle(false), '恢复默认');
      var file = make('input', 'file', { display: 'none' });
      file.setAttribute('type', 'file');
      file.setAttribute('accept', 'image/*');
      var input = make('input', 'nick-input', {
        width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: '13px',
        border: '1px solid #dcdfe6', borderRadius: '4px',
      });
      input.setAttribute('placeholder', '昵称，最多 12 个字');
      input.value = state.nickname;
      var err = make('div', 'error', { minHeight: '18px', margin: '6px 0', color: '#f56c6c', fontSize: '12px' }, '');
      var foot = make('div', null, { display: 'flex', justifyContent: 'flex-end' });
      var cancel = make('button', 'cancel', btnStyle(false), '取消');
      var save = make('button', 'save', btnStyle(true), '保存');

      row.appendChild(pick);
      row.appendChild(reset);
      foot.appendChild(cancel);
      foot.appendChild(save);
      [title, preview, row, file, input, err, foot].forEach(function (c) { panel.appendChild(c); });
      overlay.appendChild(panel);

      function showError(m) {
        err.textContent = m || '';
      }
      function close() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        editor = null;
      }

      pick.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        file.value = ''; // 允许再次选择同一文件
        if (!f) return;
        if (!/^image\//.test(f.type || '')) {
          showError(MSG.pickImage);
          return;
        }
        readImageFn(f).then(function (url) {
          pending = url;
          preview.src = url;
          showError('');
        }, function () {
          showError(MSG.pickImage);
        });
      });
      reset.addEventListener('click', function () {
        pending = null;
        if (state.defaultAvatar) preview.src = state.defaultAvatar;
        showError('');
      });
      cancel.addEventListener('click', close);
      overlay.addEventListener('click', function (e) {
        if (e && e.target === overlay) close();
      });
      save.addEventListener('click', function () {
        var nick = String(input.value == null ? '' : input.value).trim();
        var problem = nicknameProblem(nick);
        if (problem) {
          showError(problem);
          return;
        }
        var data = {};
        if (nick !== state.nickname) data.nickname = nick;
        if (pending !== undefined) data.avatar = pending;
        if (!('nickname' in data) && !('avatar' in data)) {
          close();
          return;
        }
        save.disabled = true;
        save.textContent = '保存中…';
        showError('');
        call('post', '/user/profile', data).then(function (res) {
          if (res && res.code == 0) {
            apply(res.data);
            close();
          } else if (!res) {
            close(); // 被统一拦截：已提示并退回登录
          } else {
            showError(res.msg || MSG.saveFailed);
          }
        }, function () {
          showError(MSG.network);
        }).then(function () {
          save.disabled = false;
          save.textContent = '保存';
        });
      });

      doc.body.appendChild(overlay);
      editor = { close: close };
    }

    box.addEventListener('click', openEditor);
    var timer = setIntervalFn(pollPoints, POLL_MS);
    refresh();

    function destroy() {
      destroyed = true;
      clearIntervalFn(timer);
      box.removeEventListener('click', openEditor);
      if (editor) editor.close();
      if (box.parentNode) box.parentNode.removeChild(box);
    }

    return { refresh: refresh, destroy: destroy, openEditor: openEditor };
  }

  return {
    mount: mount, nicknameProblem: nicknameProblem, fmtPoints: fmtPoints, cropBox: cropBox,
    squareDataURL: squareDataURL, readImage: readImage,
    NICK_MAX: NICK_MAX, AVATAR_SIZE: AVATAR_SIZE, AVATAR_QUALITY: AVATAR_QUALITY, POLL_MS: POLL_MS, MSG: MSG,
  };
});
```

- [ ] **Step 4: `client/index.html` 加载脚本**

把 `<script src=app://./account-onboard.js></script>` 替换为 `<script src=app://./account-onboard.js></script><script src=app://./user-profile.js></script>`（该文件是单行 HTML，只改这一处）。

- [ ] **Step 5: 运行测试**

Run: `node --test electron/user-profile.test.js && npm test`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add client/user-profile.js client/index.html electron/user-profile.test.js
git commit -m "feat(client): home page user profile widget with avatar/nickname editor"
```

---

### Task 5: 补丁层 `profile v1`：登录保存余额、首页挂载信息区

**Files:**
- Modify: `scripts/patch-ds-client.js`
- Regenerate: `client/js/chunk-4dffb567.9e3cf4c5.js`、`client/js/app.9ba1133b.js`（运行补丁脚本生成）
- Test: `electron/ds-client-patch.test.js`

**Interfaces:**
- Consumes: Task 4 的 `window.dsProfile.mount(el, { request, apiURL, points })` 与返回的 `{ refresh(points?), destroy() }`
- Produces: 导出 `PROFILE_MARK = '/* ds-patch profile v1 */'`、`INDEX_LOCATOR = 'var indexvue_type_template_id_d79680f8_scoped_true_render'`；登录成功后 `localStorage.dsPoints` 为余额字符串（缺失时为 `""`）

背景（已核实）：首页 `index.vue` 位于 app chunk 的一个 `eval('...')` 模块内（单引号），模板与脚本在同一模块；首页用 keep-alive，进入时依次触发 `mounted` 与 `activated`。下列 4 个锚点在各自文件中均恰好命中 1 次（按 `enc(s, "'")` 编码后计数）。axios 实例为 `__webpack_require__("b775")["a"]`，apiURL 为 `__webpack_require__("f121")["apiURL"]`。

- [ ] **Step 1: 写失败测试**（追加到 `electron/ds-client-patch.test.js` 末尾；文件顶部的 require 解构加入 `PROFILE_MARK, INDEX_LOCATOR`）

```js
// ---- profile v1：登录保存余额；首页在背景与 .card 之间挂载用户信息区（window.dsProfile） ----
test('login: 登录成功把 data.points 存入 localStorage.dsPoints（缺失存空串）', async () => {
  let h = loginHarness({ code: 0, data: { token: 'T', userInfo: {}, points: 12 } });
  await h.run();
  assert.strictEqual(h.store.dsPoints, '12');
  h = loginHarness({ code: 0, data: { token: 'T', userInfo: {} } });
  await h.run();
  assert.strictEqual(h.store.dsPoints, '');
});

const indexSource = () => appModuleSource(fs.readFileSync(path.join(DIR, APP_CHUNK), 'utf8'), INDEX_LOCATOR);

test('app chunk: 首页模板在背景与 .card 之间加 ref="dsProfile" 挂载点', () => {
  const src = indexSource();
  assert.ok(src.includes(PROFILE_MARK));
  const bg = src.indexOf('staticClass: "bg bodymain"');
  const mountPoint = src.indexOf('ref: "dsProfile"');
  const card = src.indexOf('staticClass: "card"');
  assert.ok(bg > 0 && bg < mountPoint && mountPoint < card);
  new vm.Script(src);
});

// 执行整个首页模块（依赖一律桩），取出 index.vue 的组件选项
function indexHarness({ withProfile = true, points = '5' } = {}) {
  const mounts = [];
  const ctl = { refreshed: [], destroyed: 0, refresh(p) { this.refreshed.push(p); }, destroy() { this.destroyed++; } };
  const service = function () {};
  const store = { dsPoints: points };
  const src = indexSource() + '\n;__webpack_exports__.dsIndex = indexvue_type_script_lang_js_;';
  const fn = new vm.Script('(function(module, __webpack_exports__, __webpack_require__, window){' + src + '\n})')
    .runInNewContext({
      console, setInterval() {}, clearInterval() {}, document: anyStub(),
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem() {}, removeItem() {} },
    });
  const exp = {};
  const all = { '2877': { a: (o) => ({ exports: o, options: o }) }, b775: { a: service }, f121: { apiURL: API_URL } };
  const req = Object.assign((id) => (id in all ? all[id] : anyStub()), {
    r() {}, d(e, n, g) { Object.defineProperty(e, n, { get: g, enumerable: true }); },
    n: (m) => { const g = () => m; g.a = m; return g; },
  });
  const win = { electron: { ipcRenderer: { send() {}, on() {} } } };
  if (withProfile) win.dsProfile = { mount: (el, o) => { mounts.push([el, o]); return ctl; } };
  fn({ exports: exp }, exp, req, win);
  const comp = exp.dsIndex;
  const el = { id: 'mount-point' };
  const vmThis = Object.assign(comp.data(), {
    $refs: { dsProfile: el }, changeWindowSize() {}, shiming() {}, setSoftDate() {},
  });
  return { comp, vmThis, mounts, ctl, el, service, store };
}

test('首页 mounted 调用 dsProfile.mount，activated 刷新，destroyed 卸载', () => {
  const h = indexHarness();
  h.comp.mounted.call(h.vmThis);
  assert.strictEqual(h.mounts.length, 1);
  const [el, o] = h.mounts[0];
  assert.strictEqual(el, h.el);
  assert.strictEqual(o.request, h.service);
  assert.strictEqual(o.apiURL, API_URL);
  assert.strictEqual(o.points, '5');
  h.store.dsPoints = '8';
  h.comp.activated.call(h.vmThis);
  assert.deepStrictEqual(h.ctl.refreshed, ['8']);
  h.comp.destroyed.call(h.vmThis);
  assert.strictEqual(h.ctl.destroyed, 1);
});

test('首页：dsProfile 脚本未加载时不报错', () => {
  const h = indexHarness({ withProfile: false });
  h.comp.mounted.call(h.vmThis);
  h.comp.activated.call(h.vmThis);
  h.comp.destroyed.call(h.vmThis);
  assert.strictEqual(h.vmThis.dsProfileCtl, undefined);
});
```

（`loginHarness` 的 `store` 已支持 `setItem`；`anyStub`、`appModuleSource`、`API_URL`、`DIR` 为该测试文件已有的辅助函数 / 常量。若既有「app chunk: 锚点不匹配时报错」等用合成输入调用 `patchApp` 的测试因新增的首页层抛出「找不到 var indexvue...」而失败，按该测试原本要验证的锚点调整合成输入，不要删除断言。）

- [ ] **Step 2: 运行确认失败**

Run: `node --test electron/ds-client-patch.test.js`
Expected: FAIL（`PROFILE_MARK` 未导出 / `dsPoints` 未定义）

- [ ] **Step 3: 修改 `scripts/patch-ds-client.js`**

在 `LOGIN_LAYERS` 定义之前加入：

```js
// 用户信息区（子项目 D）：登录成功时把 data.points 存入 localStorage.dsPoints（首页先显示、再向后台刷新）；
// 首页 index.vue（在 app chunk 里）在背景与 .card 之间加挂载点 ref="dsProfile"（不放进 opacity .74 的 .card），
// mounted 时交给 window.dsProfile（client/user-profile.js）渲染，activated 时刷新，destroyed 时卸载。
// 请求用首页同一个 axios 实例（b775），令牌注入与 10025 等拦截由它统一处理。
const PROFILE_MARK = '/* ds-patch profile v1 */';
const PROFILE_LOGIN_REPLACEMENTS = [
  {
    find: '              localStorage.setItem("token", res.data.token);\n' +
      '              localStorage.setItem("userInfo", JSON.stringify(res.data.userInfo));',
    repl: [
      '              localStorage.setItem("token", res.data.token);',
      '              localStorage.setItem("userInfo", JSON.stringify(res.data.userInfo));',
      `              ${PROFILE_MARK}`,
      '              localStorage.setItem("dsPoints", res.data && typeof res.data.points == "number" ? String(res.data.points) : "");',
    ].join('\n'),
    count: 1,
  },
];
const INDEX_LOCATOR = 'var indexvue_type_template_id_d79680f8_scoped_true_render';
const PROFILE_APP_REPLACEMENTS = [
  {
    find: "  }, [_c('div', {\n    staticClass: \"bg bodymain\"\n  }), _c('div', {\n    staticClass: \"card\"\n  }, [",
    repl: "  }, [_c('div', {\n    staticClass: \"bg bodymain\"\n  }), _c('div', {\n    ref: \"dsProfile\"\n  }), _c('div', {\n    staticClass: \"card\"\n  }, [",
    count: 1,
  },
  {
    find: '    this.shiming();\n  },\n  methods: {\n    aaa() {',
    repl: [
      '    this.shiming();',
      `    ${PROFILE_MARK}`,
      '    if (window.dsProfile && this.$refs.dsProfile) {',
      '      this.dsProfileCtl = window.dsProfile.mount(this.$refs.dsProfile, {',
      '        request: __webpack_require__("b775")["a"],',
      '        apiURL: __webpack_require__("f121")["apiURL"],',
      '        points: localStorage.getItem("dsPoints")',
      '      });',
      '    }',
      '  },',
      '  activated() {',
      '    if (this.dsProfileCtl) this.dsProfileCtl.refresh(localStorage.getItem("dsPoints"));',
      '  },',
      '  methods: {',
      '    aaa() {',
    ].join('\n'),
    count: 1,
  },
  {
    find: '  destroyed() {\n    clearInterval(this.intervalID2);\n    clearInterval(this.intervalID3);\n  }\n});',
    repl: [
      '  destroyed() {',
      '    clearInterval(this.intervalID2);',
      '    clearInterval(this.intervalID3);',
      '    if (this.dsProfileCtl) this.dsProfileCtl.destroy();',
      '  }',
      '});',
    ].join('\n'),
    count: 1,
  },
];
```

`LOGIN_LAYERS` 末尾加 `{ mark: PROFILE_MARK, replacements: PROFILE_LOGIN_REPLACEMENTS },`；`APP_LAYERS` 末尾加：

```js
  { locator: INDEX_LOCATOR, layers: [{ mark: PROFILE_MARK, replacements: PROFILE_APP_REPLACEMENTS }] },
```

（`APP_LAYERS` 定义在 `PROFILE_*` 常量之前时，把这几个常量移到 `APP_LAYERS` 之前定义。）`module.exports` 加入 `PROFILE_MARK, INDEX_LOCATOR`。

- [ ] **Step 4: 生成客户端产物并确认幂等**

Run: `node scripts/patch-ds-client.js && node scripts/patch-ds-client.js`
Expected: 第一次输出 `patched chunk-4dffb567.9e3cf4c5.js` 与 `patched app.9ba1133b.js`（其余 skip）；第二次全部 `skip`

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: 全部 PASS（此前 166 个 + Task 4 与本任务新增）

- [ ] **Step 6: 提交**

```bash
git add scripts/patch-ds-client.js electron/ds-client-patch.test.js client/js/chunk-4dffb567.9e3cf4c5.js client/js/app.9ba1133b.js
git commit -m "feat(client): mount the user profile widget on the home page and keep the login balance"
```

---

## 收尾验证（全部任务后）

- 后端：`cd backend && .venv/bin/python -m pytest -q` 全部通过
- 客户端：`npm test` 全部通过；`node scripts/patch-ds-client.js` 全部 skip
- 后台前端：`cd backend/admin-ui && npx tsc --noEmit` 通过
- `git status` 只剩三个未跟踪的 docx
