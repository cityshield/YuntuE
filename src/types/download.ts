/**
 * 下载功能相关类型定义
 */

// 下载状态枚举
export enum DownloadStatus {
  WAITING = 'waiting',       // 等待下载
  DOWNLOADING = 'downloading', // 下载中
  PAUSED = 'paused',         // 已暂停
  VERIFYING = 'verifying',   // MD5校验中
  SUCCESS = 'success',       // 下载成功
  FAILED = 'failed',         // 下载失败
}

// 下载任务
export interface DownloadTask {
  // 基本信息
  id: string                    // 下载任务ID (本地生成)
  taskId: string                // 关联的渲染任务ID
  taskName: string              // 任务名称
  fileType: 'result' | 'log' | 'preview'  // 文件类型

  // 文件信息
  fileName: string              // 文件名
  fileSize: number              // 文件大小 (bytes)
  md5?: string                  // MD5哈希 (用于完整性校验)
  ossKey: string                // OSS对象键
  ossUrl: string                // OSS完整URL

  // 下载状态
  status: DownloadStatus        // 当前状态
  progress: number              // 下载进度 (0-100)
  downloadedSize: number        // 已下载大小 (bytes)
  speed: number                 // 下载速度 (bytes/s)
  remainingTime: number         // 剩余时间 (秒)

  // 本地存储
  savePath: string              // 最终保存路径
  tempPath?: string             // 临时文件路径 (分段下载时使用)

  // 错误信息
  error?: string                // 错误描述
  retryCount?: number           // 重试次数

  // 时间戳
  createdAt: number             // 创建时间戳
  startedAt?: number            // 开始下载时间戳
  completedAt?: number          // 完成时间戳
  pausedAt?: number             // 暂停时间戳
}

// OSS下载凭证
export interface OSSDownloadCredentials {
  accessKeyId: string           // OSS AccessKeyId
  accessKeySecret: string       // OSS AccessKeySecret
  securityToken: string         // STS临时Token
  endpoint: string              // OSS Endpoint (如: https://oss-cn-beijing.aliyuncs.com)
  bucketName: string            // Bucket名称
  objectKey: string             // 对象键
  expiration: string            // 凭证过期时间 (ISO 8601格式)
}

// 下载进度回调参数
export interface DownloadProgress {
  percent: number               // 进度百分比 (0-1)
  downloadedSize: number        // 已下载大小
  totalSize: number             // 总大小
  speed: number                 // 当前速度 (bytes/s)
  remainingTime: number         // 预估剩余时间 (秒)
}

// 下载分段信息 (用于断点续传)
export interface DownloadChunk {
  index: number                 // 分段索引
  start: number                 // 起始字节位置
  end: number                   // 结束字节位置
  size: number                  // 分段大小
  completed: boolean            // 是否已完成
  data?: ArrayBuffer            // 分段数据 (内存中缓存)
}

// 下载检查点 (用于断点续传)
export interface DownloadCheckpoint {
  taskId: string                // 任务ID
  fileName: string              // 文件名
  fileSize: number              // 文件大小
  chunkSize: number             // 分段大小
  chunks: DownloadChunk[]       // 分段列表
  downloadedSize: number        // 已下载总大小
  savePath: string              // 保存路径
  tempPath: string              // 临时路径
  createdAt: number             // 检查点创建时间
  updatedAt: number             // 最后更新时间
}

// 下载选项
export interface DownloadOptions {
  credentials: OSSDownloadCredentials  // OSS凭证
  fileName: string              // 文件名
  fileSize: number              // 文件大小
  md5?: string                  // MD5哈希
  savePath: string              // 保存路径
  chunkSize?: number            // 分段大小 (可选,会自动计算)
  parallel?: number             // 并发数 (可选,会自动计算)
  onProgress?: (progress: DownloadProgress) => void  // 进度回调
  onSuccess?: (result: { path: string; md5?: string }) => void  // 成功回调
  onError?: (error: Error) => void  // 错误回调
}

// 任务输出文件信息 (从服务端获取)
export interface TaskOutputFile {
  id: string                    // 文件ID
  file_name: string             // 文件名
  file_size: number             // 文件大小
  file_type: 'result' | 'log' | 'preview'  // 文件类型
  md5?: string                  // MD5哈希
  oss_key: string               // OSS对象键
  oss_url: string               // OSS URL
  created_at: string            // 创建时间
}

// 下载管理器配置
export interface DownloadManagerConfig {
  maxConcurrent: number         // 最大并发下载数
  defaultSavePath: string       // 默认保存路径
  autoRetry: boolean            // 自动重试
  maxRetryCount: number         // 最大重试次数
  enableNotification: boolean   // 启用系统通知
}

// 下载速度采样点 (用于滑动窗口算法)
export interface DownloadSpeedSample {
  time: number                  // 时间戳
  size: number                  // 累计下载大小
}
