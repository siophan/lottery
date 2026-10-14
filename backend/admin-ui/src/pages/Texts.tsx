// 文案编辑（发财猫需求第 1 条）：数据说明、彩种规则、招商文案、公告等，保存后客户端下次读取即为最新内容。
import { useEffect, useRef, useState } from 'react'
import { ActionType, ModalForm, ProColumns, ProForm, ProFormSelect, ProFormText, ProTable } from '@ant-design/pro-components'
import { App, Button, Popconfirm, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { ApiResult, createText, deleteText, listTextCategories, listTexts, TextRow, updateText } from '../api'
import RichEditor from '../RichEditor'
import { fmtDateTime } from '../util'

const KEY_RULES = [
  { required: true, message: '请输入标识' },
  {
    pattern: /^[a-z0-9][a-z0-9._-]{0,63}$/,
    message: '只能用小写字母、数字和 . _ -，以字母或数字开头，最多 64 位',
  },
]
const TITLE_RULES = [{ required: true, whitespace: true, message: '请输入标题' }, { max: 50 }]

export default function Texts() {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()
  const [cats, setCats] = useState<{ value: string; label: string }[]>([])
  const catLabel = Object.fromEntries(cats.map((c) => [c.value, c.label]))

  useEffect(() => {
    listTextCategories().then(setCats).catch(() => message.error('读取分类失败'))
  }, [message])

  const run = async (p: Promise<ApiResult>, okMsg: string) => {
    const r = await p
    if (r.ok) {
      message.success(okMsg)
      actionRef.current?.reload()
    } else {
      message.error(r.error || '操作失败')
    }
    return r.ok
  }

  const editorFields = (editing?: TextRow) => (
    <>
      <ProFormSelect name="category" label="分类" options={cats} rules={[{ required: true, message: '请选择分类' }]} />
      <ProFormText
        name="key"
        label="标识"
        rules={KEY_RULES}
        disabled={!!editing}
        extra={editing ? '标识创建后不可修改' : '客户端按标识读取，例如 pl3.rules、notice.home；创建后不可修改'}
      />
      <ProFormText name="title" label="标题" rules={TITLE_RULES} />
      <ProForm.Item name="content" label="正文">
        <RichEditor />
      </ProForm.Item>
    </>
  )

  const columns: ProColumns<TextRow>[] = [
    {
      title: '分类',
      dataIndex: 'category',
      valueType: 'select',
      valueEnum: Object.fromEntries(cats.map((c) => [c.value, { text: c.label }])),
      render: (_, r) => catLabel[r.category] ?? r.category,
    },
    {
      title: '标识',
      dataIndex: 'key',
      render: (_, r) => <Typography.Text code copyable>{r.key}</Typography.Text>,
    },
    { title: '标题', dataIndex: 'title' },
    { title: '更新时间', dataIndex: 'updated_at', hideInSearch: true, render: (_, r) => fmtDateTime(r.updated_at) },
    { title: '更新人', dataIndex: 'updated_by', hideInSearch: true },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, r) => [
        <ModalForm
          key="edit"
          title={`编辑文案 · ${r.title}`}
          trigger={<a>编辑</a>}
          width={820}
          modalProps={{ destroyOnClose: true, maskClosable: false }}
          initialValues={{ category: r.category, key: r.key, title: r.title, content: r.content }}
          onFinish={async (v: { category: string; title: string; content?: string }) =>
            run(updateText(r.id, { category: v.category, title: v.title, content: v.content ?? '' }), '已保存，即时生效')
          }
        >
          {editorFields(r)}
        </ModalForm>,
        <Popconfirm
          key="delete"
          title="删除后客户端读取该标识将回退为原有文案。确认删除？"
          okText="删除"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => run(deleteText(r.id), '已删除')}
        >
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ]

  return (
    <ProTable<TextRow>
      rowKey="id"
      actionRef={actionRef}
      columns={columns}
      cardBordered
      search={{ labelWidth: 'auto' }}
      options={{ reload: true, density: false, setting: true }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
      request={async (params) => {
        const rows = await listTexts()
        const kw = (s?: string) => (s ? String(s).trim().toLowerCase() : '')
        const data = rows.filter(
          (t) =>
            (!params.category || t.category === params.category) &&
            (!kw(params.key) || t.key.includes(kw(params.key))) &&
            (!kw(params.title) || t.title.toLowerCase().includes(kw(params.title))),
        )
        return { data, total: data.length, success: true }
      }}
      toolBarRender={() => [
        <ModalForm
          key="create"
          title="新增文案"
          width={820}
          modalProps={{ destroyOnClose: true, maskClosable: false }}
          trigger={
            <Button type="primary" icon={<PlusOutlined />}>
              新增文案
            </Button>
          }
          onFinish={async (v: { category: string; key: string; title: string; content?: string }) =>
            run(createText({ ...v, content: v.content ?? '' }), '已新增')
          }
        >
          {editorFields()}
        </ModalForm>,
      ]}
    />
  )
}
