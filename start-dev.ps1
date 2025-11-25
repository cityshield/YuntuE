# 设置控制台编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

# 启动开发服务器
Write-Host "正在启动开发服务器..." -ForegroundColor Green
npm run electron:dev

