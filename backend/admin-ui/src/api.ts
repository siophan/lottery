// 与后端 /admin/* 端点交互。同源部署，cookie 自动随请求发送（credentials:same-origin）。
// 鉴权、cookie、字段形状全部沿用既有后端，不做任何改动。
const BASE = '/admin'

// 403 时的回调（App 注册为「重新读取 /me」）：代理被暂停/取消、管理员被删除后，已有会话在后端已失效，
// 刷新身份后若 /me 返回 401 则自动回到登录页；仍是登录状态（只是无权限）则保持原页面。
let onForbidden: (() => void) | null = null
export function setForbiddenHandler(fn: (() => void) | null): void {
  onForbidden = fn
}

async function req(path: string, options: RequestInit = {}): Promise<Response> {
  // 仅在有请求体时附带 JSON 头，避免无 body 的 GET/DELETE 带上多余的 Content-Type。
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (options.body != null && headers['Content-Type'] == null) {
    headers['Content-Type'] = 'application/json'
  }
  const r = await fetch(BASE + path, {
    credentials: 'same-origin',
    ...options,
    headers,
  })
  // 登录接口自己的 403（代理资格暂停/取消）带具体文案，不触发身份刷新
  if (r.status === 403 && path !== '/login') onForbidden?.()
  return r
}

export interface UserRow {
  code: string
  status: string // active 正常 | disabled 暂停 | banned 封禁
  expires_at: number | null
  created_at: number
  activated: boolean // 是否已激活（false = 待激活）
  first_activated_at: number | null
  phone: string | null // 已脱敏，如 138****1234
  onboarded: boolean // 是否完成首登改密 + 绑定手机号
  agent_id: number | null // 归属代理；null = 无归属
  agent_name: string | null
  number_status: string // pending 待激活 | activated 已激活 | arrears 已欠费 | to_recycle 待回收 | unassigned 未分配
  points: number // 积分余额
  nickname: string // 实际显示昵称（未设置时为默认昵称）
}

export interface ApiResult {
  ok: boolean
  error?: string
}

// 统一解析 {ok, error}：HTTP 200 且 ok !== false 视为成功，否则带回后端的 error 文案。
async function result(r: Response): Promise<ApiResult> {
  const d = await r.json().catch(() => ({}))
  // 后端无权限响应是 {"error":"forbidden"}，不要把英文原文展示给用户
  const error = r.status === 403 && d.error === 'forbidden' ? '无权限或登录已失效' : d.error
  return { ok: r.status === 200 && d.ok !== false, error }
}

export type Role = 'super' | 'admin' | 'agent'

export interface AgentRow {
  id: number
  name: string
  region: string // province | city | vip
  tier: string // senior 高级 | junior 低级
  parent_agent_id: number | null
  status: string // active 激活 | paused 暂停 | cancelled 取消
  status_by: string | null
  status_at: number | null
  status_reason: string | null
  created_at: number
  recycled_at: number | null
  points: number // 代理积分余额
  // 以下仅列表接口返回
  parent_name?: string | null
  total?: number
  activated?: number
  unactivated?: number
  children?: number
}

export interface Me {
  username: string
  role: Role
  grants: string[] // 如 agent.rename
  agent: AgentRow | null // 代理身份时为本人资料
}

export async function getMe(): Promise<Me | null> {
  const r = await req('/me')
  if (r.status === 200) return r.json()
  return null
}

// 登录失败时带回后端文案（如「代理资格已暂停，无法登录」）；密码错误时后端不给文案。
export async function login(username: string, password: string): Promise<ApiResult> {
  return result(
    await req('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  )
}

export async function logout(): Promise<void> {
  await req('/logout', { method: 'POST' })
}

export async function listUsers(agentId?: number): Promise<UserRow[]> {
  const r = await req('/users' + (agentId != null ? '?agent_id=' + agentId : ''))
  if (r.status !== 200) throw new Error('list users failed: ' + r.status)
  const d = await r.json()
  return d.users as UserRow[]
}

export async function createUser(code: string, expiresAt: number | null): Promise<ApiResult> {
  const r = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ code, expires_at: expiresAt }),
  })
  return result(r)
}

export async function patchUser(
  code: string,
  patch: Record<string, unknown>,
): Promise<ApiResult> {
  const r = await req('/users/' + encodeURIComponent(code), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return result(r)
}

export async function activateUser(code: string): Promise<ApiResult> {
  return result(await req('/users/' + encodeURIComponent(code) + '/activate', { method: 'POST' }))
}

export async function resetUserPassword(code: string): Promise<ApiResult> {
  return result(
    await req('/users/' + encodeURIComponent(code) + '/reset-password', { method: 'POST' }),
  )
}

export async function deleteUser(code: string): Promise<ApiResult> {
  return result(await req('/users/' + encodeURIComponent(code), { method: 'DELETE' }))
}

export interface UserProfile {
  code: string
  nickname: string
  avatar: string // data URL（未设置时为默认几何图案头像）
  nickname_is_default: boolean
  avatar_is_default: boolean
}

export async function getUserProfile(code: string): Promise<UserProfile> {
  const r = await req('/users/' + encodeURIComponent(code) + '/profile')
  if (r.status !== 200) throw new Error('get profile failed: ' + r.status)
  return (await r.json()) as UserProfile
}

export async function resetUserProfile(code: string): Promise<ApiResult> {
  return result(await req('/users/' + encodeURIComponent(code) + '/profile/reset', { method: 'POST' }))
}

// ---------------- 操作日志 ----------------

export interface AuditLogRow {
  id: number
  actor_type: string
  actor: string
  action: string
  target: string
  detail: Record<string, unknown>
  created_at: number
}

export async function listAuditLogs(
  limit: number,
  offset: number,
  target?: string,
): Promise<{ logs: AuditLogRow[]; total: number }> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (target) qs.set('target', target)
  const r = await req('/audit-logs?' + qs.toString())
  if (r.status !== 200) throw new Error('list audit logs failed: ' + r.status)
  return r.json()
}

