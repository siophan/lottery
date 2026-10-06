import { useEffect, useState } from 'react'
import { ProColumns, ProTable } from '@ant-design/pro-components'
import dayjs from 'dayjs'
import { LedgerRow, listAgents, listLedger, Me } from '../api'
import { fmtDateTime, HOLDER_TYPE_LABEL, POINTS_KIND_LABEL, toValueEnum } from '../util'

// 搜索表单里只用于筛选的两个虚拟字段（不对应 LedgerRow 的列）
type LedgerSearch = LedgerRow & { user_code?: string; agent_filter?: string }

// 积分流水：后台人员看全部；代理只看本人账户的（本人作为持有方的行；不含对方 / 名下账号的行，避免泄露他人余额；后端按身份限定）。
// 筛选：账号编号或代理（二选一，填了账号编号优先）、类型、时间范围；服务端分页。
export default function PointsLedger({ me }: { me: Me }) {
  const isAgent = me.role === 'agent'
  const [agentEnum, setAgentEnum] = useState<Record<string, { text: string }>>({})

  useEffect(() => {
    // 后台人员：全部代理；代理：本人 + 直属下级
    listAgents()
      .then((rows) => {
        const opts = rows.map((a) => [String(a.id), { text: a.name }] as const)
        if (isAgent && me.agent) opts.unshift([String(me.agent.id), { text: `${me.agent.name}（本人）` }])
        setAgentEnum(Object.fromEntries(opts))
      })
      .catch(() => setAgentEnum({}))
  }, [isAgent, me.agent])

  const party = (type: string | null, name: string | null, id: string | null) =>
    type ? `${HOLDER_TYPE_LABEL[type] ?? type} ${name ?? id ?? ''}` : '—'

  const columns: ProColumns<LedgerSearch>[] = [
    {
      title: '时间',
      dataIndex: 'created_at',
      valueType: 'dateTimeRange',
      width: 160,
      render: (_, r) => fmtDateTime(r.created_at),
    },
    { title: '账号编号', dataIndex: 'user_code', hideInTable: true, fieldProps: { placeholder: '按账号编号筛选' } },
    {
      title: '代理',
      dataIndex: 'agent_filter',
      valueType: 'select',
      valueEnum: agentEnum,
      hideInTable: true,
      fieldProps: { showSearch: true },
    },
    {
      title: '对象',
      dataIndex: 'holder_id',
      hideInSearch: true,
      width: 140,
      render: (_, r) => party(r.holder_type, r.holder_name, r.holder_id),
    },
    {
      title: '类型',
      dataIndex: 'kind',
      valueType: 'select',
      valueEnum: toValueEnum(POINTS_KIND_LABEL),
      width: 100,
    },
    {
      title: '变动',
      dataIndex: 'delta',
      hideInSearch: true,
      width: 90,
      render: (_, r) => (
        <span style={{ color: r.delta > 0 ? '#389e0d' : '#cf1322' }}>{r.delta > 0 ? `+${r.delta}` : r.delta}</span>
      ),
    },
    {
      title: '余额',
      dataIndex: 'balance_after',
      hideInSearch: true,
      width: 110,
      render: (_, r) => `${r.balance_before} → ${r.balance_after}`,
    },
    {
      title: '对方',
      dataIndex: 'counterparty_id',
      hideInSearch: true,
      width: 140,
      render: (_, r) => party(r.counterparty_type, r.counterparty_name, r.counterparty_id),
    },
    { title: '操作者', dataIndex: 'actor', hideInSearch: true, width: 120 },
    {
      title: '原因 / 批次',
      dataIndex: 'reason',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) => [r.reason, r.batch_id && `批次 ${r.batch_id}`].filter(Boolean).join('；') || '—',
    },
  ]

  return (
    <ProTable<LedgerSearch>
      rowKey="id"
      columns={columns}
      cardBordered
      search={{ labelWidth: 'auto' }}
      options={{ reload: true, density: false, setting: false }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
      headerTitle={isAgent ? '我的积分流水' : undefined}
      request={async (params) => {
        const current = params.current ?? 1
        const pageSize = params.pageSize ?? 20
        const range = params.created_at as [string, string] | undefined
        const code = params.user_code ? String(params.user_code).trim().toUpperCase() : ''
        const agent = params.agent_filter ? String(params.agent_filter) : ''
        const holder = code
          ? { holder_type: 'user', holder_id: code }
          : agent
            ? { holder_type: 'agent', holder_id: agent }
            : {}
        const { ledger, total } = await listLedger(pageSize, (current - 1) * pageSize, {
          ...holder,
          kind: params.kind,
          since: range ? dayjs(range[0]).unix() : undefined,
          until: range ? dayjs(range[1]).unix() : undefined,
        })
        return { data: ledger, total, success: true }
      }}
    />
  )
}
