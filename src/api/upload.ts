/**
 * 上传相关 API
 */
import axios from './axios-config'
import type { STSCredentials } from '@/types/upload'

// 上传清单文件信息
export interface UploadManifestFile {
  index: number
  local_path: string
  target_folder_path: string
  file_name: string
  file_size: number
  md5?: string
  mime_type?: string
  modified_time?: string
}

// 上传清单
export interface UploadManifest {
  task_name: string
  drive_id: string
  priority?: number
  total_files: number
  total_size: number
  client_info?: {
    platform: string
    version: string
    ip?: string
  }
  files: UploadManifestFile[]
}

// 创建上传任务请求
export interface CreateUploadTaskRequest {
  upload_manifest: UploadManifest
}

// 创建上传任务响应
export interface CreateUploadTaskResponse {
  id: string
  user_id: string
  drive_id: string
  task_name: string
  status: string
  priority: number
  total_files: number
  uploaded_files: number
  total_size: number
  uploaded_size: number
  created_at: string
}

// 文件完成通知请求
export interface FileCompleteRequest {
  oss_key: string
  oss_url: string
  md5?: string
  file_size: number
}

// 任务文件响应
export interface TaskFileResponse {
  id: string
  task_id: string
  file_id?: string
  local_path: string
  target_folder_path: string
  file_name: string
  file_size: number
  md5?: string
  mime_type?: string
  status: string
  upload_progress: number
  oss_key?: string
  oss_url?: string
  is_duplicated: boolean
  created_at: string
  updated_at?: string
  completed_at?: string
}

// 批量 MD5 检查请求
export interface CheckFilesRequest {
  files: {
    index: number
    file_name: string
    md5: string
    file_size: number
    task_file_id: string  // 服务端必需字段
  }[]
}

// 批量 MD5 检查响应
export interface CheckFilesResponse {
  duplicated_files: {
    index: number
    file_name: string
    md5: string
    file_id: string // 已存在的文件ID
    oss_url: string // 已存在文件的URL
  }[]
  new_files: {
    index: number
    file_name: string
  }[]
  stats: {
    total_files: number
    duplicated_count: number
    new_count: number
    saved_size: number // 节省的存储空间(字节)
  }
}

// 预检请求
export interface PreCheckFileItem {
  index: number
  file_name: string
  file_size: number
  local_path?: string
  file_type: 'maya' | 'blender' | 'c4d' | 'max' | 'other'
}

export interface PreCheckRequest {
  files: PreCheckFileItem[]
}

// 预检问题
export interface PreCheckIssue {
  type: string // 'missing_dependency' | 'chinese_path' | 'invalid_characters' | 'path_too_long' | ...
  severity: 'error' | 'warning' | 'info'
  message: string
  details?: any
}

// 预检文件结果
export interface PreCheckFileResult {
  file_index: number
  file_name: string
  severity: 'error' | 'warning' | 'info' | 'success'
  issues: PreCheckIssue[]
}

// 预检响应
export interface PreCheckResponse {
  check_id: string
  status: 'pending' | 'completed' | 'failed'
  results: PreCheckFileResult[]
  summary: {
    total_files: number
    error_count: number
    warning_count: number
    can_proceed: boolean
  }
}

