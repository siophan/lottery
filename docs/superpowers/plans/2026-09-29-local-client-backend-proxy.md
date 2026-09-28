# 本地 client + backend（转发优先）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭一个本地 FastAPI 透明转发后端，把客户端 `/api/*` 请求原样转发给线上 `soft-api.data-ys.com/api`，让整个 app 在本地跑起来，并为后续逐个接口本地化留好扩展点。

**Architecture:** FastAPI 应用，路由顺序为"本地覆写路由优先 → catch-all 转发兜底"。转发用 httpx 异步客户端，透传除 hop-by-hop 外的全部请求头（重写 Host、去 content-length），原样返回上游 status/body。请求日志对 token 打码。测试用 httpx MockTransport，不触真实上游。

**Tech Stack:** Python 3.9、FastAPI、uvicorn、httpx、pytest、TestClient。

## Global Constraints
- Python 版本：3.9.6（系统自带），所有依赖须兼容 3.9。
- 上游默认地址：`https://soft-api.data-ys.com/api`；默认端口 `8000`；可用环境变量覆盖。
- 转发层**不登录、不代替认证、不主动调用线上服务器**；token 由客户端登录产生，仅中继。
- 日志中 `token` 必须打码（保留首尾各 4 位），不落盘明文凭证。
- **测试与开发中不得调用真实 `data-ys.com`**——一律用 mock 上游。
- hop-by-hop 头（大小写不敏感）：`host, content-length, connection, transfer-encoding, keep-alive, te, trailer, upgrade, proxy-authorization, proxy-authenticate`。
- 目录根：`ys-mac/backend/`。所有相对路径以此为准。

---

### Task 1: 工程骨架与配置

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py` (空)
- Create: `backend/app/config.py`
- Create: `backend/tests/__init__.py` (空)
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Produces: `Settings` dataclass，字段 `port:int, upstream:str, verify_tls:bool, timeout:float`；`load_settings(env: Mapping[str,str]) -> Settings`。

- [ ] **Step 1: 初始化 git 与虚拟环境**

```bash
cd ys-mac && git init
python3 -m venv backend/.venv && backend/.venv/bin/pip install -U pip
echo "backend/.venv/" >> .gitignore
echo "__pycache__/" >> .gitignore
echo ".pytest_cache/" >> .gitignore
```

- [ ] **Step 2: 写 requirements 并安装**

`backend/requirements.txt`:
```
fastapi==0.111.0
uvicorn[standard]==0.30.1
httpx==0.27.0
pytest==8.2.2
```

```bash
backend/.venv/bin/pip install -r backend/requirements.txt
```

- [ ] **Step 3: 写失败测试**

`backend/tests/test_config.py`:
```python
from app.config import load_settings

def test_defaults():
    s = load_settings({})
    assert s.port == 8000
    assert s.upstream == "https://soft-api.data-ys.com/api"
    assert s.verify_tls is True
    assert s.timeout == 15.0

def test_env_override():
    s = load_settings({"PORT": "9000", "UPSTREAM": "http://x/api",
                       "UPSTREAM_VERIFY_TLS": "false", "UPSTREAM_TIMEOUT": "5"})
    assert s.port == 9000
    assert s.upstream == "http://x/api"
    assert s.verify_tls is False
    assert s.timeout == 5.0
```

- [ ] **Step 4: 运行，确认失败**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_config.py -v`
Expected: FAIL（`ModuleNotFoundError: app.config`）

- [ ] **Step 5: 实现 config.py**

`backend/app/config.py`:
```python
from dataclasses import dataclass
from typing import Mapping

@dataclass
class Settings:
    port: int = 8000
    upstream: str = "https://soft-api.data-ys.com/api"
    verify_tls: bool = True
    timeout: float = 15.0

def load_settings(env: Mapping[str, str]) -> Settings:
    def flag(v: str) -> bool:
        return v.strip().lower() not in ("false", "0", "no", "")
    return Settings(
        port=int(env.get("PORT", 8000)),
        upstream=env.get("UPSTREAM", "https://soft-api.data-ys.com/api").rstrip("/"),
        verify_tls=flag(env.get("UPSTREAM_VERIFY_TLS", "true")),
        timeout=float(env.get("UPSTREAM_TIMEOUT", 15.0)),
    )
```

