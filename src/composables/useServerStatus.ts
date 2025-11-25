import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

export interface ServerStatus {
  apiUrl: string
  wsUrl: string
  environment: string
  apiConnected: boolean
  wsConnected: boolean
  checking: boolean
  lastCheckTime: string | null
  error: string | null
  wsError: string | null // WebSocket 详细错误信息
  wsCloseCode: number | null // WebSocket 关闭码
  wsCloseReason: string | null // WebSocket 关闭原因
}

export function useServerStatus() {
  const status = ref<ServerStatus>({
    apiUrl: '',
    wsUrl: '',
    environment: '',
    apiConnected: false,
    wsConnected: false,
    checking: false,
    lastCheckTime: null,
    error: null,
    wsError: null,
    wsCloseCode: null,
    wsCloseReason: null,
  })

  let websocket: WebSocket | null = null
  let checkInterval: ReturnType<typeof setInterval> | null = null

  // 检查 API 服务器连接
  const checkApiConnection = async (apiUrl: string): Promise<boolean> => {
    try {
      // 尝试连接健康检查接口
      const response = await axios.get(`${apiUrl}/health`, {
        timeout: 5000,
        validateStatus: () => true, // 接受所有状态码
      })
      return response.status === 200
    } catch (error) {
      console.error('[ServerStatus] API 连接检查失败:', error)
      return false
    }
  }

  // 检查 WebSocket 连接
  const checkWebSocketConnection = (wsUrl: string): Promise<{
    success: boolean
    error?: string
    closeCode?: number
    closeReason?: string
  }> => {
    return new Promise((resolve) => {
      try {
        // 清理旧的 WebSocket 连接
        if (websocket) {
          websocket.close()
          websocket = null
        }

        // 清空之前的错误信息
        status.value.wsError = null
        status.value.wsCloseCode = null
        status.value.wsCloseReason = null

        // 将 http/https 替换为 ws/wss
        const wsProtocol = wsUrl.replace(/^http/, 'ws')
        // WebSocket 端点是 /ws，需要提供 user_id 参数（用于测试连接）
        const wsEndpoint = `${wsProtocol}/ws?user_id=health-check`

        console.log('[ServerStatus] 尝试连接 WebSocket:', wsEndpoint)
        console.log('[ServerStatus] 原始 wsUrl:', wsUrl)
        console.log('[ServerStatus] 转换后协议:', wsProtocol)

        websocket = new WebSocket(wsEndpoint)

        // 设置超时
        const timeout = setTimeout(() => {
          const errorMsg = `WebSocket 连接超时 (5秒) - URL: ${wsEndpoint}`
          console.log('[ServerStatus]', errorMsg)
          status.value.wsError = errorMsg
          if (websocket) {
            websocket.close()
            websocket = null
          }
          resolve({ success: false, error: '连接超时 (5秒)' })
        }, 5000)

        websocket.onopen = () => {
          console.log('[ServerStatus] WebSocket 连接成功 ✓')
          console.log('[ServerStatus] WebSocket readyState:', websocket?.readyState)
          clearTimeout(timeout)
          // 清空错误信息
          status.value.wsError = null
          status.value.wsCloseCode = null
          status.value.wsCloseReason = null
          // 连接成功后立即关闭，因为这只是健康检查
          if (websocket) {
            websocket.close(1000, 'Health check completed')
            websocket = null
          }
          resolve({ success: true })
        }

        websocket.onerror = (event) => {
          const errorMsg = `WebSocket 连接错误 - URL: ${wsEndpoint}`
          console.error('[ServerStatus]', errorMsg, event)
          console.error('[ServerStatus] WebSocket readyState:', websocket?.readyState)
          console.error('[ServerStatus] Event type:', event.type)
          status.value.wsError = errorMsg
          clearTimeout(timeout)
          resolve({ success: false, error: 'WebSocket 连接错误' })
        }

        websocket.onclose = (event) => {
          console.log('[ServerStatus] WebSocket 关闭')
          console.log('[ServerStatus] Close code:', event.code)
          console.log('[ServerStatus] Close reason:', event.reason)
          console.log('[ServerStatus] Was clean:', event.wasClean)

          status.value.wsCloseCode = event.code
          status.value.wsCloseReason = event.reason || getCloseCodeDescription(event.code)

          clearTimeout(timeout)

          // 如果不是正常关闭（1000），记录错误
          if (event.code !== 1000 && event.code !== 1001) {
            const errorMsg = `WebSocket 异常关闭 - Code: ${event.code}, Reason: ${event.reason || getCloseCodeDescription(event.code)}`
            console.error('[ServerStatus]', errorMsg)
            status.value.wsError = errorMsg
          }
        }
      } catch (error: any) {
        const errorMsg = `WebSocket 检查异常: ${error.message}`
        console.error('[ServerStatus]', errorMsg, error)
        status.value.wsError = errorMsg
        if (websocket) {
          websocket.close()
          websocket = null
        }
        resolve({ success: false, error: error.message })
      }
    })
  }

  // WebSocket 关闭码描述
  const getCloseCodeDescription = (code: number): string => {
    const codes: Record<number, string> = {
      1000: '正常关闭',
      1001: '端点离开',
      1002: '协议错误',
      1003: '不支持的数据类型',
      1005: '未收到关闭码',
      1006: '异常关闭 (连接断开)',
      1007: '数据格式错误',
      1008: '违反策略',
      1009: '消息过大',
      1010: '扩展协商失败',
      1011: '服务器内部错误',
      1012: '服务重启',
      1013: '稍后重试',
      1015: 'TLS 握手失败',
    }
    return codes[code] || `未知错误码 (${code})`
  }

  // 执行完整的连接检查
  const checkServerStatus = async () => {
    if (status.value.checking) return

    status.value.checking = true
    status.value.error = null

    try {
      // 获取服务器配置
      if (window.electronAPI) {
        const config = await (window.electronAPI as any).serverConfigGet()
        status.value.apiUrl = config.apiBaseUrl
        status.value.wsUrl = config.wsBaseUrl
        status.value.environment = config.environment
      }

      // 检查 API 连接
      status.value.apiConnected = await checkApiConnection(status.value.apiUrl)

      // 检查 WebSocket 连接
      const wsResult = await checkWebSocketConnection(status.value.wsUrl)
      status.value.wsConnected = wsResult.success
      if (wsResult.error) {
        status.value.wsError = wsResult.error
      }
      if (wsResult.closeCode !== undefined) {
        status.value.wsCloseCode = wsResult.closeCode
      }
      if (wsResult.closeReason) {
        status.value.wsCloseReason = wsResult.closeReason
      }

      // 更新检查时间
      status.value.lastCheckTime = new Date().toLocaleTimeString('zh-CN', { hour12: false })

      // 如果都失败，设置错误信息
      if (!status.value.apiConnected && !status.value.wsConnected) {
        status.value.error = '无法连接到服务器，请检查网络或后端服务是否运行'
      } else if (!status.value.apiConnected) {
        status.value.error = 'API 服务器连接失败'
      } else if (!status.value.wsConnected) {
        status.value.error = 'WebSocket 服务器连接失败'
      }
    } catch (error: any) {
      const errorMsg = error?.message || error?.toString() || '连接检查失败'
      status.value.error = errorMsg
      console.error('[ServerStatus] 连接检查异常:', error)
    } finally {
      status.value.checking = false
    }
  }

  // 启动定期检查
  const startPeriodicCheck = (intervalMs: number = 30000) => {
    // 立即执行一次检查
    checkServerStatus()

    // 设置定期检查
    checkInterval = setInterval(() => {
      checkServerStatus()
    }, intervalMs)
  }

  // 停止定期检查
  const stopPeriodicCheck = () => {
    if (checkInterval) {
      clearInterval(checkInterval)
      checkInterval = null
    }

    // 断开 WebSocket
    if (websocket) {
      websocket.close()
      websocket = null
    }
  }

  // 组件挂载时启动检查
  onMounted(() => {
    startPeriodicCheck(30000) // 每30秒检查一次
  })

  // 组件卸载时停止检查
  onUnmounted(() => {
    stopPeriodicCheck()
  })

  return {
    status,
    checkServerStatus,
    startPeriodicCheck,
    stopPeriodicCheck,
  }
}
