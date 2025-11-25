#!/usr/bin/env node

/**
 * 在打包前生成 config.ini 文件，使用本机局域网 IP
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

// 获取本机局域网 IP
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces()

  // 优先查找 192.168.x.x 或 10.x.x.x 网段
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name]
    if (!nets) continue

    for (const net of nets) {
      // 跳过非 IPv4 和内部地址
      if (net.family === 'IPv4' && !net.internal) {
        // 优先返回局域网地址
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
          console.log('[Generate Config] Found local IP:', net.address)
          return net.address
        }
      }
    }
  }

  // 如果没找到局域网地址，返回第一个可用的外部 IPv4 地址
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name]
    if (!nets) continue

    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('[Generate Config] Found IP:', net.address)
        return net.address
      }
    }
  }

  console.warn('[Generate Config] No local IP found, using localhost')
  return 'localhost'
}

// 生成 config.ini 内容
function generateConfigContent(host) {
  return `# 盛世云图客户端 - 服务端接口配置
# 修改此文件后需要重启客户端才能生效
#
# 注意：打包时自动使用本机局域网IP地址，方便局域网内其他电脑测试
# 如需修改为其他地址，请直接编辑下面的配置

# API 基础地址
# 开发环境示例: http://localhost:8000
# 测试环境示例: http://192.168.99.93:8000
# 生产环境示例: https://api.yuntu.com
apiBaseUrl=http://${host}:8000

# WebSocket 基础地址
# 开发环境示例: ws://localhost:8000
# 测试环境示例: ws://192.168.99.93:8000
# 生产环境示例: wss://api.yuntu.com
wsBaseUrl=ws://${host}:8000

# 当前环境
# 可选值: development, staging, production
environment=development
`
}

// 主函数
function main() {
  console.log('[Generate Config] Starting config generation...')

  const configPath = path.join(process.cwd(), 'config.ini')

  // 如果配置文件已存在，跳过生成，保留现有配置
  if (fs.existsSync(configPath)) {
    console.log('[Generate Config] 配置文件已存在，跳过生成')
    console.log('[Generate Config] 使用现有配置:', configPath)
    return
  }

  // 配置文件不存在时才生成，使用 localhost 作为默认值（不读取本机IP）
  console.log('[Generate Config] 配置文件不存在，生成默认配置（使用 localhost）')
  const content = generateConfigContent('localhost')

  console.log('[Generate Config] Writing config to:', configPath)

  fs.writeFileSync(configPath, content, 'utf-8')

  console.log('[Generate Config] Config file generated successfully!')
  console.log('[Generate Config] Content:')
  console.log(content)
}

// 执行
main()
