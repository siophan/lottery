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
注意：`manage.py add` 建的账号积分余额为 0（已欠费），登录返回 10025；需在后台「加分」后才能使用（见「积分」）。

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
- **解绑手机号**：手机号被他人绑定（例如有人抢先完成了首登）时，后台人员在「更多」→「解绑手机」
  （`POST /admin/users/{code}/unbind-phone`，审计 `user.unbind_phone`）后再「重置密码」，用户重新首登即可绑定自己的手机号。
- **上游账号保护**：所有用户共用一个上游账号，客户端旧菜单里的改密、改手机、改资料、实名、找回密码、发短信
  （`user/updatePwd`、`user/updateMobile`、`user/updateInfo`、`user/realName`、`user/forgotPwd`、`auth/forgetPwd`、
  `auth/checkUserInfo`、`sms/send`）不转发，直接返回 `{"code":1,"msg":"该功能暂不可用"}`。
  上游下单同样记在共用账号上（续费、买方案、VIP、培训报名，含「积分支付」直接扣共用账号余额，订单列表人人可见），
  整个 `order/`（`order/newCreate`、`order/create`、`order/createPlanNum`、`order/createPlanJc`、`order/createVipPlanJc`、
  `order/page`、`order/info` 等）一律不转发。除此之外，转发层只放行客户端实际调用的上游接口（`app/gate.py` 的 `ALLOWED_PATHS`），
  清单外的路径（上游可能存在的其他扣费 / 改账号接口）一律不转发；客户端更新用到新接口时，要先把它加进清单。转发层只接受由字母、数字、下划线、连字符组成的非空路径段，
  带 `;`、`.`、空白、控制字符、反斜杠或空段的路径一律不转发（防止上游按 `;参数` / 后缀规则把它们解析成被拦的接口）。
  请求头只转发 `Content-Type`、`Accept`、`Accept-Language`、`User-Agent` 和改写后的 `token`、`fromId`，
  `X-Original-URL`、`X-HTTP-Method-Override`、`X-Forwarded-*`、`Cookie` 等一律丢弃（防止上游网关按这些头改写路径或方法）。
  客户端侧的入口也已隐藏：续费页、订单列表页由主进程拦截不建窗（`electron/page-guard.js`，`newPage`、`openCalculator` 两个建窗通道都拦），方案页的购买按钮由 `scripts/patch-ds-client.js` 的 shop 补丁层去掉。
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

密码正确但没拿到会话的登录（10023 未激活、10030 首登、10022 暂停/到期、10024 封禁、10025 无积分）也计入 **IP** 的次数，
但不计入账号：号段编号连续、初始密码公开，只统计密码错误会让人用 `123456` 按段扫号、抢先完成首登。
密码校验（PBKDF2）在线程池里执行，不阻塞事件循环。

锁定期间直接返回 `{"code":1,"msg":"登录失败次数过多，请15分钟后再试"}`，不再校验密码（省 CPU）；密码校验通过即清零该账号的计数。
计数在进程内存里（单进程 uvicorn，重启即清零，最多记 1 万个键；键满时优先丢弃不在锁定期的键）。服务在本机 nginx 之后时（对端为 `127.0.0.1` / `::1`），
客户端 IP（仅当对端是本机反代时才看转发头）取 `X-Real-IP`，没有再取 `X-Forwarded-For` 最右一项
（nginx 的 `$proxy_add_x_forwarded_for` 在最右追加真实对端地址；最左项可被客户端伪造，不用）。
建议 nginx 同时配置 `proxy_set_header X-Real-IP $remote_addr;`（见 DEPLOY.md）。

### 上线顺序

1. **先发布打过补丁的客户端**（含首登弹窗与踢下线提示），再在新后端上激活新账号：旧客户端收到 10030 只会提示错误，无法完成首登。
2. **把账号交给用户前先配好 `SMS_PROVIDER=aliyun`** 及四项 `SMS_ALIYUN_*`：`log` 模式下用户收不到验证码，无法完成首登。
3. **存量用户不受影响**：迁移把已有账号回填为「已激活 + 已完成首登」，照常用原密码登录，不弹首登窗。
4. **积分上线**（见下方「积分」与 DEPLOY.md「上线：账号生命周期、代理号段、积分、头像昵称」）：先发布含 10025 处理与低积分提醒的新客户端，
   再部署后端；部署后所有账号余额为 0（已欠费、无法登录），必须**立即**执行 `manage.py recharge-arrears <分数>` 为需要继续使用的账号充值。
