/**
 * 配置管理 Composable
 */
import { ref, onMounted } from 'vue'

export interface AppConfig {
  downloadPath: string
  autoDownload: boolean
  maxConcurrent: number
  chunkSize: number
  notificationEnabled: boolean
  doNotDisturbEnabled: boolean
  doNotDisturbStart: number
  doNotDisturbEnd: number
  windowWidth: number
  windowHeight: number
  windowMaximized: boolean
  autoLaunch: boolean
  language: string
  theme: 'dark' | 'light'
}

export function useConfig() {
  const config = ref<AppConfig | null>(null)

  /**
   * 加载所有配置
   */
  const loadConfig = async () => {
    if (!window.electronAPI) {
      console.warn('Electron API not available')
      return
    }

    try {
      const allConfig = await window.electronAPI.configGetAll()
      config.value = allConfig
      console.log('Config loaded:', allConfig)
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  /**
   * 获取单个配置
   */
  const get = async (key: keyof AppConfig) => {
    if (!window.electronAPI) {
      return null
    }

    try {
      return await window.electronAPI.configGet(key)
    } catch (error) {
      console.error(`Failed to get config ${key}:`, error)
      return null
    }
  }

  /**
   * 设置单个配置
   */
  const set = (key: keyof AppConfig, value: any) => {
    if (!window.electronAPI) {
      console.warn('Electron API not available')
      return
    }

    window.electronAPI.configSet(key, value)

    // 更新本地缓存
    if (config.value) {
      config.value[key] = value as never
    }

    console.log(`Config updated: ${key} = ${value}`)
  }

  /**
   * 批量设置配置
   */
  const setAll = (updates: Partial<AppConfig>) => {
    if (!window.electronAPI) {
      console.warn('Electron API not available')
      return
    }

    window.electronAPI.configSetAll(updates)

    // 更新本地缓存
    if (config.value) {
      config.value = { ...config.value, ...updates }
    }

    console.log('Config updated:', updates)
  }

  /**
   * 重置为默认配置
   */
  const reset = () => {
    if (!window.electronAPI) {
      console.warn('Electron API not available')
      return
    }

    window.electronAPI.configReset()
    loadConfig() // 重新加载配置
    console.log('Config reset to default')
  }

  // 组件挂载时自动加载配置
  onMounted(() => {
    loadConfig()
  })

  return {
    config,
    loadConfig,
    get,
    set,
    setAll,
    reset,
  }
}
