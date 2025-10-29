/**
 * 上传管理器 - 队列管理和并发控制
 */
import { ref, reactive } from 'vue'
import type { UploadTask, UploadConfig } from '@/types/upload'
import { UploadStatus as Status } from '@/types/upload'
import { OSSUploader } from './OSSUploader'
import { uploadAPI } from '@/api/upload'
import type {
  UploadManifestFile,
  CheckFilesRequest,
  PreCheckRequest,
  PreCheckResponse,
} from '@/api/upload'
import { calculateBatchMD5 } from '@/utils/md5'

export class UploadManager {
  private tasks = reactive<Map<string, UploadTask>>(new Map())
  private uploaders = new Map<string, OSSUploader>()
  private config: UploadConfig
  private runningCount = ref(0)

  constructor(config?: Partial<UploadConfig>) {
    this.config = {
      chunkSize: 10 * 1024 * 1024,                  // 10MB
      maxConcurrent: 3,                              // 最多3个并发
      maxFileSize: 20 * 1024 * 1024 * 1024,         // 20GB
      timeout: 120000,                               // 2分钟
      retryCount: 3,                                 // 重试3次
      acceptTypes: ['.ma', '.mb', '.zip', '.rar', '.blend', '.c4d', '.max', '.fbx'],
      ...config,
    }
  }

  /**
   * 检测文件类型
   */
  private detectFileType(fileName: string): 'maya' | 'blender' | 'c4d' | 'max' | 'other' {
    const ext = fileName.toLowerCase().split('.').pop()
    switch (ext) {
      case 'ma':
      case 'mb':
        return 'maya'
      case 'blend':
        return 'blender'
      case 'c4d':
        return 'c4d'
      case 'max':
        return 'max'
      default:
        return 'other'
    }
  }

