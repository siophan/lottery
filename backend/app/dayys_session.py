import asyncio
import time
import httpx

class DataYsLoginError(Exception):
    pass

class DataYsSession:
    def __init__(self, client: httpx.AsyncClient, code: str, password: str,
                 device_id: str, from_id: str, token_ttl: int = 3600):
        self._client = client
        self._code = code
        self._password = password
        self._device_id = device_id
        self._from_id = from_id
        self._token_ttl = token_ttl
        self._token: str | None = None
        self._user_info: dict = {}
        self._logged_at: float = 0.0
        self._lock = asyncio.Lock()

    def invalidate(self) -> None:
        self._token = None

    def _fresh(self) -> bool:
        return self._token is not None and (time.monotonic() - self._logged_at) < self._token_ttl

    async def get_token(self) -> str:
        if self._fresh():
            return self._token
        async with self._lock:
            if self._fresh():
                return self._token
            return await self.login()

    async def get_user_info(self) -> dict:
        await self.get_token()
        return self._user_info

    async def login(self) -> str:
        body = {"username": self._code, "password": self._password,
                "device": "pc", "deviceId": self._device_id}
        resp = await self._client.post("/auth/login", json=body,
                                       headers={"fromId": self._from_id})
        try:
            data = resp.json()
        except Exception:
            raise DataYsLoginError(f"data-ys login: non-JSON response ({resp.status_code})")
        if data.get("code") != 0:
            raise DataYsLoginError(f"data-ys login failed: {data.get('msg')!r} (code={data.get('code')})")
        inner = data.get("data") or {}
        self._token = inner.get("token")
        self._user_info = inner.get("userInfo") or {}
        self._logged_at = time.monotonic()
        if not self._token:
            raise DataYsLoginError("data-ys login: token missing in response")
        return self._token
