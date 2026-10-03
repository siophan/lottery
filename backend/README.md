# Backend Proxy

## Purpose

This FastAPI backend serves as a transparent HTTP proxy that forwards client requests to the upstream data-ys.com API. It enables local development and testing by providing:

- CORS-enabled local endpoint (localhost/127.0.0.1 only)
- Request forwarding and response filtering
- Transparent token passthrough from client authentication
- Error handling for upstream connectivity issues

## Installation

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Server

Start the development server with:
```bash
./run.sh
```

The server listens on `http://127.0.0.1:8000` by default.

### Customization

Configure behavior via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Port to listen on |
| `UPSTREAM` | `https://soft-api.data-ys.com/api` | Upstream API base URL |
| `UPSTREAM_VERIFY_TLS` | `true` | Verify upstream TLS certificates (set to `false` for self-signed certs in dev) |
| `UPSTREAM_TIMEOUT` | `15.0` | Request timeout in seconds |

Example with custom port and upstream:
```bash
PORT=8080 UPSTREAM=http://localhost:3000/api ./run.sh
```

## Testing

Run the test suite:
```bash
pytest
```

Run with verbose output:
```bash
pytest -v
```

All tests verify proxy behavior in isolation without calling the real upstream API.

## Security Note

**Important:** This proxy does not initiate upstream calls on its own. All requests must originate from the client, and authentication tokens must be provided by the client's own login session:

1. Client logs in to the frontend (handles authentication)
2. Client's HTTP requests include the `token` header
3. Proxy transparently forwards the token to upstream
4. Proxy never stores, generates, or manages tokens

The proxy is designed for **local development only** (CORS restricted to localhost/127.0.0.1).

## 中间层后端（自有用户体系 + 共享 data-ys 账号）

### 环境变量（必填项无默认）
- `DATA_YS_CODE` / `DATA_YS_PASSWORD`：服务器持有的那个 data-ys 账号（软件编号 + 密码）
- `DATA_YS_DEVICE_ID`：服务器固定设备号（任意稳定字符串，默认 `ys-middleware`）
- `ADMIN_KEY`：管理 API 密钥
- `DB_PATH`：SQLite 路径（默认 `data/app.db`）
- 可选：`SESSION_TTL`（默认 604800）、`DATA_YS_TOKEN_TTL`（默认 3600）、`UPSTREAM_TIMEOUT`

### 运行
```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
mkdir -p data
DATA_YS_CODE=xxx DATA_YS_PASSWORD=xxx ADMIN_KEY=xxx \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 建用户
```bash
.venv/bin/python manage.py add USER01 theirpassword --expires 2027-01-01
.venv/bin/python manage.py list
```

### 部署（lottery.jh8.ai）
用 nginx/Caddy 终止 HTTPS，反代到本机 uvicorn（127.0.0.1:8000）。SQLite 文件放持久化磁盘。**仅单实例**（data-ys 会话在内存）。

### 测试
```bash
.venv/bin/python -m pytest -q
```
