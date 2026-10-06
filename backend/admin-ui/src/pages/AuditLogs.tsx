import { ProColumns, ProTable } from '@ant-design/pro-components'
import { AuditLogRow, listAuditLogs } from '../api'
import { AGENT_STATUS_LABEL, fmtDate, fmtDateTime, STATUS_LABEL } from '../util'

// 动作码 → 中文；未知动作回退显示原始码。
const ACTION_LABEL: Record<string, string> = {
  'user.create': '新建账号',
  'user.activate': '激活',
  'user.status': '状态变更',
  'user.expires': '改到期',
  'user.reset_password': '重置密码',
  'user.delete': '删除',
  'user.onboard': '首登改密绑定',
  'user.profile_reset': '重置头像昵称',
  'agent.create': '新建代理',
  'agent.update': '修改代理',
  'agent.status': '代理资格变更',
  'agent.rename': '代理改名',
  'agent.password': '重置代理密码',
  'agent.recycle': '回收编号',
  'segment.assign': '分配号段',
  'segment.transfer': '划拨编号',
  'admin.create': '新建管理员',
  'admin.password': '重置管理员密码',
  'admin.delete': '删除管理员',
  'admin.set_super': '指定最高权限者',
  'grant.add': '授权',
  'grant.revoke': '撤销授权',
  'points.grant': '加分',
  'points.revoke': '扣分',
  'points.transfer': '转积分给下级',
  'points.recharge': '代理充值',
  'points.batch': '批量充值',
  'points.trial': '体验赠送',
  'points.suspended': '积分暂停',
  'points.resumed': '积分恢复',
  'settings.trial': '体验期设置',
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
  if (r.action === 'agent.status') {
    const f = String(d.from)
    const t = String(d.to)
    return `${AGENT_STATUS_LABEL[f] ?? f} → ${AGENT_STATUS_LABEL[t] ?? t}（${String(d.reason ?? '')}）`
  }
  if (r.action === 'agent.rename') {
    return `${String(d.from)} → ${String(d.to)}`
  }
  if (r.action === 'user.expires') {
    return `${fmtExpire(d.from)} → ${fmtExpire(d.to)}`
  }
  if (r.action === 'user.profile_reset') {
    const parts = [d.nickname_custom ? '自定义昵称' : null, d.avatar_custom ? '自定义头像' : null].filter(Boolean)
    return parts.length ? `重置前：${parts.join('、')}` : '重置前已是默认'
  }
  if (r.action === 'points.resumed') {
    return `余额 ${String(d.balance)}`
  }
  if (r.action === 'settings.trial') {
    const side = (v: unknown) => {
      const o = (v ?? {}) as { trial_enabled?: boolean; trial_points?: number }
      return `${o.trial_enabled ? '开启' : '关闭'} / ${String(o.trial_points)} 分`
    }
    return `体验期：${side(d.from)} → ${side(d.to)}`
  }
  if (r.action === 'points.batch') {
    return `${String(d.count)} 个账号各 ${String(d.amount)} 分，共 ${String(d.total)} 分`
  }
  if (r.action.startsWith('points.') && d.amount !== undefined) {
    return `${String(d.amount)} 分${d.balance !== undefined ? `，余额 ${String(d.balance)}` : ''}` +
      (d.reason ? `（${String(d.reason)}）` : '')
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
      fieldProps: { placeholder: '按对象（账号编号 / 代理名称 / 批次号）搜索' },
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
