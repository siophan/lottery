import json
import sqlite3
import time
from dataclasses import dataclass
from .adapters import Draw
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
        """
    )
    conn.commit()
    if not ds_existed:
        for s in DEFAULT_SOURCES:
            create_data_source(conn, key=s["key"], name=s["name"], adapter=s["adapter"],
                               base_url=s["base_url"], headers={}, interval_sec=5,
                               enabled=True, lotteries=s["lotteries"])

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
