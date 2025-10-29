#!/bin/bash

# 托盘图标测试启动脚本

echo "========================================="
echo "  YuntuE 托盘图标测试"
echo "========================================="
echo ""
echo "📋 测试内容:"
echo "  1. 托盘图标显示 (蓝色圆角正方形)"
echo "  2. 右键菜单功能"
echo "  3. 双击恢复窗口"
echo "  4. 图标状态切换 (蓝/绿/黄)"
echo "  5. 窗口关闭最小化到托盘"
echo ""
echo "🎨 已创建 3 组图标:"
echo "  • 蓝色 - 正常状态"
echo "  • 绿色 - 上传中"
echo "  • 黄色 - 有通知"
echo ""
echo "📖 详细测试指南请查看: TRAY_ICON_TEST_GUIDE.md"
echo ""
echo "🚀 正在启动应用..."
echo ""

npm run dev
