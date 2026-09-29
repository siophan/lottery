# 设计：ys-mac 打成 macOS 桌面应用

日期：2026-09-29
状态：已通过设计评审，待 spec 复核

## 背景
`ys-mac` 目前有两部分：解包复用的 Vue 前端（`client/`，原为 Electron 构建）、
Python FastAPI 转发后端（`backend/`，把 `/api/*` 透明转发到 `soft-api.data-ys.com`）。
前端已能在浏览器里跑通登录页（为此把 Electron 私有协议 `app://./` 改成 `/`，
并注入 no-op 的 `window.electron` 垫片）。

现在要把它整合成一个可在 macOS 双击运行、可拷给少数人用的桌面 app。

## 决策（brainstorming 已拍板）
1. **后端形态**：把转发逻辑用 Node 重写，并入 Electron 主进程。单进程、无 Python 依赖。
2. **算号**：用本地 JS 引擎（`src/engine/pl3.js`）离线算，不联网。
3. **分发**：自己/少数人用，**不做 Apple 签名和公证**。
4. **算号范围**：接受当前残缺范围先打包——JS 引擎目前只覆盖排列三 7 个条件，
   其余彩种/条件显示"暂不支持"；算号扩充作为后续独立工作项。

## 目标与范围
- **本设计**：产出一个未签名的 macOS `.app`（并出 `.dmg` 便于拷贝），
  双击可运行，包含：完整 Electron 外壳、内嵌转发服务、真实 IPC、
  排列三已实现条件的离线算号。
- **非目标**：不做签名/公证；不做自动更新；不扩充 JS 算号引擎（沿用现有 7 条件）；
  不重写前端业务代码（仅配置级改动）；不打包 Python 后端。

## 架构：单进程 Electron 应用
纯 Electron，无 Python、无外部运行时依赖。三层：

- **main（主进程，Node）**：创建 `BrowserWindow`；启动内嵌 HTTP 服务
  （静态托管前端 + `/api/*` 转发上游）；注册全部 IPC handler。
- **preload**：用 `contextBridge` 暴露**真实**的 `window.electron.ipcRenderer`，
  取代浏览器阶段的 no-op 垫片。
- **renderer**：复用 `client/` 现有前端，除已有的 `apiURL`/`app://` 改动外零业务改动。

### 为什么内嵌 HTTP 服务，而不是 `loadFile`
前端 publicPath 已是 `/`、按 http origin 构建（登录页已在浏览器验证通过）。
主进程用 `loadURL('http://127.0.0.1:<固定端口>')` 加载，可零改动复用现有前端，
绕开 `file://` 下绝对路径解析和 CORS 的问题。前端从内嵌服务同源加载，
`/api/*` 也走同源，跨源问题消失。

## 目录结构
```
ys-mac/
  electron/
    main.js            # 入口：建窗口 + 启动内嵌服务 + 注册 IPC
    preload.js         # contextBridge 暴露 ipcRenderer
    server.js          # 内嵌 HTTP：静态前端 + /api 转发上游(含 token 打码日志)
    ipc/
      arithmetic.js    # arithmetic → JS 引擎(pl3) → showResult
      window.js        # close / minimize / getsub 窗口与子视图
      update.js        # checkForUpdate / runInstaller 占位(no-op)
  client/              # 现有前端(复用)
  src/engine/          # 现有 JS 算号引擎(pl3.js)，被 arithmetic.js 调用
  package.json         # electron + electron-builder 配置与脚本
  backend/             # 现有 Python 后端(保留作参考，不参与打包)
```

## 组件职责与接口

### electron/server.js —— 内嵌 HTTP 服务
- 输入：**固定本地端口**（默认 `46813`，一个冷门端口以避开常见占用）。
  端口不可动态递增——前端 `apiURL` 是编译进 `app.js` 的常量，端口一变就失配；
  因此端口固定，且必须与前端 `apiURL` 中的端口严格一致。若该端口被占，
  弹错误对话框（提示端口冲突）并退出。
- 职责一（静态）：`GET` 非 `/api` 路径 → 从 `client/` 目录读文件返回，
  正确设置 MIME（`.js` → `text/javascript`）。
- 职责二（转发）：`/api/*` → 转发到 `https://soft-api.data-ys.com/api/*`，
  透传 method、body、除 hop-by-hop 外的请求头（`host` 重写、`content-length`/
  `connection` 由底层重算），原样返回上游 status/body；剥离响应的
  `content-encoding`（Node http 客户端已解压，避免客户端二次解压——沿用 Python 版已修复的坑）。
- 日志：每条请求一行 `方法 路径 上游状态码 耗时ms`，`token` 请求头打码（前后各留几位）。
- 导出：`startServer({ port, upstream }) -> Promise<{ server, port }>`。

### electron/preload.js
- 用 `contextBridge.exposeInMainWorld('electron', { ipcRenderer: {...} })`
  暴露 `send(channel, arg)`、`on(channel, listener)`、`once`、
  `removeListener`、`removeAllListeners`、`invoke`。
