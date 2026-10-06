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
