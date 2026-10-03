# 部署手册 — lottery.jh8.ai

中间层后端 + 网页管理后台 + 官网落地页的生产部署。单实例（data-ys 会话与管理员会话都在进程/SQLite 内，不可多实例）。

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

## 升级

```bash
cd /srv/ys && git pull
cd backend && .venv/bin/pip install -r requirements.txt
sudo systemctl restart ys-backend
```

## 备份

备份 SQLite 文件即可（含用户与管理员）：`/srv/ys/backend/data/app.db`（WAL 模式，连 `-wal`/`-shm` 一起备份，或停服后再拷）。

## 注意事项

- **仅单实例**：data-ys 共享会话与管理员会话都在内存/本机 SQLite，不能起多副本或多机。
- 客户端 `apiURL` 已指向 `https://lottery.jh8.ai/api`（见仓库 `client/js/app.9ba1133b.js`）。
- 过期的管理员/用户会话目前不自动清理（靠访问时判过期），长期运行可用 cron 周期性清库，或后续加启动钩子。
