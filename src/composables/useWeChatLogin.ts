/**
 * 微信登录状态管理 Composable
 */
import { ref, computed, onUnmounted } from 'vue'
import { wechatAPI, type WeChatLoginStatus, type WeChatLoginStatusResponse } from '@/api/wechat'

export interface UseWeChatLoginOptions {
  pollingInterval?: number  // 轮询间隔（毫秒），默认 2000
  onSuccess?: (data: WeChatLoginStatusResponse) => void  // 登录成功回调
  onError?: (error: Error) => void  // 错误回调
}

export function useWeChatLogin(options: UseWeChatLoginOptions = {}) {
  const {
    pollingInterval = 2000,
    onSuccess,
    onError
  } = options

  // 状态管理
  const sceneStr = ref<string>('')  // 改为 sceneStr 适配后端
  const qrCodeUrl = ref<string>('')
  const status = ref<WeChatLoginStatus>('pending')
  const expiresIn = ref<number>(300)  // 默认 5 分钟
  const isLoading = ref<boolean>(false)
  const error = ref<string>('')

  // 轮询定时器
  let pollingTimer: number | null = null

  // 计算属性
  const isExpired = computed(() => status.value === 'expired')
  const isScanned = computed(() => status.value === 'scanned')
  const isConfirmed = computed(() => status.value === 'confirmed')
  const isCanceled = computed(() => status.value === 'canceled')
  const isPending = computed(() => status.value === 'pending')

  // 状态提示文本
  const statusText = computed(() => {
    switch (status.value) {
      case 'pending':
        return '请使用微信扫一扫'
      case 'scanned':
        return '扫码成功，请在手机上确认登录'
      case 'confirmed':
        return '登录成功'
      case 'expired':
        return '二维码已过期'
      case 'canceled':
        return '登录已取消'
      default:
        return ''
    }
  })

  /**
   * 生成二维码
   */
  const generateQRCode = async () => {
    try {
      isLoading.value = true
      error.value = ''

      const response = await wechatAPI.generateQRCode({
        client_type: 'desktop'
      })

      sceneStr.value = response.scene_str  // 使用 scene_str
      qrCodeUrl.value = response.qr_code_url
      expiresIn.value = response.expires_in
      status.value = 'pending'

      // 开始轮询
      startPolling()
    } catch (err: any) {
      error.value = err.message || '生成二维码失败'
      onError?.(err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 检查登录状态
   */
  const checkStatus = async () => {
    if (!sceneStr.value) return

    try {
      const response = await wechatAPI.checkLoginStatus(sceneStr.value)

      status.value = response.status

      // 根据状态处理
      switch (response.status) {
        case 'pending':
          // 继续轮询
          break

        case 'scanned':
          // 已扫码，继续轮询等待确认
          break

        case 'confirmed':
          // 登录成功，停止轮询
          stopPolling()
          onSuccess?.(response)
          break

        case 'expired':
          // 二维码过期，停止轮询
          stopPolling()
          break

        case 'canceled':
          // 用户取消，停止轮询
          stopPolling()
          break
      }
    } catch (err: any) {
      error.value = err.message || '检查登录状态失败'
      onError?.(err)
    }
  }

  /**
   * 开始轮询
   */
  const startPolling = () => {
    // 清除现有定时器
    stopPolling()

    // 立即检查一次
    checkStatus()

    // 启动定时器
    pollingTimer = window.setInterval(() => {
      checkStatus()
    }, pollingInterval)
  }

  /**
   * 停止轮询
   */
  const stopPolling = () => {
    if (pollingTimer !== null) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  /**
   * 刷新二维码
   */
  const refreshQRCode = async () => {
    // 停止轮询
    stopPolling()

    // 重新生成二维码
    await generateQRCode()
  }

  /**
   * 取消登录
   */
  const cancelLogin = async () => {
    stopPolling()
    status.value = 'canceled'
  }

  /**
   * 重置状态
   */
  const reset = () => {
    stopPolling()
    sceneStr.value = ''
    qrCodeUrl.value = ''
    status.value = 'pending'
    expiresIn.value = 300
    error.value = ''
  }

  // 组件卸载时清理
  onUnmounted(() => {
    stopPolling()
  })

  return {
    // 状态
    sceneStr,  // 改为 sceneStr
    qrCodeUrl,
    status,
    expiresIn,
    isLoading,
    error,

    // 计算属性
    isExpired,
    isScanned,
    isConfirmed,
    isCanceled,
    isPending,
    statusText,

    // 方法
    generateQRCode,
    checkStatus,
    startPolling,
    stopPolling,
    refreshQRCode,
    cancelLogin,
    reset
  }
}
