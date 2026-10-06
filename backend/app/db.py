import hashlib
import hmac
import json
import secrets
import sqlite3
import time
from dataclasses import dataclass
from .adapters import Draw
from .security import hash_password, new_token

_UNSET = object()

INITIAL_PASSWORD = "123456"          # 后台激活 / 重置后的初始密码
AUDIT_RETENTION_SEC = 3 * 365 * 86400  # 审计日志保留三年

@dataclass
class User:
    id: int
    code: str
    password_hash: str
    salt: str
    expires_at: int | None
    status: str
    created_at: int
    first_activated_at: int | None = None   # 首次激活时间；None = 待激活
    activated_at: int | None = None         # 当前有效激活时间
    phone: str | None = None                # 绑定的实名手机号（明文，对外一律脱敏）
    onboarded_at: int | None = None         # 完成首登改密+绑定手机号的时间；None = 未完成
    agent_id: int | None = None             # 当前归属代理；None = 无归属（存量账号 / 回收后的号）
    activated_by_agent_id: int | None = None  # 首次激活操作者为代理时记其 id；后台人员激活为 None
    agent_chain_json: str | None = None     # 首次激活时的 [直接, 间接, 次间接] 上级代理 id（JSON）

@dataclass
class Session:
    token: str
    user_id: int
    created_at: int
    expires_at: int

@dataclass
class Admin:
    id: int
    username: str
    password_hash: str
    salt: str
    created_at: int
    role: str = "admin"                     # super 最高权限者 | admin 管理员 | agent 代理

@dataclass
class AdminSession:
    token: str
    admin_id: int
    created_at: int
    expires_at: int

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

def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

