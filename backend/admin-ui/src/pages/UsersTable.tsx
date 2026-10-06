import { Key, useEffect, useRef, useState } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormDatePicker,
  ProFormDigit,
  ProFormRadio,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button, Dropdown, Popconfirm, Tag } from 'antd'
import { DownOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  activateUser,
  adjustUserPoints,
  ApiResult,
  batchRecharge,
  createUser,
  deleteUser,
  getMe,
  listAgents,
  listUsers,
  Me,
  patchUser,
  PointsResult,
  rechargeUser,
  resetUserPassword,
  UserRow,
} from '../api'
import {
  fmtDate,
  fmtDateTime,
  NUMBER_STATUS_LABEL,
  POINTS_AMOUNT_PROPS,
  STATUS_LABEL,
  toEpoch,
  toValueEnum,
} from '../util'

const AMOUNT_RULES = [{ required: true, message: '请输入积分数量' }]

// 后台人员：全部账号 + 全部操作（含加分 / 扣分 / 批量充值）；
// 代理：只读本人名下账号，可激活待激活账号、用自身积分给名下账号充值 / 批量充值。
export default function UsersTable({ me }: { me: Me }) {
  const { message, modal } = App.useApp()
  const actionRef = useRef<ActionType>()
  const reload = () => actionRef.current?.reload()
  const isAgent = me.role === 'agent'
  const [agentEnum, setAgentEnum] = useState<Record<string, { text: string }>>({})
  const [selected, setSelected] = useState<Key[]>([])
  const [myPoints, setMyPoints] = useState<number | null>(me.agent?.points ?? null)

  useEffect(() => {
    if (isAgent) return
    listAgents()
      .then((rows) => setAgentEnum(Object.fromEntries(rows.map((a) => [String(a.id), { text: a.name }]))))
      .catch(() => setAgentEnum({}))
  }, [isAgent])

  // 统一处理接口结果：成功提示并刷新，失败优先显示后端 error 文案。
  const run = async (p: Promise<ApiResult>, okMsg: string, failMsg: string) => {
    const r = await p
    if (r.ok) {
      message.success(okMsg)
      reload()
    } else {
      message.error(r.error || failMsg)
    }
    return r.ok
  }

  // 积分操作：成功后刷新列表；代理同时刷新本人余额（后端返回的 balance 即代理剩余积分）
  const runPoints = async (p: Promise<PointsResult>, okMsg: (r: PointsResult) => string) => {
    const r = await p
    if (r.ok) {
      message.success(okMsg(r))
      if (isAgent && typeof r.balance === 'number') setMyPoints(r.balance)
      reload()
    } else {
      message.error(r.error || '操作失败')
    }
    return r.ok
  }

  const setStatus = (code: string, status: string, okMsg: string) =>
    run(patchUser(code, { status }), okMsg, '操作失败')

  const columns: ProColumns<UserRow>[] = [
    {
      title: '编号',
      dataIndex: 'code',
      copyable: true,
      fieldProps: { placeholder: '按编号搜索' },
    },
    {
      title: '编号状态',
      dataIndex: 'number_status',
      valueType: 'select',
      valueEnum: toValueEnum(NUMBER_STATUS_LABEL),
      render: (dom, r) => (r.number_status === 'arrears' ? <Tag color="red">{dom}</Tag> : dom),
    },
    {
      title: '积分余额',
      dataIndex: 'points',
      hideInSearch: true,
      sorter: true, // 排序在 request 里对全表做（分页前），不是只排当前页
    },
    {
      title: '归属代理',
      dataIndex: 'agent_id',
      valueType: 'select',
      valueEnum: agentEnum,
      hideInTable: isAgent,
      hideInSearch: isAgent,
      fieldProps: { showSearch: true },
      render: (_, r) => r.agent_name || '—',
    },
    {
      title: '激活状态',
      dataIndex: 'activated',
      valueType: 'select',
      valueEnum: {
        false: { text: '待激活', status: 'Default' },
        true: { text: '已激活', status: 'Success' },
      },
    },
    {
      title: '使用控制',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: {
        active: { text: STATUS_LABEL.active, status: 'Success' },
        disabled: { text: STATUS_LABEL.disabled, status: 'Warning' },
        banned: { text: STATUS_LABEL.banned, status: 'Error' },
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      hideInSearch: true,
      render: (_, r) => r.phone || '—',
    },
    {
      title: '首登',
      dataIndex: 'onboarded',
      hideInSearch: true,
      render: (_, r) => (r.onboarded ? '已完成' : '未完成'),
    },
    {
      title: '到期',
      dataIndex: 'expires_at',
      hideInSearch: true,
      render: (_, r) => fmtDate(r.expires_at),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      hideInSearch: true,
      render: (_, r) => fmtDateTime(r.created_at),
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, record) => {
        const activate = !record.activated && (
          <Popconfirm
            key="activate"
            title="激活后初始密码为 123456，确认激活？"
            okText="激活"
            cancelText="取消"
            onConfirm={() => run(activateUser(record.code), '已激活', '激活失败')}
          >
            <a>激活</a>
          </Popconfirm>
        )
        if (isAgent) {
          return [
            activate,
            <ModalForm
              key="recharge"
              title={`充值 · ${record.code}`}
              trigger={<a>充值</a>}
              width={360}
              modalProps={{ destroyOnClose: true }}
              onFinish={async (v: { amount: number }) =>
                runPoints(rechargeUser(record.code, v.amount), (r) => `已充值，你的剩余积分 ${r.balance}`)
              }
            >
              <ProFormDigit
                name="amount"
                label="充值积分"
                rules={AMOUNT_RULES}
                fieldProps={POINTS_AMOUNT_PROPS}
                extra={`从你的积分中扣除（当前 ${myPoints ?? '—'}）；未激活账号也可预充`}
              />
            </ModalForm>,
          ]
        }
        // 不常用 / 有风险的操作收进「更多」，确认走 modal.confirm（Dropdown 内无法嵌 Popconfirm）。
        const more = [
          record.status !== 'banned' && {
            key: 'ban',
            label: '封禁',
            danger: true,
            onClick: () =>
              modal.confirm({
                title: `确认封禁账号 ${record.code}？`,
                content: '封禁后该账号立即下线且无法登录，可通过「恢复」解除。',
                okText: '封禁',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => setStatus(record.code, 'banned', '已封禁'),
              }),
          },
          record.activated && {
            key: 'reset',
            label: '重置密码',
            onClick: () =>
              modal.confirm({
                title: `重置账号 ${record.code} 的密码？`,
                content: '密码将重置为 123456，用户下次登录需重新修改密码并验证手机号，确认？',
                okText: '确认重置',
                cancelText: '取消',
                onOk: () => run(resetUserPassword(record.code), '密码已重置为初始密码', '重置失败'),
              }),
          },
          {
            key: 'del',
            label: '删除',
            danger: true,
            onClick: () =>
              modal.confirm({
                title: `确认删除用户 ${record.code}？`,
                okText: '删除',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => run(deleteUser(record.code), '已删除', '删除失败'),
              }),
          },
        ].filter(Boolean) as { key: string; label: string; danger?: boolean; onClick: () => void }[]

        return [
          activate,
          record.status === 'active' ? (
            <a key="pause" onClick={() => setStatus(record.code, 'disabled', '已暂停')}>
              暂停
            </a>
          ) : (
            <a key="resume" onClick={() => setStatus(record.code, 'active', '已恢复')}>
              恢复
            </a>
          ),
          <ModalForm
            key="expire"
            title={`改到期 · ${record.code}`}
            trigger={<a>改到期</a>}
            width={360}
            modalProps={{ destroyOnClose: true }}
            initialValues={{
              expires: record.expires_at ? dayjs.unix(record.expires_at) : undefined,
            }}
            onFinish={async (v: { expires?: unknown }) =>
              run(patchUser(record.code, { expires_at: toEpoch(v.expires) }), '到期时间已更新', '更新失败')
            }
          >
            <ProFormDatePicker
              name="expires"
              label="到期日"
              extra="留空表示永久"
              fieldProps={{ style: { width: '100%' } }}
            />
          </ModalForm>,
          <ModalForm
            key="points"
            title={`积分 · ${record.code}（当前 ${record.points}）`}
            trigger={<a>积分</a>}
            width={400}
            modalProps={{ destroyOnClose: true }}
            initialValues={{ op: 'grant' }}
            onFinish={async (v: { op: 'grant' | 'revoke'; amount: number; reason?: string }) =>
              runPoints(adjustUserPoints(record.code, v.op, v.amount, v.reason), (r) =>
                v.op === 'grant' ? `已加分，余额 ${r.balance}` : `已扣 ${r.amount} 分，余额 ${r.balance}`,
              )
            }
          >
            <ProFormRadio.Group
              name="op"
              label="操作"
              options={[
                { label: '加分', value: 'grant' },
                { label: '扣分', value: 'revoke' },
              ]}
            />
            <ProFormDigit name="amount" label="积分" rules={AMOUNT_RULES} fieldProps={POINTS_AMOUNT_PROPS} />
            <ProFormTextArea
              name="reason"
              label="原因"
              extra="扣分必须填写原因，最多扣到 0"
              rules={[
                ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
                  validator: (_: unknown, v?: string) =>
                    getFieldValue('op') === 'revoke' && !(v || '').trim()
                      ? Promise.reject(new Error('请填写扣分原因'))
                      : Promise.resolve(),
                }),
                { max: 200 },
              ]}
            />
          </ModalForm>,
          <Dropdown key="more" menu={{ items: more }} trigger={['click']}>
            <a onClick={(e) => e.preventDefault()}>
              更多 <DownOutlined />
            </a>
          </Dropdown>,
        ]
      },
    },
  ]

  return (
    <ProTable<UserRow>
      rowKey="code"
      actionRef={actionRef}
      columns={columns}
      cardBordered
      search={{ labelWidth: 'auto' }}
      options={{ reload: true, density: false, setting: true }}
      pagination={{ pageSize: 10, showSizeChanger: true }}
      headerTitle={isAgent ? `我的积分：${myPoints ?? '—'}` : undefined}
      // 跨页保留勾选，批量充值可一次选多页（单次最多 1000 个）
      rowSelection={{ selectedRowKeys: selected, onChange: setSelected, preserveSelectedRowKeys: true }}
      tableAlertOptionRender={() => <a onClick={() => setSelected([])}>清空选择</a>}
      request={async (params, sort) => {
        if (isAgent) {
          getMe()
            .then((m) => setMyPoints(m?.agent?.points ?? null))
            .catch(() => undefined)
        }
        const all = await listUsers(!isAgent && params.agent_id ? Number(params.agent_id) : undefined)
        let rows = all
        if (params.code) {
          const kw = String(params.code).toLowerCase()
          rows = rows.filter((u) => u.code.toLowerCase().includes(kw))
        }
        if (params.status) {
          rows = rows.filter((u) => u.status === params.status)
        }
        if (params.activated) {
          rows = rows.filter((u) => String(u.activated) === params.activated)
        }
        if (params.number_status) {
          rows = rows.filter((u) => u.number_status === params.number_status)
        }
        if (sort.points) {
          const dir = sort.points === 'ascend' ? 1 : -1
          rows = [...rows].sort((a, b) => dir * (a.points - b.points))
        }
        const current = params.current ?? 1
        const pageSize = params.pageSize ?? 10
        const start = (current - 1) * pageSize
        return { data: rows.slice(start, start + pageSize), total: rows.length, success: true }
      }}
      toolBarRender={() => [
        <ModalForm
          key="batch"
          title={`批量充值（已选 ${selected.length} 个账号）`}
          width={400}
          modalProps={{ destroyOnClose: true }}
          trigger={
            <Button disabled={selected.length === 0 || selected.length > 1000}>
              批量充值{selected.length ? `（${selected.length}）` : ''}
            </Button>
          }
          onFinish={async (v: { amount: number; reason?: string }) => {
            const ok = await runPoints(
              batchRecharge(selected.map(String), v.amount, v.reason),
              (r) => `已为 ${r.count} 个账号各充值 ${v.amount} 分` + (isAgent ? `，你的剩余积分 ${r.balance}` : ''),
            )
            if (ok) setSelected([])
            return ok
          }}
        >
          <ProFormDigit
            name="amount"
            label="每个账号充值积分"
            rules={AMOUNT_RULES}
            fieldProps={POINTS_AMOUNT_PROPS}
            extra={
              isAgent
                ? `按总额从你的积分中扣除（当前 ${myPoints ?? '—'}），余额不足则整批失败`
                : '全有或全无：任一账号不存在则整批失败'
            }
          />
          <ProFormText name="reason" label="备注" rules={[{ max: 200 }]} />
        </ModalForm>,
        !isAgent && (
          <ModalForm
            key="create"
            title="新增用户"
            width={400}
            modalProps={{ destroyOnClose: true }}
            trigger={
              <Button type="primary" icon={<PlusOutlined />}>
                新增用户
              </Button>
            }
            onFinish={async (v: { code: string; expires?: unknown }) =>
              run(
                createUser((v.code || '').trim().toUpperCase(), toEpoch(v.expires)),
                '已新增用户（待激活）',
                '新增失败',
              )
            }
          >
            <ProFormText
              name="code"
              label="编号"
              placeholder="如 USER01（自动转大写）"
              rules={[{ required: true, message: '请输入编号' }]}
              extra="新建账号为待激活状态，激活后初始密码为 123456"
            />
            <ProFormDatePicker
              name="expires"
              label="到期日"
              extra="留空表示永久"
              fieldProps={{ style: { width: '100%' } }}
            />
          </ModalForm>
        ),
      ]}
    />
  )
}
