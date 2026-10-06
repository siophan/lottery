import { ProColumns, ProTable } from '@ant-design/pro-components'
import { AuditLogRow, listAuditLogs } from '../api'
import { fmtDate, fmtDateTime, STATUS_LABEL } from '../util'

// 动作码 → 中文；未知动作回退显示原始码。
const ACTION_LABEL: Record<string, string> = {
  'user.create': '新建账号',
  'user.activate': '激活',
  'user.status': '状态变更',
  'user.expires': '改到期',
  'user.reset_password': '重置密码',
  'user.delete': '删除',
  'user.onboard': '首登改密绑定',
}

// user.expires 的 from/to 是 unix 秒或 null（永久）。
function fmtExpire(v: unknown): string {
  return typeof v === 'number' ? fmtDate(v) : '永久'
}

function fmtDetail(r: AuditLogRow): string {
  const d = r.detail || {}
  if (r.action === 'user.status') {
    const f = String(d.from)
    const t = String(d.to)
    return `${STATUS_LABEL[f] ?? f} → ${STATUS_LABEL[t] ?? t}`
  }
  if (r.action === 'user.expires') {
    return `${fmtExpire(d.from)} → ${fmtExpire(d.to)}`
  }
  return Object.keys(d).length ? JSON.stringify(d) : '—'
}

export default function AuditLogs() {
  const columns: ProColumns<AuditLogRow>[] = [
    {
      title: '时间',
      dataIndex: 'created_at',
      hideInSearch: true,
      width: 160,
      render: (_, r) => fmtDateTime(r.created_at),
    },
    { title: '操作者', dataIndex: 'actor', hideInSearch: true, width: 140 },
    {
      title: '动作',
      dataIndex: 'action',
      hideInSearch: true,
      width: 140,
      render: (_, r) => ACTION_LABEL[r.action] ?? r.action,
    },
    {
      title: '对象',
      dataIndex: 'target',
      width: 140,
      fieldProps: { placeholder: '按对象（账号编号）搜索' },
    },
    {
      title: '详情',
      dataIndex: 'detail',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) => fmtDetail(r),
    },
  ]

  return (
    <ProTable<AuditLogRow>
      rowKey="id"
      columns={columns}
      cardBordered
      search={{ labelWidth: 'auto' }}
      options={{ reload: true, density: false, setting: false }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
      request={async (params) => {
        const current = params.current ?? 1
        const pageSize = params.pageSize ?? 20
        const target = params.target ? String(params.target).trim() : undefined
        const { logs, total } = await listAuditLogs(pageSize, (current - 1) * pageSize, target)
        return { data: logs, total, success: true }
      }}
    />
  )
}
