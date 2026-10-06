# 子项目 A：账号生命周期 + 首次登录强制改密/绑定手机号 设计

来源：第017章《账号积分与代理后台管理（正式版）》第1、4、8节（C-17-01/03/16）+ 需求《新账号首次登录强制修改初始密码（更新密码复杂度规则）》。
第017章整体拆为 A（本篇）→ B 后台角色与代理 → C 积分 → D 客户端用户信息区，按序实施。

> 用户不在场时按文档自行决策；凡文档未写明、由本设计拍板的点，在文末「待确认决策」集中列出，回来后逐条确认。

## 1 范围

做：
- 账号「激活状态」与「使用控制」两个独立维度；未激活禁止登录；封禁/暂停禁止登录与业务使用。
- 后台激活账号：自动预置初始密码 `123456`；管理员看不到明文密码。
- 首次登录（未完成改密+绑手机）不发正式会话，客户端弹出不可跳过的弹窗；提交成功后回登录页用新密码重登。
- 短信验证码（可插拔服务商：阿里云 / 日志桩）。
- 操作审计日志表（后续子项目共用），保留三年；后台只读查看页。

不做（属后续子项目）：代理/角色/号段（B）、积分与体验期（C）、头像昵称余额（D）、找回密码（接口留到需要时，手机号已为其准备）、通知渠道（先仅记日志）。

## 2 数据模型（SQLite，`init_db` 内幂等迁移）

`users` 新增列（`ALTER TABLE ... ADD COLUMN`，列不存在才加）：

| 列 | 类型 | 含义 |
|---|---|---|
| `first_activated_at` | INTEGER NULL | 首次激活时间；NULL = 待激活 |
| `activated_at` | INTEGER NULL | 当前有效激活时间（C 的扣分周期基准，A 中与首次激活相同） |
| `phone` | TEXT NULL | 绑定的实名手机号（明文存储，接口与日志一律脱敏） |
| `onboarded_at` | INTEGER NULL | 完成「首次改密+绑定手机号」的时间；NULL = 未完成 |

使用控制沿用现有 `status` 列：`active`=正常、`disabled`=暂停、`banned`=封禁（新增取值）。到期 `expires_at` 保留原语义（C 上线后再评估是否被积分取代）。

**存量账号迁移**：新增列时把已有行的 `first_activated_at = activated_at = onboarded_at = created_at`，即视为已激活且已完成首登流程，不打扰现有用户（见待确认 #1）。

新表：

```sql
CREATE TABLE IF NOT EXISTS onboard_tickets(   -- 首登临时票据，只能用于改密/发短信
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sms_codes(         -- 每个 (phone,purpose,user_id) 只保留最新一条；码只能由取码账号使用
  phone TEXT NOT NULL, purpose TEXT NOT NULL, user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL, salt TEXT NOT NULL,
  expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL, PRIMARY KEY(phone, purpose, user_id));
CREATE TABLE IF NOT EXISTS sms_send_log(      -- 频控用：每手机号每日上限
  phone TEXT NOT NULL, sent_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,   -- admin | user | system
  actor TEXT NOT NULL,        -- 管理员用户名 / 账号编号
  action TEXT NOT NULL,       -- user.create / user.activate / user.status / user.reset_password / user.delete / user.onboard
  target TEXT,                -- 被操作账号编号
  detail_json TEXT NOT NULL DEFAULT '{}',  -- 变更前后值；手机号只存脱敏值
  created_at INTEGER NOT NULL);
```

审计日志保留三年：`purge_old_audit_logs(conn, now)` 删除 `created_at < now - 3*365*86400` 的行，应用启动时执行一次，并由已有 collector 循环外的轻量定时任务每日执行（实现上挂在 lifespan 启动的 asyncio 任务）。

## 3 登录状态判定（`POST /api/auth/login`）

按顺序：
1. 账号不存在 / 密码错 → `{"code":1,"msg":"账号或密码错误"}`（不变）。
   （待激活账号的密码在建号时即为 `123456`，见第7节。）
2. 待激活（`first_activated_at IS NULL`）→ `{"code":10023,"msg":"账号未激活，请联系有激活权限的人员激活"}`（C-17-01）。
3. 封禁 → `{"code":10024,"msg":"账号已封禁，无法登录"}`（封禁优先于其他状态）。
4. 暂停或已到期 → `{"code":10022,"msg":"账号已停用或已到期"}`（不变）。
5. 未完成首登（`onboarded_at IS NULL`）→ 不建会话，签发 15 分钟 `onboard_ticket`：
   `{"code":10030,"msg":"首次登录请修改密码并绑定手机号","data":{"onboardToken":"..."}}`。
6. 其余 → 原逻辑（取上游 userInfo、建会话）。

