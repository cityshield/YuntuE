/**
 * 认证相关 API
 */
import axios from './axios-config'

// 请求接口类型定义
export interface LoginRequest {
  username: string  // 用户名或邮箱
  password: string
}

export interface RegisterRequest {
  username: string
  phone: string
  verification_code: string
  password: string
}

export interface SendCodeRequest {
  phone: string
}

export interface RefreshTokenRequest {
  refresh_token: string
}

// 响应接口类型定义
export interface UserResponse {
  id: string
  username: string
  phone: string
  avatar: string | null
  balance: number
  member_level: number
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export interface LoginResponse {
  user: UserResponse
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface RegisterResponse {
  user: UserResponse
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface SendCodeResponse {
  success: boolean
  message: string
  request_id?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export const authAPI = {
  /**
   * 用户登录
   */
  async login(data: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await axios.post('/api/v1/auth/login', data)
      return response.data
    } catch (error: any) {
      console.error('登录失败:', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('用户名或密码错误')
        }
        throw new Error(
          error.response.data?.detail || `服务器错误 (${error.response.status})`
        )
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 发送短信验证码
   */
  async sendVerificationCode(data: SendCodeRequest): Promise<SendCodeResponse> {
    try {
      const response = await axios.post('/api/v1/auth/send-code', data)
      return response.data
    } catch (error: any) {
      console.error('发送验证码失败:', error)

      if (error.response) {
        throw new Error(
          error.response.data?.detail || `服务器错误 (${error.response.status})`
        )
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 用户注册
   */
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    try {
      const response = await axios.post('/api/v1/auth/register', data)
      return response.data
    } catch (error: any) {
      console.error('注册失败:', error)

      if (error.response) {
        if (error.response.status === 400) {
          throw new Error(error.response.data?.detail || '注册信息有误')
        }
        throw new Error(
          error.response.data?.detail || `服务器错误 (${error.response.status})`
        )
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 刷新访问令牌
   */
  async refreshToken(data: RefreshTokenRequest): Promise<TokenResponse> {
    try {
      const response = await axios.post('/api/v1/auth/refresh', data)
      return response.data
    } catch (error: any) {
      console.error('刷新 token 失败:', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        throw new Error(
          error.response.data?.detail || `服务器错误 (${error.response.status})`
        )
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 用户登出
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      await axios.post('/api/v1/auth/logout', { refresh_token: refreshToken })
    } catch (error: any) {
      console.error('登出失败:', error)
      // 登出失败不抛出错误，前端仍然清除本地数据
    }
  },
}
