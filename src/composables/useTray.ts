/**
 * 托盘相关功能 Composable
 */
import { uploadManager } from '@/utils/upload/UploadManager'

export function useTray() {
  // 缓存当前状态,避免重复更新
  let lastTrayStatus: 'normal' | 'uploading' | 'notification' | null = null
  let lastBadgeCount: number | null = null

  /**
   * 更新托盘图标状态
   */
  const updateTrayStatus = (status: 'normal' | 'uploading' | 'notification') => {
    if (window.electronAPI) {
      window.electronAPI.updateTrayIcon(status)
    }
  }

  /**
   * 更新托盘未读数（未完成任务数）
   */
  const updateTrayBadge = (count: number) => {
    if (window.electronAPI) {
      window.electronAPI.updateTrayBadge(count)
    }
  }

  /**
   * 监听上传任务变化，自动更新托盘状态
   */
  const setupTrayWatcher = () => {
    // 定时检查上传任务状态
    const interval = setInterval(() => {
      const stats = uploadManager.getStatistics()

      // 更新未完成任务数
      const unfinishedCount = stats.uploadingTasks + stats.waitingTasks

      // 只在数量变化时更新
      if (unfinishedCount !== lastBadgeCount) {
        updateTrayBadge(unfinishedCount)
        lastBadgeCount = unfinishedCount
      }

      // 确定新的托盘图标状态
      let newStatus: 'normal' | 'uploading' | 'notification'
      if (stats.uploadingTasks > 0) {
        newStatus = 'uploading'
      } else if (unfinishedCount > 0) {
        newStatus = 'notification'
      } else {
        newStatus = 'normal'
      }

      // 只在状态真正改变时更新托盘图标
      if (newStatus !== lastTrayStatus) {
        updateTrayStatus(newStatus)
        lastTrayStatus = newStatus
      }
    }, 1000) // 每秒更新一次

    return interval
  }

  /**
   * 监听主进程消息
   */
  const setupEventListeners = () => {
    if (!window.electronAPI) return

    // 监听"暂停所有任务"消息
    window.electronAPI.onPauseAllTasks(() => {
      console.log('Received pause-all-tasks from main process')
      const tasks = uploadManager.getTasks()
      tasks.forEach((task) => {
        if (task.status === 'uploading') {
          uploadManager.pauseTask(task.id)
        }
      })
    })

    // 监听"打开设置"消息
    window.electronAPI.onOpenSettings(() => {
      console.log('Received open-settings from main process')
      // 这里可以触发打开设置对话框的事件
      // 例如：eventBus.emit('open-settings')
    })
  }

  return {
    updateTrayStatus,
    updateTrayBadge,
    setupTrayWatcher,
    setupEventListeners,
  }
}
