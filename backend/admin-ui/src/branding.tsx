// 统一的品牌标识（登录页与布局共用）。
export const BRAND = 'lottery mao'
export const SUBTITLE = '管理后台'

// 小 logo：圆角方块 + 字母，避免引入图片资源。
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: 'linear-gradient(135deg,#1677ff 0%,#4096ff 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.5,
        fontFamily: 'Georgia, serif',
      }}
    >
      L
    </div>
  )
}
