import { useRef, useState } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormDependency,
  ProFormDigit,
  ProFormRadio,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button, Popconfirm, Tag, Tooltip, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  adjustAgentPoints,
  AgentInput,
  AgentRow,
  ApiResult,
  createAgent,
  createChildAgent,
  CreateAgentResult,
  CreationLogRow,
  listAgents,
  listCreationLogs,
  Me,
  recycleAgent,
  renameAgent,
  setAgentPassword,
  setAgentStatus,
  updateAgent,
} from '../api'
import {
  AGENT_NO_POINTS_TIP,
  AGENT_STATUS_LABEL,
  fmtDateTime,
  POINTS_AMOUNT_PROPS,
  REGION_LABEL,
  TIER_LABEL,
  TIER_ORDER,
  tierAbove,
  toValueEnum,
} from '../util'

const PASSWORD_RULES = [
  { required: true, message: '请输入密码' },
  { min: 8, max: 64, message: '密码长度需为 8–64 位' },
]
// 开通时密码可留空：服务端生成并只返回一次
const CREATE_PASSWORD_RULES = [{ min: 8, max: 64, message: '密码长度需为 8–64 位' }]
const CREATE_PASSWORD_EXTRA = '留空则自动生成，开通成功后只显示一次'

export default function Agents({ me }: { me: Me }) {
  const { message, modal } = App.useApp()
  const actionRef = useRef<ActionType>()
  const [all, setAll] = useState<AgentRow[]>([])
  const reload = () => actionRef.current?.reload()
  const canRename = me.role === 'super' || me.grants.includes('agent.rename')
  // 代理身份：列表只有本人直属下级，只能开通低于本人级别的代理；编辑 / 资格 / 积分 / 密码等仍是后台人员操作
  const isAgent = me.role === 'agent'
  const childTiers = TIER_ORDER.filter((t) => !!me.agent && tierAbove(me.agent.tier, t))

  const run = async (p: Promise<ApiResult>, okMsg: string) => {
    const r = await p
    if (r.ok) {
      message.success(okMsg)
      reload()
    } else {
      message.error(r.error || '操作失败')
    }
    return r.ok
  }

  // 开通代理：未填密码时弹窗显示服务端生成的密码（只此一次，关闭后无法再查看）
  const runCreate = async (p: Promise<CreateAgentResult>, name: string, okMsg: string) => {
    const r = await p
    if (!r.ok) {
      message.error(r.error || '操作失败')
      return false
    }
    message.success(okMsg)
    reload()
    if (r.generated_password) {
      modal.success({
        title: '已生成登录密码',
        content: (
          <>
            <div>代理名称：{name.trim()}</div>
            <div>
              登录密码：
              <Typography.Text code copyable>
                {r.generated_password}
              </Typography.Text>
            </div>
            <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.45)' }}>
              密码只显示这一次，请复制后交给该代理；忘记后可由后台重置。
            </div>
          </>
        ),
      })
    }
    return true
  }

  // 可做上级的代理：资格激活、级别高于所选级别的代理（排除自己）
  const parentOptions = (tier: string | undefined, selfId?: number) =>
    all
      .filter((a) => a.status === 'active' && a.id !== selfId && (!tier || tierAbove(a.tier, tier)))
      .map((a) => ({ label: `${a.name}（${TIER_LABEL[a.tier] ?? a.tier}）`, value: a.id }))
  const parentSelect = (extra: string, selfId?: number) => (
    <ProFormDependency name={['tier']}>
      {({ tier }) => (
        <ProFormSelect
          name="parent_agent_id"
          label="上级代理"
          options={parentOptions(tier, selfId)}
          fieldProps={{ allowClear: true }}
          extra={extra}
        />
      )}
    </ProFormDependency>
  )

  const columns: ProColumns<AgentRow>[] = [
    { title: '名称', dataIndex: 'name', fieldProps: { placeholder: '按名称搜索' } },
    { title: '地区', dataIndex: 'region', valueType: 'select', valueEnum: toValueEnum(REGION_LABEL) },
    { title: '级别', dataIndex: 'tier', valueType: 'select', valueEnum: toValueEnum(TIER_LABEL) },
    {
      title: '上级',
      dataIndex: 'parent_name',
      hideInSearch: true,
      hideInTable: isAgent,
      render: (_, r) => r.parent_name || '—',
    },
    {
      title: '资格',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: {
        active: { text: AGENT_STATUS_LABEL.active, status: 'Success' },
        paused: { text: AGENT_STATUS_LABEL.paused, status: 'Warning' },
        cancelled: { text: AGENT_STATUS_LABEL.cancelled, status: 'Error' },
      },
      render: (dom, r) => (
        <>
          {r.status_reason ? (
            <Tooltip
              title={`${r.status_by ?? ''} ${r.status_at ? fmtDateTime(r.status_at) : ''}：${r.status_reason}`}
            >
              <span>
                {dom}
                {r.recycled_at ? '（已回收）' : ''}
              </span>
            </Tooltip>
          ) : (
            dom
          )}
          {r.status === 'active' && r.points === 0 && (
            <Tooltip title={AGENT_NO_POINTS_TIP}>
              <Tag color="warning" style={{ marginLeft: 6 }}>
                积分暂停
              </Tag>
            </Tooltip>
          )}
        </>
      ),
    },
    { title: '积分', dataIndex: 'points', hideInSearch: true, sorter: (a, b) => a.points - b.points },
    { title: '总配额', dataIndex: 'total', hideInSearch: true },
    { title: '已激活', dataIndex: 'activated', hideInSearch: true },
    { title: '未激活', dataIndex: 'unactivated', hideInSearch: true },
    { title: '下级数', dataIndex: 'children', hideInSearch: true },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      hideInTable: isAgent,
      render: (_, r) => [
        <ModalForm
          key="edit"
          title={`编辑代理 · ${r.name}`}
          trigger={<a>编辑</a>}
          width={400}
          modalProps={{ destroyOnClose: true }}
          initialValues={{ region: r.region, tier: r.tier, parent_agent_id: r.parent_agent_id ?? undefined }}
          onFinish={async (v: { region: string; tier: string; parent_agent_id?: number }) =>
            run(
              updateAgent(r.id, { region: v.region, tier: v.tier, parent_agent_id: v.parent_agent_id ?? null }),
              '已保存',
            )
          }
        >
          <ProFormSelect name="region" label="地区标签" valueEnum={REGION_LABEL} rules={[{ required: true }]} />
          <ProFormSelect
            name="tier"
            label="级别"
            valueEnum={TIER_LABEL}
            rules={[{ required: true }]}
            extra="总代 > 省代 > 市代；上级须高于下级，市代不能有下级代理"
          />
          {parentSelect('留空表示无上级；须高于所选级别', r.id)}
        </ModalForm>,
        // 已回收的代理不能再恢复，也没有其他可变更的资格，不提供入口
        !r.recycled_at && (
        <ModalForm
          key="status"
          title={`资格变更 · ${r.name}`}
          trigger={<a>资格</a>}
          width={400}
          modalProps={{ destroyOnClose: true }}
          onFinish={async (v: { status: string; reason: string }) =>
            run(setAgentStatus(r.id, v.status, v.reason), '资格已变更')
          }
        >
          <ProFormSelect
            name="status"
            label="新资格状态"
            // 已取消的代理只能恢复为激活；激活/暂停之间可互转，也可取消
            options={Object.entries(AGENT_STATUS_LABEL)
              .filter(([k]) => k !== r.status && (r.status !== 'cancelled' || k === 'active'))
              .map(([value, label]) => ({ value, label }))}
            rules={[{ required: true, message: '请选择资格状态' }]}
            extra="暂停/取消后该代理不能登录后台；取消后名称保留一年，回收前可恢复"
          />
          <ProFormTextArea
            name="reason"
            label="原因"
            rules={[{ required: true, whitespace: true, message: '请填写变更原因' }, { max: 200 }]}
          />
        </ModalForm>
        ),
        canRename && r.status !== 'cancelled' && (
          <ModalForm
            key="rename"
            title={`改名 · ${r.name}`}
            trigger={<a>改名</a>}
            width={400}
            modalProps={{ destroyOnClose: true }}
            onFinish={async (v: { name: string }) => run(renameAgent(r.id, v.name), '已改名')}
          >
            <ProFormText
              name="name"
              label="新名称"
              rules={[{ required: true, whitespace: true, message: '请输入新名称' }, { max: 20 }]}
              extra="旧名称保留一年，期间他人不能使用；登录用户名同步改为新名称"
            />
          </ModalForm>
        ),
        <ModalForm
          key="points"
          title={`积分 · ${r.name}（当前 ${r.points}）`}
          trigger={<a>积分</a>}
          width={400}
          modalProps={{ destroyOnClose: true }}
          initialValues={{ op: 'grant' }}
          onFinish={async (v: { op: 'grant' | 'revoke'; amount: number; reason?: string }) =>
            run(adjustAgentPoints(r.id, v.op, v.amount, v.reason), v.op === 'grant' ? '已加分' : '已扣分')
          }
        >
          <ProFormRadio.Group
            name="op"
            label="操作"
            options={[
              { label: '加分', value: 'grant' },
              { label: '扣分', value: 'revoke' },
            ]}
            extra="加分要求代理资格为激活；扣分必须填写原因，最多扣到 0。积分为 0 的代理自动暂停、不能登录后台"
          />
          <ProFormDigit
            name="amount"
            label="积分"
            rules={[{ required: true, message: '请输入积分数量' }]}
            fieldProps={POINTS_AMOUNT_PROPS}
          />
          <ProFormTextArea
            name="reason"
            label="原因"
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
        <ModalForm
          key="password"
          title={`重置登录密码 · ${r.name}`}
          trigger={<a>重置密码</a>}
          width={400}
          modalProps={{ destroyOnClose: true }}
          onFinish={async (v: { password: string }) => run(setAgentPassword(r.id, v.password), '密码已重置')}
        >
          <ProFormText.Password name="password" label="新密码" rules={PASSWORD_RULES} />
        </ModalForm>,
        r.status === 'cancelled' && !r.recycled_at && (
          <Popconfirm
            key="recycle"
            title="回收后：名下未激活编号变为未分配，下级代理解除上级关系，且该代理不能再恢复。确认回收？"
            okText="回收"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => run(recycleAgent(r.id), '已回收')}
          >
            <a style={{ color: '#ff4d4f' }}>回收</a>
          </Popconfirm>
        ),
      ],
    },
  ]

  const logColumns: ProColumns<CreationLogRow>[] = [
    { title: '开通时间', dataIndex: 'created_at', render: (_, r) => fmtDateTime(r.created_at) },
    { title: '代理名称', dataIndex: 'name' },
    { title: '开通方', dataIndex: 'actor', render: (_, r) => (r.actor_type === 'agent' ? r.actor : '后台') },
  ]

  return (
    <>
      <ProTable<AgentRow>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        cardBordered
        search={{ labelWidth: 'auto' }}
        options={{ reload: true, density: false, setting: true }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        // 行数据里的 children 是「下级数」（数字），不是树形子行；改掉 antd 默认的树形字段名，否则表格渲染崩溃。
        expandable={{ childrenColumnName: '__no_tree__' }}
        request={async (params) => {
          const rows = await listAgents()
          setAll(rows)
          const kw = params.name ? String(params.name).toLowerCase() : ''
          const data = rows.filter(
            (a) =>
              (!kw || a.name.toLowerCase().includes(kw)) &&
              (!params.region || a.region === params.region) &&
              (!params.tier || a.tier === params.tier) &&
              (!params.status || a.status === params.status),
          )
          return { data, total: data.length, success: true }
        }}
        toolBarRender={() => [
          isAgent ? (
            <ModalForm
              key="create-child"
              title="开通下级代理"
              width={420}
              modalProps={{ destroyOnClose: true }}
              trigger={
                <Button type="primary" icon={<PlusOutlined />}>
                  开通下级代理
                </Button>
              }
              initialValues={{ tier: childTiers[0] }}
              onFinish={async (v: { name: string; tier: string; password?: string }) =>
                runCreate(createChildAgent(v.name, v.tier, v.password), v.name, '已开通下级代理')
              }
            >
              <ProFormText
                name="name"
                label="代理名称"
                rules={[{ required: true, whitespace: true, message: '请输入名称' }, { max: 20 }]}
                extra="全局唯一（不区分大小写），同时作为后台登录用户名"
              />
              <ProFormText.Password
                name="password"
                label="登录密码"
                rules={CREATE_PASSWORD_RULES}
                extra={CREATE_PASSWORD_EXTRA}
              />
              <ProFormSelect
                name="tier"
                label="级别"
                options={childTiers.map((t) => ({ label: TIER_LABEL[t], value: t }))}
                rules={[{ required: true }]}
                extra="只能开通低于自身级别的代理"
              />
              <div style={{ color: 'rgba(0,0,0,0.45)' }}>
                新代理挂在你名下，地区标签与你相同。积分为 0 时不能登录，请在「编号划拨」页给他转积分。
              </div>
            </ModalForm>
          ) : (
            <ModalForm
              key="create"
              title="新建代理"
              width={420}
              modalProps={{ destroyOnClose: true }}
              trigger={
                <Button type="primary" icon={<PlusOutlined />}>
                  新建代理
                </Button>
              }
              onFinish={async (v: AgentInput & { parent_agent_id?: number }) =>
                runCreate(
                  createAgent({ ...v, password: v.password || undefined, parent_agent_id: v.parent_agent_id ?? null }),
                  v.name,
                  '已新建代理',
                )
              }
            >
              <ProFormText
                name="name"
                label="代理名称"
                rules={[{ required: true, whitespace: true, message: '请输入名称' }, { max: 20 }]}
                extra="全局唯一（不区分大小写），同时作为后台登录用户名"
              />
              <ProFormText.Password
                name="password"
                label="登录密码"
                rules={CREATE_PASSWORD_RULES}
                extra={CREATE_PASSWORD_EXTRA}
              />
              <ProFormSelect name="region" label="地区标签" valueEnum={REGION_LABEL} rules={[{ required: true }]} />
              <ProFormSelect name="tier" label="级别" valueEnum={TIER_LABEL} rules={[{ required: true }]} />
              {parentSelect('可选；须是资格激活、级别高于所选级别的代理')}
            </ModalForm>
          ),
        ]}
      />
      {isAgent && (
        <ProTable<CreationLogRow>
          style={{ marginTop: 16 }}
          rowKey="id"
          headerTitle="开通记录"
          columns={logColumns}
          cardBordered
          search={false}
          options={{ reload: true, density: false, setting: false }}
          pagination={{ pageSize: 10 }}
          params={{ all }} // 列表刷新（如刚开通）时一起刷新
          request={async (params) => {
            const pageSize = params.pageSize ?? 10
            const { logs, total } = await listCreationLogs(pageSize, ((params.current ?? 1) - 1) * pageSize)
            return { data: logs, total, success: true }
          }}
        />
      )}
    </>
  )
}