def init_db(conn: sqlite3.Connection) -> None:
    # 只在首次建 data_sources 表时写种子；管理员之后删光数据源，重启也不会被补回
    ds_existed = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_sources'"
    ).fetchone() is not None
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
        CREATE TABLE IF NOT EXISTS onboard_tickets(
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sms_codes(
          phone TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          purpose TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          sent_at INTEGER NOT NULL,
          PRIMARY KEY(phone, purpose, user_id)
        );
        CREATE TABLE IF NOT EXISTS sms_send_log(
          phone TEXT NOT NULL,
          sent_at INTEGER NOT NULL,
          user_id INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_sms_send_log ON sms_send_log(phone, sent_at);
        CREATE TABLE IF NOT EXISTS audit_logs(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_type TEXT NOT NULL,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          target TEXT,
          detail_json TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target, id);
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
        """
    )
    conn.commit()
    _migrate_users(conn)
    _migrate_sms_send_log(conn)
    _migrate_users_agents(conn)
    _migrate_admins(conn)
    if not ds_existed:
        for s in DEFAULT_SOURCES:
            create_data_source(conn, key=s["key"], name=s["name"], adapter=s["adapter"],
                               base_url=s["base_url"], headers={}, interval_sec=5,
                               enabled=True, lotteries=s["lotteries"])

def _migrate_users(conn) -> None:
    # 幂等迁移：缺列才 ADD COLUMN；本次新加了列才回填存量账号（视为已激活且已完成首登）。
    # ALTER 与回填放在同一个显式事务里（SQLite 支持事务性 DDL），中途崩溃则整体回滚，
    # 下次启动重新迁移，不会出现"有列但存量账号全是待激活"的半成品状态。
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    missing = [(n, t) for n, t in (("first_activated_at", "INTEGER"), ("activated_at", "INTEGER"),
                                   ("phone", "TEXT"), ("onboarded_at", "INTEGER"))
               if n not in cols]
    if not missing:
        return
    conn.commit()  # 确保没有遗留的隐式事务，BEGIN 才不会报错
    conn.execute("BEGIN IMMEDIATE")
    try:
        for name, ddl in missing:
            conn.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl}")
        conn.execute("UPDATE users SET first_activated_at=created_at,"
                     " activated_at=created_at, onboarded_at=created_at")
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def _migrate_sms_send_log(conn) -> None:
    # 旧库的 sms_send_log 没有 user_id：幂等补列，再建按账号统计用的索引
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(sms_send_log)")}
    if "user_id" not in cols:
        conn.execute("ALTER TABLE sms_send_log ADD COLUMN user_id INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sms_send_user ON sms_send_log(user_id, sent_at)")
    conn.commit()

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

def mask_phone(phone: str | None) -> str | None:
    if phone is None:
        return None
    return phone[:3] + "****" + phone[-4:]

def _row_to_user(r: sqlite3.Row) -> User:
    return User(r["id"], r["code"], r["password_hash"], r["salt"],
                r["expires_at"], r["status"], r["created_at"],
                r["first_activated_at"], r["activated_at"], r["phone"], r["onboarded_at"],
                r["agent_id"], r["activated_by_agent_id"], r["agent_chain_json"])

def get_user_by_code(conn, code: str) -> User | None:
    r = conn.execute("SELECT * FROM users WHERE code=?", (code.upper(),)).fetchone()
    return _row_to_user(r) if r else None

def get_user_by_id(conn, user_id: int) -> User | None:
    r = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    return _row_to_user(r) if r else None

def create_user(conn, code: str, password: str, expires_at: int | None,
                *, pending: bool = False) -> User:
    now = int(time.time())
    if pending:
        # 待激活：三列为 NULL，密码预置为初始密码。这样登录时「密码正确 + 待激活」
        # 才返回 10023，密码不对仍是通用错误，不会用任意密码探测出待激活账号
        h, salt = hash_password(INITIAL_PASSWORD)
        stamp = None
    else:
        h, salt = hash_password(password)
        stamp = now
    cur = conn.execute(
        "INSERT INTO users(code,password_hash,salt,expires_at,status,created_at,"
        "first_activated_at,activated_at,onboarded_at)"
        " VALUES(?,?,?,?, 'active', ?, ?,?,?)",
        (code.upper(), h, salt, expires_at, now, stamp, stamp, stamp),
    )
    conn.commit()
    return User(cur.lastrowid, code.upper(), h, salt, expires_at, "active", now,
                stamp, stamp, None, stamp)

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

def reset_user_password(conn, code: str) -> str:
    u = get_user_by_code(conn, code)
    if not u:
        return "not_found"
    if u.first_activated_at is None:
        return "pending"
    h, salt = hash_password(INITIAL_PASSWORD)
    try:
        conn.execute("UPDATE users SET password_hash=?, salt=?, onboarded_at=NULL WHERE id=?",
                     (h, salt, u.id))
        conn.execute("DELETE FROM sessions WHERE user_id=?", (u.id,))
        conn.execute("DELETE FROM onboard_tickets WHERE user_id=?", (u.id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return "ok"

def complete_onboarding(conn, user_id: int, new_password: str, phone: str, now: int,
                        *, audit_detail: dict | None = None) -> None:
    h, salt = hash_password(new_password)
    try:
        conn.execute("UPDATE users SET password_hash=?, salt=?, phone=?, onboarded_at=? WHERE id=?",
                     (h, salt, phone, now, user_id))
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM onboard_tickets WHERE user_id=?", (user_id,))
        if audit_detail is not None:
            # 审计与改密同一事务：要么都落库，要么都回滚
            code = conn.execute("SELECT code FROM users WHERE id=?", (user_id,)).fetchone()["code"]
            conn.execute(
                "INSERT INTO audit_logs(actor_type,actor,action,target,detail_json,created_at)"
                " VALUES('user',?,'user.onboard',?,?,?)",
                (code, code, json.dumps(audit_detail, ensure_ascii=False), now))
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def delete_user_sessions(conn, user_id: int) -> None:
    conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
    conn.commit()

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

def apply_user_changes(conn, u: User, *, actor_type: str, actor: str, now: int,
                       status=_UNSET, expires_at=_UNSET) -> None:
    """管理员改状态/到期：更新与审计在同一事务里一次提交，失败整体回滚。
    只对真实变化的字段写审计；值没变则什么都不写。
    暂停/封禁不删会话：gate 每次请求都按状态拒绝（封禁 10024、暂停 10022），
    客户端据此踢下线并显示对应提示；删掉会话只会得到笼统的 10020「登录已失效」。"""
    try:
        if status is not _UNSET and status != u.status:
            conn.execute("UPDATE users SET status=? WHERE id=?", (status, u.id))
            _audit_nocommit(conn, actor_type, actor, "user.status", u.code,
                            {"from": u.status, "to": status}, now)
        if expires_at is not _UNSET and expires_at != u.expires_at:
            conn.execute("UPDATE users SET expires_at=? WHERE id=?", (expires_at, u.id))
            _audit_nocommit(conn, actor_type, actor, "user.expires", u.code,
                            {"from": u.expires_at, "to": expires_at}, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def list_users(conn) -> list[User]:
    return [_row_to_user(r) for r in conn.execute("SELECT * FROM users ORDER BY id").fetchall()]

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

# ---------------- 首登票据 ----------------

def create_onboard_ticket(conn, user_id: int, ttl: int) -> str:
    tok = new_token()
    now = int(time.time())
    conn.execute(
        "INSERT INTO onboard_tickets(token,user_id,created_at,expires_at) VALUES(?,?,?,?)",
        (tok, user_id, now, now + ttl),
    )
    conn.commit()
    return tok

def get_onboard_ticket_user(conn, token: str, now: int) -> User | None:
    r = conn.execute(
        "SELECT u.* FROM onboard_tickets t JOIN users u ON u.id=t.user_id"
        " WHERE t.token=? AND t.expires_at>=?",
        (token, now),
    ).fetchone()
    return _row_to_user(r) if r else None

def purge_expired_onboard_tickets(conn, now: int) -> int:
    cur = conn.execute("DELETE FROM onboard_tickets WHERE expires_at < ?", (now,))
    conn.commit()
    return cur.rowcount

# ---------------- 短信验证码 ----------------

def _sms_hash(salt: str, code: str) -> str:
    return hashlib.sha256((salt + code).encode("utf-8")).hexdigest()

def save_sms_code(conn, phone: str, purpose: str, code: str, ttl: int, now: int,
                  *, user_id: int) -> None:
    # 验证码按 (手机号, 用途, 账号) 存：A 账号取的码 B 账号用不了，B 取码也不会覆盖 A 的码
    salt = secrets.token_hex(8)
    try:
        conn.execute(
            "INSERT OR REPLACE INTO sms_codes(phone,purpose,user_id,code_hash,salt,expires_at,attempts,sent_at)"
            " VALUES(?,?,?,?,?,?,0,?)",
            (phone, purpose, user_id, _sms_hash(salt, code), salt, now + ttl, now),
        )
        conn.execute("INSERT INTO sms_send_log(phone,sent_at,user_id) VALUES(?,?,?)",
                     (phone, now, user_id))
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def delete_sms_code(conn, phone: str, purpose: str, *, user_id: int) -> None:
    conn.execute("DELETE FROM sms_codes WHERE phone=? AND purpose=? AND user_id=?",
                 (phone, purpose, user_id))
    conn.commit()

def last_sms_sent_at(conn, phone: str) -> int | None:
    # 取自发送流水而非 sms_codes：发送失败/验证码作废后删掉码行，也不会绕过冷却；
    # 流水按手机号统计，换个账号给同一号码取码同样受冷却约束
    r = conn.execute("SELECT MAX(sent_at) AS t FROM sms_send_log WHERE phone=?", (phone,)).fetchone()
    return r["t"]

def count_sms_sent_since(conn, phone: str, since: int) -> int:
    return conn.execute("SELECT COUNT(*) FROM sms_send_log WHERE phone=? AND sent_at>=?",
                        (phone, since)).fetchone()[0]

def count_sms_sent_by_user_since(conn, user_id: int, since: int) -> int:
    return conn.execute("SELECT COUNT(*) FROM sms_send_log WHERE user_id=? AND sent_at>=?",
                        (user_id, since)).fetchone()[0]

def purge_old_sms_send_log(conn, now: int) -> int:
    # 频控只需要最近 24 小时的发送记录
    cur = conn.execute("DELETE FROM sms_send_log WHERE sent_at < ?", (now - 86400,))
    conn.commit()
    return cur.rowcount

def check_sms_code(conn, phone: str, purpose: str, code: str, now: int,
                   *, user_id: int, max_attempts: int = 5) -> str:
    """返回 ok | missing | expired | wrong | too_many；ok 与 too_many 时验证码被删除。
    只认该账号自己取的码。"""
    key = (phone, purpose, user_id)
    where = "phone=? AND purpose=? AND user_id=?"
    r = conn.execute(f"SELECT * FROM sms_codes WHERE {where}", key).fetchone()
    if not r:
        return "missing"
    if now > r["expires_at"]:
        return "expired"
    if hmac.compare_digest(_sms_hash(r["salt"], code), r["code_hash"]):
        delete_sms_code(conn, phone, purpose, user_id=user_id)
        return "ok"
    # 计数在 SQL 里原子自增，再读回判断是否达到上限
    conn.execute(f"UPDATE sms_codes SET attempts=attempts+1 WHERE {where}", key)
    conn.commit()
    row = conn.execute(f"SELECT attempts FROM sms_codes WHERE {where}", key).fetchone()
    if row is None or row["attempts"] >= max_attempts:
        delete_sms_code(conn, phone, purpose, user_id=user_id)
        return "too_many"
    return "wrong"

# ---------------- 审计日志 ----------------

def _audit_nocommit(conn, actor_type: str, actor: str, action: str, target: str | None,
                    detail: dict, now: int | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_logs(actor_type,actor,action,target,detail_json,created_at)"
        " VALUES(?,?,?,?,?,?)",
        (actor_type, actor, action, target, json.dumps(detail, ensure_ascii=False),
         int(time.time()) if now is None else now),
    )

def add_audit(conn, actor_type: str, actor: str, action: str, target: str | None,
              detail: dict, now: int | None = None) -> None:
    _audit_nocommit(conn, actor_type, actor, action, target, detail, now)
    conn.commit()

def list_audit(conn, limit: int, offset: int, target: str | None = None) -> tuple[list[dict], int]:
    # 目标按原样或大写匹配：账号编号审计存大写，代理名称 / 管理员用户名存原样
    where, args = ("WHERE target IN (?, ?)", [target, target.upper()]) if target is not None else ("", [])
    total = conn.execute(f"SELECT COUNT(*) FROM audit_logs {where}", args).fetchone()[0]
    rs = conn.execute(
        f"SELECT * FROM audit_logs {where} ORDER BY id DESC LIMIT ? OFFSET ?",
        args + [limit, offset],
    ).fetchall()
    rows = [dict(id=r["id"], actor_type=r["actor_type"], actor=r["actor"], action=r["action"],
                 target=r["target"], detail=json.loads(r["detail_json"] or "{}"),
                 created_at=r["created_at"]) for r in rs]
    return rows, total

def purge_old_audit_logs(conn, now: int) -> int:
    cur = conn.execute("DELETE FROM audit_logs WHERE created_at < ?", (now - AUDIT_RETENTION_SEC,))
    conn.commit()
    return cur.rowcount

def _row_to_admin(r: sqlite3.Row) -> Admin:
    return Admin(r["id"], r["username"], r["password_hash"], r["salt"], r["created_at"], r["role"])

def get_admin_by_username(conn, username: str) -> Admin | None:
    r = conn.execute("SELECT * FROM admins WHERE username=?", (username,)).fetchone()
    return _row_to_admin(r) if r else None

ID_MAX = 2 ** 62      # SQLite INTEGER 为 64 位有符号；留足余量，避免 OverflowError 变 500

def valid_id(v) -> bool:
    """主键 id 的合法取值：整数（不含 bool）且 0 < v <= 2**62；否则一律按「不存在」处理。"""
    return isinstance(v, int) and not isinstance(v, bool) and 0 < v <= ID_MAX

def get_admin_by_id(conn, admin_id: int) -> Admin | None:
    if not valid_id(admin_id):
        return None
    r = conn.execute("SELECT * FROM admins WHERE id=?", (admin_id,)).fetchone()
    return _row_to_admin(r) if r else None

def upsert_admin(conn, username: str, password: str) -> Admin:
    h, salt = hash_password(password)
    existing = get_admin_by_username(conn, username)
    if existing:
        conn.execute("UPDATE admins SET password_hash=?, salt=? WHERE id=?",
                     (h, salt, existing.id))
        conn.commit()
        return Admin(existing.id, username, h, salt, existing.created_at, existing.role)
    now = int(time.time())
    cur = conn.execute(
        "INSERT INTO admins(username,password_hash,salt,created_at) VALUES(?,?,?,?)",
        (username, h, salt, now),
    )
    conn.commit()
    return Admin(cur.lastrowid, username, h, salt, now, "admin")

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
    try:
        cur = conn.execute(
            "INSERT INTO data_sources(key,name,adapter,base_url,headers_json,interval_sec,enabled,created_at)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (key, name, adapter, base_url, json.dumps(headers, ensure_ascii=False),
             interval_sec, int(enabled), int(time.time())),
        )
        _replace_lotteries(conn, cur.lastrowid, lotteries)
        conn.commit()
    except Exception:
        # 连接被多处共享：中途失败必须回滚，否则半写入状态会被其他写入方的 commit 带出去
        conn.rollback()
        raise
    return get_data_source(conn, cur.lastrowid)

def update_data_source(conn, source_id: int, *, key, name, adapter, base_url, headers,
                       interval_sec, enabled, lotteries) -> bool:
    try:
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
    except Exception:
        # 映射替换中途失败（如 lottery_code 重复）：回滚，保留旧字段与旧映射
        conn.rollback()
        raise
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

def count_draws(conn, source_id: int, lottery_code: str) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM draws WHERE source_id=? AND lottery_code=?", (source_id, lottery_code),
    ).fetchone()[0]
