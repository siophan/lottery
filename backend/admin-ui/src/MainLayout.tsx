import { ReactNode, useState } from 'react'
import { PageContainer, ProLayout } from '@ant-design/pro-components'
import { App, Dropdown } from 'antd'
import {
  ApartmentOutlined,
  ApiOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  LogoutOutlined,
  PartitionOutlined,
  SafetyOutlined,
  TeamOutlined,
  TransactionOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { logout, Me } from './api'
import { BRAND, Logo } from './branding'
import Agents from './pages/Agents'
import AuditLogs from './pages/AuditLogs'
import Dashboard from './pages/Dashboard'
import DataSources from './pages/DataSources'
import PointsLedger from './pages/PointsLedger'
import Segments from './pages/Segments'
import Staff from './pages/Staff'
import TrialSettings from './pages/TrialSettings'
import UsersTable from './pages/UsersTable'
import { ROLE_LABEL } from './util'

interface MenuRoute {
  path: string
  name: string
  icon: ReactNode
}

// 菜单按角色裁剪（只是辅助：权限以服务端校验为准）。
function routesFor(me: Me): MenuRoute[] {
  if (me.role === 'agent') {
    return [
      { path: '/users', name: '我的账号', icon: <TeamOutlined /> },
      {
        path: '/segments',
        name: me.agent?.tier === 'senior' ? '编号划拨' : '编号流水',
        icon: <PartitionOutlined />,
      },
      { path: '/points-ledger', name: '积分流水', icon: <TransactionOutlined /> },
    ]
  }
  const routes: MenuRoute[] = [
    { path: '/dashboard', name: '概览', icon: <DashboardOutlined /> },
    { path: '/users', name: '用户管理', icon: <TeamOutlined /> },
    { path: '/agents', name: '代理管理', icon: <ApartmentOutlined /> },
    { path: '/segments', name: '号段管理', icon: <PartitionOutlined /> },
    { path: '/points-ledger', name: '积分流水', icon: <TransactionOutlined /> },
    { path: '/trial', name: '体验期设置', icon: <ExperimentOutlined /> },
    { path: '/data-sources', name: '数据源', icon: <ApiOutlined /> },
    { path: '/audit-logs', name: '操作日志', icon: <FileSearchOutlined /> },
  ]
  if (me.role === 'super') {
    routes.push({ path: '/staff', name: '管理员与授权', icon: <SafetyOutlined /> })
  }
  return routes
}

function renderPage(pathname: string, me: Me): ReactNode {
  switch (pathname) {
    case '/dashboard':
      return <Dashboard />
    case '/users':
      return <UsersTable me={me} />
    case '/agents':
      return <Agents me={me} />
    case '/segments':
      return <Segments me={me} />
    case '/data-sources':
      return <DataSources />
    case '/points-ledger':
      return <PointsLedger me={me} />
    case '/trial':
      return <TrialSettings />
    case '/audit-logs':
      return <AuditLogs />
    case '/staff':
      return <Staff />
    default:
      return null
  }
}

export default function MainLayout({ me, onLoggedOut }: { me: Me; onLoggedOut: () => void }) {
  const { message } = App.useApp()
  const routes = routesFor(me)
  const [pathname, setPathname] = useState(routes[0].path)
  const title = routes.find((r) => r.path === pathname)?.name

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
      route={{ path: '/', routes }}
      location={{ pathname }}
      menuItemRender={(item, dom) => (
        <a onClick={() => item.path && setPathname(item.path)}>{dom}</a>
      )}
      avatarProps={{
        icon: <UserOutlined />,
        size: 'small',
        title: `${me.username}（${ROLE_LABEL[me.role] ?? me.role}）`,
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
      <PageContainer header={{ title }}>{renderPage(pathname, me)}</PageContainer>
    </ProLayout>
  )
}
