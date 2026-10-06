import { useRef } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormDatePicker,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button, Dropdown, Popconfirm } from 'antd'
import { DownOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  activateUser,
  ApiResult,
  createUser,
  deleteUser,
  listUsers,
  patchUser,
  resetUserPassword,
  UserRow,
} from '../api'
import { fmtDate, fmtDateTime, STATUS_LABEL, toEpoch } from '../util'

export default function UsersTable() {
  const { message, modal } = App.useApp()
  const actionRef = useRef<ActionType>()
  const reload = () => actionRef.current?.reload()

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
          !record.activated && (
            <Popconfirm
              key="activate"
              title="激活后初始密码为 123456，确认激活？"
              okText="激活"
              cancelText="取消"
              onConfirm={() => run(activateUser(record.code), '已激活', '激活失败')}
            >
              <a>激活</a>
            </Popconfirm>
          ),
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
      request={async (params) => {
        const all = await listUsers()
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
        const current = params.current ?? 1
        const pageSize = params.pageSize ?? 10
        const start = (current - 1) * pageSize
        return { data: rows.slice(start, start + pageSize), total: rows.length, success: true }
      }}
      toolBarRender={() => [
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
        </ModalForm>,
      ]}
    />
  )
}
