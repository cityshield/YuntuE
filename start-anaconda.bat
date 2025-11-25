@echo off
REM ========================================
REM Anaconda Prompt 专用启动脚本
REM 解决中文乱码问题
REM ========================================

REM 强制设置控制台编码为 UTF-8
chcp 65001
if errorlevel 1 (
    echo [错误] 无法设置 UTF-8 编码
    pause
    exit /b 1
)

REM 显示当前代码页（验证是否设置成功）
echo [信息] 当前代码页: 
chcp | findstr "65001"
if errorlevel 1 (
    echo [警告] UTF-8 编码设置可能失败，日志可能显示乱码
    echo [提示] 但日志文件会正确保存（UTF-8 编码）
    echo.
)

REM 设置环境变量确保编码正确
set PYTHONIOENCODING=utf-8
set NODE_OPTIONS=--max-old-space-size=4096

REM 清除屏幕并显示启动信息
cls
echo ========================================
echo   盛世云图 - 开发服务器启动
echo ========================================
echo.
echo [编码] UTF-8 (代码页 65001)
echo [环境] Anaconda Prompt
echo.
echo 正在启动开发服务器...
echo.
echo ========================================
echo.

REM 启动开发服务器
npm run electron:dev

REM 如果程序退出，保持窗口打开以便查看错误信息
if errorlevel 1 (
    echo.
    echo ========================================
    echo [错误] 开发服务器启动失败
    echo ========================================
    pause
)

