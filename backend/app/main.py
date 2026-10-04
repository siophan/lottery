import os
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from .config import Settings, load_settings
from .upstream import build_client, forward, filter_response_headers
from .routes import local_router
from .db import connect, init_db
from .dayys_session import DataYsSession
from .routes import auth as auth_routes
from .routes import admin as admin_routes

METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]

def create_app(settings: Settings = None, client=None, conn=None, dayys=None) -> FastAPI:
    settings = settings or load_settings(os.environ)
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_methods=["*"], allow_headers=["*"], allow_credentials=True,
    )
    app.state.settings = settings
    app.state.client = client or build_client(settings)
    if conn is not None:
        app.state.db_conn = conn
    else:
        d = os.path.dirname(settings.db_path)
        if d:
            os.makedirs(d, exist_ok=True)      # 确保 DB 目录存在
        app.state.db_conn = connect(settings.db_path)
        init_db(app.state.db_conn)
    app.state.dayys = dayys or DataYsSession(
        app.state.client, settings.dayys_code, settings.dayys_password,
        settings.dayys_device_id, settings.from_id, settings.dayys_token_ttl,
    )

    app.include_router(auth_routes.router, prefix="/api")   # 先于 catch-all
    app.include_router(local_router, prefix="/api")
    app.include_router(admin_routes.router, prefix="/admin")

    _static_dir = os.path.join(os.path.dirname(__file__), "static")
    _downloads_dir = os.path.join(_static_dir, "downloads")
    os.makedirs(_downloads_dir, exist_ok=True)

    @app.get("/")
    async def landing():
        return FileResponse(os.path.join(_static_dir, "index.html"))

    app.mount("/download", StaticFiles(directory=_downloads_dir), name="download")

    # 管理后台（Ant Design Pro / Vite 构建）的哈希资源。页面入口 GET /admin/ 由
    # admin 路由返回 index.html；其引用的 /admin/assets/*.js|css 由此挂载提供。
    # 目录随构建产物提交，存在才挂（未构建时后台不可用，但不影响其余服务）。
    _admin_assets = os.path.join(_static_dir, "admin-dist", "assets")
    if os.path.isdir(_admin_assets):
        app.mount("/admin/assets", StaticFiles(directory=_admin_assets), name="admin-assets")

    @app.api_route("/api/{path:path}", methods=METHODS)
    async def proxy(path: str, request: Request):
        import time
        from .upstream import mask_token
        from fastapi.responses import JSONResponse
        from . import gate

        body = await request.body()
        headers = dict(request.headers)

        if path not in gate.PREAUTH_PATHS:
            ok, err = gate.authorize(app.state.db_conn, headers.get("token", ""))
            if not ok:
                return JSONResponse(err)
            headers["token"] = await app.state.dayys.get_token()   # 换成 data-ys token
        for k in [k for k in headers if k.lower() == "fromid"]:    # 去掉客户端自带的任意大小写 fromId
            del headers[k]
        headers["fromId"] = app.state.settings.from_id             # 确保带 fromId

        async def do_forward():
            return await forward(app.state.client, request.method, "/" + path,
                                 headers, body, dict(request.query_params))

        t0 = time.monotonic()
        masked = mask_token(headers.get("token", ""))
        try:
            resp = await do_forward()
            if path not in gate.PREAUTH_PATHS and gate.response_signals_invalid(resp.content):
                app.state.dayys.invalidate()
                headers["token"] = await app.state.dayys.get_token()
                resp = await do_forward()
        except (httpx.TimeoutException, httpx.RequestError) as e:
            print(f"{request.method} /api/{path} -> ERR {int((time.monotonic()-t0)*1000)}ms token={masked} ({e})")
            return JSONResponse(status_code=502,
                                content={"error": "upstream_unreachable", "detail": str(e)})
        print(f"{request.method} /api/{path} -> {resp.status_code} {int((time.monotonic()-t0)*1000)}ms token={masked}")
        return Response(content=resp.content, status_code=resp.status_code,
                        headers=filter_response_headers(dict(resp.headers)))
    return app

app = create_app()
