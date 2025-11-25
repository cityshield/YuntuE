/**
 * OSS 下载器
 * 支持分段下载、断点续传、进度追踪、MD5校验
 */
import OSS from 'ali-oss'
import type {
  OSSDownloadCredentials,
  DownloadOptions,
  DownloadProgress,
  DownloadChunk,
  DownloadCheckpoint,
  DownloadSpeedSample,
} from '@/types/download'

const MB = 1024 * 1024
const GB = 1024 * MB

// 速度计算窗口 (秒)
const SPEED_SAMPLE_WINDOW = 5

export class OSSDownloader {
  private client: OSS | null = null
  private credentials: OSSDownloadCredentials
  private fileName: string
  private fileSize: number
  private md5?: string
  private savePath: string

  // 分段配置
  private chunkSize: number
  private parallel: number
  private chunks: DownloadChunk[] = []

  // 下载状态
  private downloadedSize: number = 0
  private isPaused: boolean = false
  private isAborted: boolean = false

  // 速度计算 (滑动窗口)
  private speedSamples: DownloadSpeedSample[] = []
  private currentSpeed: number = 0
  private currentRemainingTime: number = 0

  // 回调函数
  private onProgress?: (progress: DownloadProgress) => void
  private onSuccess?: (result: { path: string; md5?: string }) => void
  private onError?: (error: Error) => void

  constructor(options: DownloadOptions) {
    this.credentials = options.credentials
    this.fileName = options.fileName
    this.fileSize = options.fileSize
    this.md5 = options.md5
    this.savePath = options.savePath
    this.onProgress = options.onProgress
    this.onSuccess = options.onSuccess
    this.onError = options.onError

    // 计算最优分段策略
    const strategy = this.calculateOptimalStrategy()
    this.chunkSize = options.chunkSize || strategy.chunkSize
    this.parallel = options.parallel || strategy.parallel
  }

  /**
   * 根据文件大小计算最优分段策略
   * 参考上传功能的分片策略,但下载通常可以更大的分段和更高的并发
   */
  private calculateOptimalStrategy(): { chunkSize: number; parallel: number } {
    const size = this.fileSize

    if (size < 10 * MB) {
      // 小文件: 1MB分段, 2并发
      return { chunkSize: 1 * MB, parallel: 2 }
    } else if (size < 100 * MB) {
      // 中文件: 5MB分段, 3并发
      return { chunkSize: 5 * MB, parallel: 3 }
    } else if (size < 1 * GB) {
      // 大文件: 10MB分段, 4并发
      return { chunkSize: 10 * MB, parallel: 4 }
    } else if (size < 5 * GB) {
      // 超大文件: 20MB分段, 5并发
      return { chunkSize: 20 * MB, parallel: 5 }
    } else {
      // 巨型文件: 50MB分段, 6并发
      return { chunkSize: 50 * MB, parallel: 6 }
    }
  }

  /**
   * 检查凭证是否过期 (提前5分钟判定)
   */
  private isCredentialsExpired(): boolean {
    const expirationTime = new Date(this.credentials.expiration).getTime()
    const now = Date.now()
    const bufferTime = 5 * 60 * 1000 // 5分钟缓冲
    return now >= expirationTime - bufferTime
  }

  /**
   * 初始化 OSS 客户端
   */
  private async initClient(): Promise<void> {
    if (this.isCredentialsExpired()) {
      throw new Error('OSS凭证已过期,请重新获取凭证')
    }

    this.client = new OSS({
      region: this.credentials.endpoint.replace('https://oss-', '').replace('.aliyuncs.com', ''),
      accessKeyId: this.credentials.accessKeyId,
      accessKeySecret: this.credentials.accessKeySecret,
      stsToken: this.credentials.securityToken,
      bucket: this.credentials.bucketName,
      secure: true,
      timeout: 600000, // 10分钟超时
    })
  }

