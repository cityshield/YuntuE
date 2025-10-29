/**
 * 盘符相关 API
 */
import axios from './axios-config'

export interface Drive {
  id: string
  name: string
  icon: string
  description?: string
  total_size?: number
  used_size: number
  is_team_drive: boolean
  user_id?: string
  team_id?: string
  created_at: string
  updated_at?: string
}

export const drivesAPI = {
  /**
   * 获取用户的默认盘符（如不存在则自动创建）
   */
  async getDefaultDrive(): Promise<Drive> {
    try {
      const response = await axios.get('/api/v1/drives/default')
      return response.data
    } catch (error: any) {
      console.error('获取默认盘符失败:', error)

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
   * 获取用户的所有盘符
   */
  async getDrives(skip: number = 0, limit: number = 100): Promise<{ drives: Drive[]; total: number }> {
    try {
      const response = await axios.get('/api/v1/drives', {
        params: { skip, limit }
      })
      return response.data
    } catch (error: any) {
      console.error('获取盘符列表失败:', error)

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
  }
}
