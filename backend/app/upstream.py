from typing import Mapping
import httpx
from .config import Settings

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
