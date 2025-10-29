/**
 * Electron 配置存储管理
 * 使用 JSON 文件持久化配置
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// 配置文件路径
const CONFIG_FILE_PATH = path.join(app.getPath('userData'), 'config.json')

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

const DEFAULT_CONFIG: AppConfig = {
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

/**
 * 获取默认下载路径
 */
function getDefaultDownloadPath(): string {
  const documentsPath = app.getPath('documents')
  return path.join(documentsPath, 'YuntuDownloads')
}

/**
 * 配置管理类
 */
class ConfigStore {
  private config: AppConfig = DEFAULT_CONFIG

  constructor() {
    this.load()
  }

  /**
   * 加载配置
   */
  load() {
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8')
        const savedConfig = JSON.parse(data)
        this.config = { ...DEFAULT_CONFIG, ...savedConfig }
        console.log('Config loaded from', CONFIG_FILE_PATH)
      } else {
        // 首次运行，创建默认配置
        this.save()
        console.log('Default config created at', CONFIG_FILE_PATH)
      }
    } catch (error) {
      console.error('Failed to load config:', error)
      this.config = DEFAULT_CONFIG
    }
  }

  /**
   * 保存配置
   */
  save() {
    try {
      const dir = path.dirname(CONFIG_FILE_PATH)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(this.config, null, 2))
      console.log('Config saved to', CONFIG_FILE_PATH)
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  /**
   * 获取配置
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key]
  }

  /**
   * 获取所有配置
   */
  getAll(): AppConfig {
    return { ...this.config }
  }

  /**
   * 设置配置
   */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    this.config[key] = value
    this.save()
  }

  /**
   * 批量设置配置
   */
  setAll(updates: Partial<AppConfig>) {
    this.config = { ...this.config, ...updates }
    this.save()
  }

  /**
   * 重置为默认配置
   */
  reset() {
    this.config = { ...DEFAULT_CONFIG }
    this.save()
  }
}

// 导出单例
export const configStore = new ConfigStore()
