# 账号生命周期 + 首次登录强制改密 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 账号分「激活状态 / 使用控制」两维；后台激活预置初始密码 123456；未完成首登的账号登录后只拿到临时票据，客户端弹出不可跳过的「改密+绑定手机号（短信验证）」弹窗，成功后回登录页用新密码重登；全部后台操作写审计日志（保留三年）。

**Architecture:** FastAPI + SQLite 后端（`backend/app`）新增 users 列与 4 张表、短信模块、首登接口、后台激活/状态/重置接口与审计；React 管理后台（`backend/admin-ui`）改账号表并新增日志页；Electron 客户端新增纯 DOM 弹窗脚本 `client/account-onboard.js`，并给编译后的登录页 chunk 加一层补丁把 10030 响应接到弹窗。

**Tech Stack:** Python 3.12 / FastAPI 0.111 / httpx 0.27 / pytest；React + Ant Design Pro + Vite；Electron 33 + 编译后 Vue 2 产物 + `node --test`。

**Spec:** `docs/superpowers/specs/2026-10-06-account-lifecycle-first-login-design.md`（所有文案、错误码、阈值以 spec 为准，逐字使用）。

## Global Constraints

- 错误码：`1` 通用失败；`10022` 暂停/到期；`10023` 未激活；`10024` 封禁；`10030` 需首登（data.onboardToken）；`10031` 首登票据失效。
- 初始密码固定 `123456`；新密码 8–20 位、必须同时含字母和数字、不能等于 `123456` 或旧密码。
- 手机号正则 `^1[3-9]\d{9}$`；脱敏格式 `138****1234`（前 3 + `****` + 后 4）。
- 验证码 6 位数字、5 分钟有效、同号 60 秒冷却、同号 24 小时 ≤10 条、5 次错误作废；只存 `sha256(salt+code)`。
- 首登票据 15 分钟有效。审计日志保留 3×365 天。
- `status` 取值：`active` 正常 / `disabled` 暂停 / `banned` 封禁。
- 后端测试：`cd backend && .venv/bin/python -m pytest -q`（无 venv 时 `python3 -m pytest -q`）。客户端测试：仓库根 `npm test`。
- 代码注释用中文、风格与周边一致；commit message 英文，结尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不得修改 `backend/data/`、`app/static/downloads/`；不部署、不推送。

---

### Task 1: 数据层（迁移、账号状态、票据、验证码、审计）

**Files:**
- Modify: `backend/app/db.py`
- Test: `backend/tests/test_db_accounts.py`（新建）

**Interfaces（Produces）：**
- `User` dataclass 追加字段：`first_activated_at: int|None, activated_at: int|None, phone: str|None, onboarded_at: int|None`（追加在末尾，`_row_to_user` 同步）。
- `create_user(conn, code, password, expires_at, *, pending=False) -> User`：默认行为不变（已激活 + 已首登，时间=now）；`pending=True` 时三列为 NULL，密码哈希为随机不可猜值（`new_token()`）。
- `activate_user(conn, code, now) -> str`：返回 `"ok" | "not_found" | "already"`；ok 时密码=123456、`first_activated_at=activated_at=now`、`status='active'`、`onboarded_at=NULL`。
- `reset_user_password(conn, code) -> str`：`"ok" | "not_found" | "pending"`；密码=123456、`onboarded_at=NULL`、删除会话。
- `complete_onboarding(conn, user_id, new_password, phone, now) -> None`：单事务更新密码/phone/onboarded_at，删除该用户全部会话与 onboard 票据。
- `delete_user_sessions(conn, user_id) -> None`
- `create_onboard_ticket(conn, user_id, ttl) -> str`；`get_onboard_ticket_user(conn, token, now) -> User|None`（过期返回 None）。
- `save_sms_code(conn, phone, purpose, code, ttl, now) -> None`（覆盖旧码，同时追加 `sms_send_log`）；`delete_sms_code(conn, phone, purpose)`；`last_sms_sent_at(conn, phone, purpose) -> int|None`；`count_sms_sent_since(conn, phone, since) -> int`；`check_sms_code(conn, phone, purpose, code, now, max_attempts=5) -> str` 返回 `"ok"|"missing"|"expired"|"wrong"|"too_many"`（ok 时删码；wrong 时 attempts+1，达到上限时删码并返回 `"too_many"`）。
- `add_audit(conn, actor_type, actor, action, target, detail: dict, now=None) -> None`；`list_audit(conn, limit, offset, target=None) -> (rows: list[dict], total: int)`；`purge_old_audit_logs(conn, now) -> int`。
- `mask_phone(phone) -> str|None`。
- `init_db` 内迁移：用 `PRAGMA table_info(users)` 判断缺列才 `ALTER TABLE ADD COLUMN`，并对**本次新加列时已存在的行**回填 `first_activated_at=activated_at=onboarded_at=created_at`；建 spec 第2节 4 张新表。
- 常量 `INITIAL_PASSWORD = "123456"`、`AUDIT_RETENTION_SEC = 3*365*86400`。

