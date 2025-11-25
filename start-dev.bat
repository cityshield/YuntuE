@echo off
REM 设置控制台编码为 UTF-8（适用于 CMD 和 Anaconda Prompt）
chcp 65001
if errorlevel 1 (
    echo 警告: 无法设置 UTF-8 编码，可能仍会显示乱码
)

REM 设置环境变量确保 Node.js 使用 UTF-8
set PYTHONIOENCODING=utf-8
set NODE_OPTIONS=--max-old-space-size=4096

REM 启动开发服务器
echo ========================================
echo 正在启动开发服务器...
echo ========================================
echo.
npm run electron:dev

