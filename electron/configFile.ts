/**
 * 外部配置文件管理 (config.ini)
 * 用于管理服务端接口配置，方便测试时切换不同环境
 */
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { networkInterfaces } from 'os'

/**
 * 服务端配置接口
 */
export interface ServerConfig {
  apiBaseUrl: string
  wsBaseUrl: string
  environment: 'development' | 'staging' | 'production'
}

/**
 * 获取本机局域网 IP 地址
 */
function getLocalIPAddress(): string {
  const interfaces = networkInterfaces()

  // 优先查找 192.168.x.x 或 10.x.x.x 网段
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name]
    if (!nets) continue

    for (const net of nets) {
      // 跳过非 IPv4 和内部地址
      if (net.family === 'IPv4' && !net.internal) {
        // 优先返回局域网地址
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
          console.log('[Config] Found local IP:', net.address)
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
        console.log('[Config] Found IP:', net.address)
        return net.address
      }
    }
  }

  console.warn('[Config] No local IP found, using localhost')
  return 'localhost'
}

/**
 * 默认配置（生产环境打包时会自动使用本机 IP）
 */
function getDefaultConfig(): ServerConfig {
  // 在生产环境打包时，使用本机局域网 IP
  const shouldUseLocalIP = !process.env.VITE_DEV_SERVER_URL
  const host = shouldUseLocalIP ? getLocalIPAddress() : 'localhost'

  return {
    apiBaseUrl: `http://${host}:8000`,
    wsBaseUrl: `ws://${host}:8000`,
    environment: 'development',
  }
}

const DEFAULT_CONFIG: ServerConfig = getDefaultConfig()

/**
 * 配置文件路径
 * 生产环境：应用安装目录下的 config.ini（与 exe 同级）
 * 开发环境：项目根目录下的 config.ini
 */
function getConfigFilePath(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    // 开发环境：项目根目录
    return join(process.cwd(), 'config.ini')
  } else {
    // 生产环境：exe 所在目录
    // app.getPath('exe') 返回可执行文件的完整路径
    // 使用 dirname 获取目录路径
    const { dirname } = require('path')
    const exePath = app.getPath('exe')
    const exeDir = dirname(exePath)
    return join(exeDir, 'config.ini')
  }
}

/**
 * 解析 INI 格式配置文件
 */
function parseIniFile(content: string): ServerConfig {
  const config: Partial<ServerConfig> = {}
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    // 跳过注释和空行
    if (trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed === '') {
      continue
    }

    // 解析 key=value
    const match = trimmed.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim()

      switch (key) {
        case 'apiBaseUrl':
          config.apiBaseUrl = value
          break
        case 'wsBaseUrl':
          config.wsBaseUrl = value
          break
        case 'environment':
          if (value === 'development' || value === 'staging' || value === 'production') {
            config.environment = value
          }
          break
      }
    }
  }

  // 合并默认配置
  return { ...DEFAULT_CONFIG, ...config }
}

/**
 * 生成 INI 格式配置文件内容
 */
function generateIniContent(config: ServerConfig): string {
  return `# 盛世云图客户端 - 服务端接口配置
# 修改此文件后需要重启客户端才能生效
#
# 注意：打包时自动使用本机局域网IP地址，方便局域网内其他电脑测试
# 如需修改为其他地址，请直接编辑下面的配置

# API 基础地址
# 开发环境示例: http://localhost:8000
# 测试环境示例: http://192.168.99.93:8000
# 生产环境示例: https://api.yuntu.com
apiBaseUrl=${config.apiBaseUrl}

# WebSocket 基础地址
# 开发环境示例: ws://localhost:8000
# 测试环境示例: ws://192.168.99.93:8000
# 生产环境示例: wss://api.yuntu.com
wsBaseUrl=${config.wsBaseUrl}

# 当前环境
# 可选值: development, staging, production
environment=${config.environment}
`
}

/**
 * 加载配置文件
 */
export function loadServerConfig(): ServerConfig {
  const configPath = getConfigFilePath()
  console.log('[Config] Loading config from:', configPath)
  console.log('[Config] Process platform:', process.platform)
  console.log('[Config] Is development:', !!process.env.VITE_DEV_SERVER_URL)

  try {
    if (existsSync(configPath)) {
      console.log('[Config] Config file exists, reading...')
      const content = readFileSync(configPath, 'utf-8')
      const config = parseIniFile(content)
      console.log('[Config] Successfully loaded:', config)
      return config
    } else {
      // 配置文件不存在，创建默认配置
      console.log('[Config] Config file not found, creating default config')
      try {
        saveServerConfig(DEFAULT_CONFIG)
        console.log('[Config] Default config created successfully')
      } catch (saveError) {
        console.error('[Config] Failed to create config file:', saveError)
        console.error('[Config] Using in-memory default config')
      }
      return DEFAULT_CONFIG
    }
  } catch (error) {
    console.error('[Config] Failed to load config:', error)
    console.error('[Config] Error details:', error instanceof Error ? error.message : String(error))
    console.error('[Config] Using in-memory default config')
    return DEFAULT_CONFIG
  }
}

/**
 * 保存配置文件
 */
export function saveServerConfig(config: ServerConfig): void {
  const configPath = getConfigFilePath()
  console.log('[Config] Saving config to:', configPath)
  console.log('[Config] Config content:', config)

  try {
    const content = generateIniContent(config)
    console.log('[Config] Generated INI content length:', content.length)

    writeFileSync(configPath, content, 'utf-8')
    console.log('[Config] Config saved successfully')

    // 验证写入是否成功
    if (existsSync(configPath)) {
      console.log('[Config] Verified: config file exists')
    } else {
      console.warn('[Config] Warning: config file does not exist after write')
    }
  } catch (error) {
    console.error('[Config] Failed to save config:', error)
    console.error('[Config] Error details:', error instanceof Error ? error.message : String(error))

    // 检查是否是权限问题
    if (error instanceof Error && error.message.includes('EACCES')) {
      console.error('[Config] Permission denied! Try running as administrator or check directory permissions')
    }

    throw error
  }
}

/**
 * 获取配置文件路径（供前端显示）
 */
export function getConfigFileLocation(): string {
  return getConfigFilePath()
}