- [ ] **Step 1:** 写失败测试覆盖：旧 schema（手工建只有原 7 列的 users 并插入一行）→ `init_db` 后新列存在且旧行被回填；二次 `init_db` 不报错不重复回填（把某行 onboarded_at 置 NULL 后再 init，仍为 NULL）；`create_user` 默认与 `pending=True` 两种状态；`activate_user` 三种返回、激活后 123456 可验证；`reset_user_password` 三种返回且清会话；票据过期；验证码 ok/missing/expired/wrong/too_many（第 5 次错误返回 too_many 且码被删）、覆盖旧码；`count_sms_sent_since`；`complete_onboarding` 后旧会话和票据消失；审计增查（倒序、按 target 过滤、total）与清理边界；`mask_phone("13812341234") == "138****1234"`、`mask_phone(None) is None`。
- [ ] **Step 2:** 运行确认失败。
- [ ] **Step 3:** 实现。
- [ ] **Step 4:** 运行全部后端测试通过（现有测试必须仍全绿）。
- [ ] **Step 5:** Commit `feat(backend): account activation state, onboarding tickets, sms codes and audit log tables`。

### Task 2: 短信模块与配置

**Files:**
- Create: `backend/app/sms.py`
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_sms.py`（新建），`backend/tests/test_config.py`（追加）

**Interfaces（Produces）：**
- `class SmsError(Exception)`
- `class LogSmsSender: async def send_code(self, phone: str, code: str) -> None`（`print(f"[sms] {phone} code={code}")`）
- `class AliyunSmsSender(client: httpx.AsyncClient, access_key_id, access_key_secret, sign_name, template_code, endpoint="https://dysmsapi.aliyuncs.com/")`：`async send_code` 发 GET，参数：`AccessKeyId, Action=SendSms, Format=JSON, PhoneNumbers, RegionId=cn-hangzhou, SignName, SignatureMethod=HMAC-SHA1, SignatureNonce, SignatureVersion=1.0, TemplateCode, TemplateParam={"code":"…"}, Timestamp(UTC ISO8601 Z), Version=2017-05-25`，`Signature` 按阿里云 RPC V1 规则（参数排序→特殊 URL 编码 `+`→`%20`、`*`→`%2A`、`%7E`→`~` → `GET&%2F&` + 编码后的规范串 → HMAC-SHA1(secret+"&") → base64）。响应 `Code != "OK"` 或 HTTP 非 200 或网络异常 → `SmsError`。
- 纯函数 `aliyun_signature(params: dict, secret: str) -> str` 单独导出便于测试。
- `build_sms_sender(settings, client) -> sender`：`sms_provider == "aliyun"` 且四项配置齐全 → Aliyun；否则 Log（aliyun 配置不全时打印告警）。
- `Settings` 新增：`sms_provider: str = "log"`、`sms_aliyun_access_key_id/secret/sign_name/template_code: str = ""`；`load_settings` 读 `SMS_PROVIDER`、`SMS_ALIYUN_ACCESS_KEY_ID`、`SMS_ALIYUN_ACCESS_KEY_SECRET`、`SMS_ALIYUN_SIGN_NAME`、`SMS_ALIYUN_TEMPLATE_CODE`。

- [ ] **Step 1:** 失败测试：`aliyun_signature` 用阿里云官方文档示例（AccessKeySecret `testsecret`，参数 `AccessKeyId=testid, Action=SendSms, Format=XML, OutId=123, PhoneNumbers=15300000001, RegionId=cn-hangzhou, SignName=阿里云短信测试专用, SignatureMethod=HMAC-SHA1, SignatureNonce=45e25e9b-0a6f-4070-8c85-2956eda1b466, SignatureVersion=1.0, TemplateCode=SMS_71390007, TemplateParam={"customer":"test"}, Timestamp=2017-07-12T02:42:19Z, Version=2017-05-25`）期望 `zJDF+Lrzhj/ThnlvIToysFRq6t4=`（若不符，先核对规范串构造；仍不符则报告 DONE_WITH_CONCERNS，不得改期望值凑数）；MockTransport 断言请求参数齐全且 `Signature` 存在、`Code=OK` 成功、`Code=isv.BUSINESS_LIMIT_CONTROL` 抛 `SmsError`、HTTP 500 抛、连接异常抛；`build_sms_sender` 三种分支；config 读取新 env。
- [ ] **Step 2–4:** 跑失败 → 实现 → 全部后端测试通过。
- [ ] **Step 5:** Commit `feat(backend): pluggable sms sender with aliyun provider`。

### Task 3: 登录分支、gate 拦截、首登接口

**Files:**
- Modify: `backend/app/routes/auth.py`, `backend/app/gate.py`, `backend/app/main.py`（`app.state.sms = sms or build_sms_sender(settings, app.state.client)`，`create_app` 增加可选参数 `sms=None`）
- Test: `backend/tests/test_auth_login.py`（追加）、`backend/tests/test_onboard.py`（新建）、`backend/tests/test_gate_proxy.py`（如受影响则更新）

**Interfaces（Consumes）:** Task 1 全部 db 函数；Task 2 `SmsError`、`build_sms_sender`。
**Produces:** `POST /api/auth/login`（spec 第3节）、`POST /api/auth/onboard/sms`、`POST /api/auth/onboard`（spec 第4节，文案逐字）；纯函数 `password_problem(old, new, confirm) -> str|None`（返回 spec 4.2 第 3–6 条的文案）放在 `app/routes/auth.py` 或 `app/accounts.py`。

- [ ] **Step 1:** 失败测试：
  - login：待激活→10023；banned→10024（即使已过期也 10024）；disabled/到期→10022；未首登→10030 且 `data.onboardToken` 可在库里查到、未建 session、未调用上游；已首登→0。
  - gate：用已存在 session 的账号被改为 banned→10024；disabled→10022；`onboarded_at` 置 NULL→10022。
  - onboard/sms：坏票据→10031；过期票据→10031；坏手机号→1「手机号格式错误」；成功→0 且 fake sender 收到 6 位数字码；60 秒内再发→冷却文案；24 小时内第 11 次→上限文案（可直接往 `sms_send_log` 插 10 行并把冷却绕开）；sender 抛 `SmsError`→「验证码发送失败，请稍后再试」且库内无码。
  - onboard：按 spec 4.2 每条失败分支一个用例（文案逐字断言）；成功→0 且文案逐字、旧密码失效、新密码可登录且返回 code 0、phone 写入、`onboarded_at` 非空、票据与旧会话被删、审计里有 `user.onboard` 且 detail 为脱敏手机号；成功后同一票据再提交→10031。
  - 测试里用 `FakeSms`（记录调用，可配置抛错），通过 `create_app(..., sms=FakeSms())` 注入；时间相关用 monkeypatch `time.time`。
- [ ] **Step 2–4:** 跑失败 → 实现 → 全部后端测试通过。
- [ ] **Step 5:** Commit `feat(backend): gate login on activation/ban and add first-login onboarding endpoints`。

### Task 4: 管理后台接口与审计清理

**Files:**
- Modify: `backend/app/routes/admin.py`, `backend/app/admin_auth.py`（如需取当前管理员用户名；ADMIN_KEY 方式的操作者记为 `"admin-key"`），`backend/app/main.py`（lifespan 中启动每日 `purge_old_audit_logs` 任务，启动时先跑一次；stop 时取消）
- Test: `backend/tests/test_admin.py`（更新/追加），`backend/tests/test_admin_audit.py`（新建）

**Produces（spec 第7节）:** `POST /admin/users`（只建待激活；忽略 password）、`POST /admin/users/{code}/activate`（404/409「账号已激活」）、`PATCH /admin/users/{code}`（status 白名单，非法 400；不再接受 password，传了也忽略；暂停/封禁删会话）、`POST /admin/users/{code}/reset-password`（404 / 409「账号未激活」）、`DELETE`（审计）、`GET /admin/users` 新字段、`GET /admin/audit-logs?limit=50&offset=0&target=` → `{"logs":[{id,actor_type,actor,action,target,detail,created_at}], "total": n}`（limit 上限 200）。每个写操作写审计，`detail` 记录前后值（status: `{"from":"active","to":"banned"}`）。

- [ ] **Step 1:** 失败测试：上述每个端点的成功/失败分支 + 鉴权（未登录 403）+ 审计记录内容 + list 字段（phone 脱敏）+ purge 任务函数可被调用（直接测 db 层已在 Task 1，这里测 lifespan 启动不报错即可）。现有依赖 `password` 创建/修改的测试按新语义更新。
- [ ] **Step 2–4:** 跑失败 → 实现 → 全部后端测试通过。
- [ ] **Step 5:** Commit `feat(backend): admin activation, status control, password reset and audit log api`。

### Task 5: 管理后台前端

**Files:**
- Modify: `backend/admin-ui/src/api.ts`, `backend/admin-ui/src/pages/UsersTable.tsx`, `backend/admin-ui/src/MainLayout.tsx`（或路由所在文件）
- Create: `backend/admin-ui/src/pages/AuditLogs.tsx`
- Rebuild: `backend/app/static/admin-dist`（`cd backend/admin-ui && npm run build`，确认产物输出目录与现有一致）

**Produces（spec 第7节前端部分）:** 账号表新列（激活状态、使用控制 正常/暂停/封禁、手机号、首登 已完成/未完成）；操作：激活（待激活时显示，Popconfirm「激活后初始密码为 123456」）、暂停/恢复、封禁/解封（Popconfirm）、重置为初始密码（Popconfirm）、改到期、删除；新建表单去掉密码，说明「新建账号为待激活状态」；「操作日志」菜单页，ProTable 显示时间、操作者、动作（中文映射：user.create 新建账号 / user.activate 激活 / user.status 状态变更 / user.reset_password 重置密码 / user.delete 删除 / user.onboard 首登改密绑定）、对象、详情（JSON 文本）。

- [ ] **Step 1:** 实现；`npx tsc --noEmit`（或项目已有的 lint/typecheck 脚本）通过。
- [ ] **Step 2:** `npm run build` 成功，产物更新到 `backend/app/static/admin-dist`。
- [ ] **Step 3:** 后端测试仍全绿（`test_site.py` 等依赖 admin-dist 的测试）。
- [ ] **Step 4:** Commit `feat(admin-ui): account activation controls and audit log page`。

### Task 6: 客户端首登弹窗脚本

**Files:**
- Create: `client/account-onboard.js`
- Modify: `client/index.html`（在 `<script src=app://./ds-sources.js></script>` 之后插入 `<script src=app://./account-onboard.js></script>`）
- Test: `electron/account-onboard.test.js`（新建）