5. **回滚**必须连同数据库一起恢复到升级前的备份，不要只回退代码（见 DEPLOY.md「回滚」）。

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

### 后台角色（最高权限者 / 管理员 / 代理）

- 三类身份统一登录 `/admin/`：最高权限者（全局唯一）、管理员、代理（用户名即代理名称）。
  菜单按角色显示，但**所有 `/admin/*` 接口都在服务端校验角色与数据范围**；`X-Admin-Key` 视为最高权限者。
- 最高权限者只能用服务器命令指定，原最高权限者在同一事务内自动降为管理员；后台界面不能转让：
  ```bash
  .venv/bin/python manage.py set-super <用户名>
  ```
- **升级到本版本后，现有管理员全部是普通管理员。部署后必须执行一次 `set-super`**，
  否则没有人能在后台管理管理员账号与授权（`X-Admin-Key` 仍可调用全部接口）。
  `set-super` 必须在 backend 目录下、载入服务环境变量后运行（否则读写的是另一个空数据库），例如：
  `cd <backend 目录> && set -a && . <环境变量文件> && set +a && .venv/bin/python manage.py set-super <用户名>`。
  升级顺序：备份数据库 → 部署代码 → 重启服务（自动迁移）→ `set-super` → 用该用户登录并确认出现「管理员与授权」菜单。
- **回滚警告**：已存在代理（`role='agent'`）后，不要把代码直接回退到本版本之前的旧版——旧版不认识角色，
  会让代理拥有完整管理员权限。回滚前须先恢复升级前的数据库备份，或删除 `role='agent'` 的 admins 行及其 admin_sessions。
- 后台登录（`POST /admin/login`）带失败限流：同一用户名 15 分钟内失败 5 次、同一 IP 失败 30 次即锁定 15 分钟（HTTP 429）。
- 资格暂停 / 取消的代理不能登录后台（提示「代理资格已暂停/已取消，无法登录」），已登录的会话在下一次请求即失效。

### 代理与账号编号段

- **代理**：后台「代理管理」新建（名称全局唯一、不区分大小写、1–20 字符，同时是登录用户名；登录密码由后台设置，8–64 位）。
  级别高级/低级：只有高级代理可以做上级、向下划拨；上级必须是资格激活的高级代理，禁止成环；仍有下级时不能改为低级。
  资格激活/暂停/取消，每次变更必须填原因（记录变更人、时间、原因）。
- **名称保留**：改名（需最高权限者，或被授予「代理改名」的管理员）或取消资格时，旧名保留一年；
  一年后他人可使用该名称，此时原（已取消的）代理登录名变为「名称#id」且不能再恢复资格。
- **编号段**：新号统一 7 位纯数字 `1000000`–`9999999`，单次最多 10000 个。
  - 分配（后台人员）：段内每个编号立即建为「待激活」账号（初始密码 123456）归属该代理，整段一个事务；
    段内已存在且不是「无归属待激活号」的编号 → 整次拒绝并列出冲突编号。存量账号不属于任何号段。
  - 划拨（高级代理）：只能把本人名下、从未激活的连续编号划给直属下级，不可撤回。
  - 回收（后台人员，仅资格已取消的代理）：名下未激活账号变为「未分配」可再分配，下级代理解除上级关系；回收后不能再恢复资格。
- **代理视角**：只读本人名下账号，唯一操作是激活待激活账号；首次激活时记录直接/间接/次间接上级。
- 账号列表的「编号状态」由数据推导：待激活 / 已激活（余额 > 0）/ 已欠费（已激活且余额为 0）/ 待回收 / 未分配。

### 积分

- **余额**：账号与代理各有积分余额（整数，永不为负）；每次变化都在同一事务里写积分流水（`points_ledger`，保留三年，
  每日维护清理）并写操作日志。流水类型：体验赠送 `trial`、后台加分 `grant`、后台扣分 `revoke`、
  转出 / 转入 `transfer_out` / `transfer_in`（代理转分与代理充值，各写一条，互为对方）、每日扣减 `charge`。
- **权限**：
  - 最高权限者 / 管理员：给任意账号或代理加分（凭空增加）；扣分（原因必填，最多扣到 0）；批量充值（凭空增加）；查看全部流水。
  - 高级代理：转分给直属下级代理（扣自身余额，收款代理须资格激活）。
  - 代理（高级与低级）：用自身余额给本人名下账号充值（未激活账号也可预充）、批量充值本人名下账号（按总额校验，全有或全无）；
    只看本人账户的流水（本人作为持有方的行；转账对方、名下账号的余额变化行不可见，下级仍能看到自己的转入行）。不能从账号转回代理、不能从下级转回上级、账号之间不能互转。
  - 单笔 1–100000 分；批量一次最多 1000 个账号；代理自身积分不做每日扣减。
