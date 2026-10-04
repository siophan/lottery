import { useEffect, useRef, useState } from 'react'
import {
  ActionType,
  ModalForm,
  ProColumns,
  ProFormDigit,
  ProFormGroup,
  ProFormList,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components'
import { App, Button, Drawer, Popconfirm, Switch, Table, Tabs, Tag, Tooltip } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  DataSourceInput,
  DataSourceRow,
  DrawRow,
  deleteDataSource,
  listDataSources,
  listDraws,
  saveDataSource,
  setDataSourceEnabled,
} from '../api'
import { fmtDateTime } from '../util'

const ADAPTER_OPTIONS = [
  { label: '区块链统计格式（expect / opennumber）', value: 'qkltj' },
  { label: '全球统计格式（issue / drawResult）', value: 'qqtj' },
]

const CAT_OPTIONS = [
  { label: '哈希', value: 'hash' },
  { label: '11选5', value: '1105' },
  { label: '运动会', value: 'animals' },
]

function StatusTag({ row }: { row: DataSourceRow }) {
  if (!row.enabled) return <Tag>停用</Tag>
  if (row.status === 'ok') return <Tag color="success">正常</Tag>
  if (row.status === 'error')
    return (
      <Tooltip title={row.last_error}>
        <Tag color="error">异常</Tag>
      </Tooltip>
    )
  return <Tag>未知</Tag>
}

interface FormValues {
  key: string
  name: string
  adapter: string
  base_url: string
  headers_text: string
  interval_sec: number
  enabled: boolean
  lotteries: DataSourceInput['lotteries']
}

function toFormValues(r?: DataSourceRow): Partial<FormValues> {
  if (!r) return { adapter: 'qkltj', headers_text: '{}', interval_sec: 5, enabled: true, lotteries: [] }
  return {
    key: r.key,
    name: r.name,
    adapter: r.adapter,
    base_url: r.base_url,
    headers_text: JSON.stringify(r.headers, null, 2),
    interval_sec: r.interval_sec,
    enabled: r.enabled,
    lotteries: r.lotteries,
  }
}

function SourceForm({
  record,
  trigger,
  onDone,
}: {
  record?: DataSourceRow
  trigger: JSX.Element
  onDone: () => void
}) {
  const { message } = App.useApp()
  return (
    <ModalForm<FormValues>
      title={record ? `编辑数据源 · ${record.name}` : '新增数据源'}
      trigger={trigger}
      width={760}
      modalProps={{ destroyOnClose: true }}
      initialValues={toFormValues(record)}
      onFinish={async (v) => {
        let headers: Record<string, string>
        try {
          headers = JSON.parse(v.headers_text || '{}')
        } catch {
          message.error('请求头不是合法的 JSON')
          return false
        }
        const res = await saveDataSource(record ? record.id : null, {
          key: v.key,
          name: v.name,
          adapter: v.adapter,
          base_url: v.base_url,
          headers,
          interval_sec: v.interval_sec,
          enabled: v.enabled,
          lotteries: v.lotteries || [],
        })
        if (!res.ok) {
          message.error(res.error || '保存失败')
          return false
        }
        message.success('已保存')
        onDone()
        return true
      }}
    >
      <ProFormGroup>
        <ProFormText name="name" label="名称" width="sm" rules={[{ required: true }]} />
        <ProFormText
          name="key"
          label="标识 key"
          width="sm"
          tooltip="小写字母、数字、- 或 _；客户端接口路径中使用，上线后不要随意修改"
          rules={[{ required: true }]}
        />
        <ProFormSelect name="adapter" label="返回格式" width="md" options={ADAPTER_OPTIONS} rules={[{ required: true }]} />
      </ProFormGroup>
      <ProFormText name="base_url" label="接口地址（不含 ? 参数）" rules={[{ required: true }]} />
      <ProFormGroup>
        <ProFormDigit name="interval_sec" label="拉取周期（秒）" min={3} width="xs" fieldProps={{ precision: 0 }} rules={[{ required: true }]} />
        <ProFormSwitch name="enabled" label="启用" />
      </ProFormGroup>
      <ProFormTextArea name="headers_text" label="请求头 / 鉴权参数（JSON 对象）" fieldProps={{ rows: 3 }} />
      <ProFormList
        name="lotteries"
        label="彩种映射"
        min={1}
        copyIconProps={false}
        creatorButtonProps={{ creatorButtonText: '添加彩种' }}
      >
        <ProFormGroup>
          <ProFormText name="lottery_code" label="统一编码" width="xs" rules={[{ required: true }]} />
          <ProFormText name="remote_code" label="远端编码" width="sm" rules={[{ required: true }]} />
          <ProFormText name="name" label="名称" width="sm" rules={[{ required: true }]} />
          <ProFormSelect name="cat" label="工作台" width="xs" options={CAT_OPTIONS} rules={[{ required: true }]} />
        </ProFormGroup>
      </ProFormList>
    </ModalForm>
  )
}