**Interfaces（Produces）：**
- UMD：浏览器 `window.dsOnboard = api`；Node `module.exports = api`。
- `api.isMobile(s) -> bool`；`api.passwordProblem(oldPw, newPw, confirmPw) -> string|null`（与后端 spec 4.2 第 3–6 条同文案同顺序）；`api.validate(form) -> string|null`（form: `{oldPassword,newPassword,confirmPassword,phone,smsCode}`；依次：旧密码为空「请输入旧密码」→ passwordProblem → 手机号「手机号格式错误」→ 验证码非 6 位数字「请输入6位短信验证码」）。
- `api.open({ apiURL, onboardToken, onDone(msg), onExit() , doc = document, fetchImpl = fetch })`：构建弹窗 DOM（spec 第6节），POST JSON 到 `${apiURL}/auth/onboard/sms` 与 `${apiURL}/auth/onboard`；`code==0` 时移除弹窗并 `onDone(res.msg)`；`code==10031` 时移除弹窗并 `onDone` 不调用而调用 `onExpired(msg)`（参数可选，缺省时 `alert`）；其他错误显示在弹窗红字区。获取验证码前先校验手机号；成功后按钮 60 秒倒计时禁用。阻止 Esc（keydown 捕获阶段 `preventDefault`），遮罩全屏 `position:fixed; inset:0; z-index:2147483000`。一次只允许一个弹窗（重复 open 先移除旧的）。
- 样式内联，配色与登录页协调（白底卡片、主色 `#c0392b` 深红按钮——与客户端窗口栏深红一致）。

