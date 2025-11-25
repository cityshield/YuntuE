/**
 * 下载管理器
 * 负责下载队列管理、并发控制、持久化存储
 */
import { reactive, ref } from 'vue'
import { ElNotification } from 'element-plus'
import OSSDownloader from './OSSDownloader'
import downloadAPI from '@/api/download'
import type {
  DownloadTask,
  DownloadManagerConfig,
  TaskOutputFile,
} from '@/types/download'
import { DownloadStatus } from '@/types/download'
import type { TaskResponse } from '@/types/task'
import { useUserStore } from '@/stores/user'

export class DownloadManager {
  // 下载任务Map
  private tasks = reactive<Map<string, DownloadTask>>(new Map())

  // 下载器Map
  private downloaders = new Map<string, OSSDownloader>()

  // 配置
  private config: DownloadManagerConfig = {
    maxConcurrent: 3,
    defaultSavePath: '',
    autoRetry: true,
    maxRetryCount: 3,
    enableNotification: true,
  }

  // 正在运行的下载数
  private runningCount = ref(0)

  constructor(config?: Partial<DownloadManagerConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }

    // 从配置中读取默认保存路径
    this.loadConfigFromElectron()

    // 从localStorage恢复任务
    this.loadTasksFromStorage()
  }

  /**
   * 从 Electron 配置中加载默认保存路径
   */
  private async loadConfigFromElectron(): Promise<void> {
    try {
      if (window.electronAPI?.configGet) {
        const downloadPath = await window.electronAPI.configGet('downloadPath')
        if (downloadPath) {
          this.config.defaultSavePath = downloadPath
        }
      }
    } catch (error) {
      console.error('[DownloadManager] 加载默认保存路径失败:', error)
    }
  }

  /**
   * 从localStorage加载任务
   */
  private loadTasksFromStorage(): void {
    try {
      const userStore = useUserStore()
      const userId = userStore.user?.id || 'anonymous'
      const key = `download_tasks_${userId}`
      const data = localStorage.getItem(key)

      if (data) {
        const tasks: DownloadTask[] = JSON.parse(data)
        tasks.forEach(task => {
          // 恢复未完成的任务为等待状态
          if (task.status === DownloadStatus.DOWNLOADING) {
            task.status = DownloadStatus.WAITING
          }
          this.tasks.set(task.id, task)
        })

        console.log(`[DownloadManager] 从存储恢复了 ${tasks.length} 个任务`)
      }
    } catch (error) {
      console.error('[DownloadManager] 加载任务失败:', error)
    }
  }

  /**
   * 保存任务到localStorage
   */
  private saveTasksToStorage(): void {
    try {
      const userStore = useUserStore()
      const userId = userStore.user?.id || 'anonymous'
      const key = `download_tasks_${userId}`

      const tasks = Array.from(this.tasks.values())
      localStorage.setItem(key, JSON.stringify(tasks))
    } catch (error) {
      console.error('[DownloadManager] 保存任务失败:', error)
    }
  }

  /**
   * 生成下载任务ID
   */
  private generateTaskId(): string {
    return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 选择保存路径
   */
  private async selectSavePath(fileName: string): Promise<string> {
    try {
      if (window.electronAPI?.selectSavePath) {
        const defaultPath = `${this.config.defaultSavePath}/${fileName}`
        const result = await window.electronAPI.selectSavePath(defaultPath)

        if (result.canceled || !result.filePath) {
          throw new Error('用户取消了文件选择')
        }

        return result.filePath
      } else {
        // 降级: 使用默认路径
        return `${this.config.defaultSavePath}/${fileName}`
      }
    } catch (error: any) {
      console.error('[DownloadManager] 选择保存路径失败:', error)
      throw error
    }
  }

  /**
   * 添加下载任务 (从渲染任务)
   * @param renderTask 渲染任务
   */
  async addTaskFromRenderTask(renderTask: TaskResponse): Promise<void> {
    try {
      // 获取任务的输出文件列表
      const files = await downloadAPI.getTaskOutputFiles(renderTask.id)

      if (files.length === 0) {
        ElNotification({
          title: '无可下载文件',
          message: `任务 "${renderTask.task_name}" 没有可下载的文件`,
          type: 'warning',
        })
        return
      }

      // 为每个文件创建下载任务
      for (const file of files) {
        await this.addTask(renderTask, file)
      }

      this.saveTasksToStorage()
      this.processQueue()

      if (this.config.enableNotification) {
        ElNotification({
          title: '已添加到下载队列',
          message: `${files.length} 个文件已添加到下载队列`,
          type: 'success',
        })
      }
    } catch (error: any) {
      console.error('[DownloadManager] 添加下载任务失败:', error)
      ElNotification({
        title: '添加失败',
        message: error.message || '添加下载任务失败',
        type: 'error',
      })
    }
  }

  /**
   * 添加测试下载任务 (仅用于测试环境)
   * @param mockTask 模拟的下载任务数据
   */
  async addTestTask(mockTask: Partial<DownloadTask> & {
    fileName: string
    fileSize: number
    ossKey: string
    ossUrl: string
  }): Promise<string> {
    const taskId = this.generateTaskId()

    const task: DownloadTask = {
      id: taskId,
      taskId: mockTask.taskId || 'test_render_task',
      taskName: mockTask.taskName || '测试任务',
      fileType: mockTask.fileType || 'result',
      fileName: mockTask.fileName,
      fileSize: mockTask.fileSize,
      md5: mockTask.md5,
      ossKey: mockTask.ossKey,
      ossUrl: mockTask.ossUrl,
      status: DownloadStatus.WAITING,
      progress: 0,
      downloadedSize: 0,
      speed: 0,
      remainingTime: 0,
      savePath: mockTask.savePath || `/tmp/test_downloads/${mockTask.fileName}`,
      retryCount: 0,
      createdAt: Date.now(),
    }

    this.tasks.set(taskId, task)
    this.saveTasksToStorage()

    // 测试任务不自动开始下载,仅创建任务对象供测试使用
    // 测试面板需要手动控制状态变化

    return taskId
  }

  /**
   * 添加单个下载任务
   */
  private async addTask(renderTask: TaskResponse, file: TaskOutputFile): Promise<void> {
    const taskId = this.generateTaskId()

    // 检查是否已存在
    const existingTask = Array.from(this.tasks.values()).find(
      t => t.ossKey === file.oss_key && t.status === DownloadStatus.SUCCESS
    )

    if (existingTask) {
      console.log('[DownloadManager] 文件已下载,跳过:', file.file_name)
      return
    }

    // 选择保存路径
    let savePath: string
    try {
      savePath = await this.selectSavePath(file.file_name)
    } catch (error) {
      console.log('[DownloadManager] 用户取消选择路径,跳过该文件')
      return
    }

    const task: DownloadTask = {
      id: taskId,
      taskId: renderTask.id,
      taskName: renderTask.task_name,
      fileType: file.file_type,
      fileName: file.file_name,
      fileSize: file.file_size,
      md5: file.md5,
      ossKey: file.oss_key,
      ossUrl: file.oss_url,
      status: DownloadStatus.WAITING,
      progress: 0,
      downloadedSize: 0,
      speed: 0,
      remainingTime: 0,
      savePath,
      retryCount: 0,
      createdAt: Date.now(),
    }

    this.tasks.set(taskId, task)
  }

  /**
   * 处理下载队列
   */
  private async processQueue(): Promise<void> {
    // 检查是否有空闲槽位
    this.runningCount.value = Array.from(this.tasks.values()).filter(
      t => t.status === DownloadStatus.DOWNLOADING
    ).length

    if (this.runningCount.value >= this.config.maxConcurrent) {
      return
    }

    // 查找等待中的任务
    const waitingTask = Array.from(this.tasks.values()).find(
      t => t.status === DownloadStatus.WAITING
    )

    if (!waitingTask) {
      return
    }

    // 开始下载
    await this.startDownload(waitingTask)

    // 递归处理下一个任务
    this.processQueue()
  }

  /**
   * 开始下载任务
   */
  private async startDownload(task: DownloadTask): Promise<void> {
    try {
      console.log(`[DownloadManager] 开始下载: ${task.fileName}`)

      task.status = DownloadStatus.DOWNLOADING
      task.startedAt = Date.now()
      this.saveTasksToStorage()

      // 获取OSS下载凭证
      const credentials = await downloadAPI.getDownloadCredentials(task.taskId, task.ossKey)

      // 创建下载器
      const downloader = new OSSDownloader({
        credentials,
        fileName: task.fileName,
        fileSize: task.fileSize,
        md5: task.md5,
        savePath: task.savePath,
        onProgress: (progress) => {
          task.progress = Math.floor(progress.percent * 100)
          task.downloadedSize = progress.downloadedSize
          task.speed = progress.speed
          task.remainingTime = progress.remainingTime

          // 每秒保存一次 (避免频繁写入)
          if (task.progress % 10 === 0) {
            this.saveTasksToStorage()
          }
        },
        onSuccess: async () => {
          console.log(`[DownloadManager] 下载成功: ${task.fileName}`)
          task.status = DownloadStatus.SUCCESS
          task.progress = 100
          task.completedAt = Date.now()

          // 标记文件已下载 (可选)
          try {
            const file = await this.findFileByOssKey(task.taskId, task.ossKey)
            if (file) {
              await downloadAPI.markFileDownloaded(task.taskId, file.id)
            }
          } catch (error) {
            console.error('[DownloadManager] 标记文件下载失败:', error)
          }

          // 系统通知
          if (this.config.enableNotification && window.electronAPI?.showNotification) {
            window.electronAPI.showNotification({
              title: '下载完成',
              body: `${task.fileName} 已下载完成`,
            })
          }

          this.downloaders.delete(task.id)
          this.saveTasksToStorage()
          this.processQueue()
        },
        onError: async (error) => {
          console.error(`[DownloadManager] 下载失败: ${task.fileName}`, error)
          task.error = error.message

          // 自动重试
          if (this.config.autoRetry && (task.retryCount || 0) < this.config.maxRetryCount) {
            task.retryCount = (task.retryCount || 0) + 1
            task.status = DownloadStatus.WAITING
            console.log(`[DownloadManager] 自动重试 (${task.retryCount}/${this.config.maxRetryCount})`)

            setTimeout(() => {
              this.processQueue()
            }, 3000) // 3秒后重试
          } else {
            task.status = DownloadStatus.FAILED
            this.downloaders.delete(task.id)
            this.saveTasksToStorage()
            this.processQueue()

            // 错误通知
            if (this.config.enableNotification) {
              ElNotification({
                title: '下载失败',
                message: `${task.fileName}: ${error.message}`,
                type: 'error',
              })
            }
          }
        },
      })

      this.downloaders.set(task.id, downloader)
      await downloader.start()
    } catch (error: any) {
      console.error('[DownloadManager] 启动下载失败:', error)
      task.status = DownloadStatus.FAILED
      task.error = error.message
      this.saveTasksToStorage()
      this.processQueue()
    }
  }

  /**
   * 根据OSSKey查找文件
   */
  private async findFileByOssKey(taskId: string, ossKey: string): Promise<TaskOutputFile | null> {
    try {
      const files = await downloadAPI.getTaskOutputFiles(taskId)
      return files.find(f => f.oss_key === ossKey) || null
    } catch (error) {
      return null
    }
  }

  /**
   * 暂停下载
   */
  pauseTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== DownloadStatus.DOWNLOADING) {
      return
    }

    const downloader = this.downloaders.get(taskId)
    if (downloader) {
      downloader.pause()
    }

    task.status = DownloadStatus.PAUSED
    task.pausedAt = Date.now()
    this.saveTasksToStorage()
    this.processQueue()
  }

  /**
   * 继续下载
   */
  resumeTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== DownloadStatus.PAUSED) {
      return
    }

    task.status = DownloadStatus.WAITING
    this.saveTasksToStorage()
    this.processQueue()
  }

  /**
   * 取消下载
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    const downloader = this.downloaders.get(taskId)
    if (downloader) {
      downloader.abort()
      this.downloaders.delete(taskId)
    }

    this.tasks.delete(taskId)
    this.saveTasksToStorage()
    this.processQueue()
  }

  /**
   * 重试下载
   */
  retryTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== DownloadStatus.FAILED) {
      return
    }

    task.status = DownloadStatus.WAITING
    task.error = undefined
    task.retryCount = 0
    this.saveTasksToStorage()
    this.processQueue()
  }

  /**
   * 清除已完成的任务
   */
  clearCompletedTasks(): void {
    const completedTasks = Array.from(this.tasks.entries()).filter(
      ([_, task]) => task.status === DownloadStatus.SUCCESS
    )

    completedTasks.forEach(([id, _]) => {
      this.tasks.delete(id)
    })

    this.saveTasksToStorage()
  }

  /**
   * 获取所有任务
   */
  getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * 获取单个任务
   */
  getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * 更新任务状态 (仅用于测试环境)
   * 允许测试面板直接修改任务状态和进度
   */
  updateTestTask(taskId: string, updates: Partial<DownloadTask>): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      console.warn(`[DownloadManager] 测试任务不存在: ${taskId}`)
      return
    }

    // 更新任务属性
    Object.assign(task, updates)
    this.saveTasksToStorage()
  }

  /**
   * 获取任务统计
   */
  getStats(): {
    total: number
    waiting: number
    downloading: number
    paused: number
    success: number
    failed: number
  } {
    const tasks = this.getTasks()
    return {
      total: tasks.length,
      waiting: tasks.filter(t => t.status === DownloadStatus.WAITING).length,
      downloading: tasks.filter(t => t.status === DownloadStatus.DOWNLOADING).length,
      paused: tasks.filter(t => t.status === DownloadStatus.PAUSED).length,
      success: tasks.filter(t => t.status === DownloadStatus.SUCCESS).length,
      failed: tasks.filter(t => t.status === DownloadStatus.FAILED).length,
    }
  }
}

// 导出单例
export const downloadManager = new DownloadManager()
export default downloadManager
