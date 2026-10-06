# 部署手册 — lottery.jh8.ai

中间层后端 + 网页管理后台 + 官网落地页的生产部署。单实例（data-ys 会话与管理员会话都在进程/SQLite 内，不可多实例）。

> **正式环境的实际布局与本手册示例不同**（正式机是多个服务共用的机器，nginx 由宝塔面板管理，代码是拷贝而不是 git 仓库）。
> 下文第 1–8 节是从零部署的通用示例；在正式环境执行任何命令时按下表替换：
>
> | 本手册示例 | 正式环境（lottery.jh8.ai） |
> |---|---|
> | `/srv/ys/backend` | `/opt/ys-middleware/backend` |
> | `/etc/ys-backend.env` | `/etc/ys-middleware.env` |
> | `ys-backend`（systemd 服务） | `ys-middleware` |
> | `127.0.0.1:8000` | `127.0.0.1:8020` |
> | `git pull` 更新代码 | 本地 `backend/` 用 rsync 推送（见「上线：账号生命周期、代理号段、积分、头像昵称」） |
>
> 只动 `ys-middleware`，不要碰机器上的其他服务。

## 0. 前置条件

- 一台 Linux 服务器（本手册以 Debian/Ubuntu + systemd 为例），有公网域名 `lottery.jh8.ai` 指向它。
- **Python 3.10 或更高**（代码用了 `X | None` 注解，3.9 会在 import 时失败；推荐 3.12）。
- nginx（或 Caddy）终止 HTTPS。
- data-ys 的服务器账号（软件编号 + 密码），以及你自定义的一串高熵 `ADMIN_KEY`。

## 1. 取代码

```bash
sudo mkdir -p /srv/ys && sudo chown "$USER" /srv/ys
cd /srv/ys
git clone <你的仓库地址> .
git checkout main        # 分支已合并后用 main；或先 checkout feat/admin-web-console
```

## 2. 建虚拟环境、装依赖

```bash
cd /srv/ys/backend
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
mkdir -p data                      # SQLite 落盘目录
mkdir -p app/static/downloads      # 安装包目录（随仓库已带占位，确保存在即可）
```

## 3. 配置环境变量（不进仓库）

写一个只有 root 可读的 EnvironmentFile：

```bash
sudo tee /etc/ys-backend.env >/dev/null <<'EOF'
DATA_YS_CODE=你的data-ys软件编号
DATA_YS_PASSWORD=你的data-ys密码
ADMIN_KEY=用一串随机高熵字符串
DB_PATH=/srv/ys/backend/data/app.db
ADMIN_COOKIE_SECURE=true
# 可选：ADMIN_SESSION_TTL=86400  SESSION_TTL=604800  DATA_YS_TOKEN_TTL=3600  UPSTREAM_TIMEOUT=15
EOF
sudo chmod 600 /etc/ys-backend.env
```

> 生成 ADMIN_KEY：`python3 -c "import secrets;print(secrets.token_urlsafe(32))"`

## 4. 引导管理员账号

```bash
cd /srv/ys/backend
set -a; . /etc/ys-backend.env; set +a
.venv/bin/python manage.py admin-set admin '设一个强密码'
.venv/bin/python manage.py list        # 可选：看看用户表
```

（`admin-set` 幂等，重复执行即重置该管理员密码。终端用户用 `manage.py add <CODE> <密码> [--expires YYYY-MM-DD]` 创建，或登录后在网页后台里管理。）

指定唯一的最高权限者（**首次部署本版本时必做**；以后要更换最高权限者也用它，原最高权限者自动降为管理员）。
同样须在 backend 目录并载入环境变量文件（上面已执行）后运行，否则会操作另一个空数据库：
```bash
.venv/bin/python manage.py set-super admin
```

> `admin-set` 只能新建管理员或重置已有后台人员的密码；该用户名属于代理账号时会拒绝，
> 新建用户名与代理名称共用命名空间（不区分大小写）。

## 5. systemd 常驻 uvicorn

