// 与后端 /admin/* 端点交互。同源部署，cookie 自动随请求发送（credentials:same-origin）。
// 鉴权、cookie、字段形状全部沿用既有后端，不做任何改动。
const BASE = '/admin'

async function req(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(BASE + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
}

export interface UserRow {
  code: string
  status: string
  expires_at: number | null
  created_at: number
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

export async function createUser(
  code: string,
  password: string,
  expiresAt: number | null,
): Promise<boolean> {
  const r = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ code, password, expires_at: expiresAt }),
  })
  return r.status === 200
}

export async function patchUser(
  code: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const r = await req('/users/' + encodeURIComponent(code), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return r.status === 200
}

export async function deleteUser(code: string): Promise<boolean> {
  const r = await req('/users/' + encodeURIComponent(code), { method: 'DELETE' })
  return r.status === 200
}
