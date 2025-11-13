#!/usr/bin/env node

/**
 * 自动打包脚本
 * 功能：
 * 1. 自动递增版本号（最后一位小版本号 +1）
 * 2. 执行 Windows 打包
 * 3. 复制打包产物到服务器更新目录
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// 配置
const CONFIG = {
  packageJsonPath: path.join(process.cwd(), 'package.json'),
  releaseDir: path.join(process.cwd(), 'release'),
  serverUpdateDir: '/Users/pretty/Documents/Workspace/YuntuServer/static/client-updates',
}

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
}

function log(msg, color = colors.blue) {
  console.log(`${color}${colors.bright}[Auto Pack]${colors.reset} ${msg}`)
}

function success(msg) {
  console.log(`${colors.green}${colors.bright}✓${colors.reset} ${msg}`)
}

function error(msg) {
  console.log(`${colors.red}${colors.bright}✗${colors.reset} ${msg}`)
}

// 读取 package.json
function readPackageJson() {
  log('Reading package.json...')
  const content = fs.readFileSync(CONFIG.packageJsonPath, 'utf-8')
  return JSON.parse(content)
}

// 写入 package.json
function writePackageJson(data) {
  log('Writing package.json...')
  fs.writeFileSync(CONFIG.packageJsonPath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

// 递增版本号
function incrementVersion(version) {
  const parts = version.split('.')
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${version}`)
  }

  // 最后一位 +1
  parts[2] = String(parseInt(parts[2], 10) + 1)
  return parts.join('.')
}

// 执行构建
function build() {
  log('Starting build process...')
  try {
    execSync('npm run build:win', {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
    success('Build completed!')
  } catch (err) {
    error('Build failed!')
    throw err
  }
}

// 复制文件到服务器更新目录
function copyToServer(version) {
  log('Copying files to server update directory...')

  // 确保服务器目录存在
  if (!fs.existsSync(CONFIG.serverUpdateDir)) {
    fs.mkdirSync(CONFIG.serverUpdateDir, { recursive: true })
  }

  // 查找构建产物
  const files = fs.readdirSync(CONFIG.releaseDir)
  const versionPrefix = `盛世云图-v${version}-`
  const filesToCopy = []

  // 找到当前版本的所有文件
  files.forEach((file) => {
    if (file.startsWith(versionPrefix) || file === 'latest.yml') {
      filesToCopy.push(file)
    }
  })

  if (filesToCopy.length === 0) {
    error('No build artifacts found!')
    throw new Error('Build artifacts not found')
  }

  // 复制文件
  let copiedCount = 0
  filesToCopy.forEach((file) => {
    const srcPath = path.join(CONFIG.releaseDir, file)
    const destPath = path.join(CONFIG.serverUpdateDir, file)

    try {
      fs.copyFileSync(srcPath, destPath)
      log(`  Copied: ${file}`)
      copiedCount++
    } catch (err) {
      error(`  Failed to copy: ${file}`)
      throw err
    }
  })

  success(`Copied ${copiedCount} files to server update directory`)
}

// 主函数
async function main() {
  console.log('')
  log('='.repeat(60))
  log('Starting automatic packaging process...')
  log('='.repeat(60))
  console.log('')

  try {
    // 1. 读取并更新版本号
    const pkg = readPackageJson()
    const oldVersion = pkg.version
    const newVersion = incrementVersion(oldVersion)

    log(`Current version: ${colors.yellow}${oldVersion}${colors.reset}`)
    log(`New version: ${colors.green}${newVersion}${colors.reset}`)

    pkg.version = newVersion
    writePackageJson(pkg)
    success(`Version updated: ${oldVersion} → ${newVersion}`)
    console.log('')

    // 2. 执行构建
    build()
    console.log('')

    // 3. 复制文件到服务器
    copyToServer(newVersion)
    console.log('')

    // 完成
    log('='.repeat(60))
    success('All done! 🎉')
    log('='.repeat(60))
    console.log('')
    log(`Version: ${colors.green}${colors.bright}${newVersion}${colors.reset}`)
    log(`Files location: ${colors.blue}${CONFIG.serverUpdateDir}${colors.reset}`)
    log(`Update URL: ${colors.blue}http://192.168.99.183:8000/client-updates/${colors.reset}`)
    console.log('')
  } catch (err) {
    console.log('')
    error('Packaging failed!')
    error(err.message)
    console.log('')
    process.exit(1)
  }
}

// 运行
main()
