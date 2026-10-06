import { useRef } from 'react'
import { ActionType, ModalForm, ProColumns, ProFormText, ProTable } from '@ant-design/pro-components'
import { App, Button, Popconfirm, Switch } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  AdminRow,
  addGrant,
  ApiResult,
  createAdmin,
  deleteAdmin,
  listAdmins,
  revokeGrant,
  setAdminPassword,
} from '../api'
import { fmtDateTime, ROLE_LABEL } from '../util'

const RENAME = 'agent.rename'
const PASSWORD_RULES = [
  { required: true, message: '请输入密码' },
  { min: 8, max: 64, message: '密码长度需为 8–64 位' },
]

// 仅最高权限者可见：管理员账号管理 + 「代理改名」授权（被授权者不能转授）。
export default function Staff() {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()

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

  const columns: ProColumns<AdminRow>[] = [
    { title: '用户名', dataIndex: 'username' },
    { title: '角色', dataIndex: 'role', render: (_, r) => ROLE_LABEL[r.role] ?? r.role },
    { title: '创建时间', dataIndex: 'created_at', render: (_, r) => fmtDateTime(r.created_at) },
    {
      title: '代理改名授权',
      dataIndex: 'grants',
      render: (_, r) =>
        r.role === 'super' ? (
          '（固有）'
        ) : (
          <Switch
            checked={r.grants.includes(RENAME)}
            onChange={(on) =>
              run(on ? addGrant(r.id, RENAME) : revokeGrant(r.id, RENAME), on ? '已授权' : '已撤销授权')
            }
          />
        ),
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, r) =>
        r.role === 'super'
          ? ['最高权限者由服务器命令指定']
          : [
              <ModalForm
                key="pw"
                title={`重置密码 · ${r.username}`}
                trigger={<a>重置密码</a>}
                width={400}
                modalProps={{ destroyOnClose: true }}
                onFinish={async (v: { password: string }) => run(setAdminPassword(r.id, v.password), '密码已重置')}
              >
                <ProFormText.Password name="password" label="新密码" rules={PASSWORD_RULES} />
              </ModalForm>,
              <Popconfirm
                key="del"
                title={`确认删除管理员 ${r.username}？`}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={() => run(deleteAdmin(r.id), '已删除')}
              >
                <a style={{ color: '#ff4d4f' }}>删除</a>
              </Popconfirm>,
            ],
    },
  ]

  return (
    <ProTable<AdminRow>
      rowKey="id"
      actionRef={actionRef}
      columns={columns}
      cardBordered
      search={false}
      headerTitle="管理员"
      options={{ reload: true, density: false, setting: false }}
      pagination={false}
      request={async () => {
        const data = await listAdmins()
        return { data, total: data.length, success: true }
      }}
      toolBarRender={() => [
        <ModalForm
          key="create"
          title="新建管理员"
          width={400}
          modalProps={{ destroyOnClose: true }}
          trigger={
            <Button type="primary" icon={<PlusOutlined />}>
              新建管理员
            </Button>
          }
          onFinish={async (v: { username: string; password: string }) =>
            run(createAdmin(v.username, v.password), '已新建管理员')
          }
        >
          <ProFormText
            name="username"
            label="用户名"
            rules={[{ required: true, whitespace: true, message: '请输入用户名' }, { max: 20 }]}
          />
          <ProFormText.Password name="password" label="密码" rules={PASSWORD_RULES} />
        </ModalForm>,
      ]}
    />
  )
}
