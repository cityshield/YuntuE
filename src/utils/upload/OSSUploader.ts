/**
 * OSS 上传器 - 基于阿里云 OSS SDK
 */
import OSS from 'ali-oss'
import type { STSCredentials, UploadProgress } from '@/types/upload'
import { uploadAPI } from '@/api/upload'

export interface OSSUploaderOptions {
  file: File
  taskId: string
  serverTaskId?: string
  serverFileId?: string
  md5?: string
  onProgress?: (progress: UploadProgress) => void
  onSuccess?: (result: OSS.PutObjectResult) => void
  onError?: (error: Error) => void
  chunkSize?: number
}

/**
 * 上传采样点（用于计算滑动窗口速度）
 */
interface UploadSample {
  time: number  // 时间戳（毫秒）
  size: number  // 已上传大小（字节）
}

export class OSSUploader {
  private file: File
  private taskId: string
  private serverTaskId?: string
  private serverFileId?: string
  private md5?: string
  private client: OSS | null = null
  private credentials: STSCredentials | null = null
  private onProgress?: (progress: UploadProgress) => void
  private onSuccess?: (result: OSS.PutObjectResult) => void
  private onError?: (error: Error) => void
  private abortCheckpoint: any = null
  private isPaused = false
  private isCanceled = false
  private startTime: number = 0
  private currentPercent: number = 0
  private currentUploadedSize: number = 0
  private currentSpeed: number = 0 // 当前速度（由定时器计算）
  private currentRemainingTime: number = 0 // 剩余时间（由定时器计算）
  private progressTimer: NodeJS.Timeout | null = null
  private lastReportedPercent: number = -1 // 上次报告的进度百分比
  private uploadSamples: UploadSample[] = [] // 上传采样队列（用于滑动窗口计算）
  private readonly SAMPLE_WINDOW = 5 // 滑动窗口大小（秒）

  // 断点续传支持：保存初始凭证和 objectKey
  private initialCredentials: STSCredentials | null = null
  private initialObjectKey: string | null = null

  // 分片上传的阈值：0 = 所有文件都使用分片上传（因为 put() 方法不支持进度回调）
  private static readonly MULTIPART_THRESHOLD = 0

  constructor(options: OSSUploaderOptions) {
    this.file = options.file
    this.taskId = options.taskId
    this.serverTaskId = options.serverTaskId
    this.serverFileId = options.serverFileId
    this.md5 = options.md5
    this.onProgress = options.onProgress
    this.onSuccess = options.onSuccess
    this.onError = options.onError
  }

  /**
   * 根据文件大小计算最优分片配置
   * 目标：平衡进度显示流畅度、上传速度和请求数量
   * 分片数控制在 50-250 个区间，进度粒度 0.4-2%
   */
  private calculateOptimalPartSize(): { partSize: number; parallel: number } {
    const fileSize = this.file.size
    const MB = 1024 * 1024
    const GB = 1024 * MB

    if (fileSize < 1 * MB) {
      // < 1MB: 256KB 分片，2 并发 - 快速显示进度
      return { partSize: 256 * 1024, parallel: 2 }
    } else if (fileSize < 10 * MB) {
      // 1-10MB: 1MB 分片，3 并发 - 平衡进度和性能
      return { partSize: 1 * MB, parallel: 3 }
    } else if (fileSize < 100 * MB) {
      // 10-100MB: 5MB 分片，3 并发 - 适中的分片数
      return { partSize: 5 * MB, parallel: 3 }
    } else if (fileSize < 1 * GB) {
      // 100MB-1GB: 10MB 分片，4 并发 - 进度粒度 1%，速度提升
      return { partSize: 10 * MB, parallel: 4 }
    } else if (fileSize < 5 * GB) {
      // 1-5GB: 20MB 分片，5 并发 - 进度粒度 0.4-2%，速度优化
      return { partSize: 20 * MB, parallel: 5 }
    } else if (fileSize < 10 * GB) {
      // 5-10GB: 50MB 分片，6 并发 - 大文件平衡配置
      return { partSize: 50 * MB, parallel: 6 }
    } else {
      // > 10GB: 100MB 分片，6 并发 - 超大文件稳定性优先
      return { partSize: 100 * MB, parallel: 6 }
    }
  }

