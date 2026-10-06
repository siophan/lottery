import dayjs from 'dayjs'

// expires_at / created_at 都是 unix 秒；expires_at 为 null 表示永久。
export function fmtDate(ts: number | null): string {
  return ts == null ? '永久' : dayjs.unix(ts).format('YYYY-MM-DD')
}

export function fmtDateTime(ts: number): string {
  return dayjs.unix(ts).format('YYYY-MM-DD HH:mm')
}

// ProForm 的日期字段提交后可能是字符串或 dayjs 对象，统一转 unix 秒；空值 → null（永久）。
export function toEpoch(v: unknown): number | null {
  if (!v) return null
  return dayjs(v as dayjs.ConfigType).unix()
}

// 账号使用控制状态（后端 status 取值）→ 中文。
export const STATUS_LABEL: Record<string, string> = {
  active: '正常',
  disabled: '暂停',
  banned: '封禁',
}

// 编号状态（后端 number_status，由数据推导）→ 中文。
export const NUMBER_STATUS_LABEL: Record<string, string> = {
  pending: '待激活',
  activated: '已激活',
  arrears: '已欠费',
  to_recycle: '待回收',
  unassigned: '未分配',
}

export const REGION_LABEL: Record<string, string> = { province: '省级', city: '市级', vip: 'VIP' }
export const TIER_LABEL: Record<string, string> = { senior: '高级', junior: '低级' }
export const AGENT_STATUS_LABEL: Record<string, string> = {
  active: '激活',
  paused: '暂停',
  cancelled: '取消',
}
export const ROLE_LABEL: Record<string, string> = { super: '最高权限者', admin: '管理员', agent: '代理' }

// Record → ProTable / ProFormSelect 的 valueEnum。
export function toValueEnum(labels: Record<string, string>): Record<string, { text: string }> {
  return Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, { text: v }]))
}