- **每日扣减**：账号首次激活时计费起点 = 激活时间，24 小时后扣第 1 分，之后每 24 小时扣 1 分（进程内 Worker 每 60 秒检查一次）。
  只有「已激活、使用控制正常、未到期、余额 > 0」的账号计费；暂停 / 封禁 / 到期 / 余额为 0 期间停扣（不累计、不追扣），
  恢复后从恢复时刻重新计 24 小时。服务停机超过 24 小时错过的周期不追扣，按重新激活处理。
- **积分暂停**：已激活账号余额为 0 → 登录与业务请求返回 `{"code":10025,"msg":"无积分，无权操作，请充值积分后自动恢复使用！"}`
  （优先级：封禁 > 暂停 / 到期 > 未完成首登 > 无积分）。充值后立即自动恢复（不改变「使用控制」状态）。
  登录成功响应 `data.points` 为当前余额，客户端在 0 < 余额 < 7 时提示「您的积分已不足，请尽快联系客服增加积分！」。
- **回收与删除**：回收已取消的代理时，其名下未激活账号上预充的积分同一事务退回该代理（转出 / 转入流水，原因「回收编号退回」），
  再分配给别的代理时这些号从 0 分开始。删除账号时剩余积分先记一条扣分流水（原因「删除账号」）再删除；
  流水按账号编号记账，同编号重建的账号接续原流水，且不会再次获得体验赠送。
- **初始充值**：`manage.py recharge-arrears <分数> [--dry-run]` 给积分上线前的老账号（已激活、0 分、从无积分流水、
  使用控制正常、未到期）各充值（直接写库，每 1000 个一批）。只用于上线那一次；有过流水的账号一律不选，中途失败重跑不会重复充值。
  上线后新激活、体验期关闭且未预充的账号也是「0 分、无流水」，事后再跑会被选中，补跑前先 `--dry-run` 核对人数。
- **体验期**：后台「体验期设置」（仅后台人员）开关默认关闭、赠送分数默认 7（1–100）；开启后，此后首次激活的账号赠送一次。
  关闭 / 重新开启都不补发、不追溯；首次扣减延迟与扣减周期固定 24 小时。
- 接口：`POST /admin/users/{code}/points/grant|revoke`、`POST /admin/agents/{id}/points/grant|revoke`（后台人员，
  body `{"amount", "reason"}`）；`POST /admin/users/{code}/points/recharge`、`POST /admin/agents/{id}/points/transfer`（代理，
  body `{"amount"}`）；`POST /admin/points/batch-recharge`（body `{"codes": [...], "amount", "reason"}`）；
  `GET /admin/points/ledger?holder_type=&holder_id=&kind=&since=&until=&limit=&offset=`；`GET/PUT /admin/settings/trial`。

### 用户信息区（头像、昵称、余额）

客户端首页左上角显示头像、昵称与积分余额（子项目 D）。接口均以请求头 `token` 认证，拦截与其他业务请求一致（余额为 0 → 10025）：

- `GET /api/user/profile`：`nickname`/`avatar` 为实际显示值（未设置时为按账号编号生成的默认昵称与几何图案头像），另含 `defaultAvatar`、`points`、`nicknameIsDefault`、`avatarIsDefault`。
- `GET /api/user/points`：只返回余额，客户端每 60 秒刷新一次。
- `POST /api/user/profile`：`{"nickname": "...", "avatar": "data:image/jpeg;base64,..."}`，字段可省略；`avatar: null` 恢复默认头像。昵称 1–12 字；头像仅 JPEG/PNG/WebP、≤ 100KB（客户端已缩放为 128×128）。

头像存于 `user_avatars` 表，昵称存于 `users.nickname`；后台可在账号列表点击昵称查看，并由最高权限者 / 管理员重置为默认（审计 `user.profile_reset`）。

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
用 nginx/Caddy 终止 HTTPS，反代到本机 uvicorn。SQLite 文件放持久化磁盘。**仅单实例**（data-ys 会话在内存）。
正式环境的真实路径（`/opt/ys-middleware`、服务 `ys-middleware`、端口 8020）与上线步骤见 DEPLOY.md。

### 测试
```bash
.venv/bin/python -m pytest -q
```
