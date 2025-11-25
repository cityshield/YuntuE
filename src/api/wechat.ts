/**
 * 微信登录相关 API
 */
import axios from './axios-config'
import type { LoginResponse } from './auth'

// 请求接口类型定义
export interface WeChatQRCodeRequest {
  client_type?: 'web' | 'desktop'  // 客户端类型
}

export interface WeChatLoginStatusRequest {
  scene_id: string  // 场景 ID
}

// 响应接口类型定义
export interface WeChatQRCodeResponse {
  scene_str: string     // 场景值，用于轮询登录状态（后端字段名）
  qr_code_url: string   // 二维码内容（微信登录链接）
  expires_in: number    // 二维码有效期（秒），通常 300 秒
}

export type WeChatLoginStatus =
  | 'pending'    // 等待扫码
  | 'scanned'    // 已扫码，等待用户确认
  | 'confirmed'  // 用户确认，登录成功
  | 'expired'    // 二维码已过期
  | 'canceled'   // 用户取消登录

export interface WeChatLoginStatusResponse {
  status: WeChatLoginStatus
  message?: string
  // 登录成功时返回的用户信息和令牌
  user?: LoginResponse['user']
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
}

export const wechatAPI = {
  /**
   * 生成微信登录二维码
   */
  async generateQRCode(data: WeChatQRCodeRequest = {}): Promise<WeChatQRCodeResponse> {
    try {
      const response = await axios.post('/api/v1/wechat/qrcode', {
        client_type: data.client_type || 'desktop'
      })
      return response.data
    } catch (error: any) {
      console.error('生成二维码失败:', error)

      if (error.response) {
        const errorDetail = error.response.data?.detail || error.response.data?.message || JSON.stringify(error.response.data)
        console.error('微信登录 API 错误详情:', {
          status: error.response.status,
          data: error.response.data,
          url: error.config?.url
        })
        throw new Error(
          errorDetail || `服务器错误 (${error.response.status})`
        )
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 检查微信登录状态（轮询使用）
   */
  async checkLoginStatus(sceneStr: string): Promise<WeChatLoginStatusResponse> {
    try {
      const response = await axios.get(`/api/v1/wechat/poll/${sceneStr}`)
      return response.data
    } catch (error: any) {
      console.error('检查登录状态失败:', error)

      if (error.response) {
        // 404 可能表示 scene_str 无效或已过期
        if (error.response.status === 404) {
          return {
            status: 'expired',
            message: '二维码已过期'
          }
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
  }
}
