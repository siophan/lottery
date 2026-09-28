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
