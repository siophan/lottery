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

### 管理后台

引导管理员账号（幂等，重复执行即重置密码；凭据只在本机输入，不进仓库）：
```bash
.venv/bin/python manage.py admin-set admin 'your-strong-password'
```

然后访问 `https://lottery.jh8.ai/admin/` 登录。管理端点同时接受管理员 cookie
或 `X-Admin-Key`（供脚本自动化）。本地 http 调试需把 cookie Secure 关掉：
```bash
ADMIN_COOKIE_SECURE=false DATA_YS_CODE=xxx DATA_YS_PASSWORD=xxx ADMIN_KEY=xxx \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
相关环境变量：`ADMIN_SESSION_TTL`（默认 86400）、`ADMIN_COOKIE_SECURE`（默认 true）、
`ADMIN_COOKIE_NAME`（默认 admin_session）。

## 多数据源采集

服务启动后，进程内为每个启用的数据源单独定时拉取开奖号（默认 5 秒，`rows=10`），按数据源隔离存入 SQLite
（`data_sources / source_lotteries / draws`），某个源异常不影响其他源。首次建表时自动写入两个默认源：
区块链统计（qkltj，6001/6002/5001/5002）与全球统计（qqtj，6001→trxbhffc、6002→trxbh3fc）。

- 管理：后台「数据源」菜单——增删改、启停、查看状态（正常/异常 + 最后错误 + 最后成功时间）与最新开奖。
- 客户端接口（需我方 token）：`GET /api/ds/sources?cat=hash`、`GET /api/ds/{key}/draw-result?code=6001&rows=N`
  （返回格式与区块链统计一致，rows ≤ 2000，即库内保留深度）。
- 一次性历史回填：每次（重）建某源的采集任务时（服务启动、后台改配置/启停），库内不足 1000 期的彩种会单独发一次
  `rows=1000` 的请求（超时 120 秒，不阻塞实时轮询、不影响源状态）。区块链统计借此在启动时补齐最多 1000 期历史。
- `COLLECTOR_ENABLED=false` 可关闭采集（排障用；后台改数据源也不会重新拉起采集）。
- **必须单进程运行 uvicorn**（不要加 `--workers`），否则会重复采集。
- 全球统计 trial 接口每次最多 10 行、无历史翻页，回填也拿不到更多：历史从开始采集起累积（300 期分分彩约 5 小时、三分彩约 15 小时）。

### 官网落地页与下载

- 根路径 `https://lottery.jh8.ai/` 返回官网落地页（`backend/app/static/index.html`），含 Windows / macOS 下载按钮。
- 下载链接指向 `/download/ys-win.exe` 与 `/download/ys-mac.dmg`，由后端 `StaticFiles` 托管 `backend/app/static/downloads/`。
- 部署时把实际安装包按这两个文件名放入该目录；**生产建议 nginx/Caddy 直接 `alias` 到该目录**托管大文件，不经 uvicorn：
  ```nginx
  location /download/ { alias /srv/ys/backend/app/static/downloads/; }
  location / { proxy_pass http://127.0.0.1:8000; }   # 其余转给 uvicorn
  ```

### 部署（lottery.jh8.ai）
用 nginx/Caddy 终止 HTTPS，反代到本机 uvicorn（127.0.0.1:8000）。SQLite 文件放持久化磁盘。**仅单实例**（data-ys 会话在内存）。

### 测试
```bash
.venv/bin/python -m pytest -q
```