  /**
   * 检查凭证是否过期
   */
  private isCredentialsExpired(): boolean {
    if (!this.initialCredentials) return true

    try {
      const expiration = new Date(this.initialCredentials.expiration)
      const now = new Date()
      // 提前5分钟判定为过期，避免使用即将过期的凭证
      const bufferTime = 5 * 60 * 1000 // 5分钟
      return (expiration.getTime() - now.getTime()) < bufferTime
    } catch (error) {
      console.warn('Failed to parse expiration time:', error)
      return true
    }
  }

  /**
   * 初始化 OSS 客户端
   */
  private async initClient(): Promise<void> {
    try {
      // 如果已有凭证且未过期，复用初始凭证和 objectKey
      if (this.initialCredentials && !this.isCredentialsExpired()) {
        console.log('Reusing existing credentials and objectKey for resume')
        this.credentials = this.initialCredentials
      } else {
        // 获取新的 STS 凭证
        this.credentials = await uploadAPI.getUploadCredentials(this.taskId, this.file.name)

        // 保存为初始凭证（用于断点续传）
        if (!this.initialCredentials) {
          this.initialCredentials = this.credentials
          this.initialObjectKey = this.credentials.objectKey
          console.log('Saved initial credentials and objectKey:', this.initialObjectKey)
        }
      }

      // 从 endpoint 提取 region
      // 例如: https://oss-cn-beijing.aliyuncs.com -> oss-cn-beijing
      const region = this.credentials.endpoint
        .replace('https://', '')
        .replace('http://', '')
        .split('.')[0]

      // 初始化 OSS 客户端
      this.client = new OSS({
        accessKeyId: this.credentials.accessKeyId,
        accessKeySecret: this.credentials.accessKeySecret,
        stsToken: this.credentials.securityToken,
        bucket: this.credentials.bucketName,
        region: region,
        // 启用 HTTPS
        secure: true,
        // 超时设置（增加超时时间以适应大文件）
        timeout: 300000, // 5分钟
        // 禁用代理，直接使用本地网络连接（绕过 VPN）
        // ali-oss SDK 内部使用 axios，通过 request 选项禁用代理
        request: {
          // 禁用代理
          proxy: false,
        },
        // 添加更多配置以提高稳定性
        refreshSTSToken: async () => {
          // 如果需要，可以在这里刷新 STS token
          // 目前我们每次上传都获取新的凭证，所以不需要刷新
          return {
            accessKeyId: this.credentials!.accessKeyId,
            accessKeySecret: this.credentials!.accessKeySecret,
            stsToken: this.credentials!.securityToken,
          }
        },
      })
      
      console.log('[OSSUploader] OSS Client configured with proxy disabled')

      console.log('OSS Client initialized:', {
        bucket: this.credentials.bucketName,
        region: region,
        endpoint: this.credentials.endpoint,
        objectKey: this.credentials.objectKey,
        secure: true,
      })
    } catch (error) {
      console.error('Failed to initialize OSS client:', error)
      throw error
    }
  }