- [ ] **Step 6: 运行，确认通过**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_config.py -v`
Expected: PASS（2 passed）
注：pytest 从 `backend/` 运行以便 `app` 可导入；如需要在 `backend/` 加 `pytest.ini` 含 `[pytest]\npythonpath = .`。

- [ ] **Step 7: 提交**

```bash
cd ys-mac && git add backend/requirements.txt backend/app/__init__.py backend/app/config.py backend/tests/ .gitignore backend/pytest.ini
git commit -m "feat(backend): project scaffold and settings loader"
```

---

### Task 2: 头处理与 token 打码（纯函数）

**Files:**
- Create: `backend/app/upstream.py`
- Test: `backend/tests/test_headers.py`

**Interfaces:**
- Produces:
  - `HOP_BY_HOP: set[str]`（全小写）
  - `filter_request_headers(headers: Mapping[str,str]) -> dict[str,str]`：去除 hop-by-hop（大小写不敏感），保留其余（含 `token`,`fromId`）。
  - `filter_response_headers(headers: Mapping[str,str]) -> dict[str,str]`：同样去 hop-by-hop。
  - `mask_token(value: str) -> str`：长度>8 时返回 `前4…后4`，否则返回 `***`。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_headers.py`:
```python
from app.upstream import filter_request_headers, filter_response_headers, mask_token

def test_filter_request_drops_hop_by_hop_case_insensitive():
    h = {"Host": "x", "Content-Length": "5", "token": "abc", "fromId": "1004"}
    out = filter_request_headers(h)
    assert "host" not in {k.lower() for k in out}
    assert "content-length" not in {k.lower() for k in out}
    assert out["token"] == "abc"
    assert out["fromId"] == "1004"

def test_filter_response_drops_transfer_encoding():
    out = filter_response_headers({"Transfer-Encoding": "chunked", "Content-Type": "application/json"})
    assert {k.lower() for k in out} == {"content-type"}

def test_mask_token_long():
    assert mask_token("sk-1234567890abcdef") == "sk-1…cdef"

def test_mask_token_short():
    assert mask_token("abc") == "***"
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_headers.py -v`
Expected: FAIL（`ImportError`）

- [ ] **Step 3: 实现 upstream.py 的头工具**

`backend/app/upstream.py`:
```python
from typing import Mapping

HOP_BY_HOP = {
    "host", "content-length", "connection", "transfer-encoding",
    "keep-alive", "te", "trailer", "upgrade",
    "proxy-authorization", "proxy-authenticate",
}

def filter_request_headers(headers: Mapping[str, str]) -> dict:
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}

def filter_response_headers(headers: Mapping[str, str]) -> dict:
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}

def mask_token(value: str) -> str:
    return f"{value[:4]}…{value[-4:]}" if len(value) > 8 else "***"
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_headers.py -v`
Expected: PASS（4 passed）

- [ ] **Step 5: 提交**

```bash
cd ys-mac && git add backend/app/upstream.py backend/tests/test_headers.py
git commit -m "feat(backend): request/response header filtering and token masking"
```

---

### Task 3: 转发函数（httpx，MockTransport 测试）

**Files:**
- Modify: `backend/app/upstream.py`（新增 `build_client`、`forward`）
- Test: `backend/tests/test_forward.py`

