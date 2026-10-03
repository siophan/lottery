from dataclasses import dataclass
from typing import Mapping

@dataclass
class Settings:
    port: int = 8000
    upstream: str = "https://soft-api.data-ys.com/api"
    verify_tls: bool = True
    timeout: float = 15.0
    # 中间层新增
    dayys_code: str = ""
    dayys_password: str = ""
    dayys_device_id: str = "ys-middleware"
    from_id: str = "1004"
    admin_key: str = ""
    db_path: str = "data/app.db"
    session_ttl: int = 604800       # 我方会话 7 天
    dayys_token_ttl: int = 3600     # data-ys token 刷新间隔（秒）

def load_settings(env: Mapping[str, str]) -> Settings:
    def flag(v: str) -> bool:
        return v.strip().lower() not in ("false", "0", "no", "")
    return Settings(
        port=int(env.get("PORT", 8000)),
        upstream=env.get("UPSTREAM", "https://soft-api.data-ys.com/api").rstrip("/"),
        verify_tls=flag(env.get("UPSTREAM_VERIFY_TLS", "true")),
        timeout=float(env.get("UPSTREAM_TIMEOUT", 15.0)),
        dayys_code=env.get("DATA_YS_CODE", ""),
        dayys_password=env.get("DATA_YS_PASSWORD", ""),
        dayys_device_id=env.get("DATA_YS_DEVICE_ID", "ys-middleware"),
        from_id=env.get("DATA_YS_FROM_ID", "1004"),
        admin_key=env.get("ADMIN_KEY", ""),
        db_path=env.get("DB_PATH", "data/app.db"),
        session_ttl=int(env.get("SESSION_TTL", 604800)),
        dayys_token_ttl=int(env.get("DATA_YS_TOKEN_TTL", 3600)),
    )
