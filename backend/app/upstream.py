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