function DrawsDrawer({ record, onClose }: { record: DataSourceRow | null; onClose: () => void }) {
  const [data, setData] = useState<Record<string, DrawRow[]>>({})
  useEffect(() => {
    if (!record) return
    setData({})
    record.lotteries.forEach(async (l) => {
      const rows = await listDraws(record.id, l.lottery_code, 20)
      setData((d) => ({ ...d, [l.lottery_code]: rows }))
    })
  }, [record])
  return (
    <Drawer open={!!record} onClose={onClose} width={600} title={record ? `最新开奖 · ${record.name}` : ''}>
      {record && (
        <Tabs
          items={record.lotteries.map((l) => ({
            key: l.lottery_code,
            label: `${l.name}（${l.lottery_code}）`,
            children: (
              <Table<DrawRow>
                size="small"
                rowKey="expect"
                pagination={false}
                loading={!data[l.lottery_code]}
                dataSource={data[l.lottery_code] || []}
                columns={[
                  { title: '期号', dataIndex: 'expect' },
                  { title: '开奖号码', dataIndex: 'opennumber' },
                  { title: '开奖时间', dataIndex: 'open_time' },
                ]}
              />
            ),
          }))}
        />
      )}
    </Drawer>
  )
}

export default function DataSources() {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>()
  const [drawsOf, setDrawsOf] = useState<DataSourceRow | null>(null)
  const reload = () => actionRef.current?.reload()

  const columns: ProColumns<DataSourceRow>[] = [
    { title: '名称', dataIndex: 'name' },
    { title: 'key', dataIndex: 'key', copyable: true },
    { title: '接口地址', dataIndex: 'base_url', ellipsis: true, copyable: true },
    { title: '周期', dataIndex: 'interval_sec', width: 70, render: (_, r) => `${r.interval_sec}s` },
    { title: '彩种', dataIndex: 'lotteries', render: (_, r) => r.lotteries.map((l) => l.name).join('、') },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 70,
      render: (_, r) => (
        <Switch
          size="small"
          checked={r.enabled}
          onChange={async (on) => {
            if (await setDataSourceEnabled(r.id, on)) {
              message.success(on ? '已启用' : '已停用')
              reload()
            } else {
              message.error('操作失败')
            }
          }}
        />
      ),
    },
    { title: '状态', dataIndex: 'status', width: 80, render: (_, r) => <StatusTag row={r} /> },
    {
      title: '最后成功',
      dataIndex: 'last_ok_at',
      render: (_, r) => (r.last_ok_at ? fmtDateTime(r.last_ok_at) : '-'),
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, r) => [
        <SourceForm key="edit" record={r} trigger={<a>编辑</a>} onDone={reload} />,
        <a key="draws" onClick={() => setDrawsOf(r)}>
          最新开奖
        </a>,
        <Popconfirm
          key="del"
          title={`删除「${r.name}」及其全部开奖数据？`}
          onConfirm={async () => {
            if (await deleteDataSource(r.id)) {
              message.success('已删除')
              reload()
            } else {
              message.error('删除失败')
            }
          }}
        >
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ]

  return (
    <>
      <ProTable<DataSourceRow>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        pagination={false}
        polling={10000}
        request={async () => ({ data: await listDataSources(), success: true })}
        toolBarRender={() => [
          <SourceForm
            key="new"
            trigger={
              <Button type="primary" icon={<PlusOutlined />}>
                新增数据源
              </Button>
            }
            onDone={reload}
          />,
        ]}
      />
      <DrawsDrawer record={drawsOf} onClose={() => setDrawsOf(null)} />
    </>
  )
}
