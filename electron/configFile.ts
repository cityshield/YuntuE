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
let _defaultConfig: ServerConfig | null = null

function getDefaultConfig(): ServerConfig {
  if (_defaultConfig) {
    return _defaultConfig
  }

  // 在生产环境打包时，使用本机局域网 IP
  const shouldUseLocalIP = !process.env.VITE_DEV_SERVER_URL
  const host = shouldUseLocalIP ? getLocalIPAddress() : 'localhost'

  _defaultConfig = {
    apiBaseUrl: `http://${host}:8000`,
    wsBaseUrl: `ws://${host}:8000`,
    environment: 'development',
  }

  return _defaultConfig
}

const DEFAULT_CONFIG = getDefaultConfig

/**
 * 配置文件路径（延迟计算，只在首次访问时计算）
 */
let _configFilePath: string | null = null

/**
 * 获取配置文件路径
 * 生产环境：应用安装目录下的 config.ini（与 exe 同级）
 * 开发环境：项目根目录下的 config.ini（使用 app.getAppPath() 确定，不依赖 process.cwd()）
 */
function getConfigFilePath(): string {
  if (_configFilePath) {
    return _configFilePath
  }

  // 如果 app 还未 ready，返回一个临时路径
  if (!app.isReady()) {
    // 在开发环境使用 process.cwd()，生产环境使用 __dirname
    if (process.env.VITE_DEV_SERVER_URL) {
      return join(process.cwd(), 'config.ini')
    } else {
      const { dirname } = require('path')
      return join(dirname(__dirname), 'config.ini')
    }
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    // 开发环境：项目根目录
    // 使用 app.getAppPath() 获取应用路径，然后向上找到项目根目录
    // app.getAppPath() 在开发环境中返回项目根目录
    const appPath = app.getAppPath()
    // 在开发环境中，app.getAppPath() 返回项目根目录
    // 但为了保险，我们检查是否存在 config.ini，如果不存在则尝试其他路径
    const configPath = join(appPath, 'config.ini')

    // 如果 appPath 下的 config.ini 不存在，尝试从 __dirname 向上查找
    if (!existsSync(configPath)) {
      const { dirname } = require('path')
      // __dirname 在开发环境中指向 dist-electron，需要向上到项目根目录
      const distElectronDir = __dirname
      const projectRoot = dirname(distElectronDir) // dist-electron -> 项目根目录
      const altConfigPath = join(projectRoot, 'config.ini')

      if (existsSync(altConfigPath)) {
        console.log('[Config] 开发环境 - 使用备用路径:', altConfigPath)
        _configFilePath = altConfigPath
        return _configFilePath
      }
    }

    console.log('[Config] 开发环境 - 应用路径:', appPath)
    console.log('[Config] 开发环境 - 配置文件路径:', configPath)
    _configFilePath = configPath
    return _configFilePath
  } else {
    // 生产环境：exe 所在目录
    // app.getPath('exe') 返回可执行文件的完整路径
    // 使用 dirname 获取目录路径
    const { dirname } = require('path')
    const exePath = app.getPath('exe')
    const exeDir = dirname(exePath)
    const configPath = join(exeDir, 'config.ini')
    console.log('[Config] 生产环境 - exe 目录:', exeDir)
    console.log('[Config] 生产环境 - 配置文件路径:', configPath)
    _configFilePath = configPath
    return _configFilePath
  }
}

/**
 * 解析 INI 格式配置文件
 */
function parseIniFile(content: string): ServerConfig {
  const config: Partial<ServerConfig> = {}
  const lines = content.split('\n')

  console.log('[Config] 开始解析配置文件，总行数:', lines.length)

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

      console.log(`[Config] 解析配置项: ${key} = ${value}`)

      switch (key) {
        case 'apiBaseUrl':
          config.apiBaseUrl = value
          console.log(`[Config] 设置 apiBaseUrl: ${value}`)
          break
        case 'wsBaseUrl':
          config.wsBaseUrl = value
          console.log(`[Config] 设置 wsBaseUrl: ${value}`)
          break
        case 'environment':
          if (value === 'development' || value === 'staging' || value === 'production') {
            config.environment = value
            console.log(`[Config] 设置 environment: ${value}`)
          }
          break
      }
    }
  }

  // 合并默认配置（如果配置文件中没有指定，使用默认值）
  const defaultConfig = getDefaultConfig()
  const finalConfig = { ...defaultConfig, ...config }
  console.log('[Config] 最终配置:', finalConfig)
  console.log('[Config] 默认配置:', defaultConfig)
  console.log('[Config] 解析的配置:', config)

  return finalConfig
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
  console.log('[Config] ========================================')
  console.log('[Config] 开始加载配置文件')
  console.log('[Config] 配置文件路径:', configPath)
  console.log('[Config] 工作目录:', process.cwd())
  console.log('[Config] 平台:', process.platform)
  console.log('[Config] 是否开发环境:', !!process.env.VITE_DEV_SERVER_URL)
  console.log('[Config] ========================================')

  try {
    if (existsSync(configPath)) {
      console.log('[Config] ✓ 配置文件存在，开始读取...')
      const content = readFileSync(configPath, 'utf-8')
      console.log('[Config] 配置文件内容长度:', content.length, '字符')
      console.log('[Config] 配置文件内容预览:')
      console.log(content.substring(0, 200))
      
      const config = parseIniFile(content)
      console.log('[Config] ✓ 配置文件解析成功')
      console.log('[Config] 最终使用的配置:')
      console.log('[Config]   - apiBaseUrl:', config.apiBaseUrl)
      console.log('[Config]   - wsBaseUrl:', config.wsBaseUrl)
      console.log('[Config]   - environment:', config.environment)
      console.log('[Config] ========================================')
      return config
    } else {
      // 配置文件不存在，创建默认配置
      const defaultConfig = getDefaultConfig()
      console.log('[Config] ✗ 配置文件不存在')
      console.log('[Config] 默认配置:')
      console.log('[Config]   - apiBaseUrl:', defaultConfig.apiBaseUrl)
      console.log('[Config]   - wsBaseUrl:', defaultConfig.wsBaseUrl)
      console.log('[Config]   - environment:', defaultConfig.environment)
      console.log('[Config] 尝试创建默认配置文件...')
      try {
        saveServerConfig(defaultConfig)
        console.log('[Config] ✓ 默认配置文件创建成功')
      } catch (saveError) {
        console.error('[Config] ✗ 创建配置文件失败:', saveError)
        console.error('[Config] 使用内存中的默认配置')
      }
      console.log('[Config] ========================================')
      return defaultConfig
    }
  } catch (error) {
    const defaultConfig = getDefaultConfig()
    console.error('[Config] ✗ 加载配置文件时发生错误')
    console.error('[Config] 错误类型:', error instanceof Error ? error.constructor.name : typeof error)
    console.error('[Config] 错误信息:', error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.stack) {
      console.error('[Config] 错误堆栈:', error.stack)
    }
    console.error('[Config] 使用内存中的默认配置')
    console.error('[Config] 默认配置:')
    console.error('[Config]   - apiBaseUrl:', defaultConfig.apiBaseUrl)
    console.error('[Config]   - wsBaseUrl:', defaultConfig.wsBaseUrl)
    console.error('[Config] ========================================')
    return defaultConfig
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
