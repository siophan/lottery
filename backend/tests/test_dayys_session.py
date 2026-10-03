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
