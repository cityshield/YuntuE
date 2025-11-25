#!/usr/bin/env node

/**
 * Windows 打包脚本
 * 自动生成时间戳并执行打包
 */

const { execSync } = require('child_process')

// 生成时间戳 YYYYMMDDHHMMSS
function getTimestamp() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}${hour}${minute}${second}`
}

// 执行命令
function runCommand(command, description) {
  console.log(`\n[Build] ${description}...`)
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        BUILD_TIMESTAMP: getTimestamp(),
      },
    })
    console.log(`[Build] ${description} 完成 ✓`)
  } catch (error) {
    console.error(`[Build] ${description} 失败 ✗`)
    process.exit(1)
  }
}

// 主流程
function main() {
  const timestamp = getTimestamp()
  console.log(`[Build] 开始打包 Windows 应用`)
  console.log(`[Build] 时间戳: ${timestamp}`)
  console.log(`[Build] 工作目录: ${process.cwd()}`)

  // 设置环境变量
  process.env.BUILD_TIMESTAMP = timestamp

  try {
    // 1. 检查配置文件（如果不存在则生成默认配置，但不覆盖现有配置）
    runCommand('node scripts/generate-config.js', '检查配置文件')

    // 2. 使用 PyArmor 混淆 Python 代码（保护源代码）
    runCommand('node scripts/obfuscate-python.js', '混淆 Python 代码')

    // 3. 使用 PyInstaller 打包 Python 为独立可执行文件（不依赖外部 Python）
    runCommand('node scripts/package-python.js', '打包 Python 为可执行文件')

    // 4. TypeScript 类型检查
    runCommand('vue-tsc --noEmit', 'TypeScript 类型检查')

    // 5. 编译前端代码
    runCommand('vite build', '编译前端代码')

    // 6. 打包 Electron 应用
    const target = process.argv.includes('--portable') ? '--config.win.target=portable' : ''
    runCommand(`electron-builder --win ${target}`, '打包 Electron 应用')

    console.log(`\n[Build] ✨ 打包完成！`)
    console.log(`[Build] 输出目录: release/`)
    console.log(`[Build] 文件名包含时间戳: ${timestamp}`)
  } catch (error) {
    console.error(`[Build] 打包失败:`, error)
    throw error
  }
}

// 执行
main()

