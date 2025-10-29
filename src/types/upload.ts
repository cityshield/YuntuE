/**
 * 上传相关类型定义
 */

// 上传状态
export enum UploadStatus {
  WAITING = 'waiting',     // 等待中
  UPLOADING = 'uploading', // 上传中
  PAUSED = 'paused',       // 已暂停
  SUCCESS = 'success',     // 上传成功
  FAILED = 'failed',       // 上传失败
  CANCELED = 'canceled',   // 已取消
}

// 上传任务
export interface UploadTask {
  id: string                    // 任务ID
  file: File                    // 文件对象
  fileName: string              // 文件名
  fileSize: number              // 文件大小
  fileType: string              // 文件类型
  taskId: string                // 关联的业务任务ID
  status: UploadStatus          // 上传状态
  progress: number              // 上传进度 (0-100)
  uploadedSize: number          // 已上传大小
  speed: number                 // 上传速度 (bytes/s)
  remainingTime: number         // 剩余时间 (秒)
  error?: string                // 错误信息
  objectKey?: string            // OSS对象键
  url?: string                  // 文件URL
  checkpoint?: any              // 断点续传检查点
  createdAt: number             // 创建时间戳
  startedAt?: number            // 开始上传时间戳
  completedAt?: number          // 完成时间戳
  serverTaskId?: string         // 服务端任务ID（UploadTask.id）
  serverFileId?: string         // 服务端文件ID（TaskFile.id）
  md5?: string                  // 文件MD5哈希
}

// STS 凭证响应
export interface STSCredentials {
  accessKeyId: string
  accessKeySecret: string
  securityToken: string
  endpoint: string
  bucketName: string
  objectKey: string
  expiration: string
}

// 上传配置
export interface UploadConfig {
  chunkSize: number             // 分片大小 (bytes)
  maxConcurrent: number         // 最大并发数
  maxFileSize: number           // 最大文件大小 (bytes)
  timeout: number               // 超时时间 (ms)
  retryCount: number            // 重试次数
  acceptTypes: string[]         // 接受的文件类型
}

// 上传进度回调
export interface UploadProgress {
  percent: number               // 进度百分比 (0-1)
  uploadedSize: number          // 已上传大小
  totalSize: number             // 总大小
  speed: number                 // 上传速度
  remainingTime: number         // 剩余时间
}

// 上传事件
export enum UploadEvent {
  PROGRESS = 'progress',
  SUCCESS = 'success',
  ERROR = 'error',
  PAUSE = 'pause',
  RESUME = 'resume',
  CANCEL = 'cancel',
}

// 上传统计
export interface UploadStatistics {
  totalTasks: number            // 总任务数
  successTasks: number          // 成功任务数
  failedTasks: number           // 失败任务数
  totalSize: number             // 总大小
  uploadedSize: number          // 已上传大小
  averageSpeed: number          // 平均速度
}