  /**
   * 开始上传
   */
  async start(): Promise<OSS.PutObjectResult> {
    try {
      // 验证文件对象
      if (!this.file) {
        throw new Error('文件对象不存在')
      }
      if (this.file.size === 0) {
        throw new Error('文件大小为 0，无法上传')
      }
      
      console.log(`[OSSUploader] Starting upload:`, {
        fileName: this.file.name,
        fileSize: this.file.size,
        fileType: this.file.type,
        taskId: this.taskId,
      })

      this.startTime = Date.now()
      this.lastReportedPercent = -1
      this.currentPercent = 0
      this.currentUploadedSize = 0
      this.currentSpeed = 0
      this.currentRemainingTime = 0
      this.isPaused = false
      this.isCanceled = false
      this.uploadSamples = [] // 清空采样队列

      // 启动进度定时器（立即触发一次，显示初始状态）
      this.startProgressTimer()
      
      // 立即触发一次进度更新，显示 0%
      if (this.onProgress) {
        this.onProgress({
          percent: 0,
          uploadedSize: 0,
          totalSize: this.file.size,
          speed: 0,
          remainingTime: 0,
        })
      }

      console.log(`[OSSUploader] Initializing OSS client...`)
      // 初始化客户端
      await this.initClient()

      if (!this.client || !this.credentials) {
        throw new Error('OSS client not initialized')
      }

      // 使用初始 objectKey（如果存在），确保断点续传时使用相同的 key
      const objectKey = this.initialObjectKey || this.credentials.objectKey
      console.log(`[OSSUploader] Using objectKey: ${objectKey}`)

      // 根据文件大小选择上传方式（MULTIPART_THRESHOLD = 0，所有文件都使用分片上传）
      if (this.file.size > OSSUploader.MULTIPART_THRESHOLD) {
        // 大文件：分片上传
        console.log(`[OSSUploader] Using multipart upload`)
        return await this.multipartUpload(objectKey)
      } else {
        // 小文件：简单上传
        console.log(`[OSSUploader] Using simple upload`)
        return await this.simpleUpload(objectKey)
      }
    } catch (error: any) {
      // 停止进度定时器
      this.stopProgressTimer()

      // 特殊处理：暂停不算错误（包括被 OSS SDK 包装后的错误）
      if (error.message === 'UPLOAD_PAUSED' || error.message?.includes('UPLOAD_PAUSED')) {
        console.log('Upload paused at start(), not calling onError')
        throw new Error('UPLOAD_PAUSED') // 确保向上抛出标准格式
      }

      console.error('Upload failed:', error)
      if (this.onError) {
        this.onError(error as Error)
      }
      throw error
    }
  }

  /**
   * 简单上传（小于100MB的文件）
   */
  private async simpleUpload(objectKey: string): Promise<OSS.PutObjectResult> {
    if (!this.client) {
      throw new Error('OSS client not initialized')
    }

    console.log(`Starting simple upload for file: ${this.file.name} (${this.formatFileSize(this.file.size)})`)

    const result = await this.client.put(objectKey, this.file, {
      // 上传进度回调
      progress: (p: number) => {
        this.handleProgress(p, this.file.size * p, this.file.size)
      },
    })

    console.log('Simple upload completed:', result)

    // 停止进度定时器
    this.stopProgressTimer()

    // 通知服务器文件上传完成
    await this.notifyServerComplete(result)

    if (this.onSuccess) {
      this.onSuccess(result)
    }

    return result
  }