```bash
sudo tee /etc/systemd/system/ys-backend.service >/dev/null <<'EOF'
[Unit]
Description=YS middleware backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/ys/backend
EnvironmentFile=/etc/ys-backend.env
ExecStart=/srv/ys/backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=2
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
EOF

sudo chown -R www-data:www-data /srv/ys/backend/data /srv/ys/backend/app/static/downloads
sudo systemctl daemon-reload
sudo systemctl enable --now ys-backend
sudo systemctl status ys-backend --no-pager
```

> 多数据源采集运行在 uvicorn 进程内：保持上面的单进程 `ExecStart`，**不要**加 `--workers N`。
> 升级到含采集器的版本后，首次启动会自动建表并写入两个默认数据源，无需手工迁移。
> 部署后在后台「数据源」页确认两个源在 10 秒内变为「正常」。
> 先部署后端、再发客户端（反过来时客户端请求 /api/ds/sources 会被转发到上游）。

## 6. nginx 反代 + TLS

```nginx
server {
    listen 80;
    server_name lottery.jh8.ai;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name lottery.jh8.ai;

    # ssl_certificate / ssl_certificate_key 由 certbot 填入

    client_max_body_size 300m;             # 允许大安装包下载/上传场景

    # 大文件：安装包目录直接由 nginx 托管，不经 uvicorn
    location /download/ {
        alias /srv/ys/backend/app/static/downloads/;
    }

    # 其余（/、/admin/、/api/）全部转给 uvicorn
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;      # 登录限流按真实客户端 IP 计数（客户端无法伪造）
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

签证书并重载：

```bash
sudo certbot --nginx -d lottery.jh8.ai
sudo nginx -t && sudo systemctl reload nginx
```

> 注意：`ADMIN_COOKIE_SECURE=true` 要求 HTTPS，否则浏览器不会保存登录 cookie。务必先把证书装好。

## 7. 放安装包

把实际安装包按这两个文件名放进下载目录（文件名必须与落地页链接一致）：

```bash
sudo cp ys-win.exe  /srv/ys/backend/app/static/downloads/ys-win.exe
sudo cp ys-mac.dmg  /srv/ys/backend/app/static/downloads/ys-mac.dmg
sudo chown www-data:www-data /srv/ys/backend/app/static/downloads/*
```

## 8. 验证

```bash
curl -I https://lottery.jh8.ai/                      # 200，官网落地页
curl -I https://lottery.jh8.ai/download/ys-win.exe   # 200（放了安装包后）
curl -I https://lottery.jh8.ai/admin/                # 200，后台页面
# 登录拿 cookie：
curl -i -X POST https://lottery.jh8.ai/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"你的管理员密码"}'   # 200 且带 Set-Cookie: admin_session=...
```

浏览器访问 `https://lottery.jh8.ai/admin/` 登录，应能看到用户管理界面。

## 管理后台前端（Ant Design Pro）

后台是一个 Vite + React + antd Pro 组件的单页应用，源码在 `backend/admin-ui/`，
构建产物在 `backend/app/static/admin-dist/`（**已随仓库提交**）。后端的 `GET /admin/`
返回该目录的 `index.html`，哈希资源由 `/admin/assets` 挂载提供。

**服务器无需安装 Node**：直接用仓库里已构建好的产物。只有改动后台界面时才需要在
本地重新构建并提交：

```bash
cd backend/admin-ui
npm ci            # 首次用 npm install 生成 lock 后，后续用 npm ci
npm run build     # 产物输出到 ../app/static/admin-dist/
git add ../app/static/admin-dist admin-ui
git commit -m "chore(admin-ui): rebuild"
```

## 升级

```bash
cd /srv/ys && git pull
cd backend && .venv/bin/pip install -r requirements.txt
sudo systemctl restart ys-backend
```

### 从「无角色」旧版本升级到含代理与号段的版本

现有管理员全部迁移为普通管理员，必须指定最高权限者。**严格按此顺序**：

1. **备份数据库**（见「备份」一节），升级前务必先备份。
2. 部署新代码并安装依赖（上面的 `git pull` + `pip install`）。
3. `sudo systemctl restart ys-backend`：重启时自动执行数据库迁移。
4. 指定最高权限者（**必须在 backend 目录下、并载入服务的环境变量文件**，否则会读写另一个空的数据库）：
   ```bash
   cd /srv/ys/backend
   set -a; . /etc/ys-backend.env; set +a
   .venv/bin/python manage.py set-super <用户名>
   ```
5. 用该用户登录 `/admin/`，确认出现「管理员与授权」菜单。

在执行 `set-super` 之前没有最高权限者：管理员管理与授权类接口只能用 `X-Admin-Key` 调用
（`X-Admin-Key` 始终视为最高权限者，拥有全部权限）。

> **回滚警告**：见下文「回滚」一节。不要只回退代码而保留现库。

### 升级到含积分的版本

迁移后**所有账号与代理积分余额为 0**：已激活账号立即变为「已欠费」，登录与业务请求返回 10025。**严格按此顺序**：

1. **先发布新客户端**（含 10025 提示与低积分提醒）。旧客户端收到 10025 只显示通用的登录失败 / 退出提示。
2. **备份数据库**（见「备份」一节）。
3. 部署新代码并 `sudo systemctl restart ys-backend`：重启时自动迁移（只加列，不改动任何账号的激活 / 首登状态），
   每日扣减 Worker 随服务启动（每 60 秒一轮）。
4. **立即批量充值**需要继续使用的账号。少量账号用后台「用户管理」→ 多选 →「批量充值」；
   全部「已欠费、使用控制正常、未到期」的账号在服务器上用 `manage.py` 直接充值（不经 HTTP、不需要运维密钥，
   每 1000 个一批；`30` 为每个账号的分数）：
   ```bash
   cd /srv/ys/backend
   set -a; . /etc/ys-backend.env; set +a
   .venv/bin/python manage.py recharge-arrears 30 --dry-run    # 先看人数
   .venv/bin/python manage.py recharge-arrears 30
   ```
   每批一个事务、全有或全无；输出里的 `batch_id` 可在「积分流水」中按批次核对。只处理仍为 0 分的账号，中途失败可直接重跑。
5. 需要体验期时，在后台「体验期设置」开启（只影响此后首次激活的账号）。

> **回滚**：见下文「回滚」一节。

## 上线：账号生命周期、代理号段、积分、头像昵称（正式环境命令）

四部分一次上线。迁移只加表加列：老账号保留状态与到期时间，回填为已激活、已完成首登，**余额全部为 0**；
现有管理员全部变为普通管理员。以下命令均为正式环境的真实路径。

**上线前检查**

1. 新客户端已打包好，准备先发布（含首登弹窗、10025 提示、低积分提醒、头像昵称、隐藏上游购买入口）。旧客户端收到 10025 只会显示通用失败提示。
2. 确认宝塔里代理到 `127.0.0.1:8020` 的站点配置**覆盖**了客户端 IP 头：
   ```nginx
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   ```
   缺了 `X-Real-IP` 这一行，客户端可以自填 IP 绕过登录限流；两行都缺，所有人会共用一个计数，任何人失败 30 次就锁住全站登录。
3. 检查旧版本遗留的异常数据（应输出 `[]`；否则先在后台修正这些账号的状态或到期时间）：
   ```bash
   /opt/ys-middleware/backend/.venv/bin/python -c "import sqlite3; print(sqlite3.connect('/opt/ys-middleware/backend/data/app.db').execute(\"SELECT code, typeof(expires_at), status FROM users WHERE typeof(expires_at) NOT IN ('integer','null') OR status NOT IN ('active','disabled','banned')\").fetchall())"
   ```

**上线步骤**（严格按顺序）

1. 发布新客户端。
2. 备份代码与数据库（SQLite 在线备份，WAL 一并处理）：
   ```bash
   TS=$(date +%Y%m%d-%H%M%S); B=/opt/ys-middleware-backup-$TS; mkdir -p $B
   tar -C /opt/ys-middleware -czf $B/code.tgz --exclude='backend/.venv' --exclude='backend/data' backend
   /opt/ys-middleware/backend/.venv/bin/python -c "import sqlite3; s=sqlite3.connect('/opt/ys-middleware/backend/data/app.db'); d=sqlite3.connect('$B/app.db'); s.backup(d); d.close()"
   ```
3. 在本地 `backend/` 目录推送代码（不带 `--delete`，不覆盖数据库与安装包）：
   ```bash
   rsync -rc --exclude .venv --exclude __pycache__ --exclude data/ --exclude admin-ui/ \
     --exclude app/static/downloads/ --exclude .pytest_cache --exclude '*.db*' \
     ./ root@lottery.jh8.ai:/opt/ys-middleware/backend/
   ```
4. 重启，启动时自动迁移：`systemctl restart ys-middleware && systemctl status ys-middleware --no-pager`
   （从此刻到第 6 步完成前，老账号都会收到 10025，尽快执行后面两步。）
5. 指定最高权限者（必须在 backend 目录并载入环境变量文件，否则会操作另一个空数据库）：
   ```bash
   cd /opt/ys-middleware/backend
   set -a; . /etc/ys-middleware.env; set +a
   .venv/bin/python manage.py set-super <用户名>
   ```
6. 初始充值（同一终端，环境变量已载入）：
   ```bash
   .venv/bin/python manage.py recharge-arrears 30 --dry-run
   .venv/bin/python manage.py recharge-arrears 30
   ```
   当前处于「暂停」或已到期的老账号不会被充值；之后恢复使用时在后台单独充值。
7. 验证：`/admin/` 用最高权限者登录，看到「管理员与授权」「积分流水」菜单；用一个老账号登录客户端，
   首页左上角显示头像、昵称和积分；`journalctl -u ys-middleware -n 50 --no-pager` 无异常。
8. 需要体验期时，在后台「体验期设置」开启（只影响此后首次激活的账号）。

## 回滚

**回滚 = 代码与数据库一起恢复到升级前的备份**（上面第 2 步的 `code.tgz` 与 `app.db`）：
`systemctl stop ys-middleware` → 解压代码 → 用备份的 `app.db` 覆盖 `data/app.db` 并删掉旁边的 `app.db-wal`、`app.db-shm`
→ `systemctl start ys-middleware`。升级后新产生的数据（新激活、充值、流水）会随之丢失。

**不要只回退代码而保留现库。** 旧版本代码不认识本版新增的字段：
- 旧版不认识 `role`，会把代理账号当作完整管理员，代理获得全部后台权限。
- 旧版登录只校验密码、状态和到期时间：所有已分配但未激活的号段账号、被重置密码后未重新首登的账号，
  都能直接用公开的初始密码 `123456` 登录，并且不受积分限制。

确实只能回退代码、必须保留现库时，**先停服并另做一份现库备份**，在库上执行下面的语句后再启动旧代码：
```sql
UPDATE users SET status='disabled' WHERE first_activated_at IS NULL OR onboarded_at IS NULL;
UPDATE admins SET password_hash='!' WHERE role='agent';     -- 代理密码失效，旧版无法用它登录
DELETE FROM admin_sessions WHERE admin_id IN (SELECT id FROM admins WHERE role='agent');
```
之后重新升级时：代理需由后台重置密码才能登录；被停用的账号要逐个恢复（注意不要恢复未激活的号段账号）。

## 备份

备份 SQLite 文件即可（含用户与管理员）：`/srv/ys/backend/data/app.db`（WAL 模式，连 `-wal`/`-shm` 一起备份，或停服后再拷）。

## 注意事项

- **仅单实例**：data-ys 共享会话与管理员会话都在内存/本机 SQLite，不能起多副本或多机。
- 客户端 `apiURL` 已指向 `https://lottery.jh8.ai/api`（见仓库 `client/js/app.9ba1133b.js`）。
- 过期的管理员/用户会话目前不自动清理（靠访问时判过期），长期运行可用 cron 周期性清库，或后续加启动钩子。
