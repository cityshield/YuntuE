import { defineStore } from 'pinia'
import { ref } from 'vue'
import { uploadManager } from '@/utils/upload/UploadManager'

export interface User {
  id: string
  username: string
  phone: string
  avatar?: string | null
  balance: number
  memberLevel: number
}

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const token = ref<string>('')
  const refreshToken = ref<string>('')
  const isLoggedIn = ref(false)

  // 登录
  const login = (userData: User, userToken: string, userRefreshToken?: string) => {
    user.value = userData
    token.value = userToken
    isLoggedIn.value = true
    localStorage.setItem('token', userToken)
    localStorage.setItem('user', JSON.stringify(userData))

    // 保存 refresh_token
    if (userRefreshToken) {
      refreshToken.value = userRefreshToken
      localStorage.setItem('refresh_token', userRefreshToken)
    }
  }

  /**
   * 统一的登出清理逻辑
   * 在所有需要清除登录状态的场景调用
   */
  const performLogout = () => {
    console.log('[UserStore] 执行登出清理')

    // 清除当前用户的上传任务数据
    if (user.value?.id) {
      uploadManager.clearTasksFromStorage(user.value.id)
    }

    // 清空 Pinia state
    user.value = null
    token.value = ''
    refreshToken.value = ''
    isLoggedIn.value = false

    // 清空 localStorage
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
  }

  // 登出（用户主动登出）
  const logout = () => {
    performLogout()
  }

  // 标记是否正在恢复 session（防止重复调用）
  let isRestoring = false

  /**
   * 从本地存储恢复登录状态
   * 直接从 localStorage 恢复，不验证服务器（避免网络问题导致登录状态丢失）
   * 让 axios 拦截器在首次请求时自动处理过期 token
   * 防止重复调用导致的竞态条件
   */
  const restoreSession = async (): Promise<boolean> => {
    // 短路：如果已经登录，直接返回成功
    if (isLoggedIn.value) {
      console.log('[UserStore] 已登录，跳过恢复流程')
      return true
    }

    // 防止并发调用
    if (isRestoring) {
      console.log('[UserStore] Session 恢复正在进行中，跳过重复调用')
      // 等待当前恢复完成
      while (isRestoring) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return isLoggedIn.value
    }

    isRestoring = true

    try {
      const savedToken = localStorage.getItem('token')
      const savedRefreshToken = localStorage.getItem('refresh_token')
      const savedUser = localStorage.getItem('user')

      // 基本数据检查
      if (!savedToken || !savedUser || !savedRefreshToken) {
        console.log('[UserStore] 恢复失败：缺少必要的本地数据')
        return false
      }

      // 直接恢复状态，不验证服务器
      // 让 axios 拦截器在首次请求时自动处理过期 token
      token.value = savedToken
      user.value = JSON.parse(savedUser)
      isLoggedIn.value = true
      refreshToken.value = savedRefreshToken

      console.log('[UserStore] Session 恢复成功（从本地存储）')
      return true
    } catch (error) {
      console.log('[UserStore] Session 恢复失败：解析本地数据出错', error)
      // 只有在数据格式错误时才清理
      performLogout()
      return false
    } finally {
      isRestoring = false
    }
  }

  // 更新 token (用于刷新 token 后更新)
  const updateToken = (newToken: string, newRefreshToken?: string) => {
    token.value = newToken
    localStorage.setItem('token', newToken)

    if (newRefreshToken) {
      refreshToken.value = newRefreshToken
      localStorage.setItem('refresh_token', newRefreshToken)
    }
  }

  return {
    user,
    token,
    refreshToken,
    isLoggedIn,
    login,
    logout,
    performLogout,
    restoreSession,
    updateToken,
  }
})