  /**
   * 分片上传（大于100MB的文件）
   */
  private async multipartUpload(objectKey: string): Promise<OSS.PutObjectResult> {
    if (!this.client) {
      throw new Error('OSS client not initialized')
    }

    // 获取最优配置
    const config = this.calculateOptimalPartSize()
    const estimatedParts = Math.ceil(this.file.size / config.partSize)

    console.log(`Starting multipart upload for file: ${this.file.name} (${this.formatFileSize(this.file.size)})`)
    console.log(`Upload config: partSize=${this.formatFileSize(config.partSize)}, parallel=${config.parallel}, estimatedParts=${estimatedParts}`)

    // 尝试从 LocalStorage 恢复 checkpoint
    const savedCheckpoint = this.loadCheckpoint()

    console.log('Checkpoint load attempt:', {
      hasCheckpoint: !!savedCheckpoint,
      objectKey: objectKey,
      initialObjectKey: this.initialObjectKey,
      checkpointObjectKey: savedCheckpoint?.name
    })

    // 验证 checkpoint 是否有效
    let validCheckpoint = null
    if (this.isCheckpointValid(savedCheckpoint)) {
      validCheckpoint = savedCheckpoint
      console.log('✓ Using saved checkpoint for resumable upload, doneParts:', savedCheckpoint.doneParts?.length || 0)
    } else if (savedCheckpoint) {
      // checkpoint 无效，清除它
      console.log('✗ Clearing invalid checkpoint:', {
        hasFile: !!savedCheckpoint.file,
        hasUploadId: !!savedCheckpoint.uploadId,
        objectKey: savedCheckpoint.name,
        expectedObjectKey: objectKey
      })
      this.clearCheckpoint()
    } else {
      console.log('No checkpoint found, starting fresh upload')
    }

    try {
      const result = await this.client.multipartUpload(objectKey, this.file, {
        // 分片大小（动态计算）
        partSize: config.partSize,
        // 并发上传数（动态计算）
        parallel: config.parallel,
        // 断点续传检查点（仅在有效时使用）
        checkpoint: validCheckpoint,
        // 进度回调
        progress: (p: number, checkpoint: any) => {
          // 保存 checkpoint 以支持断点续传
          this.abortCheckpoint = checkpoint
          this.saveCheckpoint(checkpoint)

          // 计算已上传大小
          const uploadedSize = Math.floor(this.file.size * p)
          this.handleProgress(p, uploadedSize, this.file.size)

          // 检查是否被暂停
          if (this.isPaused) {
            console.log('Upload paused at part_num:', checkpoint.doneParts?.length || 0)
            throw new Error('UPLOAD_PAUSED') // 使用特殊标记
          }

          // 检查是否被取消
          if (this.isCanceled) {
            throw new Error('Upload canceled')
          }
        },
      })

      console.log('Multipart upload completed:', result)

      // 停止进度定时器
      this.stopProgressTimer()

      // 清除保存的 checkpoint
      this.clearCheckpoint()

      // 通知服务器文件上传完成
      await this.notifyServerComplete(result)

      if (this.onSuccess) {
        this.onSuccess(result)
      }

      return result
    } catch (error: any) {
      // 特殊处理：暂停不算错误（包括被 OSS SDK 包装后的错误）
      if (error.message === 'UPLOAD_PAUSED' || error.message?.includes('UPLOAD_PAUSED')) {
        console.log('Upload paused successfully, checkpoint saved')
        // 暂停时停止定时器
        this.stopProgressTimer()
        // 不调用 onError，不清除 checkpoint
        throw new Error('UPLOAD_PAUSED') // 确保向上抛出标准格式
      }

      // 其他错误时也停止定时器
      this.stopProgressTimer()

      // 详细的错误日志
      console.error('Multipart upload error:', {
        name: error.name,
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: error.requestId,
      })

      // 如果是网络错误或 uploadId 相关错误，清除 checkpoint
      if (error.message?.includes('uploadId') ||
          error.message?.includes('XHR error') ||
          error.message?.includes('connected: false') ||
          error.code === 'RequestError') {
        console.log('Upload failed with network/uploadId error, clearing checkpoint')
        this.clearCheckpoint()

        // 提供更友好的错误信息
        const errorMsg = error.message?.includes('connected: false')
          ? '网络连接失败，请检查网络状态后重试'
          : error.message?.includes('uploadId')
          ? '上传会话已过期，请重新上传'
          : '上传失败，请重试'

        throw new Error(errorMsg)
      }
      throw error
    }
  }

  /**
   * 处理上传进度（OSS 回调）
   * 职责：更新进度值，检查百分比变化，触发 UI 更新
   */
  private handleProgress(percent: number, uploadedSize: number, totalSize: number): void {
    if (!this.onProgress) return

    // 更新当前进度（供定时器使用）
    this.currentPercent = percent
    this.currentUploadedSize = uploadedSize

    const percentInt = Math.floor(percent * 100) // 转为整数百分比

    // 只在百分比变化至少 0.5% 时才立即报告（更频繁的更新）
    if (percentInt > this.lastReportedPercent || percentInt === 0) {
      this.lastReportedPercent = percentInt

      // 使用定时器计算好的速度和剩余时间
      this.onProgress({
        percent,
        uploadedSize,
        totalSize,
        speed: this.currentSpeed,
        remainingTime: this.currentRemainingTime,
      })
      
      console.log(`[OSSUploader] Progress: ${percentInt}% (${this.formatFileSize(uploadedSize)} / ${this.formatFileSize(totalSize)})`)
    }
  }