- `send`/`on` 桥接到 Electron 的 `ipcRenderer`；仅放行白名单 channel
  （`arithmetic`/`getsub`/`close`/`minimize`/`checkForUpdate`/`runInstaller`/`showResult`）。

### electron/ipc/arithmetic.js
- 监听主进程 `ipcMain.on('arithmetic', (event, arg) => ...)`。
- `arg` 形如 `{ code, type, parameter: JSON.stringify(parameterStr) }`
  （具体字段在实现时对照前端调用点逐一确认）。
- 解析 `arg.parameter` → 映射到 `src/engine/pl3.js` 的 `filter(play)` 入参 →
  得到过滤结果。
- 成功：`event.reply('showResult', { result: 'success', ...结果字段 })`
  （结果字段结构对照前端 `showResult(arg)` 消费点确认）。
- 不支持的彩种/条件：`event.reply('showResult',
  { result: 'fail', message: '该玩法/条件暂未支持' })`。前端已有
  `if (arg.result !== 'success') return` 分支，不会崩。

### electron/ipc/window.js
- `close` → 关闭当前窗口；`minimize` → 最小化。
- `getsub` → 按 `arg`（含 `data`）打开子窗口/子视图展示内容；
  最小实现：新开一个 `BrowserWindow` 加载对应路由并把 `data` 传入
  （具体路由在实现时对照前端确认）。

### electron/ipc/update.js
- `checkForUpdate` / `runInstaller` → no-op（可选：向渲染进程回传"已是最新"）。

### electron/main.js
- app ready → `startServer()` 拿到端口 → 建 `BrowserWindow`
  （`webPreferences: { preload, contextIsolation: true, nodeIntegration: false }`）
  → `loadURL('http://127.0.0.1:<端口>')` → 注册所有 IPC handler。
- 窗口全关闭 → 退出（macOS 习惯可保留 dock，但自用从简：直接 quit）。

### 前端改动（client/）
- `apiURL` 改为指向内嵌服务的固定端口：`http://127.0.0.1:46813/api`
  （必须与 server.js 的固定端口一致；从上一阶段的 `http://127.0.0.1:8000/api` 改过来）。
- `app://./` → `/` 的改动已完成，保留。
- 浏览器阶段注入的 `electron-shim.js` 在 Electron 里由真实 preload 取代；
  保留 shim 引用无害（preload 先注入，shim 里 `if (window.electron...) return` 直接跳过）。

## 数据流
1. 启动：main 起内嵌 HTTP（拿到端口）→ 建窗口 → `loadURL` 到内嵌服务。
2. 登录/行情/用户数据/图表等 HTTP → 内嵌服务 `/api/*` → 转发上游 → 原样返回；token 打码日志。
3. 算号：前端 `send('arithmetic', arg)` → main 解析 → JS 引擎 → `showResult` 回传。
4. 窗口：`close`/`minimize` → 主进程真实控制。
5. 更新：`checkForUpdate`/`runInstaller` → no-op。

## 算号能力现状（已确认接受）
`src/engine/pl3.js` 目前仅实现排列三 7 个条件：和值、跨度、胆码、定位、
最小/中/最大数、各位差值、组选形态。因此本次 app：
- 排列三这些条件 → 可离线算号。
- 其他彩种 / 排列三其余条件 → 回传 `result:'fail'`，前端提示"暂不支持"。
扩充 JS 引擎是后续独立工作项（需先锁定"开出K"等聚合语义，可能需一次真程序参照）。

## 错误处理与可观测性
- 算号未实现：结构化 `{result:'fail', message}`，前端优雅提示，不崩。
- 上游超时/断网：转发层返回结构化 JSON 错误（含简短原因），设 15s 超时，不让前端悬挂。
- 端口冲突：固定端口(46813)被占 → 弹错误对话框(提示端口冲突)并退出（不递增，避免与前端 apiURL 失配）。
- 主进程未捕获异常：记录日志，不静默吞掉。

## 测试策略
- **JS 引擎**：现有 `src/engine/pl3.test.js`（16 项）继续跑，作回归。
- **转发层（Node 版）**：用 mock 上游（如 Node http mock 或注入的 fetch/undici mock）
  验证：method/header/body 透传、token 打码、上游 status/body 原样返回、
  `content-encoding` 剥离、上游报错降级。**不在测试中调用真实 `data-ys.com`**。
- **arithmetic handler**：给定 `arg` → 断言 `showResult` 回传结构（成功与 fail 两路）。
- **打包冒烟（手动）**：`electron-builder` 出 `.app` → 启动 → 验证登录页渲染 +
  一次排列三算号 → 通过。

## 分发
- `electron-builder`，`mac.target: [dmg, dir]`，`mac.identity: null`（不签名）。
- 图标：`client/favicon.ico` 转 `.icns`。
- 首次打开：右键 → 打开，绕过 Gatekeeper（README 写明步骤）。
- 产物：`dist/` 下的 `.app` 与 `.dmg`。

## 后续工作项（非本设计）
- 扩充 JS 算号引擎到更多条件/彩种（需锁定聚合语义）。
- 逐个把仍走上游转发的接口本地化。
- 若要公开分发：补 Apple 签名 + 公证。
- 自动更新（若需要）。
