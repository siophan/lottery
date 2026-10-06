import { useEffect, useState } from 'react'
import { ProCard, ProForm, ProFormDigit, ProFormSwitch } from '@ant-design/pro-components'
import { App, Descriptions, Spin } from 'antd'
import { getTrialSettings, saveTrialSettings, TrialSettings as Trial } from '../api'

// 体验期设置（仅后台人员）：只有开关与赠送分数可改；首次扣减延迟与扣减周期固定 24 小时，只读显示。
export default function TrialSettings() {
  const { message } = App.useApp()
  const [cfg, setCfg] = useState<Trial | null>(null)

  useEffect(() => {
    getTrialSettings()
      .then(setCfg)
      .catch(() => message.error('读取体验期设置失败'))
  }, [message])

  if (!cfg) return <Spin />

  return (
    <ProCard>
      <ProForm<{ trial_enabled: boolean; trial_points: number }>
        initialValues={{ trial_enabled: cfg.trial_enabled, trial_points: cfg.trial_points }}
        submitter={{ searchConfig: { submitText: '保存' }, resetButtonProps: false }}
        onFinish={async (v) => {
          const r = await saveTrialSettings(v.trial_enabled, v.trial_points)
          if (r.ok) {
            message.success('已保存（只影响此后首次激活的账号）')
            setCfg({ ...cfg, ...v })
          } else {
            message.error(r.error || '保存失败')
          }
          return r.ok
        }}
      >
        <ProFormSwitch name="trial_enabled" label="体验期" extra="开启后，此后首次激活的账号赠送一次体验积分；关闭 / 重新开启都不补发、不追溯" />
        <ProFormDigit
          name="trial_points"
          label="赠送积分"
          width="sm"
          rules={[{ required: true, message: '请输入赠送积分' }]}
          fieldProps={{ min: 1, max: 100, precision: 0 }}
          extra="1–100，默认 7"
        />
      </ProForm>
      <Descriptions column={1} size="small" style={{ marginTop: 24 }} title="扣减规则（固定）">
        <Descriptions.Item label="首次扣减延迟">{cfg.first_charge_delay_hours} 小时</Descriptions.Item>
        <Descriptions.Item label="扣减周期">每 {cfg.charge_period_hours} 小时扣 1 分</Descriptions.Item>
      </Descriptions>
    </ProCard>
  )
}
