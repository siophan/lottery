import { LoginForm, ProFormText } from '@ant-design/pro-components'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { App } from 'antd'
import { login } from './api'

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const { message } = App.useApp()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
      }}
    >
      <div
        style={{
          width: 360,
          background: '#fff',
          padding: '36px 28px 12px',
          borderRadius: 8,
          boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
        }}
      >
        <LoginForm
          title="lottery mao"
          subTitle="管理后台"
          submitter={{ searchConfig: { submitText: '登录' } }}
          onFinish={async (values: { username: string; password: string }) => {
            const ok = await login(values.username, values.password)
            if (ok) {
              message.success('登录成功')
              onSuccess()
            } else {
              message.error('用户名或密码错误')
            }
            return ok
          }}
        >
          <ProFormText
            name="username"
            fieldProps={{ size: 'large', prefix: <UserOutlined /> }}
            placeholder="管理员用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          />
          <ProFormText.Password
            name="password"
            fieldProps={{ size: 'large', prefix: <LockOutlined /> }}
            placeholder="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          />
        </LoginForm>
      </div>
    </div>
  )
}