`gate.authorize` 同步：会话对应账号若待激活/封禁/暂停/未完成首登，一律视为无效（封禁返回 10024，其余 10022），防止旧会话绕过。

## 4 首登接口（`/api/auth/onboard/*`，免会话，凭 onboardToken）

`gate.PREAUTH_PATHS` 无需改动：auth 路由在 catch-all 之前注册。

### 4.1 `POST /api/auth/onboard/sms`  `{onboardToken, phone}`
- 票据无效/过期 → `{"code":10031,"msg":"操作已超时，请重新登录"}`。
- 手机号不匹配 `^1[3-9]\d{9}$` → `{"code":1,"msg":"手机号格式错误"}`。
- 账号已绑定手机号（管理员重置密码后重新首登）且提交的号码与之不同 → `{"code":1,"msg":"请使用已绑定的手机号（尾号XXXX）验证"}`（XXXX 为已绑定号码后 4 位），不发码。
- 同号 60 秒内重复 → `{"code":1,"msg":"验证码发送过于频繁，请稍后再试"}`；同号 24 小时内 ≥10 条 → `{"code":1,"msg":"今日验证码发送次数已达上限"}`。
- 生成 6 位数字码，存 `sha256(salt+code)`，有效期 5 分钟，覆盖该账号对该号码的旧码（码与账号绑定：A 账号取的码 B 账号不能用，B 取码也不覆盖 A 的码；同号冷却/日上限仍按手机号统计）；调用短信服务商发送；发送失败 → `{"code":1,"msg":"验证码发送失败，请稍后再试"}`（并删除刚存的码）。
- 成功 → `{"code":0,"msg":"验证码已发送","data":{"resendAfter":60}}`。

### 4.2 `POST /api/auth/onboard`  `{onboardToken, oldPassword, newPassword, confirmPassword, phone, smsCode}`
校验顺序与提示（失败均 `code:1`，弹窗停留，不跳转）：
1. 票据无效/过期 → `code:10031`「操作已超时，请重新登录」。
2. 旧密码与当前密码不符 → 「旧密码错误」。
3. 新密码长度 < 8 → 「新密码长度不能少于8位」；> 20 → 「新密码长度不能超过20位」。
4. 缺字母或缺数字 → 「新密码必须同时包含字母和数字」。
5. 新密码等于 `123456` 或等于旧密码 → 「新密码不能与初始密码相同」。
6. 两次不一致 → 「两次输入的新密码不一致」。
7. 手机号格式 → 「手机号格式错误」；账号已绑定手机号且提交的号码与之不同 → 「请使用已绑定的手机号（尾号XXXX）验证」（不消耗验证码）。
8. 验证码：无记录或过期 → 「验证码已过期，请重新获取」；错误 → 「验证码错误」（累计 5 次错误作废该码，提示「验证码错误次数过多，请重新获取」）。
9. 全部通过（单事务）：更新密码哈希、`phone`、`onboarded_at=now`；删除该票据与该用户所有会话；删除已用验证码；写审计 `user.onboard`（`{"phone":"138****1234"}`）。
   → `{"code":0,"msg":"密码修改与手机号绑定成功，请使用新密码重新登录"}`。

密码长度上限 20：原客户端登录表单限制 6–12 位，需同步放宽到 6–20 位（见第6节）。

## 5 短信服务

`app/sms.py`：`SmsSender` 协议 `async send_code(phone, code) -> None`（失败抛 `SmsError`）。
- `LogSmsSender`：把验证码打印到服务日志（开发/测试用；手机号脱敏为 `138****1234`，运维从 journald 读码）。
- `AliyunSmsSender`：阿里云 Dysmsapi `SendSms`（RPC 签名 V1，HMAC-SHA1），用现有 httpx 客户端，`TemplateParam={"code": "..."}`。

配置（`/etc/ys-middleware.env`）：`SMS_PROVIDER=log|aliyun`（默认 `log`）、`SMS_ALIYUN_ACCESS_KEY_ID`、`SMS_ALIYUN_ACCESS_KEY_SECRET`、`SMS_ALIYUN_SIGN_NAME`、`SMS_ALIYUN_TEMPLATE_CODE`。`aliyun` 缺任一配置 → 启动时打印告警并退回 `log`。

## 6 客户端（Electron，编译后 Vue 2 产物）

