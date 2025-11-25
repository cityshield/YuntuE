/**
 * 下载功能 API 接口
 */
import axios from './axios-config'
import type {
  OSSDownloadCredentials,
  TaskOutputFile,
} from '@/types/download'

export const downloadAPI = {
  /**
   * 获取任务的输出文件列表 (渲染结果、日志等)
   * @param taskId 渲染任务ID
   * @returns 文件列表
   */
  async getTaskOutputFiles(taskId: string): Promise<TaskOutputFile[]> {
    const response = await axios.get(`/api/v1/tasks/${taskId}/outputs`)
    return response.data.files || []
  },

  /**
   * 获取 OSS 下载凭证 (STS 临时读权限)
   * @param taskId 渲染任务ID
   * @param ossKey OSS 对象键
   * @returns OSS 下载凭证
   */
  async getDownloadCredentials(
    taskId: string,
    ossKey: string
  ): Promise<OSSDownloadCredentials> {
    const response = await axios.post('/api/v1/files/get-download-credentials', {
      task_id: taskId,
      oss_key: ossKey,
    })
    return response.data
  },

  /**
   * 标记文件已下载 (可选,用于统计)
   * @param taskId 渲染任务ID
   * @param fileId 文件ID
   */
  async markFileDownloaded(taskId: string, fileId: string): Promise<void> {
    await axios.post(`/api/v1/tasks/${taskId}/files/${fileId}/downloaded`, {
      downloaded_at: new Date().toISOString(),
    })
  },

  /**
   * 获取任务的所有下载历史
   * @param taskId 渲染任务ID
   * @returns 下载记录列表
   */
  async getDownloadHistory(taskId: string): Promise<any[]> {
    const response = await axios.get(`/api/v1/tasks/${taskId}/download-history`)
    return response.data.records || []
  },
}

export default downloadAPI
