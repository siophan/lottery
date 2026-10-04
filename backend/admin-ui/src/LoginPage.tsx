import { LoginForm, ProFormText } from '@ant-design/pro-components'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { App } from 'antd'
import { login } from './api'
import { BRAND, Logo, SUBTITLE } from './branding'

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const { message } = App.useApp()

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(160deg,#eef3ff 0%,#f5f7fb 55%,#f0f2f5 100%)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#fff',
          padding: '40px 32px 8px',
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(22,119,255,0.10)',
        }}
      >
        <LoginForm
          logo={<Logo size={44} />}
          title={BRAND}
          subTitle={SUBTITLE}
          submitter={{ searchConfig: { submitText: '登 录' } }}
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