**Interfaces:**
- Consumes: `Settings`（Task 1）、`filter_request_headers`（Task 2）。
- Produces:
  - `build_client(settings: Settings, transport=None) -> httpx.AsyncClient`：`base_url=settings.upstream`，`verify=settings.verify_tls`，`timeout=settings.timeout`；`transport` 非空时用于测试注入。
  - `async forward(client, method: str, path: str, headers: dict, content: bytes, params) -> httpx.Response`：向 `path`（相对 base_url，形如 `/auth/login`）发请求，头经 `filter_request_headers` 过滤。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_forward.py`:
```python
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_forward.py -v`
Expected: FAIL（`ImportError: build_client`）

- [ ] **Step 3: 实现 build_client 与 forward**

在 `backend/app/upstream.py` 追加：
```python
import httpx
from .config import Settings

def build_client(settings: Settings, transport=None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.upstream,
        verify=settings.verify_tls,
        timeout=settings.timeout,
        transport=transport,
    )

async def forward(client: httpx.AsyncClient, method: str, path: str,
                  headers: dict, content: bytes, params) -> httpx.Response:
    req = client.build_request(
        method, path,
        headers=filter_request_headers(headers),
        content=content,
        params=params,
    )
    return await client.send(req)
```
说明：`build_request` 相对 `base_url` 解析 `path`，并自动设置正确的 `host` 头为上游主机。

- [ ] **Step 4: 运行，确认通过**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_forward.py -v`
Expected: PASS（1 passed）

- [ ] **Step 5: 提交**

```bash
cd ys-mac && git add backend/app/upstream.py backend/tests/test_forward.py
git commit -m "feat(backend): httpx upstream client and forward helper"
```

---

### Task 4: FastAPI 应用与 catch-all 转发路由

**Files:**
- Create: `backend/app/routes/__init__.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_proxy.py`

**Interfaces:**
- Consumes: `load_settings`、`build_client`、`forward`、`filter_response_headers`。
- Produces:
  - `local_router: fastapi.APIRouter`（`app/routes/__init__.py` 导出，phase 1 无路由，供后续本地覆写挂载）。
  - `create_app(settings: Settings | None = None, client: httpx.AsyncClient | None = None) -> FastAPI`：先 `include_router(local_router, prefix="/api")`，再注册 catch-all `@app.api_route("/api/{path:path}", methods=[...])`，把 `/api/{path}` 转发到上游 `/{path}`。CORS 允许 `http://localhost` 与 `http://127.0.0.1` 任意端口。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_proxy.py`:
```python
import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

def make_client(handler):
    s = Settings(upstream="https://up.example/api")
    client = httpx.AsyncClient(base_url=s.upstream, transport=httpx.MockTransport(handler))
    return TestClient(create_app(settings=s, client=client))

def test_get_forwarded_with_status_and_body():
    def handler(req):
        assert str(req.url) == "https://up.example/api/user/info"
        return httpx.Response(201, json={"ok": True})
    tc = make_client(handler)
    r = tc.get("/api/user/info")
    assert r.status_code == 201
    assert r.json() == {"ok": True}

def test_post_body_and_token_forwarded():
    def handler(req):
        assert req.method == "POST"
        assert req.content == b'{"a":1}'
        assert req.headers.get("token") == "TT"
        return httpx.Response(200, json={"code": 0})
    tc = make_client(handler)
    r = tc.post("/api/auth/login", content=b'{"a":1}',
                headers={"token": "TT", "content-type": "application/json"})
    assert r.status_code == 200
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_proxy.py -v`
Expected: FAIL（`ImportError: app.main`）

- [ ] **Step 3: 实现 routes 包与 main.py**

`backend/app/routes/__init__.py`:
```python
from fastapi import APIRouter

# phase 1：暂无本地覆写路由；后续在此挂载 (如 serviceAi)。
local_router = APIRouter()
```

`backend/app/main.py`:
```python
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from .config import Settings, load_settings
from .upstream import build_client, forward, filter_response_headers
from .routes import local_router

METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]

