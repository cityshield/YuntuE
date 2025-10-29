/**
 * 任务相关 API
 */
import axios from './axios-config'
import type {
  TaskCreate,
  TaskResponse,
  TaskListResponse,
  TaskLogsResponse,
  GetTasksParams,
} from '@/types/task'

export const tasksAPI = {
  /**
   * 获取任务列表
   */
  async getTasks(params: GetTasksParams = {}): Promise<TaskListResponse> {
    const endpoint = '/api/v1/tasks'

    // 📤 请求日志
    console.log(`%c[Tasks API] 📤 Request: GET ${endpoint}`, 'color: #3b82f6; font-weight: bold')
    console.log('%c[Tasks API] 📦 Params:', 'color: #6366f1', params)

    try {
      const response = await axios.get(endpoint, { params })

      // ✅ 成功响应日志
      console.log(
        `%c[Tasks API] ✅ Response (${response.status}):`,
        'color: #10b981; font-weight: bold',
        response.data
      )
      console.log('%c[Tasks API] 📊 Stats:', 'color: #10b981', {
        total: response.data.total,
        count: response.data.tasks.length,
      })

      return response.data
    } catch (error: any) {
      // ❌ 错误响应日志
      console.error(`%c[Tasks API] ❌ Error:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        console.error(
          `%c[Tasks API] 💥 Server Error (${error.response.status}):`,
          'color: #dc2626',
          {
            status: error.response.status,
            detail: error.response.data?.detail,
            full_response: error.response.data,
          }
        )

        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        throw new Error(error.response.data?.detail || `服务器错误 (${error.response.status})`)
      } else if (error.request) {
        console.error('%c[Tasks API] 🔌 Network Error:', 'color: #f59e0b', error.request)
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        console.error('%c[Tasks API] ⚠️ Unknown Error:', 'color: #f97316', error.message)
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 获取任务详情
   */
  async getTaskDetail(taskId: string): Promise<TaskResponse> {
    const endpoint = `/api/v1/tasks/${taskId}`

    console.log(`%c[Tasks API] 📤 Request: GET ${endpoint}`, 'color: #3b82f6; font-weight: bold')

    try {
      const response = await axios.get(endpoint)

      console.log(
        `%c[Tasks API] ✅ Response (${response.status}):`,
        'color: #10b981; font-weight: bold',
        response.data
      )

      return response.data
    } catch (error: any) {
      console.error(`%c[Tasks API] ❌ Error:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        if (error.response.status === 404) {
          throw new Error('任务不存在')
        }
        throw new Error(error.response.data?.detail || `服务器错误 (${error.response.status})`)
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 创建任务
   */
  async createTask(taskData: TaskCreate): Promise<TaskResponse> {
    const endpoint = '/api/v1/tasks'

    console.log(`%c[Tasks API] 📤 Request: POST ${endpoint}`, 'color: #8b5cf6; font-weight: bold')
    console.log('%c[Tasks API] 📦 Payload:', 'color: #a78bfa', taskData)

    try {
      const response = await axios.post(endpoint, taskData)

      console.log(
        `%c[Tasks API] ✅ Response (${response.status}):`,
        'color: #10b981; font-weight: bold',
        response.data
      )

      return response.data
    } catch (error: any) {
      console.error(`%c[Tasks API] ❌ Error:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        throw new Error(error.response.data?.detail || `服务器错误 (${error.response.status})`)
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 暂停任务
   */
  async pauseTask(taskId: string): Promise<TaskResponse> {
    const endpoint = `/api/v1/tasks/${taskId}/pause`

    console.log(`%c[Tasks API] 📤 Request: PUT ${endpoint}`, 'color: #f59e0b; font-weight: bold')

    try {
      const response = await axios.put(endpoint)

      console.log(
        `%c[Tasks API] ✅ Response (${response.status}):`,
        'color: #10b981; font-weight: bold',
        response.data
      )

      return response.data
    } catch (error: any) {
      console.error(`%c[Tasks API] ❌ Error:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        if (error.response.status === 404) {
          throw new Error('任务不存在')
        }
        throw new Error(error.response.data?.detail || `服务器错误 (${error.response.status})`)
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 恢复任务
   */
  async resumeTask(taskId: string): Promise<TaskResponse> {
    const endpoint = `/api/v1/tasks/${taskId}/resume`

    console.log(`%c[Tasks API] 📤 Request: PUT ${endpoint}`, 'color: #10b981; font-weight: bold')

    try {
      const response = await axios.put(endpoint)

      console.log(
        `%c[Tasks API] ✅ Response (${response.status}):`,
        'color: #10b981; font-weight: bold',
        response.data
      )

      return response.data
    } catch (error: any) {
      console.error(`%c[Tasks API] ❌ Error:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        if (error.response.status === 404) {
          throw new Error('任务不存在')
        }
        throw new Error(error.response.data?.detail || `服务器错误 (${error.response.status})`)
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<TaskResponse> {
    const endpoint = `/api/v1/tasks/${taskId}/cancel`

    console.log(`%c[Tasks API] 📤 Request: PUT ${endpoint}`, 'color: #ef4444; font-weight: bold')

    try {
      const response = await axios.put(endpoint)

      console.log(
        `%c[Tasks API] ✅ Response (${response.status}):`,
        'color: #10b981; font-weight: bold',
        response.data
      )

      return response.data
    } catch (error: any) {
      console.error(`%c[Tasks API] ❌ Error:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        if (error.response.status === 404) {
          throw new Error('任务不存在')
        }
        throw new Error(error.response.data?.detail || `服务器错误 (${error.response.status})`)
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    const endpoint = `/api/v1/tasks/${taskId}`

    console.log(
      `%c[Tasks API] 📤 Request: DELETE ${endpoint}`,
      'color: #ef4444; font-weight: bold'
    )

    try {
      await axios.delete(endpoint)

      console.log(`%c[Tasks API] ✅ Task Deleted`, 'color: #10b981; font-weight: bold')
    } catch (error: any) {
      console.error(`%c[Tasks API] ❌ Error:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        if (error.response.status === 404) {
          throw new Error('任务不存在')
        }
        throw new Error(error.response.data?.detail || `服务器错误 (${error.response.status})`)
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 获取任务日志
   */
  async getTaskLogs(
    taskId: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<TaskLogsResponse> {
    const endpoint = `/api/v1/tasks/${taskId}/logs`

    console.log(`%c[Tasks API] 📤 Request: GET ${endpoint}`, 'color: #3b82f6; font-weight: bold')
    console.log('%c[Tasks API] 📦 Params:', 'color: #6366f1', { skip, limit })

    try {
      const response = await axios.get(endpoint, {
        params: { skip, limit },
      })

      console.log(
        `%c[Tasks API] ✅ Response (${response.status}):`,
        'color: #10b981; font-weight: bold',
        response.data
      )

      return response.data
    } catch (error: any) {
      console.error(`%c[Tasks API] ❌ Error:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        if (error.response.status === 404) {
          throw new Error('任务不存在')
        }
        throw new Error(error.response.data?.detail || `服务器错误 (${error.response.status})`)
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '未知错误')
      }
    }
  },
}
