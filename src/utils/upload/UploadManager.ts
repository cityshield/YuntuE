/**
 * 上传管理器 - 队列管理和并发控制
 */
import { ref, reactive } from 'vue'
import type { UploadTask, UploadConfig, PackageInfo, PackageConfirmCallback } from '@/types/upload'
import { UploadStatus as Status } from '@/types/upload'
import { OSSUploader } from './OSSUploader'
import { uploadAPI } from '@/api/upload'
import type {
  UploadManifestFile,
  CheckFilesRequest,
} from '@/api/upload'

import { calculateBatchMD5 } from '@/utils/md5'

interface SceneMetadataPayload {
  fileName: string
  uploadJson: any
  renderSettings: any
  serverRoot: string
}

class PackagingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackagingError'
  }
}

export class UploadManager {
  private tasks = reactive<Map<string, UploadTask>>(new Map())
  private uploaders = new Map<string, OSSUploader>()
  private config: UploadConfig
  private runningCount = ref(0)
  private packageConfirmCallback?: PackageConfirmCallback
  private pendingSceneMetadata: SceneMetadataPayload[] = []

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
   * 设置打包确认回调
   */
  setPackageConfirmCallback(callback: PackageConfirmCallback) {
    this.packageConfirmCallback = callback
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

  private createPackageFileName(originalName: string, timestamp: number): string {
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '') || 'scene'
    return `${nameWithoutExt}_package_${timestamp}.zip`
  }

  private createInitialPackageInfo(file: File): PackageInfo {
    return {
      status: 'analyzing',
      sceneFileName: file.name,
      sceneFileSize: file.size,
      dependencies: {
        textureCount: 0,
        textureSize: 0,
        cacheCount: 0,
        cacheSize: 0,
        referenceCount: 0,
        referenceSize: 0,
        xgenCount: 0,
        xgenSize: 0,
        otherCount: 0,
        otherSize: 0,
      },
    }
  }

  private createEmptyDependencySummary() {
    return {
      textureCount: 0,
      textureSize: 0,
      cacheCount: 0,
      cacheSize: 0,
      referenceCount: 0,
      referenceSize: 0,
      xgenCount: 0,
      xgenSize: 0,
      otherCount: 0,
      otherSize: 0,
    }
  }

  private summarizeDependenciesFromStats(stats: any, uploadJson: any) {
    const summary = this.createEmptyDependencySummary()
    if (stats) {
      summary.textureCount = stats.texture_count || 0
      summary.textureSize = stats.texture_size || 0
      summary.cacheCount = stats.cache_count || 0
      summary.cacheSize = stats.cache_size || 0
      summary.referenceCount = stats.reference_count || 0
      summary.referenceSize = stats.reference_size || 0
      summary.xgenCount = stats.xgen_count || 0
      summary.xgenSize = stats.xgen_size || 0
      summary.otherCount = stats.other_count || 0
      summary.otherSize = stats.other_size || 0
      const total =
        summary.textureCount +
        summary.cacheCount +
        summary.referenceCount +
        summary.xgenCount +
        (summary.otherCount || 0)
      return { summary, total }
    }

    let total = 0
    if (uploadJson?.asset && Array.isArray(uploadJson.asset)) {
      total = uploadJson.asset.length
      summary.otherCount = total
    }
    return { summary, total }
  }

  /**
   * 准备文件上传（Maya 文件需要打包确认）
   */
  private async prepareFileForUpload(file: File): Promise<File> {
    const fileType = this.detectFileType(file.name)

    if (fileType !== 'maya') {
      return file
    }

    if (!window.electronAPI?.mayaCliPackage) {
      console.warn('[UploadManager] Maya CLI not available, uploading original file.')
      return file
    }

    const scenePath = (file as any)?.path
    if (!scenePath) {
      console.warn('[UploadManager] Scene file path unavailable, uploading original file.')
      return file
    }

    if (!this.packageConfirmCallback) {
      console.warn('[UploadManager] No package confirm callback set, uploading original file.')
      return file
    }

    const packageInfo = reactive(this.createInitialPackageInfo(file)) as PackageInfo
    const confirmPromise = this.packageConfirmCallback(packageInfo)

    const { packagedFile } = await this.packageMayaScene(file, scenePath, packageInfo)

    const confirmed = await confirmPromise
    if (!confirmed) {
      this.pendingSceneMetadata = this.pendingSceneMetadata.filter((meta) => meta.fileName !== packagedFile.name)
      throw new PackagingError('已取消 Maya 打包，上传流程终止')
    }

    console.log(`[UploadManager] Using packaged ZIP: ${packagedFile.name}`)
    return packagedFile
  }