- [ ] **Step 1:** 失败测试（`node --test`）：`isMobile`、`passwordProblem` 各分支文案、`validate` 顺序；用最小假 DOM 或 `jsdom`（若仓库未装则写一个够用的极简 fake document：createElement/appendChild/addEventListener/querySelector 按 data-role 查找）驱动 `open`：提交成功调用 onDone 且弹窗被移除；后端返回 code 1 时错误文本显示且弹窗仍在；10031 调用 onExpired；发码成功后按钮禁用。优先不引入新依赖。
- [ ] **Step 2–4:** 跑失败 → 实现 → `npm test` 全绿。
- [ ] **Step 5:** Commit `feat(client): first-login password change and phone binding dialog`。

### Task 7: 登录页 chunk 补丁层

**Files:**
- Modify: `scripts/patch-ds-client.js`（新增 `ONBOARD_MARK = '/* ds-patch onboard v1 */'`、`LOGIN_CHUNK = 'chunk-4dffb567.9e3cf4c5.js'`、`LOGIN_LAYERS`、`patchLogin(raw)`，locator 用 `'jizhumimaClick() {'`；CLI 段对 LOGIN_CHUNK 同样 patch/skip；导出新符号）
- Modify (generated): `client/js/chunk-4dffb567.9e3cf4c5.js`（运行 `node scripts/patch-ds-client.js`）
- Test: `electron/ds-client-patch.test.js`（追加）

