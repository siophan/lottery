import { useEffect, useRef, useState } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormDigit,
  ProFormSelect,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button } from 'antd'
import { GiftOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons'
import {
  AgentRow,
  ApiResult,
  assignSegment,
  getMe,
  listAgents,
  listSegmentOps,
  Me,
  SegmentOpRow,
  transferAgentPoints,
  transferSegment,
} from '../api'
import { fmtDateTime, POINTS_AMOUNT_PROPS } from '../util'

const OP_LABEL: Record<string, string> = { assign: '分配', transfer: '划拨', recycle: '回收' }
const NO_RULES = [{ required: true, message: '请输入编号' }]
const NO_PROPS = { min: 1000000, max: 9999999, precision: 0 }

export default function Segments({ me }: { me: Me }) {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()
  // 后台人员：全部代理（分配对象）；代理：本人直属下级（划拨对象）
  const [agents, setAgents] = useState<AgentRow[]>([])
  const isStaff = me.role !== 'agent'
  const canTransfer = me.role === 'agent' && me.agent?.tier === 'senior'
  const [myPoints, setMyPoints] = useState<number | null>(me.agent?.points ?? null)

  useEffect(() => {
    if (isStaff || canTransfer) listAgents().then(setAgents).catch(() => setAgents([]))
  }, [isStaff, canTransfer])

  const targets = agents
    .filter((a) => a.status === 'active')
    .map((a) => ({ label: a.name, value: a.id }))

  const run = async (p: Promise<ApiResult>, okMsg: string) => {
    const r = await p
    if (r.ok) {
      message.success(okMsg)
      actionRef.current?.reload()
    } else {
      message.error(r.error || '操作失败')
    }
    return r.ok
  }

  const columns: ProColumns<SegmentOpRow>[] = [
    { title: '时间', dataIndex: 'created_at', width: 160, render: (_, r) => fmtDateTime(r.created_at) },
    { title: '类型', dataIndex: 'op', width: 80, render: (_, r) => OP_LABEL[r.op] ?? r.op },
    {
      title: '编号区间',
      dataIndex: 'start_no',
      render: (_, r) => (r.start_no == null ? '—' : `${r.start_no} – ${r.end_no}`),
    },
    { title: '数量', dataIndex: 'count', width: 90 },
    { title: '划出方', dataIndex: 'from_name', render: (_, r) => r.from_name || '—' },
    { title: '接收方', dataIndex: 'to_name', render: (_, r) => r.to_name || '—' },
    { title: '操作者', dataIndex: 'actor' },
  ]

  const rangeFields = (
    <>
      <ProFormDigit name="start" label="起始编号" rules={NO_RULES} fieldProps={NO_PROPS} />
      <ProFormDigit
        name="end"
        label="结束编号"
        rules={NO_RULES}
        fieldProps={NO_PROPS}
        extra="7 位数字，含两端，单次最多 10000 个"
      />
    </>
  )

  return (
    <ProTable<SegmentOpRow>
      rowKey="id"
      actionRef={actionRef}
      columns={columns}
      cardBordered
      search={false}
      headerTitle="号段流水"
      options={{ reload: true, density: false, setting: false }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
      request={async (params) => {
        const current = params.current ?? 1
        const pageSize = params.pageSize ?? 20
        const { ops, total } = await listSegmentOps(pageSize, (current - 1) * pageSize)
        return { data: ops, total, success: true }
      }}
      toolBarRender={() => [
        isStaff && (
          <ModalForm
            key="assign"
            title="分配号段"
            width={420}
            modalProps={{ destroyOnClose: true }}
            trigger={
              <Button type="primary" icon={<PlusOutlined />}>
                分配号段
              </Button>
            }
            onFinish={async (v: { agent_id: number; start: number; end: number }) =>
              run(assignSegment(v.agent_id, v.start, v.end), '已分配，段内编号已建为待激活账号')
            }
          >
            <ProFormSelect
              name="agent_id"
              label="代理"
              options={targets}
              rules={[{ required: true, message: '请选择代理' }]}
              showSearch
            />
            {rangeFields}
          </ModalForm>
        ),
        canTransfer && (
          <ModalForm
            key="points"
            title="转积分给直属下级"
            width={420}
            modalProps={{ destroyOnClose: true }}
            trigger={<Button icon={<GiftOutlined />}>转积分给下级</Button>}
            onOpenChange={(open) => {
              if (open) getMe().then((m) => setMyPoints(m?.agent?.points ?? null)).catch(() => undefined)
            }}
            onFinish={async (v: { to_agent_id: number; amount: number }) =>
              run(transferAgentPoints(v.to_agent_id, v.amount), '已转出积分')
            }
          >
            <ProFormSelect
              name="to_agent_id"
              label="直属下级"
              options={targets}
              rules={[{ required: true, message: '请选择下级代理' }]}
              extra="收款代理须资格激活；转出后不能转回"
            />
            <ProFormDigit
              name="amount"
              label="积分"
              rules={[{ required: true, message: '请输入积分数量' }]}
              fieldProps={POINTS_AMOUNT_PROPS}
              extra={`从你的积分中扣除（当前 ${myPoints ?? '—'}）`}
            />
          </ModalForm>
        ),
        canTransfer && (
          <ModalForm
            key="transfer"
            title="划拨编号给直属下级"
            width={420}
            modalProps={{ destroyOnClose: true }}
            trigger={
              <Button type="primary" icon={<SwapOutlined />}>
                划拨编号
              </Button>
            }
            onFinish={async (v: { to_agent_id: number; start: number; end: number }) =>
              run(transferSegment(v.to_agent_id, v.start, v.end), '已划拨')
            }
          >
            <ProFormSelect
              name="to_agent_id"
              label="直属下级"
              options={targets}
              rules={[{ required: true, message: '请选择下级代理' }]}
              extra="只能划拨本人名下、从未激活的编号；划拨后不可撤回"
            />
            {rangeFields}
          </ModalForm>
        ),
      ]}
    />
  )
}
