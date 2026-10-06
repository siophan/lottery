import { useCallback, useEffect, useState } from 'react'
import { Spin } from 'antd'
import { getMe, Me } from './api'
import LoginPage from './LoginPage'
import MainLayout from './MainLayout'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<Me | null>(null)

  const refreshMe = useCallback(async () => {
    setMe(await getMe())
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

  if (!me) {
    return <LoginPage onSuccess={refreshMe} />
  }

  return <MainLayout me={me} onLoggedOut={() => setMe(null)} />
}
