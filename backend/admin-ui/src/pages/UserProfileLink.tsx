import { useState } from 'react'
import { App, Avatar, Button, Modal, Space, Spin, Tag } from 'antd'
import { getUserProfile, resetUserProfile, UserProfile } from '../api'

// 账号列表的昵称单元格：点击查看实际显示的头像与昵称；后台人员可重置为默认（二次确认，写审计）。
export default function UserProfileLink({
  code,
  nickname,
  canReset,
  onReset,
}: {
  code: string
  nickname: string
  canReset: boolean
  onReset: () => void
}) {
  const { message, modal } = App.useApp()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<UserProfile | null>(null)

  const load = () => {
    setData(null)
    getUserProfile(code)
      .then(setData)
      .catch(() => {
        message.error('加载失败')
        setOpen(false)
      })
  }
  const show = () => {
    setOpen(true)
    load()
  }
  const reset = () =>
    modal.confirm({
      title: `重置账号 ${code} 的头像和昵称？`,
      content: '将恢复为系统随机生成的默认头像和昵称，用户之后仍可自行修改。',
      okText: '重置',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const r = await resetUserProfile(code)
        if (!r.ok) {
          message.error(r.error || '重置失败')
          return
        }
        message.success('已重置为默认')
        load()
        onReset()
      },
    })
  const allDefault = !data || (data.nickname_is_default && data.avatar_is_default)

  return (
    <>
      <a onClick={show}>{nickname}</a>
      <Modal
        title={`头像昵称 · ${code}`}
        open={open}
        onCancel={() => setOpen(false)}
        width={360}
        destroyOnClose
        footer={[
          canReset && (
            <Button key="reset" danger disabled={allDefault} onClick={reset}>
              重置为默认
            </Button>
          ),
          <Button key="close" onClick={() => setOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        {data ? (
          <Space direction="vertical" align="center" style={{ width: '100%' }}>
            <Avatar src={data.avatar} size={96} />
            <div style={{ fontSize: 16 }}>{data.nickname}</div>
            <Space>
              {data.avatar_is_default && <Tag>默认头像</Tag>}
              {data.nickname_is_default && <Tag>默认昵称</Tag>}
            </Space>
          </Space>
        ) : (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        )}
      </Modal>
    </>
  )
}
