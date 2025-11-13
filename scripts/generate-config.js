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

  const localIP = getLocalIPAddress()
  const content = generateConfigContent(localIP)
  const configPath = path.join(process.cwd(), 'config.ini')

  console.log('[Generate Config] Writing config to:', configPath)
  console.log('[Generate Config] Using IP:', localIP)

  fs.writeFileSync(configPath, content, 'utf-8')

  console.log('[Generate Config] Config file generated successfully!')
  console.log('[Generate Config] Content:')
  console.log(content)
}

// 执行
main()
