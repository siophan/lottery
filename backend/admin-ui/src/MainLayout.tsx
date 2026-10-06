import { useState } from 'react'
import { PageContainer, ProLayout } from '@ant-design/pro-components'
import { App, Dropdown } from 'antd'
import { ApiOutlined, DashboardOutlined, FileSearchOutlined, LogoutOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { logout } from './api'
import { BRAND, Logo } from './branding'
import AuditLogs from './pages/AuditLogs'
import Dashboard from './pages/Dashboard'
import DataSources from './pages/DataSources'
import UsersTable from './pages/UsersTable'

const ROUTE = {
  path: '/',
  routes: [
    { path: '/dashboard', name: '概览', icon: <DashboardOutlined /> },
    { path: '/users', name: '用户管理', icon: <TeamOutlined /> },
    { path: '/data-sources', name: '数据源', icon: <ApiOutlined /> },
    { path: '/audit-logs', name: '操作日志', icon: <FileSearchOutlined /> },
  ],
}

const TITLES: Record<string, string> = {
  '/dashboard': '概览',
  '/users': '用户管理',
  '/data-sources': '数据源',
  '/audit-logs': '操作日志',
}

export default function MainLayout({
  username,
  onLoggedOut,
}: {
  username: string
  onLoggedOut: () => void
}) {
  const { message } = App.useApp()
  const [pathname, setPathname] = useState('/dashboard')

  const handleLogout = async () => {
    await logout()
    message.success('已退出登录')
    onLoggedOut()
  }

  return (
    <ProLayout
      title={BRAND}
      logo={<Logo />}
      layout="mix"
      fixedHeader
      fixSiderbar
      route={ROUTE}
      location={{ pathname }}
      menuItemRender={(item, dom) => (
        <a onClick={() => item.path && setPathname(item.path)}>{dom}</a>
      )}
      avatarProps={{
        icon: <UserOutlined />,
        size: 'small',
        title: username,
        render: (_, dom) => (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: handleLogout,
                },
              ],
            }}
          >
            {dom}
          </Dropdown>
        ),
      }}
    >
      <PageContainer header={{ title: TITLES[pathname] }}>
        {pathname === '/dashboard' ? (
          <Dashboard />
        ) : pathname === '/users' ? (
          <UsersTable />
        ) : pathname === '/audit-logs' ? (
          <AuditLogs />
        ) : (
          <DataSources />
        )}
      </PageContainer>
    </ProLayout>
  )
}
