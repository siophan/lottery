# 后台鉴权并发回归：共享的 SQLite 连接只能在事件循环线程上使用。
# 同步依赖会被 FastAPI 放进线程池，多个线程同时用一个连接会串号（代理读到最高权限者的会话）。
# TestClient 逐个发请求测不出来，这里用 ASGITransport 并发发请求。
import asyncio
import collections
import httpx
from app import db
from tests.agent_helpers import build_app, mk_admin, mk_agent_raw

def test_concurrent_admin_requests_keep_each_identity():
    conn, app = build_app()
    mk_admin(conn, "boss", role="super")
    mk_agent_raw(conn, "agentx", tier="junior")
    for i in range(30):
        db.create_user(conn, f"U{i}", "x", None)

    async def run():
        tr = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=tr, base_url="http://t") as boss, \
                   httpx.AsyncClient(transport=tr, base_url="http://t") as ag:
            assert (await boss.post("/admin/login", json={"username": "boss", "password": "pw"})).status_code == 200
            assert (await ag.post("/admin/login", json={"username": "agentx", "password": "pw"})).status_code == 200
            res = collections.Counter()
            for _ in range(20):
                reqs = []
                for _ in range(8):
                    reqs.append(("boss", boss.get("/admin/admins")))
                    reqs.append(("agent", ag.get("/admin/admins")))      # 仅最高权限者：代理必须 403
                    reqs.append(("boss_users", boss.get("/admin/users")))
                outs = await asyncio.gather(*(r for _, r in reqs), return_exceptions=True)
                for (who, _), o in zip(reqs, outs):
                    res[(who, type(o).__name__ if isinstance(o, Exception) else o.status_code)] += 1
            return res

    res = asyncio.run(run())
    assert res == {("boss", 200): 160, ("agent", 403): 160, ("boss_users", 200): 160}