// ---------------- 数据源 ----------------

export interface SourceLottery {
  lottery_code: string
  remote_code: string
  name: string
  cat: string
}

export interface DataSourceRow {
  id: number
  key: string
  name: string
  adapter: string
  base_url: string
  headers: Record<string, string>
  interval_sec: number
  enabled: boolean
  status: string
  last_error: string | null
  last_ok_at: number | null
  created_at: number
  lotteries: SourceLottery[]
}

export type DataSourceInput = Omit<
  DataSourceRow,
  'id' | 'status' | 'last_error' | 'last_ok_at' | 'created_at'
>

export interface DrawRow {
  expect: string
  opennumber: string
  open_time: string
}

export async function listDataSources(): Promise<DataSourceRow[]> {
  const r = await req('/data-sources')
  if (r.status !== 200) throw new Error('list data sources failed: ' + r.status)
  const d = await r.json()
  return d.sources as DataSourceRow[]
}

export async function saveDataSource(
  id: number | null,
  input: DataSourceInput,
): Promise<{ ok: boolean; error?: string }> {
  const r = await req(id == null ? '/data-sources' : '/data-sources/' + id, {
    method: id == null ? 'POST' : 'PUT',
    body: JSON.stringify(input),
  })
  const d = await r.json().catch(() => ({}))
  return { ok: r.status === 200 && d.ok === true, error: d.error }
}

