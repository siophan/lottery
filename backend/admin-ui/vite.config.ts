import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后台挂在后端的 /admin/ 前缀下，资源路径必须带该前缀。
// 构建产物直接落到 FastAPI 的静态目录，随源码一起提交，服务器无需装 Node。
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: '../app/static/admin-dist',
    emptyOutDir: true,
  },
})
