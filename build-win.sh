#!/bin/bash

# Windows 打包脚本 (在 macOS 上运行)

echo "========================================="
echo "  YuntuE Windows 打包工具"
echo "========================================="
echo ""
echo "🎯 目标平台: Windows x64"
echo "📦 输出格式: NSIS 安装程序 + Portable 免安装版"
echo "📂 输出目录: release/"
echo ""

# 检查 Node.js 版本
echo "🔍 检查环境..."
NODE_VERSION=$(node --version)
echo "  Node.js: $NODE_VERSION"
echo ""

# 清理旧的构建文件
echo "🧹 清理旧的构建文件..."
rm -rf dist dist-electron release/*.exe release/*.zip
echo "  ✅ 清理完成"
echo ""

# 运行打包命令
echo "🚀 开始打包 Windows 版本..."
echo ""
npm run build:win

# 检查打包结果
echo ""
echo "========================================="
if [ -d "release" ] && [ "$(ls -A release/*.exe 2>/dev/null)" ]; then
    echo "✅ 打包成功!"
    echo ""
    echo "📦 生成的文件:"
    ls -lh release/*.exe release/*.zip 2>/dev/null | awk '{print "  "$9, "("$5")"}'
    echo ""
    echo "📍 输出目录: $(pwd)/release"
else
    echo "❌ 打包失败，请检查错误日志"
fi
echo "========================================="
