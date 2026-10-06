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
          purpose TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          sent_at INTEGER NOT NULL,
          PRIMARY KEY(phone, purpose)
        );
        CREATE TABLE IF NOT EXISTS sms_send_log(
          phone TEXT NOT NULL,
          sent_at INTEGER NOT NULL
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
        """
    )
    conn.commit()
    _migrate_users(conn)
    if not ds_existed:
        for s in DEFAULT_SOURCES:
            create_data_source(conn, key=s["key"], name=s["name"], adapter=s["adapter"],
                               base_url=s["base_url"], headers={}, interval_sec=5,
                               enabled=True, lotteries=s["lotteries"])

def _migrate_users(conn) -> None:
    # 幂等迁移：缺列才 ADD COLUMN；仅在本次新加列时回填存量账号（视为已激活且已完成首登）
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    added = False
    for name, ddl in (("first_activated_at", "INTEGER"), ("activated_at", "INTEGER"),
                      ("phone", "TEXT"), ("onboarded_at", "INTEGER")):
        if name not in cols:
            conn.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl}")
            added = True
    if added:
        conn.execute("UPDATE users SET first_activated_at=created_at,"
                     " activated_at=created_at, onboarded_at=created_at")
    conn.commit()

def mask_phone(phone: str | None) -> str | None:
    if phone is None:
        return None
    return phone[:3] + "****" + phone[-4:]

def _row_to_user(r: sqlite3.Row) -> User:
    return User(r["id"], r["code"], r["password_hash"], r["salt"],
                r["expires_at"], r["status"], r["created_at"],
                r["first_activated_at"], r["activated_at"], r["phone"], r["onboarded_at"])

def get_user_by_code(conn, code: str) -> User | None:
    r = conn.execute("SELECT * FROM users WHERE code=?", (code.upper(),)).fetchone()
    return _row_to_user(r) if r else None

def create_user(conn, code: str, password: str, expires_at: int | None,
                *, pending: bool = False) -> User:
    now = int(time.time())
    if pending:
        # 待激活：三列为 NULL，密码为随机不可猜值（激活时才设为初始密码）
        h, salt = hash_password(new_token())
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

def activate_user(conn, code: str, now: int) -> str:
    u = get_user_by_code(conn, code)
    if not u:
        return "not_found"
    if u.first_activated_at is not None:
        return "already"
    h, salt = hash_password(INITIAL_PASSWORD)
    conn.execute(
        "UPDATE users SET password_hash=?, salt=?, first_activated_at=?, activated_at=?,"
        " status='active', onboarded_at=NULL WHERE id=?",
        (h, salt, now, now, u.id),
    )
    conn.commit()
    return "ok"

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
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return "ok"

def complete_onboarding(conn, user_id: int, new_password: str, phone: str, now: int) -> None:
    h, salt = hash_password(new_password)
    try:
        conn.execute("UPDATE users SET password_hash=?, salt=?, phone=?, onboarded_at=? WHERE id=?",
                     (h, salt, phone, now, user_id))
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM onboard_tickets WHERE user_id=?", (user_id,))
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

# ---------------- 短信验证码 ----------------

def _sms_hash(salt: str, code: str) -> str:
    return hashlib.sha256((salt + code).encode("utf-8")).hexdigest()

def save_sms_code(conn, phone: str, purpose: str, code: str, ttl: int, now: int) -> None:
    salt = secrets.token_hex(8)
    try:
        conn.execute(
            "INSERT OR REPLACE INTO sms_codes(phone,purpose,code_hash,salt,expires_at,attempts,sent_at)"
            " VALUES(?,?,?,?,?,0,?)",
            (phone, purpose, _sms_hash(salt, code), salt, now + ttl, now),
        )
        conn.execute("INSERT INTO sms_send_log(phone,sent_at) VALUES(?,?)", (phone, now))
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def delete_sms_code(conn, phone: str, purpose: str) -> None:
    conn.execute("DELETE FROM sms_codes WHERE phone=? AND purpose=?", (phone, purpose))
    conn.commit()

def last_sms_sent_at(conn, phone: str, purpose: str) -> int | None:
    r = conn.execute("SELECT sent_at FROM sms_codes WHERE phone=? AND purpose=?",
                     (phone, purpose)).fetchone()
    return r["sent_at"] if r else None

def count_sms_sent_since(conn, phone: str, since: int) -> int:
    return conn.execute("SELECT COUNT(*) FROM sms_send_log WHERE phone=? AND sent_at>=?",
                        (phone, since)).fetchone()[0]

def check_sms_code(conn, phone: str, purpose: str, code: str, now: int,
                   max_attempts: int = 5) -> str:
    """返回 ok | missing | expired | wrong | too_many；ok 与 too_many 时验证码被删除。"""
    r = conn.execute("SELECT * FROM sms_codes WHERE phone=? AND purpose=?",
                     (phone, purpose)).fetchone()
    if not r:
        return "missing"
    if now > r["expires_at"]:
        return "expired"
    if hmac.compare_digest(_sms_hash(r["salt"], code), r["code_hash"]):
        delete_sms_code(conn, phone, purpose)
        return "ok"
    attempts = r["attempts"] + 1
    if attempts >= max_attempts:
        delete_sms_code(conn, phone, purpose)
        return "too_many"
    conn.execute("UPDATE sms_codes SET attempts=? WHERE phone=? AND purpose=?",
                 (attempts, phone, purpose))
    conn.commit()
    return "wrong"

# ---------------- 审计日志 ----------------

def add_audit(conn, actor_type: str, actor: str, action: str, target: str | None,
              detail: dict, now: int | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_logs(actor_type,actor,action,target,detail_json,created_at)"
        " VALUES(?,?,?,?,?,?)",
        (actor_type, actor, action, target, json.dumps(detail, ensure_ascii=False),
         int(time.time()) if now is None else now),
    )
    conn.commit()

def list_audit(conn, limit: int, offset: int, target: str | None = None) -> tuple[list[dict], int]:
    where, args = ("WHERE target=?", [target]) if target is not None else ("", [])
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