  /**
   * 启动进度定时器（每秒更新速度和剩余时间）
   * 职责：使用滑动窗口计算实时速度，强制触发 UI 更新
   */
  private startProgressTimer(): void {
    // 清除已有定时器
    this.stopProgressTimer()

    // 每秒触发一次进度更新
    this.progressTimer = setInterval(() => {
      if (this.isPaused || this.isCanceled || !this.onProgress) {
        return
      }

      const now = Date.now()

      // 1. 记录当前采样点
      this.uploadSamples.push({
        time: now,
        size: this.currentUploadedSize
      })

      // 2. 清理超出窗口的采样点（保留最近 5 秒的数据）
      const cutoffTime = now - (this.SAMPLE_WINDOW * 1000)
      this.uploadSamples = this.uploadSamples.filter(sample => sample.time >= cutoffTime)

      // 3. 计算滑动窗口内的实时速度
      if (this.uploadSamples.length >= 2) {
        // 有足够的采样点，使用滑动窗口计算
        const firstSample = this.uploadSamples[0]
        const lastSample = this.uploadSamples[this.uploadSamples.length - 1]

        const timeDiff = (lastSample.time - firstSample.time) / 1000 // 转为秒
        const sizeDiff = lastSample.size - firstSample.size

        if (timeDiff > 0) {
          // 滑动窗口速度 = 窗口内上传量 / 窗口时间
          this.currentSpeed = sizeDiff / timeDiff
        }
      } else if (this.currentUploadedSize > 0) {
        // 前几秒采样点不足，使用平均速度
        const totalElapsed = (now - this.startTime) / 1000
        if (totalElapsed > 0) {
          this.currentSpeed = this.currentUploadedSize / totalElapsed
        }
      }

      // 4. 计算剩余时间（基于当前速度）
      if (this.currentSpeed > 0) {
        const remainingSize = this.file.size - this.currentUploadedSize
        this.currentRemainingTime = remainingSize / this.currentSpeed
      }

      // 5. 强制触发进度回调（保证速度和剩余时间每秒更新）
      this.onProgress({
        percent: this.currentPercent,
        uploadedSize: this.currentUploadedSize,
        totalSize: this.file.size,
        speed: this.currentSpeed,
        remainingTime: this.currentRemainingTime,
      })
    }, 1000) // 每秒更新一次
  }

  /**
   * 停止进度定时器
   */
  private stopProgressTimer(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
    // 清空采样队列
    this.uploadSamples = []
  }

  /**
   * 验证 checkpoint 是否有效
   */
  private isCheckpointValid(checkpoint: any): boolean {
    if (!checkpoint) {
      return false
    }

    // 检查文件信息
    if (!checkpoint.file ||
        checkpoint.file.name !== this.file.name ||
        checkpoint.file.size !== this.file.size) {
      console.log('Checkpoint validation failed: file mismatch')
      return false
    }

    // 检查是否有有效的 uploadId
    if (!checkpoint.uploadId) {
      console.log('Checkpoint validation failed: missing uploadId')
      return false
    }

    // 检查 objectKey 是否匹配（如果已保存初始 objectKey）
    if (this.initialObjectKey && checkpoint.name !== this.initialObjectKey) {
      console.log('Checkpoint validation failed: objectKey mismatch', {
        checkpointKey: checkpoint.name,
        initialKey: this.initialObjectKey
      })
      return false
    }

    console.log('Checkpoint validation passed')
    return true
  }

  /**
   * 暂停上传
   */
  pause(): void {
    this.isPaused = true
    console.log('Upload paused, checkpoint will be saved automatically')
  }

