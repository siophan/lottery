# 设计：本地 client + backend（转发优先）

日期：2026-09-29
状态：已通过设计评审，待 spec 复核

## 背景
原软件 `ys-data-fw`（Windows Electron 应用，窗口名"赢晟"）是彩票选号/过滤工具。
现有资产：解包出的 Vue 前端（`app.asar`）、Windows 原生算号引擎 `arithmetic.node`（无源码，
不能跨平台）、线上后端 `soft-api.data-ys.com`（117 个可用接口）。已用 JS 重写排列三算号引擎
（`src/engine/pl3.js`，7 个条件、16 测试通过）。

本项目目标：在 macOS 上本地搭 client + backend，先跑通，再逐步本地化。

## 目标与范围
- **Phase 1（本设计）**：backend 做**透明转发**——客户端 `/api/*` 请求打到本地 FastAPI，
  原样转发给 `soft-api.data-ys.com/api`，让整个 app 在本地跑起来。
- **后续（非本设计）**：把单个接口的转发**逐个替换成本地实现**，第一个目标是算号
  `serviceAi` → 接 JS 引擎。竞彩、订单、视频等模块增量补。
- **非目标**：不重写客户端（复用现有前端，仅改配置）；不实现那 26 个指向内网/localhost 的
  死接口；不做 Mac 正式打包（后续单独立项）。

## 目录结构
```
ys-mac/
  backend/
    app/main.py          # FastAPI 入口：CORS + 请求日志 + catch-all 转发
    app/upstream.py      # 上游地址常量、httpx 客户端、header 透传/打码
    app/routes/          # 未来本地覆写路由(如 serviceAi.py)，phase 1 为空
    requirements.txt
    README.md
  client/                # 解包出的前端，apiURL 改指本地
  src/engine/            # 已有 JS 算号引擎，未来供本地 serviceAi 使用
  tests/                 # 转发机制测试(mock 上游)
```

## 架构与数据流
1. 客户端 → `http://127.0.0.1:8000/api/*`
2. FastAPI 路由顺序：**本地覆写路由优先**（phase 1 无）→ **catch-all `/{path:path}`**
   转发到 `https://soft-api.data-ys.com/api/{path}`。
3. 转发保真：透传 HTTP method、请求 body，以及**除 hop-by-hop 外的全部请求头**
   （`host` 重写为上游、去掉 `content-length`/`connection` 由 httpx 重算），
   确保 `token`、`fromId`、`content-type`、`user-agent` 等不丢失；上游响应的
   status code、body 与相关响应头原样返回。
4. HTTP 客户端用 `httpx`（异步）。上游 HTTPS，默认校验证书；提供 `UPSTREAM_VERIFY_TLS`
   开关（默认 True）以备上游证书异常时临时关闭。
5. 端口、上游地址通过环境变量可配（默认 `PORT=8000`,
   `UPSTREAM=https://soft-api.data-ys.com/api`）。

## 凭证与安全边界
- 转发层**不登录、不代替认证、不主动调用线上服务器**。token 由用户在客户端正常登录时产生，
  代理仅原样中继请求字节。
- 日志对 `token` 请求头做打码（只留前后几位），不落盘明文凭证。
- 已知历史问题（不在本设计处理，仅记录）：原前端硬编码了 DeepSeek API Key、"记住密码"
  明文存 localStorage、更新机制关闭 TLS 校验且不校验签名。后续本地化时一并整改。

## 客户端改动
- 仅修改配置模块中的 `apiURL`：`https://soft-api.data-ys.com/api` → `http://127.0.0.1:8000/api`。
  其余配置与代码不动。
- 开发期客户端先用浏览器或 Electron 运行；因是本地 http 跨源，backend 开启针对
  `127.0.0.1`/`localhost` 的 CORS。

## 错误处理与可观测性
- 上游超时/连接错误 → 返回结构化 JSON 错误（含简短原因），不让客户端悬挂；设置合理超时（如 15s）。
- 每条请求打印一行：`方法 路径 上游状态码 耗时ms`（token 打码）。这是选择代码代理而非
  nginx 的主要价值——能看清客户端实际在调哪些接口，为后续本地化排优先级。

## 测试策略
- 用本地 mock 上游（一个最小 HTTP 服务或 httpx 的 mock transport）验证：
  method/header/body 是否正确透传、token 是否打码、上游 status/body 是否原样返回、
  上游报错时的降级响应。
- **不在测试或开发中调用真实 `data-ys.com`**。真实联调由用户在客户端登录后自行进行。

## 后续本地化的已知决策点（非本设计）
- 算号引擎是 JS，backend 是 Python：本地化 `serviceAi` 时需决定"把引擎移植成 Python"
  还是"FastAPI 以子进程/内部服务调用 JS 引擎"。
- 本地化需要开奖历史数据源（`Opennumber`），来源待定。
- 排列三仍有 18 个 B 类条件待一次真程序参照锁定（尤其"开出K"聚合语义）。
