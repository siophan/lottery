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
