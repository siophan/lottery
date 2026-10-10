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
    points: int = 0           # 代理积分余额（与账号一样每日扣减，见 points_worker；永不为负）

_AGENT_FIELDS = tuple(f.name for f in fields(Agent))

def _row_to_agent(r: sqlite3.Row) -> Agent:
    # 只取 agents 表列：联表查询多出的列（parent_name、统计）忽略
    return Agent(**{k: r[k] for k in _AGENT_FIELDS})

def get_agent(conn, agent_id: int) -> Agent | None:
    if not db.valid_id(agent_id):        # 超大 / 非法 id 按不存在处理（否则 sqlite3 抛 OverflowError → 500）
        return None
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
        if status != "active":
            # 暂停 / 取消即停扣（保留 charge_anchor_at）：很快恢复也从恢复后的第一轮重新起算，不沿用旧周期
            conn.execute("UPDATE agents SET next_charge_at=NULL WHERE id=?", (a.id,))
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