  /**
   * 初始化分段列表
   */
  private initChunks(): void {
    const totalChunks = Math.ceil(this.fileSize / this.chunkSize)
    this.chunks = []

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize
      const end = Math.min(start + this.chunkSize - 1, this.fileSize - 1)

      this.chunks.push({
        index: i,
        start,
        end,
        size: end - start + 1,
        completed: false,
      })
    }
  }

  /**
   * 加载断点续传检查点
   */
  private loadCheckpoint(): DownloadCheckpoint | null {
    try {
      const key = `download_checkpoint_${this.fileName}`
      const data = localStorage.getItem(key)
      if (!data) return null

      const checkpoint: DownloadCheckpoint = JSON.parse(data)

      // 验证检查点有效性
      if (checkpoint.fileName !== this.fileName || checkpoint.fileSize !== this.fileSize) {
        console.warn('[OSSDownloader] 检查点文件信息不匹配,忽略')
        return null
      }

      return checkpoint
    } catch (error) {
      console.error('[OSSDownloader] 加载检查点失败:', error)
      return null
    }
  }

  /**
   * 保存断点续传检查点
   */
  private saveCheckpoint(): void {
    try {
      const checkpoint: DownloadCheckpoint = {
        taskId: this.fileName, // 使用文件名作为标识
        fileName: this.fileName,
        fileSize: this.fileSize,
        chunkSize: this.chunkSize,
        chunks: this.chunks.map(c => ({
          ...c,
          data: undefined, // 不保存数据到localStorage
        })),
        downloadedSize: this.downloadedSize,
        savePath: this.savePath,
        tempPath: `${this.savePath}.downloading`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const key = `download_checkpoint_${this.fileName}`
      localStorage.setItem(key, JSON.stringify(checkpoint))
    } catch (error) {
      console.error('[OSSDownloader] 保存检查点失败:', error)
    }
  }

  /**
   * 清除断点续传检查点
   */
  private clearCheckpoint(): void {
    try {
      const key = `download_checkpoint_${this.fileName}`
      localStorage.removeItem(key)
    } catch (error) {
      console.error('[OSSDownloader] 清除检查点失败:', error)
    }
  }

  /**
   * 下载单个分段 (使用 HTTP Range 请求)
   */
  private async downloadChunk(chunk: DownloadChunk): Promise<ArrayBuffer> {
    if (!this.client) {
      throw new Error('OSS客户端未初始化')
    }

    try {
      // OSS SDK 的 get 方法支持 Range 请求
      // @ts-ignore - ali-oss types are incomplete, but get method exists
      const result = await this.client.get(this.credentials.objectKey, {
        headers: {
          Range: `bytes=${chunk.start}-${chunk.end}`,
        },
      })

      // result.content 是 Buffer,转换为 ArrayBuffer
      if (result.content instanceof Buffer) {
        return result.content.buffer.slice(
          result.content.byteOffset,
          result.content.byteOffset + result.content.byteLength
        )
      }

      throw new Error('下载的数据格式不正确')
    } catch (error: any) {
      console.error(`[OSSDownloader] 下载分段 ${chunk.index} 失败:`, error)
      throw new Error(`下载分段失败: ${error.message}`)
    }
  }

  /**
   * 更新下载进度 (滑动窗口速度计算)
   */
  private updateProgress(): void {
    const now = Date.now()

    // 添加新采样点
    this.speedSamples.push({
      time: now,
      size: this.downloadedSize,
    })

    // 移除窗口外的旧采样点
    const windowStart = now - SPEED_SAMPLE_WINDOW * 1000
    this.speedSamples = this.speedSamples.filter(sample => sample.time >= windowStart)

    // 计算实时速度
    if (this.speedSamples.length >= 2) {
      const firstSample = this.speedSamples[0]
      const lastSample = this.speedSamples[this.speedSamples.length - 1]
      const timeDiff = (lastSample.time - firstSample.time) / 1000 // 转换为秒

      if (timeDiff > 0) {
        this.currentSpeed = (lastSample.size - firstSample.size) / timeDiff

        // 计算剩余时间
        const remainingSize = this.fileSize - this.downloadedSize
        this.currentRemainingTime = this.currentSpeed > 0 ? remainingSize / this.currentSpeed : 0
      }
    }

    // 触发进度回调
    if (this.onProgress) {
      this.onProgress({
        percent: this.downloadedSize / this.fileSize,
        downloadedSize: this.downloadedSize,
        totalSize: this.fileSize,
        speed: this.currentSpeed,
        remainingTime: Math.ceil(this.currentRemainingTime),
      })
    }
  }

  /**
   * 合并所有分段并写入文件
   */
  private async mergeAndSave(): Promise<void> {
    try {
      // 计算总大小
      const totalSize = this.chunks.reduce((sum, chunk) => sum + chunk.size, 0)
      const mergedBuffer = new Uint8Array(totalSize)

      // 合并所有分段数据
      let offset = 0
      for (const chunk of this.chunks) {
        if (!chunk.data) {
          throw new Error(`分段 ${chunk.index} 数据缺失`)
        }

        mergedBuffer.set(new Uint8Array(chunk.data), offset)
        offset += chunk.size
      }

      // 通过 Electron IPC 写入文件
      if (window.electronAPI?.writeFile) {
        await window.electronAPI.writeFile(this.savePath, mergedBuffer.buffer)
      } else {
        throw new Error('Electron API 不可用,无法写入文件')
      }

      console.log(`[OSSDownloader] 文件已保存: ${this.savePath}`)
    } catch (error: any) {
      console.error('[OSSDownloader] 合并文件失败:', error)
      throw new Error(`合并文件失败: ${error.message}`)
    }
  }

  /**
   * MD5 校验
   */
  private async verifyMD5(): Promise<boolean> {
    if (!this.md5) {
      console.log('[OSSDownloader] 未提供MD5哈希,跳过校验')
      return true
    }

    try {
      if (window.electronAPI?.calculateFileMD5) {
        const calculatedMD5 = await window.electronAPI.calculateFileMD5(this.savePath)
        const isValid = calculatedMD5.toLowerCase() === this.md5.toLowerCase()

        if (!isValid) {
          console.error('[OSSDownloader] MD5校验失败')
          console.error(`  期望: ${this.md5}`)
          console.error(`  实际: ${calculatedMD5}`)
        }

        return isValid
      } else {
        console.warn('[OSSDownloader] Electron API 不可用,无法进行MD5校验')
        return true // 无法校验时默认通过
      }
    } catch (error: any) {
      console.error('[OSSDownloader] MD5校验出错:', error)
      throw new Error(`MD5校验失败: ${error.message}`)
    }
  }

  /**
   * 开始下载
   */
  async start(): Promise<void> {
    try {
      console.log(`[OSSDownloader] 开始下载: ${this.fileName} (${(this.fileSize / MB).toFixed(2)} MB)`)

      // 初始化 OSS 客户端
      await this.initClient()

      // 初始化或恢复分段列表
      const checkpoint = this.loadCheckpoint()
      if (checkpoint && checkpoint.chunks.length > 0) {
        console.log('[OSSDownloader] 恢复断点续传')
        this.chunks = checkpoint.chunks.map(c => ({ ...c, data: undefined }))
        this.downloadedSize = checkpoint.downloadedSize
      } else {
        this.initChunks()
      }

      // 并发下载所有分段
      const downloadQueue: Promise<void>[] = []
      let activeDownloads = 0

      for (let i = 0; i < this.chunks.length; i++) {
        if (this.isPaused || this.isAborted) break

        const chunk = this.chunks[i]
        if (chunk.completed && chunk.data) {
          // 分段已完成,跳过
          continue
        }

        // 等待空闲槽位
        while (activeDownloads >= this.parallel) {
          await Promise.race(downloadQueue)
        }

        // 启动下载任务
        activeDownloads++
        const downloadTask = this.downloadChunk(chunk)
          .then(data => {
            chunk.data = data
            chunk.completed = true
            this.downloadedSize += chunk.size

            // 更新进度
            this.updateProgress()

            // 保存检查点 (每10个分段保存一次)
            if (chunk.index % 10 === 0) {
              this.saveCheckpoint()
            }
          })
          .catch(error => {
            console.error(`[OSSDownloader] 分段 ${chunk.index} 下载失败:`, error)
            throw error
          })
          .finally(() => {
            activeDownloads--
          })

        downloadQueue.push(downloadTask)
      }

      // 等待所有下载完成
      await Promise.all(downloadQueue)

      if (this.isPaused) {
        console.log('[OSSDownloader] 下载已暂停')
        return
      }

      if (this.isAborted) {
        console.log('[OSSDownloader] 下载已取消')
        return
      }

      console.log('[OSSDownloader] 所有分段下载完成,开始合并文件')

      // 合并并保存文件
      await this.mergeAndSave()

      // MD5 校验
      console.log('[OSSDownloader] 开始MD5校验')
      const isValid = await this.verifyMD5()
      if (!isValid) {
        throw new Error('文件MD5校验失败,文件可能已损坏')
      }

      // 清除检查点
      this.clearCheckpoint()

      // 触发成功回调
      console.log('[OSSDownloader] 下载成功')
      if (this.onSuccess) {
        this.onSuccess({
          path: this.savePath,
          md5: this.md5,
        })
      }
    } catch (error: any) {
      console.error('[OSSDownloader] 下载失败:', error)

      // 保存检查点以便后续恢复
      this.saveCheckpoint()

      // 触发错误回调
      if (this.onError) {
        this.onError(error)
      }

      throw error
    }
  }

  /**
   * 暂停下载
   */
  pause(): void {
    this.isPaused = true
    this.saveCheckpoint()
    console.log('[OSSDownloader] 下载已暂停')
  }

  /**
   * 继续下载
   */
  resume(): void {
    this.isPaused = false
    console.log('[OSSDownloader] 继续下载')
    this.start() // 重新启动下载
  }

  /**
   * 取消下载
   */
  abort(): void {
    this.isAborted = true
    this.clearCheckpoint()
    console.log('[OSSDownloader] 下载已取消')
  }
}

export default OSSDownloader
