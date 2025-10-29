/**
 * 上传功能组合式函数
 */
import { ref, computed } from 'vue'
import { uploadManager } from '@/utils/upload/UploadManager'
import type { UploadTask } from '@/types/upload'
import type { PreCheckResponse } from '@/api/upload'

export function useUpload() {
  const tasks = ref<UploadTask[]>([])
  const updateTrigger = ref(0)

  // 定时更新任务列表
  const updateTasks = () => {
    const newTasks = uploadManager.getTasks()
    tasks.value = newTasks
    updateTrigger.value++
  }

  // 每秒更新一次
  setInterval(updateTasks, 1000)
  updateTasks()

  // 统计信息
  const statistics = computed(() => uploadManager.getStatistics())

  /**
   * 添加文件
   */
  const addFiles = async (
    files: File[],
    taskId: string = 'default',
    driveId: string,
    onMD5Progress?: (completed: number, total: number) => void,
    onDuplicateDetected?: (duplicatedCount: number, savedSize: number) => void,
    onPreCheckResult?: (result: PreCheckResponse) => Promise<boolean>
  ) => {
    // 批量添加文件并创建服务器端任务
    await uploadManager.addBatchTask(
      files,
      taskId,
      driveId,
      onMD5Progress,
      onDuplicateDetected,
      onPreCheckResult
    )
    updateTasks()
  }

  /**
   * 暂停任务
   */
  const pauseTask = (taskId: string) => {
    uploadManager.pauseTask(taskId)
    updateTasks()
  }

  /**
   * 恢复任务
   */
  const resumeTask = async (taskId: string) => {
    await uploadManager.resumeTask(taskId)
    updateTasks()
  }

  /**
   * 取消任务
   */
  const cancelTask = async (taskId: string) => {
    await uploadManager.cancelTask(taskId)
    updateTasks()
  }

  /**
   * 删除任务
   */
  const removeTask = (taskId: string) => {
    uploadManager.removeTask(taskId)
    updateTasks()
  }

  /**
   * 清空已完成任务
   */
  const clearCompleted = () => {
    uploadManager.clearCompleted()
    updateTasks()
  }

  /**
   * 格式化文件大小
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  /**
   * 格式化速度
   */
  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatFileSize(bytesPerSecond)}/s`
  }

  /**
   * 格式化时间
   */
  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return '--:--'

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  return {
    tasks,
    statistics,
    updateTrigger,
    addFiles,
    pauseTask,
    resumeTask,
    cancelTask,
    removeTask,
    clearCompleted,
    formatFileSize,
    formatSpeed,
    formatTime,
  }
}
