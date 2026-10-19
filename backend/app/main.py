import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from .config import Settings, load_settings
from .upstream import build_client, forward, filter_response_headers
from .userinfo import rewrite_user_info, UpstreamNames, LegacyCheckLimiter
from .member_data import MemberData, UpstreamUnavailable, EXPERT_PAGE
from .routes import local_router
from .db import connect, init_db
from .dayys_session import DataYsSession
from .sms import build_sms_sender
from .throttle import LoginThrottle
from .routes import auth as auth_routes
from .routes import admin as admin_routes
from .collector import Collector
from .admin_auth import AdminDenied
from .maintenance import run_maintenance, maintenance_loop
from .points_worker import charge_loop
from .routes import ds as ds_routes
from .routes import user as user_routes
from .routes import admin_datasources as admin_ds_routes
from .routes import admin_agents as admin_agents_routes
from .routes import admin_staff as admin_staff_routes
from .routes import admin_segments as admin_segments_routes
from .routes import admin_points as admin_points_routes
from .routes import texts as texts_routes
from .routes import draws as draws_routes
from .draw_feed import DrawFeedHub

METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]

def create_app(settings: Settings = None, client=None, conn=None, dayys=None, collector=None, sms=None) -> FastAPI:
    settings = settings or load_settings(os.environ)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.draw_feed.install_exit_hook()     # 退出时先结束推送长连接，否则 uvicorn 一直等它们
        if app.state.settings.collector_enabled:
            try:
                await app.state.collector.start()
            except Exception as e:      # 采集起不来（如库里 headers_json 损坏）只记日志，代理照常启动
                print(f"collector start failed: {e!r}")
        # 每日维护（清理过期审计/会话/票据等）：启动时先跑一次，之后每 24h 一次
        run_maintenance(app.state.db_conn, int(time.time()))
        app.state.maintenance_task = asyncio.create_task(maintenance_loop(app.state.db_conn))
        # 积分每日扣减：启动即跑一轮，之后每 60 秒一轮（进程内，单实例部署）
        app.state.charge_task = asyncio.create_task(charge_loop(app.state.db_conn))
        try:
            yield
        finally:
            try:
                for task in (app.state.maintenance_task, app.state.charge_task):
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                await app.state.draw_feed.stop()
                await app.state.collector.stop()
            finally:       # collector.stop() 抛异常也要关掉短信客户端
                if app.state.sms_client is not None:
                    await app.state.sms_client.aclose()

    app = FastAPI(lifespan=lifespan)

    @app.exception_handler(AdminDenied)
    async def _admin_denied(request: Request, exc: AdminDenied):
        # 后台接口统一的未登录 / 越权响应（与原 _forbidden() 形状一致）
        return JSONResponse({"error": "forbidden"}, status_code=403)
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
    # 短信服务商用独立 httpx 客户端：默认校验 TLS，不继承 UPSTREAM_VERIFY_TLS（那是给上游的）
    app.state.sms_client = None
    if sms is None:
        app.state.sms_client = httpx.AsyncClient(timeout=10)
        sms = build_sms_sender(settings, app.state.sms_client)
    app.state.sms = sms
    app.state.login_throttle = LoginThrottle()      # 登录失败限流（进程内）
    app.state.upstream_names = UpstreamNames()       # 用过的共用账号编号（userinfo.py）
    app.state.legacy_limiter = LegacyCheckLimiter()  # 旧编号查询限次（routes/user.py）
    app.state.maintenance_task = None
    app.state.charge_task = None
    # 会员各自的方案 / 关注 / 遗漏监控 / 模拟练习（member_data.py）
    app.state.member = MemberData(app.state.db_conn, app.state.client, app.state.dayys, settings.from_id)
    app.state.collector = collector or Collector(app.state.db_conn, enabled=settings.collector_enabled)
    # 开奖推送（K线即时刷新）：我方数据源入库后由采集器通知，上游彩种由推送模块自己查（draw_feed.py）
    app.state.draw_feed = DrawFeedHub(app.state.db_conn, app.state.client, settings.from_id)
    app.state.collector.on_insert = app.state.draw_feed.notify_ds

    app.include_router(auth_routes.router, prefix="/api")   # 先于 catch-all
    app.include_router(ds_routes.router, prefix="/api")     # 多数据源，先于 catch-all
    app.include_router(user_routes.router, prefix="/api")   # 用户信息区，先于 catch-all
    app.include_router(texts_routes.router, prefix="/api")  # 文案读取，先于 catch-all
    app.include_router(draws_routes.router, prefix="/api")  # 开奖推送，先于 catch-all
    app.include_router(local_router, prefix="/api")
    app.include_router(admin_routes.router, prefix="/admin")
    app.include_router(admin_ds_routes.router, prefix="/admin")
    app.include_router(admin_agents_routes.router, prefix="/admin")
    app.include_router(admin_staff_routes.router, prefix="/admin")
    app.include_router(admin_segments_routes.router, prefix="/admin")
    app.include_router(admin_points_routes.router, prefix="/admin")
    app.include_router(texts_routes.admin_router, prefix="/admin")

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

        norm = gate.normalize(path)
        if gate.SAFE_PATH.fullmatch(path) and norm in app.state.member.handlers:
            user, err = gate.authorize_user(app.state.db_conn, request.headers.get("token", ""))
            if user is None:
                return JSONResponse(err)
            try:
                payload = json.loads(await request.body() or b"{}")
            except (ValueError, RecursionError):
                payload = {}
            try:
                result = await app.state.member.handle(norm, user, payload if isinstance(payload, dict) else {})
            except UpstreamUnavailable as e:
                return JSONResponse(status_code=502, content={"error": "upstream_unreachable", "detail": str(e)})
            print(f"{request.method} /api/{path} -> member user={user.id} code={result.get('code')}")
            return JSONResponse(result)
        if gate.is_blocked(path):
            empty = gate.empty_response(path)
            if empty is None:
                return JSONResponse(gate.BLOCKED)
            ok, err = gate.authorize(app.state.db_conn, request.headers.get("token", ""))
            return JSONResponse(empty if ok else err)
        body = await request.body()
        headers = dict(request.headers)

        user = None
        if path not in gate.PREAUTH_PATHS:
            user, err = gate.authorize_user(app.state.db_conn, headers.get("token", ""))
            if user is None:
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
        content = resp.content
        if user is not None and norm in gate.USERINFO_PATHS:
            content = rewrite_user_info(content, user)
        elif user is not None and norm == EXPERT_PAGE:
            content = app.state.member.rewrite_expert_page(content, user, body)
        return Response(content=content, status_code=resp.status_code,
                        headers=filter_response_headers(dict(resp.headers)))
    return app

app = create_app()