export async function setDataSourceEnabled(id: number, enabled: boolean): Promise<boolean> {
  const r = await req(`/data-sources/${id}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
  return r.status === 200
}

export async function deleteDataSource(id: number): Promise<boolean> {
  const r = await req(`/data-sources/${id}`, { method: 'DELETE' })
  return r.status === 200
}

export async function listDraws(id: number, code: string, rows = 20): Promise<DrawRow[]> {
  const r = await req(`/data-sources/${id}/draws?code=${encodeURIComponent(code)}&rows=${rows}`)
  if (r.status !== 200) return []
  const d = await r.json()
  return d.draws as DrawRow[]
}

// ---------------- 代理 ----------------

function post(path: string, body?: unknown): Promise<Response> {
  return req(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}

export async function listAgents(): Promise<AgentRow[]> {
  const r = await req('/agents')
  if (r.status !== 200) throw new Error('list agents failed: ' + r.status)
  return (await r.json()).agents as AgentRow[]
}

export interface AgentInput {
  name: string
  password: string
  region: string
  tier: string
  parent_agent_id: number | null
}

export async function createAgent(input: AgentInput): Promise<ApiResult> {
  return result(await post('/agents', input))
}

export async function updateAgent(
  id: number,
  patch: { region?: string; tier?: string; parent_agent_id?: number | null },
): Promise<ApiResult> {
  return result(await req('/agents/' + id, { method: 'PATCH', body: JSON.stringify(patch) }))
}

export async function setAgentStatus(id: number, status: string, reason: string): Promise<ApiResult> {
  return result(await post(`/agents/${id}/status`, { status, reason }))
}

export async function renameAgent(id: number, name: string): Promise<ApiResult> {
  return result(await post(`/agents/${id}/rename`, { name }))
}

export async function setAgentPassword(id: number, password: string): Promise<ApiResult> {
  return result(await post(`/agents/${id}/password`, { password }))
}

export async function recycleAgent(id: number): Promise<ApiResult> {
  return result(await post(`/agents/${id}/recycle`))
}

// ---------------- 号段 ----------------

export interface SegmentOpRow {
  id: number
  op: string // assign 分配 | transfer 划拨 | recycle 回收
  start_no: number | null
  end_no: number | null
  count: number
  from_agent_id: number | null
  to_agent_id: number | null
  from_name: string | null
  to_name: string | null
  actor: string
  created_at: number
}

export async function assignSegment(agentId: number, start: number, end: number): Promise<ApiResult> {
  return result(await post('/segments/assign', { agent_id: agentId, start, end }))
}

export async function transferSegment(toAgentId: number, start: number, end: number): Promise<ApiResult> {
  return result(await post('/segments/transfer', { to_agent_id: toAgentId, start, end }))
}

export async function listSegmentOps(
  limit: number,
  offset: number,
): Promise<{ ops: SegmentOpRow[]; total: number }> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const r = await req('/segment-ops?' + qs.toString())
  if (r.status !== 200) throw new Error('list segment ops failed: ' + r.status)
  return r.json()
}

// ---------------- 管理员与授权（仅最高权限者） ----------------

export interface AdminRow {
  id: number
  username: string
  role: Role
  created_at: number
  grants: string[]
}

export async function listAdmins(): Promise<AdminRow[]> {
  const r = await req('/admins')
  if (r.status !== 200) throw new Error('list admins failed: ' + r.status)
  return (await r.json()).admins as AdminRow[]
}

export async function createAdmin(username: string, password: string): Promise<ApiResult> {
  return result(await post('/admins', { username, password }))
}

export async function setAdminPassword(id: number, password: string): Promise<ApiResult> {
  return result(await post(`/admins/${id}/password`, { password }))
}

export async function deleteAdmin(id: number): Promise<ApiResult> {
  return result(await req('/admins/' + id, { method: 'DELETE' }))
}

export async function addGrant(adminId: number, grant: string): Promise<ApiResult> {
  return result(await post('/grants', { admin_id: adminId, grant }))
}

export async function revokeGrant(adminId: number, grant: string): Promise<ApiResult> {
  return result(await req(`/grants/${adminId}/${encodeURIComponent(grant)}`, { method: 'DELETE' }))
}

// ---------------- 积分 ----------------

export interface PointsResult extends ApiResult {
  amount?: number // 实际变化量（扣分最多扣到 0，可能小于请求值）
  balance?: number | null // 加分/扣分：对象变化后余额；代理转分/充值/批量：代理自身剩余余额
  count?: number
  total?: number
  batch_id?: string
}

// 与 result() 相同的 ok / error 规则，另外带回后端返回的余额等字段。
async function pointsResult(r: Response): Promise<PointsResult> {
  const d = await r.json().catch(() => ({}))
  const error = r.status === 403 && d.error === 'forbidden' ? '无权限或登录已失效' : d.error
  return { ...d, ok: r.status === 200 && d.ok !== false, error }
}

// 后台人员：加分（凭空增加）/ 扣分（原因必填，最多扣到 0）
export async function adjustUserPoints(
  code: string,
  op: 'grant' | 'revoke',
  amount: number,
  reason?: string,
): Promise<PointsResult> {
  return pointsResult(await post(`/users/${encodeURIComponent(code)}/points/${op}`, { amount, reason }))
}

export async function adjustAgentPoints(
  id: number,
  op: 'grant' | 'revoke',
  amount: number,
  reason?: string,
): Promise<PointsResult> {
  return pointsResult(await post(`/agents/${id}/points/${op}`, { amount, reason }))
}

// 代理：用自身余额给本人名下账号充值
export async function rechargeUser(code: string, amount: number): Promise<PointsResult> {
  return pointsResult(await post(`/users/${encodeURIComponent(code)}/points/recharge`, { amount }))
}

// 高级代理：转积分给直属下级
export async function transferAgentPoints(toAgentId: number, amount: number): Promise<PointsResult> {
  return pointsResult(await post(`/agents/${toAgentId}/points/transfer`, { amount }))
}

// 批量充值：后台人员凭空增加；代理扣自身余额（仅本人名下账号）
export async function batchRecharge(codes: string[], amount: number, reason?: string): Promise<PointsResult> {
  return pointsResult(await post('/points/batch-recharge', { codes, amount, reason }))
}

export interface LedgerRow {
  id: number
  holder_type: 'user' | 'agent'
  holder_id: string // 账号编号 / 代理 id
  holder_name: string | null // 账号编号 / 代理名称
  delta: number
  balance_before: number
  balance_after: number
  kind: string // trial | grant | revoke | transfer_out | transfer_in | charge
  counterparty_type: string | null
  counterparty_id: string | null
  counterparty_name: string | null
  actor_type: string
  actor: string
  reason: string | null
  batch_id: string | null
  cycle_key: number | null
  created_at: number
}

export interface LedgerQuery {
  holder_type?: string
  holder_id?: string
  kind?: string
  since?: number
  until?: number
}

export async function listLedger(
  limit: number,
  offset: number,
  q: LedgerQuery = {},
): Promise<{ ledger: LedgerRow[]; total: number }> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  const r = await req('/points/ledger?' + qs.toString())
  if (r.status !== 200) throw new Error('list ledger failed: ' + r.status)
  return r.json()
}

export interface TrialSettings {
  trial_enabled: boolean
  trial_points: number
  first_charge_delay_hours: number // 只读：固定 24
  charge_period_hours: number // 只读：固定 24
}

export async function getTrialSettings(): Promise<TrialSettings> {
  const r = await req('/settings/trial')
  if (r.status !== 200) throw new Error('get trial settings failed: ' + r.status)
  return r.json()
}

export async function saveTrialSettings(trialEnabled: boolean, trialPoints: number): Promise<ApiResult> {
  return result(
    await req('/settings/trial', {
      method: 'PUT',
      body: JSON.stringify({ trial_enabled: trialEnabled, trial_points: trialPoints }),
    }),
  )
}
