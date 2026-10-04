import { useCallback, useEffect, useState } from 'react'
import { StatisticCard } from '@ant-design/pro-components'
import { App, Button, Spin } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { listUsers } from '../api'

interface Stats {
  total: number
  active: number
  disabled: number
  soon: number
  expired: number
}

const ZERO: Stats = { total: 0, active: 0, disabled: 0, soon: 0, expired: 0 }

export default function Dashboard() {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>(ZERO)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const users = await listUsers()
      const now = Math.floor(Date.now() / 1000)
      const week = now + 7 * 86400
      setStats({
        total: users.length,
        active: users.filter((u) => u.status === 'active').length,
        disabled: users.filter((u) => u.status === 'disabled').length,
        expired: users.filter((u) => u.expires_at != null && u.expires_at < now).length,
        soon: users.filter(
          (u) => u.expires_at != null && u.expires_at >= now && u.expires_at <= week,
        ).length,
      })
    } catch {
      message.error('加载统计失败')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </div>
      <StatisticCard.Group direction="row">
        <StatisticCard statistic={{ title: '总用户数', value: stats.total }} />
        <StatisticCard.Divider />
        <StatisticCard
          statistic={{ title: '启用', value: stats.active, valueStyle: { color: '#3f8600' } }}
        />
        <StatisticCard.Divider />
        <StatisticCard
          statistic={{ title: '停用', value: stats.disabled, valueStyle: { color: '#cf1322' } }}
        />
        <StatisticCard.Divider />
        <StatisticCard
          statistic={{
            title: '7 天内到期',
            value: stats.soon,
            valueStyle: { color: '#d46b08' },
          }}
        />
        <StatisticCard.Divider />
        <StatisticCard
          statistic={{ title: '已过期', value: stats.expired, valueStyle: { color: '#8c8c8c' } }}
        />
      </StatisticCard.Group>
    </Spin>
  )
}