  /**
   * 批量添加上传任务（创建服务器端任务 + MD5 秒传检测）
   */
  async addBatchTask(
    files: File[],
    taskId: string = 'default',
    driveId: string,
    onMD5Progress?: (completed: number, total: number) => void,
    onDuplicateDetected?: (duplicatedCount: number, savedSize: number) => void,
    onPreCheckResult?: (result: PreCheckResponse) => Promise<boolean>
  ): Promise<void> {
    try {
      // ===== 第零步: 智能预检 (仅检测场景文件) =====
      const sceneFiles = files.filter((file) => {
        const fileType = this.detectFileType(file.name)
        return fileType !== 'other' // Maya/Blender/C4D/Max 文件
      })

      if (sceneFiles.length > 0 && onPreCheckResult) {
        console.log(`Step 0: Pre-checking ${sceneFiles.length} scene files...`)

        try {
          const preCheckRequest: PreCheckRequest = {
            files: sceneFiles.map((file, index) => ({
              index,
              file_name: file.name,
              file_size: file.size,
              // @ts-ignore - Electron环境下File对象有path属性
              local_path: file.path,
              file_type: this.detectFileType(file.name),
            })),
          }

          // 调用预检API (使用临时task_id)
          const tempTaskId = `temp_${Date.now()}`
          const preCheckResult = await uploadAPI.preCheck(tempTaskId, preCheckRequest)

          console.log('Pre-check result:', preCheckResult)

          // 如果有错误或警告,显示预检对话框
          if (
            preCheckResult.summary.error_count > 0 ||
            preCheckResult.summary.warning_count > 0
          ) {
            const userConfirmed = await onPreCheckResult(preCheckResult)
            if (!userConfirmed) {
              console.log('User canceled upload due to pre-check issues')
              return // 用户选择"返回修改"
            }
            console.log('User chose to proceed despite pre-check issues')
          }
        } catch (error) {
          console.warn('Pre-check failed, continuing with upload:', error)
          // 预检失败时降级处理:继续上传流程
        }
      }

      console.log(`Creating server upload task for ${files.length} files...`)

      // 第一步:计算所有文件的 MD5
      console.log('Step 1: Calculating MD5 for all files...')
      const md5Results = await calculateBatchMD5(files, (completed, total) => {
        console.log(`MD5 progress: ${completed}/${total}`)
        if (onMD5Progress) {
          onMD5Progress(completed, total)
        }
      })

      // 构造上传清单（带 MD5）
      const manifestFiles: UploadManifestFile[] = md5Results.map((result, index) => ({
        index,
        local_path: result.file.name,
        target_folder_path: '/',
        file_name: result.file.name,
        file_size: result.file.size,
        md5: result.md5,
        mime_type: result.file.type || undefined,
      }))

      // 第二步: 创建服务器端任务
      console.log('Step 2: Creating server upload task...')
      const taskName = `Upload ${new Date().toLocaleString()}`
      const response = await uploadAPI.createUploadTask({
        upload_manifest: {
          task_name: taskName,
          drive_id: driveId,
          priority: 5,
          total_files: files.length,
          total_size: files.reduce((sum, f) => sum + f.size, 0),
          client_info: {
            platform: navigator.platform || 'unknown',
            version: '1.0.0',
          },
          files: manifestFiles,
        },
      })

      console.log(`Server task created: ${response.id}`)

      // 第三步: 获取任务文件列表（必须先获取task_file_id）
      console.log('Step 3: Getting task files from server...')
      const taskFilesResponse = await uploadAPI.getTaskFiles(response.id)
      const taskFiles = taskFilesResponse.files

      console.log(`Got ${taskFiles.length} task files from server`)

      // 建立文件名到 TaskFile ID 的映射
      const fileMap = new Map<string, string>() // fileName -> task_file_id
      taskFiles.forEach((tf) => {
        fileMap.set(tf.file_name, tf.id)
      })

      // 第四步: 批量 MD5 检查（秒传检测） - 现在可以包含task_file_id了
      console.log('Step 4: Checking for duplicate files (MD5)...')

      let checkResult: any
      try {
        const checkRequest: CheckFilesRequest = {
          files: md5Results.map((result, index) => {
            const taskFileId = fileMap.get(result.file.name)
            if (!taskFileId) {
              console.warn(`No task_file_id found for ${result.file.name}`)
            }
            return {
              index,
              file_name: result.file.name,
              md5: result.md5,
              file_size: result.file.size,
              task_file_id: taskFileId || '',  // 添加 task_file_id
            }
          }),
        }

        checkResult = await uploadAPI.checkFiles(response.id, checkRequest)

        console.log(
          `Duplicate detection result: ${checkResult.stats.duplicated_count} duplicated, ${checkResult.stats.new_count} new`
        )
        console.log(`Saved storage: ${this.formatFileSize(checkResult.stats.saved_size)}`)

        // 通知用户秒传结果
        if (onDuplicateDetected && checkResult.stats.duplicated_count > 0) {
          onDuplicateDetected(
            checkResult.stats.duplicated_count,
            checkResult.stats.saved_size
          )
        }

        // 显示秒传通知
        if (checkResult.stats.duplicated_count > 0 && window.electronAPI) {
          window.electronAPI.showNotification({
            title: '秒传成功',
            body: `${checkResult.stats.duplicated_count} 个文件已秒传,节省 ${this.formatFileSize(checkResult.stats.saved_size)} 存储空间`,
            urgency: 'normal',
          })
        }
      } catch (error) {
        console.warn('MD5 check failed, skipping deduplication:', error)
        // MD5检查失败时，假设所有文件都需要上传
        checkResult = {
          duplicated_files: [],
          new_files: files.map((f, index) => ({ index, file_name: f.name })),
          stats: {
            total_files: files.length,
            duplicated_count: 0,
            new_count: files.length,
            saved_size: 0
          }
        }
      }

      // 第五步: 创建本地任务（只为需要上传的文件创建）
      files.forEach((file) => {
        const md5Info = md5Results.find((r) => r.file.name === file.name)

        // 检查是否已秒传
        const isDuplicated = checkResult.duplicated_files.some((d: any) => d.file_name === file.name)

        if (isDuplicated) {
          // 秒传文件，直接标记为成功
          console.log(`File ${file.name} is duplicated, skipping upload`)
          const task = this.addTask(file, taskId, true) // 延迟触发队列
          if (task) {
            task.serverTaskId = response.id
            task.serverFileId = fileMap.get(file.name)
            task.status = Status.SUCCESS
            task.progress = 100
            task.uploadedSize = file.size
            task.completedAt = Date.now()
            task.md5 = md5Info?.md5
          }
        } else {
          // 需要上传的文件
          const task = this.addTask(file, taskId, true) // 延迟触发队列
          if (task) {
            task.serverTaskId = response.id
            task.serverFileId = fileMap.get(file.name)
            task.md5 = md5Info?.md5
            console.log(
              `Mapped ${file.name} -> serverTaskId: ${task.serverTaskId}, serverFileId: ${task.serverFileId}, MD5: ${task.md5}`
            )
          }
        }
      })

      // 所有任务添加完毕，统一触发队列处理
      console.log('All tasks added, starting queue processing...')
      this.processQueue()
    } catch (error) {
      console.error('Failed to create server upload task:', error)
      // 即使服务器任务创建失败，也允许本地上传继续（降级处理）
      files.forEach((file) => {
        this.addTask(file, taskId)
      })
    }
  }

