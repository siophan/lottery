import { useCallback, useEffect, useState } from 'react'
import { Spin } from 'antd'
import { getMe } from './api'
import LoginPage from './LoginPage'
import UsersPage from './UsersPage'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)

  const refreshMe = useCallback(async () => {
    const me = await getMe()
    setUsername(me ? me.username : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    refreshMe()
  }, [refreshMe])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!username) {
    return <LoginPage onSuccess={refreshMe} />
  }

  return <UsersPage username={username} onLoggedOut={() => setUsername(null)} />
}
