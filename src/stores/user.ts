import { defineStore } from 'pinia'
import { ref } from 'vue'

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

  // 登出
  const logout = () => {
    user.value = null
    token.value = ''
    refreshToken.value = ''
    isLoggedIn.value = false
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
  }

  // 从本地存储恢复登录状态
  const restoreSession = () => {
    const savedToken = localStorage.getItem('token')
    const savedRefreshToken = localStorage.getItem('refresh_token')
    const savedUser = localStorage.getItem('user')

    if (savedToken && savedUser) {
      token.value = savedToken
      user.value = JSON.parse(savedUser)
      isLoggedIn.value = true

      if (savedRefreshToken) {
        refreshToken.value = savedRefreshToken
      }

      return true
    }
    return false
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
    restoreSession,
    updateToken,
  }
})