def create_app(settings: Settings = None, client=None) -> FastAPI:
    settings = settings or load_settings(os.environ)
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_methods=["*"], allow_headers=["*"], allow_credentials=True,
    )
    app.state.client = client or build_client(settings)

    app.include_router(local_router, prefix="/api")

    @app.api_route("/api/{path:path}", methods=METHODS)
    async def proxy(path: str, request: Request):
        body = await request.body()
        resp = await forward(app.state.client, request.method, "/" + path,
                             dict(request.headers), body, dict(request.query_params))
        return Response(content=resp.content, status_code=resp.status_code,
                        headers=filter_response_headers(dict(resp.headers)))
    return app

app = create_app()
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_proxy.py -v`
Expected: PASS（2 passed）

- [ ] **Step 5: 提交**

```bash
cd ys-mac && git add backend/app/routes/__init__.py backend/app/main.py backend/tests/test_proxy.py
git commit -m "feat(backend): FastAPI app with catch-all upstream proxy and CORS"
```

---

### Task 5: 请求日志与上游错误降级

**Files:**
- Modify: `backend/app/main.py`（加日志中间件 + 转发异常处理）
- Test: `backend/tests/test_errors_logging.py`

**Interfaces:**
- Consumes: `mask_token`（Task 2）。
- Produces: 无新公共符号；行为变更——
  - 每请求打印一行 `{method} /api/{path} -> {status} {elapsed_ms}ms token={masked}`。
  - 上游 `httpx.TimeoutException`/`httpx.RequestError` → 返回 `502` JSON `{"error":"upstream_unreachable","detail":"..."}`。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_errors_logging.py`:
```python
import httpx
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

def test_upstream_timeout_returns_502():
    def handler(req):
        raise httpx.ConnectTimeout("boom", request=req)
    s = Settings(upstream="https://up.example/api")
    client = httpx.AsyncClient(base_url=s.upstream, transport=httpx.MockTransport(handler))
    tc = TestClient(create_app(settings=s, client=client))
    r = tc.get("/api/user/info")
    assert r.status_code == 502
    assert r.json()["error"] == "upstream_unreachable"

def test_request_logged_with_masked_token(capsys):
    def handler(req):
        return httpx.Response(200, json={"code": 0})
    s = Settings(upstream="https://up.example/api")
    client = httpx.AsyncClient(base_url=s.upstream, transport=httpx.MockTransport(handler))
    tc = TestClient(create_app(settings=s, client=client))
    tc.post("/api/auth/login", headers={"token": "sk-1234567890abcdef"})
    out = capsys.readouterr().out
    assert "/api/auth/login -> 200" in out
    assert "sk-1234567890abcdef" not in out
    assert "sk-1…cdef" in out
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_errors_logging.py -v`
Expected: FAIL（超时未捕获→500 而非 502；日志断言失败）

- [ ] **Step 3: 修改 main.py 的 proxy 处理**

将 `main.py` 中 `proxy` 函数体替换为：
```python
    @app.api_route("/api/{path:path}", methods=METHODS)
    async def proxy(path: str, request: Request):
        import time
        from .upstream import mask_token
        from fastapi.responses import JSONResponse
        body = await request.body()
        masked = mask_token(request.headers.get("token", ""))
        t0 = time.monotonic()
        try:
            resp = await forward(app.state.client, request.method, "/" + path,
                                 dict(request.headers), body, dict(request.query_params))
        except (httpx.TimeoutException, httpx.RequestError) as e:
            print(f"{request.method} /api/{path} -> ERR {int((time.monotonic()-t0)*1000)}ms token={masked} ({e})")
            return JSONResponse(status_code=502,
                                content={"error": "upstream_unreachable", "detail": str(e)})
        print(f"{request.method} /api/{path} -> {resp.status_code} {int((time.monotonic()-t0)*1000)}ms token={masked}")
        return Response(content=resp.content, status_code=resp.status_code,
                        headers=filter_response_headers(dict(resp.headers)))
```
并在 `main.py` 顶部 `import httpx`。

