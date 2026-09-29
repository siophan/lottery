# 赢晟 macOS 版 (ys-mac)

原 Windows Electron 应用的 macOS 打包版：纯 Electron，主进程内嵌一个本地 HTTP
服务（同源托管前端 + `/api` 转发上游 `soft-api.data-ys.com`），算号走本地 JS 引擎。

## 开发运行

```bash
npm install
npm start
```

应用会在 `http://127.0.0.1:46813` 起本地服务，窗口加载该地址。

## 测试

```bash
npm test          # 内嵌服务 + 算号核心 (node:test)
npm run test:engine  # 排列三过滤引擎 (16 项)
```

## 打包

```bash
npm run dist
```

产物在 `dist/`：未签名的 `.app` 与 `.dmg`。首次打开：右键 → 打开，绕过 Gatekeeper。

## 架构

- `electron/server.js` —— 内嵌 HTTP：静态托管 `client/` + `/api/*` 透明转发上游，token 打码日志、502 降级。
- `electron/preload.js` —— contextBridge 暴露白名单 `ipcRenderer`。
- `electron/main.js` —— 启动服务 + 建窗口 + 注册 IPC。
- `electron/ipc/` —— `arithmetic`（→ 本地 pl3 引擎）、`window`（close/minimize）、`update`（占位）。
- `src/engine/pl3.js` —— 排列三过滤引擎（被 arithmetic 调用）。

## 已知范围

- 算号目前仅支持排列三、且条件按引擎字段给出的情形；其他玩法显示"暂不支持"。
- 窗口最小化/关闭已实现；`getsub` 子窗口、自动更新为占位。
- 未做 Apple 签名/公证（自用）。
- 现有 Python `backend/` 保留作参考，不参与打包（其转发逻辑已翻译进 `electron/server.js`）。
