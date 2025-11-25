/**
 * Electron 配置存储管理
 * 使用 JSON 文件持久化配置
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// 配置文件路径 - 延迟初始化，避免在 app ready 之前访问
let CONFIG_FILE_PATH: string

function getConfigFilePath(): string {
  if (!CONFIG_FILE_PATH) {
    CONFIG_FILE_PATH = path.join(app.getPath('userData'), 'config.json')
  }
  return CONFIG_FILE_PATH
}

// 默认配置
export interface AppConfig {
  // 下载设置
  downloadPath: string
  autoDownload: boolean

  // 上传设置
  maxConcurrent: number
  chunkSize: number

  // 通知设置
  notificationEnabled: boolean
  doNotDisturbEnabled: boolean
  doNotDisturbStart: number // 小时 (0-23)
  doNotDisturbEnd: number // 小时 (0-23)

  // 窗口设置
  windowWidth: number
  windowHeight: number
  windowMaximized: boolean

  // 其他设置
  autoLaunch: boolean
  language: string
  theme: 'dark' | 'light'

}

/**
 * 获取默认下载路径
 */
function getDefaultDownloadPath(): string {
  const documentsPath = app.getPath('documents')
  return path.join(documentsPath, 'YuntuDownloads')
}

/**
 * 获取默认配置 - 延迟初始化
 */
function getDefaultConfig(): AppConfig {
  return {
    downloadPath: getDefaultDownloadPath(),
    autoDownload: false,
    maxConcurrent: 3,
    chunkSize: 10 * 1024 * 1024, // 10MB
    notificationEnabled: true,
    doNotDisturbEnabled: true,
    doNotDisturbStart: 22,
    doNotDisturbEnd: 8,
    windowWidth: 1400,
    windowHeight: 900,
    windowMaximized: false,
    autoLaunch: true,
    language: 'zh-CN',
    theme: 'dark',
  }
}

/**
 * 配置管理类
 */
class ConfigStore {
  private config: AppConfig | null = null

  constructor() {
    // 延迟加载，不在构造函数中初始化
    this.load()
  }

  /**
   * 确保配置已初始化
   */
  private ensureConfig(): AppConfig {
    if (!this.config) {
      this.config = getDefaultConfig()
    }
    return this.config
  }

  /**
   * 加载配置
   */
  load() {
    // 如果 app 还没有 ready，跳过加载
    // ensureConfig() 会在首次访问时自动加载默认配置
    if (!app.isReady()) {
      console.log('[ConfigStore] App not ready, skipping load')
      return
    }

    try {
      const configPath = getConfigFilePath()
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8')
        const savedConfig = JSON.parse(data)
        this.config = { ...getDefaultConfig(), ...savedConfig }
        console.log('Config loaded from', configPath)
      } else {
        // 首次运行，创建默认配置
        this.config = getDefaultConfig()
        this.save()
        console.log('Default config created at', configPath)
      }
    } catch (error) {
      console.error('Failed to load config:', error)
      this.config = getDefaultConfig()
    }
  }

  /**
   * 保存配置
   */
  save() {
    try {
      const config = this.ensureConfig()
      const configPath = getConfigFilePath()
      const dir = path.dirname(configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      console.log('Config saved to', configPath)
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  /**
   * 获取配置
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.ensureConfig()[key]
  }

  /**
   * 获取所有配置
   */
  getAll(): AppConfig {
    return { ...this.ensureConfig() }
  }

  /**
   * 设置配置
   */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    const config = this.ensureConfig()
    config[key] = value
    this.save()
  }

  /**
   * 批量设置配置
   */
  setAll(updates: Partial<AppConfig>) {
    this.config = { ...this.ensureConfig(), ...updates }
    this.save()
  }

  /**
   * 重置为默认配置
   */
  reset() {
    this.config = getDefaultConfig()
    this.save()
  }
}

// 延迟初始化的单例 - 必须在 app.ready 之后调用
let _configStoreInstance: ConfigStore | null = null

/**
 * 获取配置存储单例
 * 注意：必须在 Electron app.ready 之后调用
 */
export function getConfigStore(): ConfigStore {
  if (!_configStoreInstance) {
    _configStoreInstance = new ConfigStore()
  }
  return _configStoreInstance
}

// 为了向后兼容，导出一个访问器对象
// 所有方法都会延迟初始化 configStore
export const configStore = {
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return getConfigStore().get(key)
  },
  getAll(): AppConfig {
    return getConfigStore().getAll()
  },
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    return getConfigStore().set(key, value)
  },
  setAll(updates: Partial<AppConfig>) {
    return getConfigStore().setAll(updates)
  },
  reset() {
    return getConfigStore().reset()
  }
}