- 新增 `client/account-onboard.js`（与 `ds-sources.js` 同模式：浏览器挂 `window.dsOnboard`，Node 下 `module.exports` 供测试），纯 DOM 实现弹窗，不依赖 Vue：
  - 全屏遮罩 + 居中卡片，`z-index` 最高；无关闭/取消按钮，屏蔽 Esc；遮罩拦截点击，登录页其余控件不可操作。
  - 字段：旧密码（预填 `123456`，可改）、新密码、确认新密码、实名手机号、短信验证码 +「获取验证码」（60 秒倒计时）。
  - 前端先做与后端相同的校验（同一套提示文案），再提交；后端错误文案显示在弹窗内红字区域。
  - 卡片底部提供「退出程序」文字按钮（发 `close` IPC，不算跳过——下次登录仍会弹出），避免无边框窗口无法退出（待确认 #4）。
  - 成功：关闭弹窗，回调登录页清空密码框、提示「密码修改与手机号绑定成功，请使用新密码重新登录」；若勾了「记住密码」，清除本地保存的旧密码。
  - 纯函数 `validate(form)`、`isMobile(phone)` 导出给 `node --test`。
- `client/index.html` 在 `ds-sources.js` 后加 `<script src=app://./account-onboard.js></script>`。
- `scripts/patch-ds-client.js` 新增一层 `onboard v1`，`only: ['chunk-4dffb567.9e3cf4c5.js']`（登录页）：
  1. `login()` 的 `res.code == 0` 分支后插入 `else if (res.code == 10030 && window.dsOnboard)` → `window.dsOnboard.open({ apiURL, onboardToken: res.data.onboardToken, onDone })`。
  2. 密码校验规则 `max: 12` / 「请输入6-12位密码」→ `max: 20` /「请输入6-20位密码」。
  锚点命中次数精确校验，幂等；测试用现有 `loadComponent` 夹具跑补丁后的真实模块。

## 7 管理后台

后端 `/admin/*`：
- `POST /admin/users {code, expires_at?}`：只建「待激活」账号（不再收密码；密码预置为初始密码 `123456`，使「正确账号密码 + 未激活」能得到 10023 提示，且不暴露任意密码下的账号存在性）。审计 `user.create`。
- `POST /admin/users/{code}/activate`：仅待激活可激活 → 密码置 `123456`、`first_activated_at=activated_at=now`、`status=active`、`onboarded_at=NULL`；已激活返回 409「账号已激活」。审计 `user.activate`。
- `PATCH /admin/users/{code}`：`status` 仅接受 `active|disabled|banned`（其他值 400）；`expires_at` 照旧；**移除** `password` 字段（管理员不得设置任意密码）。状态变更审计 `user.status`（前后值）；封禁/暂停时删除该账号全部会话。
- `POST /admin/users/{code}/reset-password`：仅已激活账号；密码重置为 `123456`、`onboarded_at=NULL`（下次登录重新走首登弹窗，含重新验证手机号），删除会话。审计 `user.reset_password`。
- `DELETE /admin/users/{code}`：审计 `user.delete`。
- `GET /admin/users`：新增 `activated`（bool）、`first_activated_at`、`phone`（脱敏 `138****1234`）、`onboarded`（bool）。
- `GET /admin/audit-logs?limit=&offset=&target=`：倒序分页。

`manage.py add` 保持原行为（直接建已激活、已完成首登、指定密码的账号），作为运维兜底。

前端 `admin-ui`：
- 账号表新增列「激活状态」（待激活/已激活）、「使用控制」（正常/暂停/封禁）、「手机号」（脱敏）、「首登」（已完成/未完成）。
- 操作：激活（待激活时）、暂停/恢复/封禁/解封、重置为初始密码、改到期、删除。新建账号表单去掉密码。
- 新增「操作日志」页（只读表格）。
- 构建产物 `app/static/admin-dist` 随提交更新。

## 8 测试

后端 pytest：迁移（旧库加列+回填）、登录 6 种分支、gate 拦截、发码频控/日上限/失败回滚、首登 9 条校验分支与成功事务、阿里云签名（固定时间/nonce 对比已知值）+ MockTransport、后台激活/状态/重置/审计、日志三年清理。
客户端 `node --test`：`account-onboard.js` 的校验函数；补丁层命中次数、幂等；`loadComponent` 下 `login()` 收到 10030 时调用 `window.dsOnboard.open` 且参数正确、规则上限为 20。

## 待确认决策（用户回来后确认）

1. 存量账号视为已完成首登，不强制补绑手机号。
2. 短信服务商默认按阿里云实现；需要你提供签名名称、模板编号和 AccessKey（写进服务器 env，不进仓库）。未配置前线上只能用日志桩，新账号无法完成首登。
3. 管理员后台只显示脱敏手机号；如需核验身份时看完整号码再加权限。
4. 首登弹窗保留「退出程序」按钮（只是退出 App，不跳过流程）。
5. 新密码上限 20 位，客户端登录框同步放宽为 6–20 位。
6. 管理员「重置密码」= 重置为 123456 并要求重新走首登（含重新验证手机号）：已绑定手机号的账号只能用原号码收码验证（换绑手机号不在本期范围），提示「请使用已绑定的手机号（尾号XXXX）验证」；`phone` 保持不变。
7. 同一手机号可绑定多个账号（文档未要求唯一）。
