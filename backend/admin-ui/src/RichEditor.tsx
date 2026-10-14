// 文案富文本编辑器：contenteditable + 浏览器编辑命令，不引入第三方编辑器。
// 产出的 HTML 由后端 db_texts.sanitize_html 按白名单清洗（只留排版标签、颜色 / 对齐 / 字号等样式、http(s) 链接），
// 这里的工具栏只提供清洗后仍然保留的格式；粘贴一律按纯文本插入，避免外部样式在保存后被悄悄去掉。
import { CSSProperties, useEffect, useRef } from 'react'
import { Button, Dropdown, Space, Tooltip } from 'antd'
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BoldOutlined,
  ClearOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'

const SYMBOLS = ['①', '②', '③', '④', '⑤', '★', '☆', '●', '○', '■', '◆', '▲', '→', '←', '√', '×', '※', '【', '】', '「', '」', '…', '—', '·', '¥', '%', '℃']
const COLORS = ['#000000', '#595959', '#c00000', '#d4380d', '#d48806', '#389e0d', '#1677ff', '#531dab']
const BLOCKS = [
  { key: 'p', label: '正文' },
  { key: 'h2', label: '大标题' },
  { key: 'h3', label: '中标题' },
  { key: 'h4', label: '小标题' },
  { key: 'blockquote', label: '引用' },
]
const SIZES = [
  { key: '2', label: '小' },
  { key: '3', label: '标准' },
  { key: '5', label: '大' },
  { key: '6', label: '特大' },
]

const boxStyle: CSSProperties = {
  minHeight: 260,
  maxHeight: 480,
  overflowY: 'auto',
  padding: '8px 11px',
  border: '1px solid #d9d9d9',
  borderRadius: 6,
  lineHeight: 1.7,
  outline: 'none',
}

export default function RichEditor({ value, onChange }: { value?: string; onChange?: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // 最近一次在编辑区内的选区：点下拉菜单（颜色 / 段落 / 字号 / 符号）会让编辑区失去选区，执行命令前要先恢复
  const saved = useRef<Range | null>(null)

  // 当前选区在编辑区内时记下来；selectionchange 不保证每次键盘选中都触发，键盘 / 鼠标抬起与按下工具栏时也记一次
  const selInside = () => {
    const sel = window.getSelection()
    return sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode) ? sel : null
  }
  const save = () => {
    const sel = selInside()
    if (sel) saved.current = sel.getRangeAt(0).cloneRange()
  }

  useEffect(() => {
    document.addEventListener('selectionchange', save)
    return () => document.removeEventListener('selectionchange', save)
  }, [])

  // 只在外部值与当前内容不同时回写，避免输入时光标跳到开头
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== (value ?? '')) el.innerHTML = value ?? ''
  }, [value])

  const emit = () => onChange?.(ref.current?.innerHTML ?? '')
  // 工具栏按下时：先记下选区，再阻止默认行为（不让编辑区失去选区）
  const keep = (e: React.MouseEvent) => {
    save()
    e.preventDefault()
  }
  const exec = (cmd: string, arg?: string) => {
    // 选区仍在编辑区（点的是普通按钮）就用当前选区；已移到下拉菜单上时，聚焦后恢复记下的选区
    // （必须先判断再聚焦：重新聚焦时浏览器可能把光标放到开头）
    if (selInside()) {
      save()
    } else {
      ref.current?.focus()
      const sel = window.getSelection()
      if (saved.current && sel) {
        sel.removeAllRanges()
        sel.addRange(saved.current)
      }
    }
    document.execCommand('styleWithCSS', false, 'true') // 颜色 / 字号写成 style，而不是 <font>（会被清洗掉）
    document.execCommand(cmd, false, arg)
    emit()
  }
  const btn = (title: string, icon: React.ReactNode, cmd: string, arg?: string) => (
    <Tooltip title={title} key={title}>
      {/* onMouseDown 阻止默认行为：点按钮时不让编辑区失去选区 */}
      <Button size="small" type="text" icon={icon} onMouseDown={keep} onClick={() => exec(cmd, arg)} />
    </Tooltip>
  )

  return (
    <div>
      <Space size={2} wrap style={{ marginBottom: 6 }}>
        <Dropdown
          menu={{ items: BLOCKS, onClick: ({ key }) => exec('formatBlock', key) }}
          trigger={['click']}
        >
          <Button size="small" onMouseDown={keep}>
            段落
          </Button>
        </Dropdown>
        <Dropdown menu={{ items: SIZES, onClick: ({ key }) => exec('fontSize', key) }} trigger={['click']}>
          <Button size="small" onMouseDown={keep}>
            字号
          </Button>
        </Dropdown>
        {btn('加粗', <BoldOutlined />, 'bold')}
        {btn('斜体', <ItalicOutlined />, 'italic')}
        {btn('下划线', <UnderlineOutlined />, 'underline')}
        {btn('删除线', <StrikethroughOutlined />, 'strikeThrough')}
        <Dropdown
          trigger={['click']}
          menu={{
            items: COLORS.map((c) => ({
              key: c,
              label: <span style={{ display: 'inline-block', width: 48, height: 14, background: c }} />,
            })),
            onClick: ({ key }) => exec('foreColor', key),
          }}
        >
          <Tooltip title="文字颜色">
            <Button size="small" type="text" icon={<FontColorsOutlined />} onMouseDown={keep} />
          </Tooltip>
        </Dropdown>
        {btn('左对齐', <AlignLeftOutlined />, 'justifyLeft')}
        {btn('居中', <AlignCenterOutlined />, 'justifyCenter')}
        {btn('右对齐', <AlignRightOutlined />, 'justifyRight')}
        {btn('项目符号', <UnorderedListOutlined />, 'insertUnorderedList')}
        {btn('编号', <OrderedListOutlined />, 'insertOrderedList')}
        <Tooltip title="链接（仅 http / https）">
          <Button
            size="small"
            type="text"
            icon={<LinkOutlined />}
            onMouseDown={keep}
            onClick={() => {
              const url = window.prompt('链接地址（http:// 或 https:// 开头）', 'https://')
              if (url && /^https?:\/\//i.test(url.trim())) exec('createLink', url.trim())
            }}
          />
        </Tooltip>
        <Dropdown
          trigger={['click']}
          menu={{ items: SYMBOLS.map((s) => ({ key: s, label: s })), onClick: ({ key }) => exec('insertText', key) }}
        >
          <Button size="small" onMouseDown={keep}>
            符号
          </Button>
        </Dropdown>
        {btn('清除格式', <ClearOutlined />, 'removeFormat')}
        {btn('撤销', <UndoOutlined />, 'undo')}
        {btn('重做', <RedoOutlined />, 'redo')}
      </Space>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        style={boxStyle}
        onInput={() => {
          save()
          emit()
        }}
        onKeyUp={save}
        onMouseUp={save}
        onBlur={emit}
        onPaste={(e) => {
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
          emit()
        }}
      />
    </div>
  )
}