export const uploadAPI = {
  /**
   * 批量检查文件MD5 (秒传检测)
   */
  async checkFiles(taskId: string, request: CheckFilesRequest): Promise<CheckFilesResponse> {
    const endpoint = `/api/v1/upload-tasks/${taskId}/files/check`

    // 📤 请求日志
    console.log(`%c[Upload API] 📤 Request: POST ${endpoint}`, 'color: #8b5cf6; font-weight: bold')
    console.log('%c[Upload API] 📦 Payload:', 'color: #a78bfa', {
      task_id: taskId,
      files_count: request.files.length,
      files: request.files
    })

    try {
      const response = await axios.post(endpoint, request)

      // ✅ 成功响应日志
      console.log(`%c[Upload API] ✅ MD5 Check Response (${response.status}):`, 'color: #10b981; font-weight: bold', response.data)
      console.log('%c[Upload API] 📊 Stats:', 'color: #10b981', response.data.stats)

      return response.data
    } catch (error: any) {
      // ❌ 错误响应日志
      console.error(`%c[Upload API] ❌ MD5 Check Failed:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        console.error(`%c[Upload API] 💥 Server Error (${error.response.status}):`, 'color: #dc2626', {
          status: error.response.status,
          detail: error.response.data?.detail,
          full_response: error.response.data
        })

        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        throw new Error(
          error.response.data?.detail || `服务器错误 (${error.response.status})`
        )
      } else if (error.request) {
        console.error('%c[Upload API] 🔌 Network Error:', 'color: #f59e0b', error.request)
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        console.error('%c[Upload API] ⚠️ Unknown Error:', 'color: #f97316', error.message)
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 获取 OSS 上传凭证（STS 临时授权）
   */
  async getUploadCredentials(taskId: string, fileName: string): Promise<STSCredentials> {
    try {
      const response = await axios.post('/api/v1/files/get-upload-credentials', {
        taskId,
        fileName,
      })

      return response.data
    } catch (error: any) {
      console.error('获取上传凭证失败:', error)

      if (error.response) {
        // 服务器返回错误
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        throw new Error(
          error.response.data?.detail || `服务器错误 (${error.response.status})`
        )
      } else if (error.request) {
        // 请求已发送但没有收到响应
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        // 其他错误
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 创建上传任务
   */
  async createUploadTask(request: CreateUploadTaskRequest): Promise<CreateUploadTaskResponse> {
    try {
      const response = await axios.post('/api/v1/upload-tasks', request)
      return response.data
    } catch (error: any) {
      console.error('创建上传任务失败:', error)

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
   * 标记文件上传完成
   */
  async markFileComplete(
    taskId: string,
    fileId: string,
    request: FileCompleteRequest
  ): Promise<TaskFileResponse> {
    const endpoint = `/api/v1/upload-tasks/${taskId}/files/${fileId}/complete`

    // 📤 请求日志
    console.log(`%c[Upload API] 📤 Request: POST ${endpoint}`, 'color: #3b82f6; font-weight: bold')
    console.log('%c[Upload API] 📦 Payload:', 'color: #6366f1', {
      task_id: taskId,
      file_id: fileId,
      ...request
    })

    try {
      const response = await axios.post(endpoint, request)

      // ✅ 成功响应日志
      console.log(`%c[Upload API] ✅ Response (${response.status}):`, 'color: #10b981; font-weight: bold', response.data)
      console.log('%c[Upload API] 🎯 Key Fields:', 'color: #10b981', {
        file_id: response.data.file_id,
        status: response.data.status,
        oss_key: response.data.oss_key,
        oss_url: response.data.oss_url?.substring(0, 50) + '...'
      })

      return response.data
    } catch (error: any) {
      // ❌ 错误响应日志
      console.error(`%c[Upload API] ❌ Error:`, 'color: #ef4444; font-weight: bold', error)

      if (error.response) {
        console.error(`%c[Upload API] 💥 Server Error (${error.response.status}):`, 'color: #dc2626', {
          status: error.response.status,
          detail: error.response.data?.detail,
          full_response: error.response.data
        })

        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        throw new Error(
          error.response.data?.detail || `服务器错误 (${error.response.status})`
        )
      } else if (error.request) {
        console.error('%c[Upload API] 🔌 Network Error:', 'color: #f59e0b', error.request)
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        console.error('%c[Upload API] ⚠️ Unknown Error:', 'color: #f97316', error.message)
        throw new Error(error.message || '未知错误')
      }
    }
  },

  /**
   * 获取任务文件列表
   */
  async getTaskFiles(taskId: string): Promise<{ files: TaskFileResponse[]; total: number }> {
    try {
      const response = await axios.get(`/api/v1/upload-tasks/${taskId}/files`)
      return response.data
    } catch (error: any) {
      console.error('获取任务文件列表失败:', error)

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
   * 上传前智能预检
   */
  async preCheck(taskId: string, request: PreCheckRequest): Promise<PreCheckResponse> {
    try {
      const response = await axios.post(`/api/v1/upload-tasks/${taskId}/pre-check`, request)
      return response.data
    } catch (error: any) {
      console.error('智能预检失败:', error)

      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('登录已过期，请重新登录')
        }
        throw new Error(
          error.response.data?.detail || `预检失败 (${error.response.status})`
        )
      } else if (error.request) {
        throw new Error('网络连接失败，请检查网络或后端服务是否运行')
      } else {
        throw new Error(error.message || '预检失败')
      }
    }
  },
}
