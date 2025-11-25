/**
 * 下载功能 Composable
 * 提供下载任务管理的响应式接口
 */
import { computed } from 'vue'
import { downloadManager } from '@/utils/download/DownloadManager'
import type { DownloadTask, DownloadStatus } from '@/types/download'
import type { TaskResponse } from '@/types/task'

export function useDownload() {
  /**
   * 获取所有下载任务
   */
  const tasks = computed<DownloadTask[]>(() => {
    return downloadManager.getTasks()
  })

  /**
   * 获取下载统计
   */
  const stats = computed(() => {
    return downloadManager.getStats()
  })

  /**
   * 按状态筛选任务
   */
  const getTasksByStatus = (status?: DownloadStatus): DownloadTask[] => {
    const allTasks = downloadManager.getTasks()
    if (!status) {
      return allTasks
    }
    return allTasks.filter(t => t.status === status)
  }

  /**
   * 添加下载任务 (从渲染任务)
   */
  const addTaskFromRenderTask = async (renderTask: TaskResponse): Promise<void> => {
    await downloadManager.addTaskFromRenderTask(renderTask)
  }

  /**
   * 暂停下载
   */
  const pauseTask = (taskId: string): void => {
    downloadManager.pauseTask(taskId)
  }

  /**
   * 继续下载
   */
  const resumeTask = (taskId: string): void => {
    downloadManager.resumeTask(taskId)
  }

  /**
   * 取消下载
   */
  const cancelTask = (taskId: string): void => {
    downloadManager.cancelTask(taskId)
  }

  /**
   * 重试下载
   */
  const retryTask = (taskId: string): void => {
    downloadManager.retryTask(taskId)
  }

  /**
   * 清除已完成的任务
   */
  const clearCompletedTasks = (): void => {
    downloadManager.clearCompletedTasks()
  }

  /**
   * 格式化文件大小
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
  }

  /**
   * 格式化下载速度
   */
  const formatSpeed = (bytesPerSecond: number): string => {
    return formatFileSize(bytesPerSecond) + '/s'
  }

  /**
   * 格式化剩余时间
   */
  const formatRemainingTime = (seconds: number): string => {
    if (seconds <= 0 || !isFinite(seconds)) {
      return '--:--'
    }

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  return {
    // 数据
    tasks,
    stats,

    // 方法
    getTasksByStatus,
    addTaskFromRenderTask,
    pauseTask,
    resumeTask,
    cancelTask,
    retryTask,
    clearCompletedTasks,

    // 格式化工具
    formatFileSize,
    formatSpeed,
    formatRemainingTime,
  }
}

export default useDownload