  /**
   * 恢复上传
   */
  async resume(): Promise<OSS.PutObjectResult> {
    try {
      this.isPaused = false
      console.log('Upload resuming...')

      // 启动进度定时器
      this.startProgressTimer()

      // 检查凭证是否过期
      if (this.isCredentialsExpired()) {
        console.log('Credentials expired, will fetch new credentials')
        // 清除旧凭证，让 initClient 获取新的
        this.initialCredentials = null
        this.initialObjectKey = null
        // 清除 checkpoint（因为 objectKey 会变）
        this.clearCheckpoint()
      }

      // 如果客户端不存在，重新初始化
      if (!this.client) {
        console.log('Client not initialized, reinitializing...')
        await this.initClient()
      }

      // 使用保存的 objectKey 继续上传
      const objectKey = this.initialObjectKey || this.credentials!.objectKey
      console.log('Resuming upload with objectKey:', objectKey)

      // 继续分片上传（会自动使用 checkpoint）
      return await this.multipartUpload(objectKey)
    } catch (error: any) {
      // 停止进度定时器
      this.stopProgressTimer()

      // 特殊处理：暂停不算错误（包括被 OSS SDK 包装后的错误）
      if (error.message === 'UPLOAD_PAUSED' || error.message?.includes('UPLOAD_PAUSED')) {
        console.log('Upload paused during resume(), not calling onError')
        throw new Error('UPLOAD_PAUSED') // 确保向上抛出标准格式
      }

      console.error('Resume failed:', error)
      if (this.onError) {
        this.onError(error as Error)
      }
      throw error
    }
  }

  /**
   * 取消上传
   */
  async cancel(): Promise<void> {
    this.isCanceled = true

    // 停止进度定时器
    this.stopProgressTimer()

    if (this.client && this.credentials && this.abortCheckpoint) {
      try {
        // 终止分片上传
        await this.client.abortMultipartUpload(
          this.credentials.objectKey,
          this.abortCheckpoint.uploadId
        )
        console.log('Multipart upload aborted')
      } catch (error) {
        console.error('Failed to abort multipart upload:', error)
      }
    }

    // 清除 checkpoint
    this.clearCheckpoint()

    console.log('Upload canceled')
  }

  /**
   * 保存 checkpoint 到 LocalStorage
   */
  private saveCheckpoint(checkpoint: any): void {
    try {
      const key = `upload_checkpoint_${this.taskId}_${this.file.name}`

      // 修复 File 对象无法正确序列化的问题
      // OSS SDK 的 checkpoint.file 可能是空对象，需要手动添加文件信息
      const checkpointToSave = {
        ...checkpoint,
        file: {
          name: this.file.name,
          size: this.file.size,
          type: this.file.type,
          lastModified: this.file.lastModified
        }
      }

      localStorage.setItem(key, JSON.stringify(checkpointToSave))
    } catch (error) {
      console.warn('Failed to save checkpoint:', error)
    }
  }

  /**
   * 从 LocalStorage 加载 checkpoint
   */
  private loadCheckpoint(): any {
    try {
      const key = `upload_checkpoint_${this.taskId}_${this.file.name}`
      const saved = localStorage.getItem(key)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (error) {
      console.warn('Failed to load checkpoint:', error)
    }
    return null
  }

  /**
   * 清除 checkpoint
   */
  private clearCheckpoint(): void {
    try {
      const key = `upload_checkpoint_${this.taskId}_${this.file.name}`
      localStorage.removeItem(key)
    } catch (error) {
      console.warn('Failed to clear checkpoint:', error)
    }
  }

  /**
   * 通知服务器文件上传完成
   */
  private async notifyServerComplete(result: OSS.PutObjectResult): Promise<void> {
    // 如果没有服务器任务ID和文件ID，跳过通知
    if (!this.serverTaskId || !this.serverFileId) {
      console.log('No server task/file ID, skipping server notification')
      return
    }

    try {
      console.log(`Notifying server: taskId=${this.serverTaskId}, fileId=${this.serverFileId}, md5=${this.md5}`)
      console.log('OSS upload result:', result)

      // 构造 OSS URL（如果 result.url 不存在）
      // 阿里云 OSS URL 格式：https://{bucket}.{endpoint}/{objectKey}
      const ossUrl = result.url || `https://${this.credentials?.bucketName}.${this.credentials?.endpoint.replace('https://', '').replace('http://', '')}/${result.name}`

      console.log('Constructed OSS URL:', ossUrl)

      await uploadAPI.markFileComplete(this.serverTaskId, this.serverFileId, {
        oss_key: result.name,
        oss_url: ossUrl,
        md5: this.md5,
        file_size: this.file.size,
      })

      console.log('Server notified successfully')
    } catch (error) {
      // 通知失败不影响上传成功
      console.error('Failed to notify server:', error)
    }
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
}
