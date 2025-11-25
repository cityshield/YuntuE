#!/usr/bin/env node

/**
 * 使用 PyArmor 混淆 Python 代码
 * 保护源代码不被用户查看
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function checkPyArmorInstalled() {
  try {
    execSync('pyarmor --version', { stdio: 'ignore' })
    return true
  } catch (error) {
    return false
  }
}

function installPyArmor() {
  console.log('[Obfuscate Python] PyArmor 未安装，正在安装...')
  try {
    execSync('pip install pyarmor', {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
    console.log('[Obfuscate Python] ✓ PyArmor 安装完成')
    return true
  } catch (error) {
    console.error('[Obfuscate Python] ✗ PyArmor 安装失败')
    console.error('[Obfuscate Python] 请手动安装: pip install pyarmor')
    return false
  }
}

function obfuscatePython(dir, outputDir) {
  console.log(`[Obfuscate Python] 混淆目录: ${dir}`)
  console.log(`[Obfuscate Python] 输出目录: ${outputDir}`)
  
  if (!fs.existsSync(dir)) {
    console.warn(`[Obfuscate Python] 目录不存在: ${dir}`)
    return false
  }

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  try {
    // 使用 pyarmor 混淆代码
    // --recursive: 递归处理子目录
    // --output: 输出目录
    const command = `pyarmor gen --recursive --output "${outputDir}" "${dir}"`
    
    console.log(`[Obfuscate Python] 执行命令: ${command}`)
    execSync(command, {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
    
    console.log(`[Obfuscate Python] ✓ 混淆完成: ${dir}`)
    return true
  } catch (error) {
    console.error(`[Obfuscate Python] ✗ 混淆失败: ${dir}`)
    console.error(error.message)
    return false
  }
}

function main() {
  console.log('[Obfuscate Python] 开始混淆 Python 文件...')
  
  // 检查并安装 PyArmor
  if (!checkPyArmorInstalled()) {
    if (!installPyArmor()) {
      console.error('[Obfuscate Python] 无法继续，请先安装 PyArmor')
      process.exit(1)
    }
  }

  const sourceDir = path.join(process.cwd(), 'python', 'get_maya_plug4')
  const outputDir = path.join(process.cwd(), 'python', 'get_maya_plug4_obfuscated')

  // 混淆 get_maya_plug4 模块
  if (fs.existsSync(sourceDir)) {
    const success = obfuscatePython(sourceDir, outputDir)
    if (!success) {
      console.error('[Obfuscate Python] 混淆失败，退出')
      process.exit(1)
    }
  } else {
    console.warn(`[Obfuscate Python] 源目录不存在: ${sourceDir}`)
  }

  console.log('[Obfuscate Python] 混淆完成！')
  console.log(`[Obfuscate Python] 混淆后的代码位于: ${outputDir}`)
}

main()