  /**
   * 添加上传任务
   * @param file 文件对象
   * @param taskId 任务ID
   * @param deferProcessing 是否延迟触发队列处理（批量添加时使用）
   */
  addTask(file: File, taskId: string = 'default', deferProcessing: boolean = false): UploadTask | null {
    // 验证文件大小
    if (file.size > this.config.maxFileSize) {
      console.error(`File too large: ${file.name} (${this.formatFileSize(file.size)})`)
      return null
    }

    // 验证文件类型
    if (this.config.acceptTypes.length > 0) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!this.config.acceptTypes.includes(ext)) {
        console.error(`File type not accepted: ${ext}`)
        return null
      }
    }

    // 创建任务
    const task: UploadTask = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      taskId,
      status: Status.WAITING,
      progress: 0,
      uploadedSize: 0,
      speed: 0,
      remainingTime: 0,
      createdAt: Date.now(),
    }

    // 添加到队列
    this.tasks.set(task.id, task)

    console.log(`Task added: ${task.fileName} (${this.formatFileSize(task.fileSize)})`)

    // 如果不延迟处理，立即尝试开始上传
    if (!deferProcessing) {
      this.processQueue()
    }

    return task
  }

  /**
   * 处理上传队列
   */
  private async processQueue(): Promise<void> {
    // 检查是否达到最大并发数
    if (this.runningCount.value >= this.config.maxConcurrent) {
      return
    }

    // 查找等待中的任务
    const waitingTask = Array.from(this.tasks.values()).find(
      (task) => task.status === Status.WAITING
    )

    if (!waitingTask) {
      return
    }

    // 开始上传
    await this.startUpload(waitingTask)

    // 递归处理队列
    this.processQueue()
  }

  /**
   * 开始上传任务
   */
  private async startUpload(task: UploadTask): Promise<void> {
    try {
      // 更新状态
      task.status = Status.UPLOADING
      task.startedAt = Date.now()
      this.runningCount.value++

      console.log(`Starting upload: ${task.fileName}`)

      // 创建上传器
      const uploader = new OSSUploader({
        file: task.file,
        taskId: task.taskId,
        serverTaskId: task.serverTaskId,
        serverFileId: task.serverFileId,
        md5: task.md5,
        chunkSize: this.config.chunkSize,
        onProgress: (progress) => {
          // 直接更新属性，getTasks() 会返回新副本触发 Vue 更新
          task.progress = Math.floor(progress.percent * 100)
          task.uploadedSize = progress.uploadedSize
          task.speed = progress.speed
          task.remainingTime = progress.remainingTime
        },
        onSuccess: async (result) => {
          task.status = Status.SUCCESS
          task.progress = 100
          task.uploadedSize = task.fileSize
          task.completedAt = Date.now()
          task.url = result.url
          task.objectKey = result.name

          console.log(`%c✅ Upload succeeded: ${task.fileName}`, 'color: #10b981; font-weight: bold')
          console.log('%c📋 Upload Result:', 'color: #6366f1', {
            file_name: task.fileName,
            oss_key: result.name,
            oss_url: result.url,
            file_size: task.fileSize,
          })

          // 注意：服务器通知已在 OSSUploader.notifyServerComplete() 中完成
          // 这里不再重复调用，避免向服务器发送两次请求

          // 显示上传完成通知
          if (window.electronAPI) {
            window.electronAPI.showNotification({
              title: '上传完成',
              body: `${task.fileName} 已上传完成`,
              urgency: 'normal',
            })
          }

          // 清理
          this.uploaders.delete(task.id)
          this.runningCount.value--

          // 处理队列中的下一个任务
          this.processQueue()
        },
        onError: (error) => {
          task.status = Status.FAILED
          task.error = error.message

          console.error(`Upload failed: ${task.fileName}`, error)

          // 显示上传失败通知
          if (window.electronAPI) {
            window.electronAPI.showNotification({
              title: '上传失败',
              body: `${task.fileName} 上传失败: ${error.message}`,
              urgency: 'normal',
            })
          }

          // 清理
          this.uploaders.delete(task.id)
          this.runningCount.value--

          // 处理队列中的下一个任务
          this.processQueue()
        },
      })

      // 保存上传器引用
      this.uploaders.set(task.id, uploader)

      // 开始上传
      await uploader.start()
    } catch (error: any) {
      // 特殊处理：暂停不算失败（包括被 OSS SDK 包装后的错误）
      if (error.message === 'UPLOAD_PAUSED' || error.message?.includes('UPLOAD_PAUSED')) {
        console.log(`Upload paused: ${task.fileName}`)
        task.status = Status.PAUSED
        this.runningCount.value--
        // 处理队列中的下一个任务
        this.processQueue()
        return
      }

      console.error(`Failed to start upload: ${task.fileName}`, error)
      task.status = Status.FAILED
      task.error = (error as Error).message
      this.runningCount.value--

      // 处理队列中的下一个任务
      this.processQueue()
    }
  }

  /**
   * 暂停上传
   */
  pauseTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    const uploader = this.uploaders.get(taskId)
    if (!uploader) return

    uploader.pause()
    task.status = Status.PAUSED

    console.log(`Task paused: ${task.fileName}`)
  }

  /**
   * 恢复上传
   */
  async resumeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    const uploader = this.uploaders.get(taskId)
    if (!uploader) {
      // 重新创建上传器
      task.status = Status.WAITING
      await this.processQueue()
      return
    }

    try {
      task.status = Status.UPLOADING
      this.runningCount.value++ // 恢复上传时增加计数
      await uploader.resume()

      console.log(`Task resumed: ${task.fileName}`)
    } catch (error: any) {
      // 特殊处理：暂停不算失败（包括被 OSS SDK 包装后的错误）
      if (error.message === 'UPLOAD_PAUSED' || error.message?.includes('UPLOAD_PAUSED')) {
        console.log(`Upload paused again during resume: ${task.fileName}`)
        task.status = Status.PAUSED
        this.runningCount.value--
        return
      }

      console.error(`Failed to resume upload: ${task.fileName}`, error)
      task.status = Status.FAILED
      task.error = (error as Error).message
      this.runningCount.value--
    }
  }

  /**
   * 取消上传
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    const uploader = this.uploaders.get(taskId)
    if (uploader) {
      await uploader.cancel()
      this.uploaders.delete(taskId)
      this.runningCount.value--
    }

    task.status = Status.CANCELED

    console.log(`Task canceled: ${task.fileName}`)

    // 处理队列中的下一个任务
    this.processQueue()
  }

  /**
   * 删除任务
   */
  removeTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    // 如果正在上传，先取消
    if (task.status === Status.UPLOADING) {
      this.cancelTask(taskId)
    }

    this.tasks.delete(taskId)

    console.log(`Task removed: ${task.fileName}`)
  }

  /**
   * 获取所有任务（返回新副本以确保 Vue 响应式更新）
   */
  getTasks(): UploadTask[] {
    // 返回新的对象副本，确保 Vue 能检测到变化
    return Array.from(this.tasks.values()).map(task => ({ ...task }))
  }

  /**
   * 获取指定任务
   */
  getTask(taskId: string): UploadTask | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * 清空已完成和失败的任务
   */
  clearCompleted(): void {
    Array.from(this.tasks.values()).forEach((task) => {
      if (task.status === Status.SUCCESS || task.status === Status.FAILED || task.status === Status.CANCELED) {
        this.tasks.delete(task.id)
      }
    })

    console.log('Completed tasks cleared')
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  /**
   * 获取上传统计
   */
  getStatistics() {
    const tasks = this.getTasks()
    return {
      totalTasks: tasks.length,
      successTasks: tasks.filter((t) => t.status === Status.SUCCESS).length,
      failedTasks: tasks.filter((t) => t.status === Status.FAILED).length,
      uploadingTasks: tasks.filter((t) => t.status === Status.UPLOADING).length,
      waitingTasks: tasks.filter((t) => t.status === Status.WAITING).length,
      totalSize: tasks.reduce((sum, t) => sum + t.fileSize, 0),
      uploadedSize: tasks.reduce((sum, t) => sum + t.uploadedSize, 0),
      averageSpeed: tasks
        .filter((t) => t.status === Status.UPLOADING)
        .reduce((sum, t) => sum + t.speed, 0) / Math.max(this.runningCount.value, 1),
    }
  }
}

// 创建全局上传管理器实例
export const uploadManager = new UploadManager()
