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

`manage.py add` 是运维兜底：直接建「已激活 + 已完成首登」、密码由命令指定的账号。
日常开号走管理后台（见下方「账号生命周期与首次登录」）。

### 账号生命周期与首次登录

- **开号**：后台「新建账号」只建「待激活」账号，密码预置为初始密码 `123456`；此时登录返回 10023「账号未激活」。
  管理 API 不接受 `password` 字段（`POST /admin/users`、`PATCH /admin/users/{code}` 带 `password` 键 → 400）。
- **激活**：后台点「激活」→ 密码重置为 `123456`、状态正常，账号进入「未完成首登」。
- **首次登录**：用 `123456` 登录 → 后端不建会话、不触达上游，返回 10030 和 15 分钟有效的 `onboardToken`；
  客户端弹出首登弹窗（`client/account-onboard.js`），用户必须改密（8–20 位、含字母和数字、不能是初始密码）
  并用短信验证码绑定实名手机号（`POST /api/auth/onboard/sms` 发码，`POST /api/auth/onboard` 提交）。
  完成后用新密码重新登录。验证码 5 分钟有效、错 5 次作废，与取码账号绑定；同号 60 秒冷却、
  同号/同账号 24 小时各最多 10 条。
- **重置密码**：后台「重置为初始密码」→ 密码回到 `123456`、删除会话，下次登录重新走首登弹窗；
  已绑定手机号的账号只能用原号码收码（提示「请使用已绑定的手机号（尾号XXXX）验证」）。
- **暂停 / 封禁**：不删会话，每个请求都按状态拒绝（封禁 10024、暂停/到期 10022），客户端据此踢下线并显示对应提示；
  恢复后未过期的会话重新可用。所有后台操作与用户首登都写入「操作日志」（审计保留三年，手机号只存脱敏值）。

### 短信（首登验证码）

| 变量 | 默认 | 说明 |
|---|---|---|
| `SMS_PROVIDER` | `log` | `log`：只把验证码打印到服务日志（开发/测试）；`aliyun`：阿里云 Dysmsapi `SendSms` |
| `SMS_ALIYUN_ACCESS_KEY_ID` | 空 | 阿里云 AccessKey ID |
| `SMS_ALIYUN_ACCESS_KEY_SECRET` | 空 | 阿里云 AccessKey Secret |
| `SMS_ALIYUN_SIGN_NAME` | 空 | 短信签名名称 |
| `SMS_ALIYUN_TEMPLATE_CODE` | 空 | 验证码模板编号（模板变量为 `${code}`） |

`SMS_PROVIDER=aliyun` 但四项 `SMS_ALIYUN_*` 有任一缺失、或 `SMS_PROVIDER` 拼错时，启动打印告警并退回 `log`。
`log` 模式下日志形如 `[sms] 138****1234 code=123456`（手机号脱敏），运维可从 journald 读码：
```bash
journalctl -u ys-middleware -f | grep '\[sms\]'
```
密钥只写在服务器的 `/etc/ys-middleware.env`，不进仓库。

### 登录限流

`POST /api/auth/login` 失败（账号不存在或密码错误）按账号编号（大写）和客户端 IP 分别计数（15 分钟滑动窗口）：

- 同一账号 15 分钟内失败 5 次 → 锁 15 分钟；
- 同一 IP 15 分钟内失败 30 次 → 锁 15 分钟。

锁定期间直接返回 `{"code":1,"msg":"登录失败次数过多，请15分钟后再试"}`，不再校验密码（省 CPU）；密码校验通过即清零该账号的计数。
计数在进程内存里（单进程 uvicorn，重启即清零，最多记 1 万个键）。服务在本机 nginx 之后时（对端为 `127.0.0.1` / `::1`），
客户端 IP（仅当对端是本机反代时才看转发头）取 `X-Real-IP`，没有再取 `X-Forwarded-For` 最右一项
（nginx 的 `$proxy_add_x_forwarded_for` 在最右追加真实对端地址；最左项可被客户端伪造，不用）。
建议 nginx 同时配置 `proxy_set_header X-Real-IP $remote_addr;`（见 DEPLOY.md）。

### 上线顺序

1. **先发布打过补丁的客户端**（含首登弹窗与踢下线提示），再在新后端上激活新账号：旧客户端收到 10030 只会提示错误，无法完成首登。
2. **把账号交给用户前先配好 `SMS_PROVIDER=aliyun`** 及四项 `SMS_ALIYUN_*`：`log` 模式下用户收不到验证码，无法完成首登。
3. **存量用户不受影响**：迁移把已有账号回填为「已激活 + 已完成首登」，照常用原密码登录，不弹首登窗。

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
