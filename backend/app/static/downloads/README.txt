把实际安装包放到这个目录，文件名需与落地页链接一致：
  ys-win.exe   —— Windows 安装包
  ys-mac.dmg   —— macOS 安装包
生产环境建议由 nginx/Caddy 直接托管本目录（大文件不经 uvicorn）。
