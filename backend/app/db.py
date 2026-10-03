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
