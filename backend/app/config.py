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
