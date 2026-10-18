# 账号各存各的数据（方案、关注专家、遗漏监控、模拟练习） 设计

来源：客户反馈桌面端残留原账号信息（2026-10-18）。上一步已把这些接口拦截为「没有数据 / 该功能暂不可用」，本设计把它们恢复为按会员账号隔离。依赖：会话与拦截（`gate.authorize_user`）、兜底转发（`main.proxy`）。
状态：已于 2026-10-18 与用户确认（第 7 节各项均按所写执行）。

## 1 背景与范围

所有会员在上游 data-ys 共用一个账号。下列功能的数据存在该账号名下，转发时人人可见、可删，还带着原账号主人的历史数据，所以目前被拦截：

| 功能 | 页面 | 接口 |
|---|---|---|
| 均衡方案 | 计算器保存、我的方案 | `averagePlan/{save,list,info,del}` |
| 倍投方案 | 计算器保存、我的方案 | `doublePlan/{save,list,info,del}` |
| 关注专家 | 专家详情、关注专家列表 | `expertFavorites/{save,del,list}`，专家页响应的 `favorites` |
| 遗漏监控 | `/animal/missControl` | `misscontrol/{list,save,del}` |
| 模拟练习（3D / 排列三） | `/monilianxi` | `userNumPlan/{save,list,info,del}` |

做：以上 5 项按会员账号隔离，各看各的、各删各的。全部在服务端实现，**客户端不改**，已安装的旧客户端直接生效。

不做：
- 职业培训报名（`coursemsg/*`）：报名按钮早已去掉，无入口；`coursemsg/info` 继续回「未报名」，`coursemsg/save` 继续拦截。
- 共用账号名下的旧数据：无法区分归属，对所有会员隐藏；上游数据不删。

## 2 两种实现方式

按「响应里有没有上游实时计算的字段」分两类（字段依据：对 client/js 各调用方的逐项梳理）。

**A. 本地存储**（均衡方案、倍投方案、关注专家）：金额、赔率都是客户端算好发上来的，服务端只补 `id`、创建时间。数据存在本服务 SQLite，按 `user_id` 隔离，不再访问上游。

**B. 上游存储 + 归属登记**（遗漏监控、模拟练习）：`missCount`（当前遗漏）、`warnCount`、`status`、`opennumber`（开奖号）、`prizeAmount`（中奖金额）等由上游按开奖数据实时计算，本地重算需复刻各玩法规则，风险大。做法：照常转发上游（共用账号），本地登记「上游数据 id → 会员」；列表只返回本人登记的条目，详情 / 删除只允许操作本人的条目。

## 3 数据

```
member_plans(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
             kind TEXT NOT NULL,            -- 'average' | 'double'
             data TEXT NOT NULL,            -- 客户端提交的 JSON 原文（已校验）
             created_at INTEGER NOT NULL)
  INDEX (user_id, kind, id)

member_favorites(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                 expert_id INTEGER NOT NULL, expert_type INTEGER NOT NULL, name TEXT NOT NULL,
                 created_at INTEGER NOT NULL, UNIQUE(user_id, expert_id, expert_type))

member_upstream_items(kind TEXT NOT NULL,      -- 'misscontrol' | 'usernumplan'
                      upstream_id TEXT NOT NULL, user_id INTEGER NOT NULL,
                      created_at INTEGER NOT NULL, PRIMARY KEY(kind, upstream_id))
  INDEX (user_id, kind)
```

- 删除账号时一并删除三张表中该账号的行（同 `user_avatars`）。
- 上限（防滥用）：每账号每类方案 200 条、关注 500 个、上游登记每类 200 条；单个方案 JSON 不超过 256KB。超限回 `{"code":1,"msg":"已达上限，请先删除旧数据"}`。

## 4 接口行为

所有接口先走 `gate.authorize_user`（10020/10022/10024/10025 照旧）。路径按 `gate.normalize`（小写）分派，在兜底转发里先于放行清单处理；这些路径不进入放行清单，不会被原样转发。失败统一 `{"code":1,"msg":...}`，客户端会弹出 `msg`。

### 4.1 均衡方案 / 倍投方案（A）

