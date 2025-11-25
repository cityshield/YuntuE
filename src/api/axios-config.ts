/**
 * Axios 配置 - 统一的 HTTP 客户端
 * 包含请求拦截器、响应拦截器和自动 Token 刷新机制
 */
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

// 默认 API 地址(仅在 Electron API 不可用时使用)
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// 创建 Axios 实例
const axiosInstance: AxiosInstance = axios.create({
  baseURL: DEFAULT_API_BASE_URL,
  timeout: 30000, // 30秒超时
  headers: {
    'Content-Type': 'application/json',
  },
  // 禁用代理，直接使用本地网络连接（绕过 VPN）
  proxy: false,
})

/**
 * 初始化 Axios 配置 - 从 Electron 配置中读取服务器地址
 * 必须在应用启动时调用
 */
export async function initializeAxiosConfig(): Promise<void> {
  try {
    if (window.electronAPI) {
      const config = await window.electronAPI.serverConfigGet()
      const apiBaseUrl = config.apiBaseUrl

      console.log('[Axios Config] 初始化 API 地址:', apiBaseUrl)

      // 更新 axios baseURL
      axiosInstance.defaults.baseURL = apiBaseUrl

      // 监听配置更新事件
      window.electronAPI.onServerConfigUpdated((newConfig) => {
        console.log('[Axios Config] 服务器配置已更新:', newConfig.apiBaseUrl)
        axiosInstance.defaults.baseURL = newConfig.apiBaseUrl
      })
    } else {
      console.warn('[Axios Config] Electron API 不可用，使用默认 API 地址:', DEFAULT_API_BASE_URL)
    }
  } catch (error) {
    console.error('[Axios Config] 初始化失败:', error)
    console.log('[Axios Config] 使用默认 API 地址:', DEFAULT_API_BASE_URL)
  }
}

/**
 * 手动更新 API 地址
 * @param apiBaseUrl 新的 API 基础地址
 */
export function updateApiBaseUrl(apiBaseUrl: string): void {
  console.log('[Axios Config] 手动更新 API 地址:', apiBaseUrl)
  axiosInstance.defaults.baseURL = apiBaseUrl
}

// 标记是否正在刷新 token
let isRefreshing = false
// 存储等待刷新 token 的请求队列
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: Error) => void
}> = []

/**
 * 处理队列中的请求
 */
const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(promise => {
    if (error) {
      promise.reject(error)
    } else if (token) {
      promise.resolve(token)
    }
  })

  failedQueue = []
}

/**
 * 请求拦截器 - 自动添加 Authorization header
 */
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

/**
 * 响应拦截器 - 自动刷新 Token
 */
axiosInstance.interceptors.response.use(
  (response) => {
    // 请求成功，直接返回数据
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // 如果是 401 错误且未重试过
    if (error.response?.status === 401 && !originalRequest._retry) {
      // 如果是登录、注册、刷新 token 等接口，直接返回错误
      if (
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/register') ||
        originalRequest.url?.includes('/auth/refresh') ||
        originalRequest.url?.includes('/auth/send-code')
      ) {
        return Promise.reject(error)
      }

      originalRequest._retry = true

      // 如果正在刷新，将请求加入队列
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return axiosInstance(originalRequest)
          })
          .catch((err) => {
            return Promise.reject(err)
          })
      }

      isRefreshing = true

      // 尝试刷新 token
      const refreshToken = localStorage.getItem('refresh_token')

      if (!refreshToken) {
        // 没有 refresh_token，直接登出
        isRefreshing = false
        processQueue(new Error('登录已过期，请重新登录'), null)

        // 调用统一的登出清理逻辑（动态导入避免循环依赖）
        import('@/stores/user').then(({ useUserStore }) => {
          const userStore = useUserStore()
          userStore.performLogout()
        })

        // 重定向到登录页
        window.location.href = '/login'

        return Promise.reject(new Error('登录已过期，请重新登录'))
      }

      try {
        // 调用刷新 token 接口(使用当前的 baseURL)
        const response = await axios.post(
          `${axiosInstance.defaults.baseURL}/api/v1/auth/refresh`,
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        )

        const { access_token, refresh_token: new_refresh_token } = response.data

        // 同步更新 Pinia store 和 localStorage（动态导入避免循环依赖）
        import('@/stores/user').then(({ useUserStore }) => {
          const userStore = useUserStore()
          userStore.updateToken(access_token, new_refresh_token)
        })

        // 更新当前请求的 token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`
        }

        // 处理队列中的请求
        processQueue(null, access_token)
        isRefreshing = false

        console.log('[Axios] Token 刷新成功')

        // 重新发送原始请求
        return axiosInstance(originalRequest)
      } catch (refreshError) {
        // 刷新 token 失败，清除本地数据并跳转登录页
        isRefreshing = false
        processQueue(new Error('登录已过期，请重新登录'), null)

        console.log('[Axios] Token 刷新失败，执行登出')

        // 调用统一的登出清理逻辑（动态导入避免循环依赖）
        import('@/stores/user').then(({ useUserStore }) => {
          const userStore = useUserStore()
          userStore.performLogout()
        })

        window.location.href = '/login'

        return Promise.reject(refreshError)
      }
    }

    // 其他错误直接返回
    return Promise.reject(error)
  }
)

export default axiosInstance
