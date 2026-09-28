import asyncio, httpx
from app.config import Settings
from app.upstream import build_client, forward

def test_forward_passes_method_body_headers_and_strips_host():
    seen = {}
    def handler(req: httpx.Request) -> httpx.Response:
        seen["method"] = req.method
        seen["url"] = str(req.url)
        seen["body"] = req.content
        seen["token"] = req.headers.get("token")
        seen["host_is_upstream"] = req.headers["host"]
        return httpx.Response(200, json={"code": 0})
    transport = httpx.MockTransport(handler)
    s = Settings(upstream="https://up.example/api")

    async def run():
        client = build_client(s, transport=transport)
        r = await forward(client, "POST", "/auth/login",
                          {"token": "T", "Content-Length": "3"}, b"xyz", {})
        await client.aclose()
        return r

    r = asyncio.run(run())
    assert r.status_code == 200
    assert seen["method"] == "POST"
    assert seen["url"] == "https://up.example/api/auth/login"
    assert seen["body"] == b"xyz"
    assert seen["token"] == "T"
    assert seen["host_is_upstream"] == "up.example"  # host 被重写为上游