**Replacements（在 eval 字符串编码下，锚点命中次数精确）:**
1. 登录失败分支：把 `login()` 里 `this.$router.push("/index");\n            } else {\n              this.$message({` 替换为在 `} else if (res.code == 10030 && window.dsOnboard) { ... } else {` ——新分支内容：
   ```js
   } else if (res.code == 10030 && window.dsOnboard) {
     /* ds-patch onboard v1 */
     window.dsOnboard.open({
       apiURL: config_default.a.apiURL,
       onboardToken: res.data.onboardToken,
       onDone: msg => {
         this.loginForm.password = "";
         if (this.jizhumima) localStorage.removeItem("jizhuPassword");
         this.$message({ message: msg, type: 'success', duration: 3000 });
       },
       onExpired: msg => {
         this.loginForm.password = "";
         this.$message({ message: msg, type: 'error', duration: 3000 });
       },
       onExit: () => ipcRenderer.send("close")
     });
   ```
   （实现者先在解码后的模块源里确认 `config_default` 与 `ipcRenderer` 标识符在该作用域可用，确认锚点 count。）
2. 密码规则：`max: 12,\n          message: "请输入6-12位密码"` → `max: 20,\n          message: "请输入6-20位密码"`（count 以实际为准，必须精确）。

- [ ] **Step 1:** 失败测试：`patchLogin` 后标记存在；二次 patch 原样返回；用现有 `loadComponent` 夹具加载补丁后的登录模块（提供 `window.dsOnboard` 假实现、`user.h` login 假实现返回 `{code:10030,data:{onboardToken:'T'}}`、config `apiURL`），调用 `login()`（`$refs.loginForm.validate` 假实现回调 true，`checked=true`）后断言 `open` 被调用且 `apiURL/onboardToken` 正确，调用 `onDone('X')` 后密码清空、`$message` 收到 success；返回 code 0 时行为不变（路由跳 `/index`）；规则 max 为 20。
- [ ] **Step 2–4:** 跑失败 → 实现 → 运行 `node scripts/patch-ds-client.js` 写盘 → `npm test` 全绿 → 再运行一次脚本应全部 skip。
- [ ] **Step 5:** Commit `feat(client): route first-login response on the login page to the onboarding dialog`。

### Task 7 补充（控制者在实现前追加）

3. app chunk 新增补丁层 `kick v1`（`APP_LAYERS` 中 locator 同 AUTH 层）：响应拦截器把 `10024`（封禁）也纳入踢下线分支，提示文案「账号已封禁！」。原因：gate 对使用中被封禁的账号返回 10024，原拦截器只处理 10020/10021/10022，客户端不会退出。同时修正该分支回调里 `userInfo` 为空时 `userInfo.username` 抛错（用 `userInfo && userInfo.username`）。