- `save`：请求体须为 JSON 对象，`planName` 非空字符串（≤50 字），`resultArr` 为数组；整体原样存入 `data`。回 `{"code":0,"msg":"成功","data":null}`。
- `list`：请求 `{"params":{"limit","page"}}`（字符串数字，缺省 10 / 1，limit 上限 50）。按 `id` 倒序分页，回 `{"list":[...],"total":N}`；每行 `id, planName, planType, createTime, sumBetting, odds, sumBonus`。
- `info`：请求 `{"planId"}`；非本人或不存在回「方案不存在」。回存入的 JSON，加 `id`、`createTime`，并补齐上游原先会补、客户端保存时不带的显示字段：
  - 均衡：`resultArr[].optionArr[]` 中 `type == 1` 的项补 `name`（让球选项名 = `goalLine` 前缀 + 选项中文名）；
  - 倍投：顶层 `resultName`（取 `resultArr[0].resultName`）；`resultArr[].oddsArr[]` 补 `bouns = bonus`（客户端模板拼写如此）。
- `del`：均衡发 `{"id":[...]}`（数组），倍投发 `{"id": n}`（标量），两种都接受；只删本人的。
- `createTime` 格式 `yyyy-MM-dd HH:mm:ss`（北京时间）。

### 4.2 关注专家（A）

- 专家页 `sportExpertPlan/footballJc/expert` 照常转发；响应顶层 `favorites` 改为本人对该专家的关注记录（无则 `null`），不再一律清空。同时记下本次请求的 `params.type`（会员 + 专家 → 类型，进程内）。
- `expertFavorites/save`：请求 `{"expertId","expertName"}`，客户端不带类型 → 取该会员最近一次打开此专家页时的 `type`，没有则 0。已关注则返回已有记录。回 `data` = 记录 `{id, expertId, expert_id, name, type, createTime}`（客户端随后用 `id` 取消关注）。
- `expertFavorites/del`：`{"id"}`，只删本人的。
- `expertFavorites/list`：`data` 为数组（非 `.list`），每行 `{id, expert_id, expertId, name, type, createTime}`，按关注时间倒序。

### 4.3 遗漏监控 / 模拟练习（B）

- `save`：
  1. 按「列表键」先拉一次上游列表，记下已有 id；遗漏监控的键是 `(playId, code)`，模拟练习是 `(code, openTime 所在月份)`。
  2. 转发保存；上游失败（含 9981「未购买此服务」）原样返回。
  3. 再拉一次列表，新出现的 id 登记到当前会员。上游保存响应若直接带了 id，以它为准。
  4. 同类保存进程内串行（一把锁），避免两人同时保存时互相认领。
  5. 没认领到新 id 时回「保存失败，请重试」（上游那条成为无主数据，对所有人隐藏）。
- `list`：转发上游，结果只保留本人登记的条目。遗漏监控 `data` 为数组；模拟练习 `data.list` 过滤后，`data.total` 按过滤后的行重算为 `[{"touru": Σ consumeAmount, "zhongchu": Σ prizeAmount}]`（数值）。
- 模拟练习 `info`、两者的 `del`：`id` 不是本人登记的 → 回「数据不存在」，不转发；删除成功后同时删除登记。
- 上游接口失败或超时：与兜底转发一致（会话失效时重登重试一次；网络错误回 502）。

## 5 安全

- 本人数据之外的 id 一律当不存在处理，不泄露是否存在。
- B 类条目的内容（方案名、邮箱）存在共用的上游账号下，上游账号本身可见；这与现状一致，不再扩大暴露面。
- 不新增任何会转发到上游的写接口形状：B 类只转发这 6 个固定路径，且 info / del 前先校验归属。

## 6 测试

- 每个接口：未登录 10020；本人保存 → 列表 / 详情可见；另一账号看不到、删不掉、查不到详情。
- A 类：分页、上限、非法 JSON / 字段类型、补齐的显示字段、两种 del 形状、账号删除时数据清理。
- 关注：专家页 `favorites` 按本人状态返回、类型取自最近一次专家页请求、重复关注幂等。
- B 类（mock 上游）：认领新 id、原有条目不被认领、上游报错原样返回、未认领到时报错、总计按过滤后重算、并发保存串行。
- 端到端：本地起后端 + mock 上游 + 浏览器客户端，两个测试账号交叉验证各页面。

## 7 已确认的取舍

1. 模拟练习的「投入总额 / 中奖总额」按 Σ消费金额、Σ中奖金额计算——与上游原算法是否一致无法核对（上游是否乘倍数未知）。
2. 遗漏监控、模拟练习仍在共用上游账号下：若上游对单账号有条数上限，全体会员共享该上限；保存时上游若回 9981（共用账号未购买遗漏服务），会员会看到「去购买」提示，而购买页已拦截。
3. 共用账号名下旧数据（含会员此前通过共用账号保存的）对所有人隐藏。
4. 第 3 节的数量上限是否合适。
