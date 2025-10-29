/**
 * 服务端配置管理 Composable
 */
import { ref, onMounted } from 'vue'

export interface ServerConfig {
  apiBaseUrl: string
  wsBaseUrl: string
  environment: 'development' | 'staging' | 'production'
}

export function useServerConfig() {
  const config = ref<ServerConfig | null>(null)
  const configPath = ref<string>('')
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 加载配置
   */
  const loadConfig = async () => {
    loading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available')
      }
      config.value = await (window.electronAPI as any).serverConfigGet()
      configPath.value = await (window.electronAPI as any).serverConfigGetPath()
      console.log('[ServerConfig] Loaded:', config.value)
      console.log('[ServerConfig] Path:', configPath.value)
    } catch (err: any) {
      error.value = err.message || '加载配置失败'
      console.error('[ServerConfig] Load error:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存配置
   */
  const saveConfig = async (newConfig: ServerConfig) => {
    loading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available')
      }
      ;(window.electronAPI as any).serverConfigSet(newConfig)
      config.value = newConfig
      console.log('[ServerConfig] Saved:', newConfig)
    } catch (err: any) {
      error.value = err.message || '保存配置失败'
      console.error('[ServerConfig] Save error:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 重新加载配置（从文件）
   */
  const reloadConfig = async () => {
    loading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available')
      }
      config.value = await (window.electronAPI as any).serverConfigReload()
      console.log('[ServerConfig] Reloaded:', config.value)
    } catch (err: any) {
      error.value = err.message || '重新加载配置失败'
      console.error('[ServerConfig] Reload error:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 监听配置更新
   */
  const watchConfigUpdates = () => {
    if (!window.electronAPI) {
      return
    }
    ;(window.electronAPI as any).onServerConfigUpdated((newConfig: ServerConfig) => {
      config.value = newConfig
      console.log('[ServerConfig] Updated from main process:', newConfig)
    })
  }

  // 组件挂载时加载配置
  onMounted(() => {
    loadConfig()
    watchConfigUpdates()
  })

  return {
    config,
    configPath,
    loading,
    error,
    loadConfig,
    saveConfig,
    reloadConfig,
  }
}
