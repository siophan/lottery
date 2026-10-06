// 与后端 /admin/* 端点交互。同源部署，cookie 自动随请求发送（credentials:same-origin）。
// 鉴权、cookie、字段形状全部沿用既有后端，不做任何改动。
const BASE = '/admin'

async function req(path: string, options: RequestInit = {}): Promise<Response> {
  // 仅在有请求体时附带 JSON 头，避免无 body 的 GET/DELETE 带上多余的 Content-Type。
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (options.body != null && headers['Content-Type'] == null) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(BASE + path, {
    credentials: 'same-origin',
    ...options,
    headers,
  })
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
}

export interface ApiResult {
  ok: boolean
  error?: string
}

// 统一解析 {ok, error}：HTTP 200 且 ok !== false 视为成功，否则带回后端的 error 文案。
async function result(r: Response): Promise<ApiResult> {
  const d = await r.json().catch(() => ({}))
  return { ok: r.status === 200 && d.ok !== false, error: d.error }
}

export async function getMe(): Promise<{ username: string } | null> {
  const r = await req('/me')
  if (r.status === 200) return r.json()
  return null
}

export async function login(username: string, password: string): Promise<boolean> {
  const r = await req('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return r.status === 200
}

export async function logout(): Promise<void> {
  await req('/logout', { method: 'POST' })
}

export async function listUsers(): Promise<UserRow[]> {
  const r = await req('/users')
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
