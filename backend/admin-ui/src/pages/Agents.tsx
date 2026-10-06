import { useRef, useState } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button, Popconfirm, Tooltip } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  AgentInput,
  AgentRow,
  ApiResult,
  createAgent,
  listAgents,
  Me,
  recycleAgent,
  renameAgent,
  setAgentPassword,
  setAgentStatus,
  updateAgent,
} from '../api'
import {
  AGENT_STATUS_LABEL,
  fmtDateTime,
  REGION_LABEL,
  TIER_LABEL,
  toValueEnum,
} from '../util'

const PASSWORD_RULES = [
  { required: true, message: '请输入密码' },
  { min: 8, max: 64, message: '密码长度需为 8–64 位' },
]

export default function Agents({ me }: { me: Me }) {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()
  const [all, setAll] = useState<AgentRow[]>([])
  const reload = () => actionRef.current?.reload()
  const canRename = me.role === 'super' || me.grants.includes('agent.rename')

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

  // 可做上级的代理：资格激活的高级代理（排除自己）
  const parentOptions = (selfId?: number) =>
    all
      .filter((a) => a.tier === 'senior' && a.status === 'active' && a.id !== selfId)
      .map((a) => ({ label: a.name, value: a.id }))

  const columns: ProColumns<AgentRow>[] = [
    { title: '名称', dataIndex: 'name', fieldProps: { placeholder: '按名称搜索' } },
    { title: '地区', dataIndex: 'region', valueType: 'select', valueEnum: toValueEnum(REGION_LABEL) },
    { title: '级别', dataIndex: 'tier', valueType: 'select', valueEnum: toValueEnum(TIER_LABEL) },
    { title: '上级', dataIndex: 'parent_name', hideInSearch: true, render: (_, r) => r.parent_name || '—' },
    {
      title: '资格',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: {
        active: { text: AGENT_STATUS_LABEL.active, status: 'Success' },
        paused: { text: AGENT_STATUS_LABEL.paused, status: 'Warning' },
        cancelled: { text: AGENT_STATUS_LABEL.cancelled, status: 'Error' },
      },
      render: (dom, r) =>
        r.status_reason ? (
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
        ),
    },
    { title: '总配额', dataIndex: 'total', hideInSearch: true },
    { title: '已激活', dataIndex: 'activated', hideInSearch: true },
    { title: '未激活', dataIndex: 'unactivated', hideInSearch: true },
    { title: '下级数', dataIndex: 'children', hideInSearch: true },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
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
            extra="只有高级代理可以有下级、向下划拨编号"
          />
          <ProFormSelect
            name="parent_agent_id"
            label="上级代理"
            options={parentOptions(r.id)}
            fieldProps={{ allowClear: true }}
            extra="留空表示无上级"
          />
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

  return (
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
            run(createAgent({ ...v, parent_agent_id: v.parent_agent_id ?? null }), '已新建代理')
          }
        >
          <ProFormText
            name="name"
            label="代理名称"
            rules={[{ required: true, whitespace: true, message: '请输入名称' }, { max: 20 }]}
            extra="全局唯一（不区分大小写），同时作为后台登录用户名"
          />
          <ProFormText.Password name="password" label="登录密码" rules={PASSWORD_RULES} />
          <ProFormSelect name="region" label="地区标签" valueEnum={REGION_LABEL} rules={[{ required: true }]} />
          <ProFormSelect name="tier" label="级别" valueEnum={TIER_LABEL} rules={[{ required: true }]} />
          <ProFormSelect
            name="parent_agent_id"
            label="上级代理"
            options={parentOptions()}
            fieldProps={{ allowClear: true }}
            extra="可选；必须是资格激活的高级代理"
          />
        </ModalForm>,
      ]}
    />
  )
}