  private attachNativePath(target: File, path: string) {
    Reflect.set(target, 'nativePath', path)
  }

  private async packageMayaScene(file: File, scenePath: string, packageInfo: PackageInfo) {
    const progressLogs: string[] = []
    const pushProgressLog = (message: string) => {
      const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      progressLogs.push(`[${time}] ${message}`)
      packageInfo.progressLogs = [...progressLogs]
      packageInfo.progress = message
    }
    const setProgressPercent = (percent: number) => {
      packageInfo.progressPercent = Math.max(0, Math.min(100, Math.round(percent)))
    }
    const updateProgress = (message: string, percent?: number) => {
      pushProgressLog(message)
      if (typeof percent === 'number') {
        setProgressPercent(percent)
      }
    }

    try {
      console.log('[UploadManager] Packaging Maya scene:', scenePath)
      const sceneDir = await window.electronAPI!.pathDirname(scenePath)
      const timestamp = Date.now()
      const serverRoot = `/input/LOCAL/LOCAL_${timestamp}/cfg`
      const zipFileName = this.createPackageFileName(file.name, timestamp)
      updateProgress('正在初始化 Maya 环境...', 5)

      const cliResult = await window.electronAPI!.mayaCliPackage({
        scene: scenePath,
        serverRoot,
        outputDir: sceneDir,
      })

      if (cliResult.error) {
        throw new Error(cliResult.error)
      }

      const finalZipPath = (cliResult.zip || '').replace(/\\/g, '/')
      const uploadJsonPath = (cliResult.upload_json || '').replace(/\\/g, '/')
      const renderSettingsPath = (cliResult.render_settings || '').replace(/\\/g, '/')

      if (!finalZipPath || !(await window.electronAPI!.pathExists(finalZipPath))) {
        throw new Error('未找到 CLI 生成的 ZIP 文件')
      }
      if (!uploadJsonPath || !(await window.electronAPI!.pathExists(uploadJsonPath))) {
        throw new Error('未找到 upload.json 文件')
      }
      if (!renderSettingsPath || !(await window.electronAPI!.pathExists(renderSettingsPath))) {
        throw new Error('未找到 render_settings.json 文件')
      }

      updateProgress('解析 upload.json ...', 40)
      const uploadJsonBuffer = await window.electronAPI!.readFile(uploadJsonPath)
      const uploadJsonText = new TextDecoder().decode(uploadJsonBuffer)
      const uploadJson = JSON.parse(uploadJsonText)

      updateProgress('解析 render_settings.json ...', 55)
      const renderSettingsBuffer = await window.electronAPI!.readFile(renderSettingsPath)
      const renderSettingsText = new TextDecoder().decode(renderSettingsBuffer)
      const renderSettings = JSON.parse(renderSettingsText)

      const { summary, total } = this.summarizeDependenciesFromStats(cliResult.stats, uploadJson)
      packageInfo.dependencies = summary
      packageInfo.totalDependencies = total
      packageInfo.uploadJsonPath = uploadJsonPath
      packageInfo.renderSettingsPath = renderSettingsPath
      packageInfo.uploadJsonData = uploadJson
      packageInfo.renderSettings = renderSettings
      packageInfo.serverRoot = serverRoot
      updateProgress(`解析到 ${total} 个依赖文件`, 70)

      updateProgress('读取打包结果...', 85)
      const zipBuffer = await window.electronAPI!.readFile(finalZipPath)
      const packaged = new File([zipBuffer as ArrayBuffer], cliResult.zip_name || zipFileName, {
        type: 'application/zip',
        lastModified: Date.now(),
      })
      this.attachNativePath(packaged, finalZipPath)

      packageInfo.status = 'completed'
      packageInfo.zipFileName = packaged.name
      packageInfo.zipFileSize = packaged.size
      packageInfo.zipFilePath = finalZipPath
      packageInfo.progressPercent = 100
      packageInfo.progress = '打包完成'

      this.pendingSceneMetadata.push({
        fileName: packaged.name,
        uploadJson,
        renderSettings,
        serverRoot,
      })

      return { packagedFile: packaged }
    } catch (error: any) {
      console.error('[UploadManager] Failed to package Maya scene:', error)
      packageInfo.status = 'error'
      packageInfo.error = error.message || '打包失败，请检查 Maya 是否已安装'
      updateProgress(`打包失败：${packageInfo.error}`, 100)
      throw error
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
    onDuplicateDetected?: (duplicatedCount: number, savedSize: number) => void
  ): Promise<void> {
    const uploadFiles: File[] = []
    try {
      console.log('Step 1: Preparing files for upload (packaging Maya scenes via CLI if needed)...')
      for (const file of files) {
        const prepared = await this.prepareFileForUpload(file)
        uploadFiles.push(prepared)
      }

      console.log(`Creating server upload task for ${uploadFiles.length} files...`)

      // 第二步: 计算所有文件的 MD5
      console.log('Step 2: Calculating MD5 for prepared files...')
      const md5Results = await calculateBatchMD5(uploadFiles, (completed, total) => {
        console.log(`MD5 progress: ${completed}/${total}`)
        if (onMD5Progress) {
          onMD5Progress(completed, total)
        }
      })

      // 构造上传清单（带 MD5）
      const manifestFiles: UploadManifestFile[] = md5Results.map((result, index) => {
        const nativePath = (result.file as any)?.nativePath || (result.file as any)?.path || result.file.name
        return {
          index,
          local_path: nativePath,
          target_folder_path: '/',
          file_name: result.file.name,
          file_size: result.file.size,
          md5: result.md5,
          mime_type: result.file.type || 'application/zip',
        }
      })
      // 第三步: 创建服务器端任务
      console.log('Step 3: Creating server upload task...')
      const taskName = `Upload ${new Date().toLocaleString()}`
      const sceneMetadataPayload = this.pendingSceneMetadata.length
        ? { scenes: this.pendingSceneMetadata }
        : undefined
      const response = await uploadAPI.createUploadTask({
        upload_manifest: {
          task_name: taskName,
          drive_id: driveId,
          priority: 5,
          total_files: uploadFiles.length,
          total_size: uploadFiles.reduce((sum, f) => sum + f.size, 0),
          client_info: {
            platform: navigator.platform || 'unknown',
            version: '1.0.0',
          },
          files: manifestFiles,
        },
        scene_metadata: sceneMetadataPayload,
      })
      this.pendingSceneMetadata = []

      console.log(`Server task created: ${response.id}`)

      // 第四步: 获取任务文件列表（必须先获取task_file_id）
      console.log('Step 4: Getting task files from server...')
      const taskFilesResponse = await uploadAPI.getTaskFiles(response.id)
      const taskFiles = taskFilesResponse.files

      console.log(`Got ${taskFiles.length} task files from server`)

      // 建立文件名到 TaskFile ID 的映射
      const fileMap = new Map<string, string>() // fileName -> task_file_id
      taskFiles.forEach((tf) => {
        fileMap.set(tf.file_name, tf.id)
      })

      // 第五步: 批量 MD5 检查（秒传检测） - 现在可以包含task_file_id了
      console.log('Step 5: Checking for duplicate files (MD5)...')

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
          new_files: uploadFiles.map((f, index) => ({ index, file_name: f.name })),
          stats: {
            total_files: uploadFiles.length,
            duplicated_count: 0,
            new_count: uploadFiles.length,
            saved_size: 0
          }
        }
      }

      // 第六步: 创建本地任务（只为需要上传的文件创建）
      uploadFiles.forEach((file) => {
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

      // 所有任务添加完毕，统一保存并触发队列处理
      console.log('All tasks added, starting queue processing...')
      this.saveTasksToStorage()
      this.processQueue()
    } catch (error) {
      if (error instanceof PackagingError) {
        console.error('[UploadManager] Packaging aborted:', error.message)
        this.pendingSceneMetadata = []
        throw error
      }
      console.error('Failed to create server upload task:', error)
      this.pendingSceneMetadata = []
      const fallbackFiles = uploadFiles.length ? uploadFiles : files
      for (const file of fallbackFiles) {
        this.addTask(file, taskId)
      }
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
      packagedZipPath: (file as any)._packagedZipPath,
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

    // 保存到 localStorage
    this.saveTasksToStorage()

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

      await this.ensurePackagedFile(task)

      const uploader = await this.createUploaderForTask(task)
      this.uploaders.set(task.id, uploader)
      await uploader.start()
    } catch (error: any) {
      if (error.message === 'UPLOAD_PAUSED' || error.message?.includes('UPLOAD_PAUSED')) {
        console.log(`Upload paused: ${task.fileName}`)
        task.status = Status.PAUSED
        this.runningCount.value--
        this.processQueue()
        return
      }

      console.error(`Failed to start upload: ${task.fileName}`, error)
      task.status = Status.FAILED
      task.error = (error as Error).message
      this.runningCount.value--
      this.processQueue()
    }
  }

  private async ensurePackagedFile(task: UploadTask): Promise<File> {
    if (!window.electronAPI?.readFile) {
      throw new Error('当前环境不支持读取打包文件')
    }
    const isZipFile =
      task.file &&
      (task.file.type === 'application/zip' ||
        (task.file.name && task.file.name.toLowerCase().endsWith('.zip')))

    if (task.file && isZipFile) {
      return task.file
    }
    const zipPath =
      task.packagedZipPath ||
      (task.file as any)?._packagedZipPath ||
      (task.file as any)?.path
    if (!zipPath) {
      throw new Error('找不到打包后的 ZIP 文件，请重新选择场景')
    }
    const buffer = await window.electronAPI.readFile(zipPath)
    const zipFileName = task.fileName.endsWith('.zip') ? task.fileName : `${task.fileName}.zip`
    const rebuilt = new File([buffer as ArrayBuffer], zipFileName, {
      type: 'application/zip',
      lastModified: Date.now(),
    })
    // @ts-ignore - 记录路径方便下次复用
    rebuilt._packagedZipPath = zipPath
    ;(rebuilt as any).path = zipPath
    task.file = rebuilt
    task.packagedZipPath = zipPath
    return rebuilt
  }

  private async createUploaderForTask(task: UploadTask): Promise<OSSUploader> {
    await this.ensurePackagedFile(task)

    return new OSSUploader({
      file: task.file,
      taskId: task.taskId,
      serverTaskId: task.serverTaskId,
      serverFileId: task.serverFileId,
      md5: task.md5,
      chunkSize: this.config.chunkSize,
      onProgress: (progress) => {
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

        this.saveTasksToStorage()

        if (window.electronAPI) {
          window.electronAPI.showNotification({
            title: '上传完成',
            body: `${task.fileName} 已上传完成`,
            urgency: 'normal',
          })
        }

        this.uploaders.delete(task.id)
        this.runningCount.value--
        this.processQueue()
      },
      onError: (error) => {
        task.status = Status.FAILED
        task.error = error.message

        console.error(`Upload failed: ${task.fileName}`, error)

        this.saveTasksToStorage()

        if (window.electronAPI) {
          window.electronAPI.showNotification({
            title: '上传失败',
            body: `${task.fileName} 上传失败，请检查网络或稍后重试`,
            urgency: 'normal',
          })
        }

        this.uploaders.delete(task.id)
        this.runningCount.value--
        this.processQueue()
      },
    })
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

    // 保存到 localStorage
    this.saveTasksToStorage()
  }

  /**
   * 恢复上传
   */
  async resumeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    const uploader = this.uploaders.get(taskId)
    if (!uploader) {
      // 上传器可能已被清理，重新排队
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
    task.packagedZipPath = undefined

    console.log(`Task canceled: ${task.fileName}`)

    // 保存到 localStorage
    this.saveTasksToStorage()

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

    // 保存到 localStorage
    this.saveTasksToStorage()
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

    // 保存到 localStorage
    this.saveTasksToStorage()
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

  /**
   * ========================================
   * 持久化相关方法
   * ========================================
   */

  /**
   * 序列化任务数据（排除 File 对象）
   */
  private serializeTask(task: UploadTask): any {
    return {
      id: task.id,
      fileName: task.fileName,
      fileSize: task.fileSize,
      fileType: task.fileType,
      // @ts-ignore - Electron环境下File对象有path属性
      filePath: task.file?.path,
      taskId: task.taskId,
      serverTaskId: task.serverTaskId,
      serverFileId: task.serverFileId,
      status: task.status,
      progress: task.progress,
      uploadedSize: task.uploadedSize,
      speed: task.speed,
      remainingTime: task.remainingTime,
      md5: task.md5,
      url: task.url,
      objectKey: task.objectKey,
      error: task.error,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      packagedZipPath: task.packagedZipPath,
    }
  }

  /**
   * 保存任务到 localStorage
   */
  saveTasksToStorage(userId?: string): void {
    try {
      if (!userId) {
        // 尝试从 localStorage 获取当前用户ID
        const userStr = localStorage.getItem('user')
        if (userStr) {
          const user = JSON.parse(userStr)
          userId = user.id
        }
      }

      if (!userId) {
        console.warn('No userId provided, skip saving tasks to storage')
        return
      }

      const tasks = this.getTasks()
      const serializedTasks = tasks.map(task => this.serializeTask(task))

      const storageKey = `upload_tasks_${userId}`
      localStorage.setItem(storageKey, JSON.stringify(serializedTasks))

      console.log(`✅ Saved ${serializedTasks.length} tasks to localStorage for user ${userId}`)
    } catch (error) {
      console.error('Failed to save tasks to storage:', error)
    }
  }

  /**
   * 从 localStorage 恢复任务
   */
  loadTasksFromStorage(userId: string): void {
    try {
      const storageKey = `upload_tasks_${userId}`
      const data = localStorage.getItem(storageKey)

      if (!data) {
        console.log('No saved tasks found in storage')
        return
      }

      const serializedTasks = JSON.parse(data)
      console.log(`📦 Loading ${serializedTasks.length} tasks from localStorage for user ${userId}`)

      serializedTasks.forEach((serialized: any) => {
        // 恢复任务（不包含 File 对象）
        const task: UploadTask = {
          id: serialized.id,
          file: null as any, // File对象无法恢复，设为null
          fileName: serialized.fileName,
          fileSize: serialized.fileSize,
          fileType: serialized.fileType,
          taskId: serialized.taskId,
          serverTaskId: serialized.serverTaskId,
          serverFileId: serialized.serverFileId,
          status: serialized.status,
          progress: serialized.progress,
          uploadedSize: serialized.uploadedSize,
          speed: serialized.speed || 0,
          remainingTime: serialized.remainingTime || 0,
          md5: serialized.md5,
          url: serialized.url,
          objectKey: serialized.objectKey,
          error: serialized.error,
          createdAt: serialized.createdAt,
          startedAt: serialized.startedAt,
          completedAt: serialized.completedAt,
          packagedZipPath: serialized.packagedZipPath,
        }

        // 如果任务未完成且有文件路径（Electron环境），尝试重新创建File对象
        if (serialized.filePath && task.status !== Status.SUCCESS) {
          // 在 Electron 环境下，可以通过 window.electronAPI 重新读取文件
          // 这里先标记为需要文件，后续在UI层处理
          task.error = task.error || '需要重新选择文件以继续上传'
        }

        // 添加到任务列表（不触发队列处理）
        this.tasks.set(task.id, task)
      })

      console.log(`✅ Restored ${serializedTasks.length} tasks from storage`)
    } catch (error) {
      console.error('Failed to load tasks from storage:', error)
    }
  }

  /**
   * 清除指定用户的任务存储
   */
  clearTasksFromStorage(userId: string): void {
    try {
      const storageKey = `upload_tasks_${userId}`
      localStorage.removeItem(storageKey)
      console.log(`✅ Cleared tasks storage for user ${userId}`)
    } catch (error) {
      console.error('Failed to clear tasks from storage:', error)
    }
  }

  /**
   * 清除所有用户的任务存储
   */
  clearAllTasksFromStorage(): void {
    try {
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('upload_tasks_')) {
          localStorage.removeItem(key)
        }
      })
      console.log('✅ Cleared all tasks storage')
    } catch (error) {
      console.error('Failed to clear all tasks from storage:', error)
    }
  }
}

// 创建全局上传管理器实例
export const uploadManager = new UploadManager()
