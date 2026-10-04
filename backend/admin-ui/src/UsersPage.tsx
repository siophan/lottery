import { useRef } from 'react'
import {
  ModalForm,
  PageContainer,
  ProColumns,
  ProFormDatePicker,
  ProFormText,
  ProLayout,
  ProTable,
  ActionType,
} from '@ant-design/pro-components'
import { App, Button, Popconfirm, Space, Tag } from 'antd'
import { LogoutOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  createUser,
  deleteUser,
  listUsers,
  logout,
  patchUser,
  UserRow,
} from './api'
import { fmtDate, fmtDateTime, toEpoch } from './util'

export default function UsersPage({
  username,
  onLoggedOut,
}: {
  username: string
  onLoggedOut: () => void
}) {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()
  const reload = () => actionRef.current?.reload()

  const handleLogout = async () => {
    await logout()
    message.success('已退出登录')
    onLoggedOut()
  }

  const columns: ProColumns<UserRow>[] = [
    { title: '编号', dataIndex: 'code', copyable: true },
    {
      title: '状态',
      dataIndex: 'status',
      render: (_, r) =>
        r.status === 'active' ? (
          <Tag color="green">启用</Tag>
        ) : (
          <Tag color="red">停用</Tag>
        ),
    },
    {
      title: '到期',
      dataIndex: 'expires_at',
      render: (_, r) => fmtDate(r.expires_at),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      render: (_, r) => fmtDateTime(r.created_at),
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, record) => [
        <ModalForm
          key="expire"
          title={`改到期 · ${record.code}`}
          trigger={<a>改到期</a>}
          width={360}
          modalProps={{ destroyOnClose: true }}
          initialValues={{
            expires: record.expires_at ? dayjs.unix(record.expires_at) : undefined,
          }}
          onFinish={async (v: { expires?: unknown }) => {
            const ok = await patchUser(record.code, { expires_at: toEpoch(v.expires) })
            if (ok) {
              message.success('到期时间已更新')
              reload()
            } else {
              message.error('更新失败')
            }
            return ok
          }}
        >
          <ProFormDatePicker
            name="expires"
            label="到期日"
            extra="留空表示永久"
            fieldProps={{ style: { width: '100%' } }}
          />
        </ModalForm>,
        <a
          key="toggle"
          onClick={async () => {
            const next = record.status === 'active' ? 'disabled' : 'active'
            const ok = await patchUser(record.code, { status: next })
            if (ok) {
              message.success(next === 'active' ? '已启用' : '已停用')
              reload()
            } else {
              message.error('操作失败')
            }
          }}
        >
          {record.status === 'active' ? '停用' : '启用'}
        </a>,
        <ModalForm
          key="pw"
          title={`重置密码 · ${record.code}`}
          trigger={<a>重置密码</a>}
          width={360}
          modalProps={{ destroyOnClose: true }}
          onFinish={async (v: { password: string }) => {
            const ok = await patchUser(record.code, { password: v.password })
            if (ok) {
              message.success('密码已重置')
            } else {
              message.error('重置失败')
            }
            return ok
          }}
        >
          <ProFormText.Password
            name="password"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }]}
          />
        </ModalForm>,
        <Popconfirm
          key="del"
          title={`确认删除用户 ${record.code}？`}
          okText="删除"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={async () => {
            const ok = await deleteUser(record.code)
            if (ok) {
              message.success('已删除')
              reload()
            } else {
              message.error('删除失败')
            }
          }}
        >
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ]

  return (
    <ProLayout
      title="lottery mao"
      logo={false}
      layout="top"
      fixedHeader
      contentWidth="Fluid"
      menuRender={false}
      location={{ pathname: '/' }}
      actionsRender={() => [
        <span key="user" style={{ color: 'rgba(0,0,0,0.65)' }}>
          {username}
        </span>,
        <a key="logout" onClick={handleLogout}>
          <Space size={4}>
            <LogoutOutlined />
            退出登录
          </Space>
        </a>,
      ]}
    >
      <PageContainer header={{ title: '用户管理' }}>
        <ProTable<UserRow>
          rowKey="code"
          actionRef={actionRef}
          columns={columns}
          search={false}
          pagination={false}
          options={{ reload: true, density: false, setting: false }}
          request={async () => {
            const users = await listUsers()
            return { data: users, success: true }
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
              onFinish={async (v: {
                code: string
                password: string
                expires?: unknown
              }) => {
                const ok = await createUser(
                  (v.code || '').toUpperCase(),
                  v.password,
                  toEpoch(v.expires),
                )
                if (ok) {
                  message.success('已新增用户')
                  reload()
                } else {
                  message.error('新增失败（编号可能已存在）')
                }
                return ok
              }}
            >
              <ProFormText
                name="code"
                label="编号"
                placeholder="如 USER01（自动转大写）"
                rules={[{ required: true, message: '请输入编号' }]}
              />
              <ProFormText.Password
                name="password"
                label="初始密码"
                rules={[{ required: true, message: '请输入初始密码' }]}
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
      </PageContainer>
    </ProLayout>
  )
}