- [ ] **Step 4: 运行，确认通过**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest tests/test_errors_logging.py -v`
Expected: PASS（2 passed）

- [ ] **Step 5: 全量测试**

Run: `cd ys-mac/backend && .venv/bin/python -m pytest -v`
Expected: 全部 PASS（9 项）

- [ ] **Step 6: 提交**

```bash
cd ys-mac && git add backend/app/main.py backend/tests/test_errors_logging.py
git commit -m "feat(backend): request logging with token masking and 502 upstream fallback"
```

---

### Task 6: 运行入口与 README

**Files:**
- Create: `backend/README.md`
- Create: `backend/run.sh`

**Interfaces:** 无代码接口；提供启动方式与手动联调说明。

- [ ] **Step 1: 写 run.sh**

`backend/run.sh`:
```bash
#!/usr/bin/env bash
cd "$(dirname "$0")"
exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}" --reload
```
```bash
chmod +x ys-mac/backend/run.sh
```

- [ ] **Step 2: 写 README.md**

`backend/README.md`：写明用途（透明转发到 data-ys.com）、`pip install -r requirements.txt`、`./run.sh` 启动、环境变量（PORT/UPSTREAM/UPSTREAM_VERIFY_TLS/UPSTREAM_TIMEOUT）、`pytest` 跑测试、以及"不主动调用真实上游、token 由客户端登录产生"的安全说明。

- [ ] **Step 3: 冒烟（本地空跑，不联真上游）**

```bash
cd ys-mac/backend && (.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &) ; sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/docs   # 期望 200
kill %1 2>/dev/null || pkill -f "uvicorn app.main:app"
```
Expected: `/docs` 返回 200（应用能起、路由已注册）。

- [ ] **Step 4: 提交**

```bash
cd ys-mac && git add backend/README.md backend/run.sh
git commit -m "chore(backend): run script and README"
```

---

### Task 7: 客户端改配置指向本地 backend

**Files:**
- Modify: 客户端配置模块（解包代码中 `f1e0` 模块的 `apiURL` 值）
- Create: `client/README.md`（记录改动与运行方式）

**Interfaces:** 无代码接口；产出可指向本地 backend 的客户端。

- [ ] **Step 1: 定位配置**

在客户端前端代码中找到配置：`apiURL: "https://soft-api.data-ys.com/api"`（原 `f1e0` 模块）。
Run: `grep -rn 'soft-api.data-ys.com/api' <客户端前端目录>`

- [ ] **Step 2: 改为本地地址**

把该处 `apiURL` 值改为 `http://127.0.0.1:8000/api`。仅改这一处字符串，其余不动。

- [ ] **Step 3: 写 client/README.md**

记录：改了哪个文件的哪一行、如何运行客户端（浏览器或 Electron）、需先启动 backend。

- [ ] **Step 4: 手动联调（由用户执行）**

用户启动 backend（`./run.sh`）→ 运行客户端 → 登录 → 观察 backend 日志出现
`POST /api/auth/login -> 200`。确认转发链路打通。
（注：真实登录/调用由用户完成；实现者不代为登录，不访问真实上游。）

- [ ] **Step 5: 提交**

```bash
cd ys-mac && git add client/README.md <改动的客户端文件>
git commit -m "feat(client): point apiURL to local backend"
```

---

## Self-Review
- **Spec 覆盖**：透明转发(T3/T4)、路由本地优先(T4)、头透传+Host 重写(T2/T3)、token 打码日志(T2/T5)、上游错误降级(T5)、CORS(T4)、环境变量配置(T1)、mock 上游测试(T3/T4/T5)、客户端改配置(T7)、run/README(T6) 均有对应任务。死接口与 Mac 打包在 spec 中明确为非目标，未建任务，符合。
- **占位符**：无 TBD/TODO；每个代码步骤含实际代码与命令。
- **类型一致**：`Settings` 字段(port/upstream/verify_tls/timeout)、`build_client(settings,transport)`、`forward(client,method,path,headers,content,params)`、`create_app(settings,client)`、`filter_request_headers/filter_response_headers/mask_token`、`local_router` 在各任务间命名与签名一致。
