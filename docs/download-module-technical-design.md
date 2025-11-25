# 我的下载功能模块 - 技术方案总结

## 一、模块概述

### 1.1 功能定位
"我的下载"模块是盛世云图客户端的核心功能之一,负责从阿里云OSS下载渲染完成的文件(结果文件、日志文件、预览文件等),并提供下载任务的管理、监控和控制能力。

### 1.2 核心特性
- 支持大文件断点续传下载
- 多任务并发下载管理
- 实时进度监控和速度计算
- 文件完整性校验(MD5)
- 任务状态管理(下载中、暂停、成功、失败等)
- OSS临时凭证自动刷新机制

---

## 二、技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    DownloadArea.vue (UI层)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Tab导航栏   │  │  统计工具栏  │  │  任务列表    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              useDownload.ts (业务逻辑层)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - tasks (任务列表)                                   │  │
│  │  - stats (统计信息)                                   │  │
│  │  - pauseTask / resumeTask / retryTask / cancelTask   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│            DownloadManager.ts (核心管理层)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - 任务队列管理                                       │  │
│  │  - 并发控制 (maxConcurrent)                          │  │
│  │  - 任务状态同步                                       │  │
│  │  - OSS凭证管理                                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│            OSSDownloader.ts (下载执行层)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - 分片下载 (chunked download)                        │  │
│  │  - 断点续传                                           │  │
│  │  - 进度计算                                           │  │
│  │  - MD5校验                                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Electron IPC (系统层)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - 文件系统操作 (readFile / writeFile)               │  │
│  │  - MD5计算 (calculateFileMD5)                         │  │
│  │  - 目录选择 (selectDirectory)                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

#### 前端框架
- **Vue 3** (Composition API)
- **TypeScript** (类型安全)
- **Element Plus** (UI组件库)
- **Vue Router** (路由管理)

#### 下载引擎
- **ali-oss** (阿里云OSS SDK)
- **Axios** (HTTP客户端)
- **Crypto** (MD5校验)

#### 桌面端
- **Electron** (跨平台桌面应用框架)
- **Node.js** (文件系统操作)

---

## 三、核心模块设计

### 3.1 数据结构设计

#### 3.1.1 DownloadTask (下载任务)

```typescript
interface DownloadTask {
  // 基本信息
  id: string                    // 任务唯一标识
  taskId: string                // 关联的渲染任务ID
  taskName: string              // 任务名称

  // 文件信息
  fileType: 'result' | 'log' | 'preview'  // 文件类型
  fileName: string              // 文件名
  fileSize: number              // 文件大小(字节)
  md5?: string                  // MD5校验值

  // OSS信息
  ossKey: string                // OSS对象键
  ossUrl: string                // OSS下载地址

  // 任务状态
  status: DownloadStatus        // 当前状态
  progress: number              // 下载进度(0-100)
  downloadedSize: number        // 已下载大小(字节)
  speed: number                 // 下载速度(字节/秒)
  remainingTime: number         // 剩余时间(秒)

  // 保存路径
  savePath: string              // 本地保存路径

  // 错误信息
  error?: string                // 错误消息
  retryCount: number            // 重试次数

  // 时间戳
  createdAt: number             // 创建时间
  startedAt?: number            // 开始下载时间
  completedAt?: number          // 完成时间
}
```

#### 3.1.2 DownloadStatus (任务状态)

```typescript
enum DownloadStatus {
  WAITING = 'waiting',          // 等待中
  DOWNLOADING = 'downloading',  // 下载中
  PAUSED = 'paused',            // 已暂停
  VERIFYING = 'verifying',      // 校验中
  SUCCESS = 'success',          // 成功
  FAILED = 'failed',            // 失败
}
```

#### 3.1.3 DownloadStats (统计信息)

```typescript
interface DownloadStats {
  total: number       // 总任务数
  downloading: number // 下载中
  waiting: number     // 等待中
  success: number     // 成功
  failed: number      // 失败
}
```

### 3.2 核心类设计

#### 3.2.1 DownloadManager (下载管理器)

```typescript
class DownloadManager {
  private tasks: Map<string, DownloadTask>
  private activeDownloads: Set<string>
  private maxConcurrent: number = 3
  private ossClient: OSS | null = null
  private credentials: STSCredentials | null = null

  // 核心方法
  async addTask(task: DownloadTask): Promise<void>
  async startTask(taskId: string): Promise<void>
  async pauseTask(taskId: string): Promise<void>
  async resumeTask(taskId: string): Promise<void>
  async cancelTask(taskId: string): Promise<void>
  async retryTask(taskId: string): Promise<void>

  // 内部方法
  private async processQueue(): Promise<void>
  private async refreshCredentials(): Promise<void>
  private createOSSClient(): OSS
  private updateTaskStatus(taskId: string, updates: Partial<DownloadTask>): void
}
```

**关键实现逻辑:**

1. **并发控制**: 通过 `maxConcurrent` 限制同时下载的任务数,避免网络拥塞
2. **队列管理**: 使用 `processQueue()` 自动调度等待中的任务
3. **凭证刷新**: `refreshCredentials()` 在凭证过期前自动刷新OSS临时凭证
4. **状态同步**: 所有状态变更通过 `updateTaskStatus()` 集中管理,确保响应式更新

#### 3.2.2 OSSDownloader (OSS下载器)

```typescript
class OSSDownloader {
  private task: DownloadTask
  private ossClient: OSS
  private abortController: AbortController

  // 核心方法
  async download(): Promise<void>
  pause(): void
  resume(): void
  cancel(): void

  // 内部方法
  private async downloadWithProgress(): Promise<void>
  private async verifyMD5(): Promise<boolean>
  private calculateSpeed(downloaded: number, elapsed: number): number
  private estimateRemainingTime(remaining: number, speed: number): number
}
```

**关键实现逻辑:**

1. **分片下载**:
   ```typescript
   const stream = await this.ossClient.getStream(ossKey, {
     headers: {
       'Range': `bytes=${startByte}-${endByte}`
     }
   })
   ```

2. **进度回调**:
   ```typescript
   stream.on('data', (chunk) => {
     downloadedSize += chunk.length
     progress = (downloadedSize / fileSize) * 100
     speed = calculateSpeed(downloadedSize, Date.now() - startTime)
     onProgress({ progress, downloadedSize, speed })
   })
   ```

3. **MD5校验**:
   ```typescript
   const calculatedMD5 = await window.electronAPI.calculateFileMD5(savePath)
   if (calculatedMD5 !== task.md5) {
     throw new Error('文件MD5校验失败')
   }
   ```

### 3.3 UI组件设计

#### 3.3.1 DownloadArea.vue (主页面)

```vue
<template>
  <div class="download-area">
    <!-- Tab 导航 -->
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="分析列表" name="analysis" />
      <el-tab-pane label="我的上传" name="upload" />
      <el-tab-pane label="渲染作业" name="tasks" />
      <el-tab-pane label="我的下载" name="download" />
    </el-tabs>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="stats">
        <span>全部 {{ stats.total }}</span>
        <span class="downloading">下载中 {{ stats.downloading }}</span>
        <span class="success">成功 {{ stats.success }}</span>
        <span class="failed">失败 {{ stats.failed }}</span>
      </div>

      <div class="actions">
        <el-select v-model="filter" placeholder="筛选状态" />
        <el-button @click="clearCompleted">清除已完成</el-button>
      </div>
    </div>

    <!-- 任务列表 -->
    <div class="task-list">
      <DownloadTask
        v-for="task in filteredTasks"
        :key="task.id"
        :task="task"
        @pause="handlePause"
        @resume="handleResume"
        @retry="handleRetry"
        @cancel="handleCancel"
      />
    </div>
  </div>
</template>
```

**核心功能:**
- Tab导航: 与主界面保持一致的4 Tab结构
- 统计信息: 实时显示各状态任务数量
- 筛选器: 按状态筛选任务
- 批量操作: 清除已完成任务

#### 3.3.2 DownloadTask.vue (任务卡片)

```vue
<template>
  <div class="download-task-card">
    <!-- 文件信息 -->
    <div class="file-info">
      <el-icon class="file-icon"><Document /></el-icon>
      <div class="details">
        <div class="file-name">{{ task.fileName }}</div>
        <div class="task-name">{{ task.taskName }}</div>
      </div>
    </div>

    <!-- 进度条 -->
    <el-progress
      :percentage="task.progress"
      :status="getProgressStatus(task.status)"
    />

    <!-- 状态信息 -->
    <div class="status-info">
      <span class="speed">{{ formatSpeed(task.speed) }}</span>
      <span class="size">{{ formatSize(task.downloadedSize) }} / {{ formatSize(task.fileSize) }}</span>
      <span class="time">剩余 {{ formatTime(task.remainingTime) }}</span>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <el-button v-if="canPause" @click="$emit('pause', task.id)">暂停</el-button>
      <el-button v-if="canResume" @click="$emit('resume', task.id)">继续</el-button>
      <el-button v-if="canRetry" @click="$emit('retry', task.id)">重试</el-button>
      <el-button @click="$emit('cancel', task.id)">取消</el-button>
    </div>
  </div>
</template>
```

**核心功能:**
- 文件信息展示: 文件名、任务名、文件大小
- 进度可视化: 进度条、百分比、下载速度
- 状态指示: 不同状态显示不同颜色和图标
- 操作控制: 暂停、继续、重试、取消

---

## 四、关键技术实现

### 4.1 断点续传实现

```typescript
class OSSDownloader {
  private async downloadWithResume(): Promise<void> {
    // 1. 检查本地是否有未完成的下载
    const existingFile = await this.checkExistingFile()
    const startByte = existingFile ? existingFile.size : 0

    // 2. 发起Range请求
    const stream = await this.ossClient.getStream(this.task.ossKey, {
      headers: {
        'Range': `bytes=${startByte}-`
      }
    })

    // 3. 追加写入文件
    const fileStream = fs.createWriteStream(this.task.savePath, {
      flags: 'a'  // 追加模式
    })

    stream.pipe(fileStream)

    // 4. 监听进度
    stream.on('data', (chunk) => {
      this.updateProgress(startByte + chunk.length)
    })
  }
}
```

### 4.2 并发下载控制

```typescript
class DownloadManager {
  private async processQueue(): Promise<void> {
    // 获取等待中的任务
    const waitingTasks = Array.from(this.tasks.values())
      .filter(t => t.status === DownloadStatus.WAITING)
      .sort((a, b) => a.createdAt - b.createdAt)

    // 计算可启动的任务数
    const availableSlots = this.maxConcurrent - this.activeDownloads.size

    // 启动任务
    for (let i = 0; i < Math.min(availableSlots, waitingTasks.length); i++) {
      await this.startTask(waitingTasks[i].id)
    }
  }

  private async startTask(taskId: string): Promise<void> {
    if (this.activeDownloads.size >= this.maxConcurrent) {
      return
    }

    this.activeDownloads.add(taskId)

    try {
      const downloader = new OSSDownloader(task, this.ossClient)
      await downloader.download()
      this.updateTaskStatus(taskId, { status: DownloadStatus.SUCCESS })
    } catch (error) {
      this.updateTaskStatus(taskId, {
        status: DownloadStatus.FAILED,
        error: error.message
      })
    } finally {
      this.activeDownloads.delete(taskId)
      this.processQueue()  // 继续处理队列
    }
  }
}
```

### 4.3 OSS凭证自动刷新

```typescript
class DownloadManager {
  private credentialsExpireTime: number = 0

  private async ensureCredentials(): Promise<void> {
    const now = Date.now()
    const bufferTime = 5 * 60 * 1000  // 提前5分钟刷新

    if (!this.credentials || now > this.credentialsExpireTime - bufferTime) {
      await this.refreshCredentials()
    }
  }

  private async refreshCredentials(): Promise<void> {
    const response = await axios.get('/api/oss/credentials')
    this.credentials = response.data
    this.credentialsExpireTime = Date.now() + (this.credentials.expiration * 1000)

    // 重新创建OSS客户端
    this.ossClient = this.createOSSClient()
  }

  private createOSSClient(): OSS {
    return new OSS({
      region: this.credentials.region,
      accessKeyId: this.credentials.accessKeyId,
      accessKeySecret: this.credentials.accessKeySecret,
      stsToken: this.credentials.securityToken,
      bucket: this.credentials.bucket,
    })
  }
}
```

### 4.4 进度计算与速度估算

```typescript
class ProgressCalculator {
  private samples: Array<{ time: number; bytes: number }> = []
  private readonly SAMPLE_SIZE = 10  // 保留最近10个采样点

  addSample(bytes: number): void {
    this.samples.push({
      time: Date.now(),
      bytes
    })

    if (this.samples.length > this.SAMPLE_SIZE) {
      this.samples.shift()
    }
  }

  calculateSpeed(): number {
    if (this.samples.length < 2) return 0

    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]

    const timeDiff = (last.time - first.time) / 1000  // 秒
    const bytesDiff = last.bytes - first.bytes

    return timeDiff > 0 ? bytesDiff / timeDiff : 0
  }

  estimateRemainingTime(remainingBytes: number): number {
    const speed = this.calculateSpeed()
    return speed > 0 ? Math.ceil(remainingBytes / speed) : 0
  }
}
```

### 4.5 MD5校验实现

```typescript
// Electron Main Process (electron/main.ts)
ipcMain.handle('calculate-file-md5', async (_event, filePath: string) => {
  const crypto = await import('crypto')
  const { readFile } = await import('fs/promises')

  const buffer = await readFile(filePath)
  const hash = crypto.createHash('md5')
  hash.update(buffer)

  return hash.digest('hex')
})

// Renderer Process (src/utils/download/OSSDownloader.ts)
class OSSDownloader {
  private async verifyFile(): Promise<boolean> {
    if (!this.task.md5) {
      return true  // 没有MD5则跳过校验
    }

    this.updateStatus(DownloadStatus.VERIFYING)

    const calculatedMD5 = await window.electronAPI.calculateFileMD5(
      this.task.savePath
    )

    const isValid = calculatedMD5.toLowerCase() === this.task.md5.toLowerCase()

    if (!isValid) {
      throw new Error('文件MD5校验失败,文件可能已损坏')
    }

    return isValid
  }
}
```

---

## 五、性能优化

### 5.1 下载性能优化

#### 分片下载
```typescript
// 对于大文件,使用分片下载提高并发性
const CHUNK_SIZE = 10 * 1024 * 1024  // 10MB

async function downloadLargeFile(task: DownloadTask) {
  const chunks = Math.ceil(task.fileSize / CHUNK_SIZE)
  const promises = []

  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, task.fileSize) - 1

    promises.push(
      downloadChunk(task.ossKey, start, end, `${task.savePath}.part${i}`)
    )
  }

  await Promise.all(promises)
  await mergeChunks(task.savePath, chunks)
}
```

#### 连接复用
```typescript
// 使用单例OSS客户端,避免频繁创建连接
class DownloadManager {
  private static instance: DownloadManager
  private ossClient: OSS

  private constructor() {
    this.ossClient = this.createOSSClient()
  }

  static getInstance(): DownloadManager {
    if (!this.instance) {
      this.instance = new DownloadManager()
    }
    return this.instance
  }
}
```

### 5.2 UI性能优化

#### 虚拟滚动
```vue
<!-- 对于大量任务,使用虚拟滚动减少DOM节点 -->
<el-virtual-scroll
  :items="filteredTasks"
  :item-height="120"
  :buffer="5"
>
  <template #default="{ item }">
    <DownloadTask :task="item" />
  </template>
</el-virtual-scroll>
```

#### 节流更新
```typescript
// 限制进度更新频率,避免频繁渲染
import { throttle } from 'lodash-es'

const updateProgress = throttle((taskId: string, progress: number) => {
  downloadManager.updateTaskStatus(taskId, { progress })
}, 500)  // 每500ms最多更新一次
```

### 5.3 内存优化

```typescript
// 使用流式处理,避免一次性加载整个文件到内存
async function downloadWithStream(task: DownloadTask) {
  const stream = await ossClient.getStream(task.ossKey)
  const fileStream = fs.createWriteStream(task.savePath)

  // 使用管道传输,自动处理背压
  stream.pipe(fileStream)

  return new Promise((resolve, reject) => {
    fileStream.on('finish', resolve)
    fileStream.on('error', reject)
  })
}
```

---

## 六、错误处理

### 6.1 错误分类

```typescript
enum DownloadErrorType {
  NETWORK_ERROR = 'network_error',        // 网络错误
  OSS_ERROR = 'oss_error',                // OSS服务错误
  FILE_SYSTEM_ERROR = 'file_system_error', // 文件系统错误
  VERIFICATION_ERROR = 'verification_error', // 校验错误
  PERMISSION_ERROR = 'permission_error',   // 权限错误
}

class DownloadError extends Error {
  constructor(
    public type: DownloadErrorType,
    public message: string,
    public retryable: boolean = false
  ) {
    super(message)
  }
}
```

### 6.2 重试策略

```typescript
class RetryHandler {
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAYS = [1000, 3000, 5000]  // 递增延迟

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (!this.shouldRetry(error, retryCount)) {
        throw error
      }

      const delay = this.RETRY_DELAYS[retryCount]
      await this.sleep(delay)

      return this.executeWithRetry(fn, retryCount + 1)
    }
  }

  private shouldRetry(error: Error, retryCount: number): boolean {
    if (retryCount >= this.MAX_RETRIES) {
      return false
    }

    if (error instanceof DownloadError) {
      return error.retryable
    }

    // 网络错误可重试
    return error.message.includes('network') ||
           error.message.includes('timeout')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

### 6.3 错误提示

```typescript
// 用户友好的错误消息映射
const ERROR_MESSAGES: Record<DownloadErrorType, string> = {
  [DownloadErrorType.NETWORK_ERROR]: '网络连接失败,请检查网络后重试',
  [DownloadErrorType.OSS_ERROR]: 'OSS服务异常,请稍后重试',
  [DownloadErrorType.FILE_SYSTEM_ERROR]: '文件写入失败,请检查磁盘空间',
  [DownloadErrorType.VERIFICATION_ERROR]: '文件校验失败,文件可能已损坏',
  [DownloadErrorType.PERMISSION_ERROR]: '没有文件写入权限,请检查目录权限',
}

function showErrorNotification(error: DownloadError) {
  ElNotification({
    title: '下载失败',
    message: ERROR_MESSAGES[error.type] || error.message,
    type: 'error',
    duration: 5000,
  })
}
```

---

## 七、数据持久化

### 7.1 任务状态持久化

```typescript
class DownloadPersistence {
  private readonly STORAGE_KEY = 'download_tasks'

  // 保存任务状态到本地存储
  saveTasks(tasks: Map<string, DownloadTask>): void {
    const tasksArray = Array.from(tasks.values())
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(tasksArray))
  }

  // 从本地存储恢复任务
  loadTasks(): Map<string, DownloadTask> {
    const data = localStorage.getItem(this.STORAGE_KEY)
    if (!data) return new Map()

    const tasksArray: DownloadTask[] = JSON.parse(data)
    const tasks = new Map()

    for (const task of tasksArray) {
      // 重启后将下载中的任务标记为暂停
      if (task.status === DownloadStatus.DOWNLOADING) {
        task.status = DownloadStatus.PAUSED
      }
      tasks.set(task.id, task)
    }

    return tasks
  }

  // 清除已完成的任务
  clearCompletedTasks(tasks: Map<string, DownloadTask>): void {
    const activeTasks = new Map()

    for (const [id, task] of tasks) {
      if (task.status !== DownloadStatus.SUCCESS) {
        activeTasks.set(id, task)
      }
    }

    this.saveTasks(activeTasks)
  }
}
```

### 7.2 自动保存

```typescript
// 在DownloadManager中自动保存状态变更
class DownloadManager {
  private persistence = new DownloadPersistence()

  private updateTaskStatus(
    taskId: string,
    updates: Partial<DownloadTask>
  ): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    Object.assign(task, updates)
    this.tasks.set(taskId, task)

    // 自动保存到本地存储
    this.persistence.saveTasks(this.tasks)
  }
}
```

---

## 八、测试方案

### 8.1 单元测试

```typescript
// tests/unit/DownloadManager.spec.ts
describe('DownloadManager', () => {
  let manager: DownloadManager

  beforeEach(() => {
    manager = DownloadManager.getInstance()
  })

  it('should add task to queue', async () => {
    const task = createMockTask()
    await manager.addTask(task)

    expect(manager.getTasks()).toContain(task)
  })

  it('should respect max concurrent limit', async () => {
    const tasks = [
      createMockTask(),
      createMockTask(),
      createMockTask(),
      createMockTask(),
    ]

    for (const task of tasks) {
      await manager.addTask(task)
    }

    expect(manager.getActiveDownloads().size).toBeLessThanOrEqual(3)
  })

  it('should retry failed downloads', async () => {
    const task = createMockTask()
    await manager.addTask(task)

    // 模拟下载失败
    manager.updateTaskStatus(task.id, { status: DownloadStatus.FAILED })

    // 重试
    await manager.retryTask(task.id)

    expect(task.retryCount).toBe(1)
    expect(task.status).toBe(DownloadStatus.WAITING)
  })
})
```

### 8.2 集成测试

```typescript
// tests/integration/download-flow.spec.ts
describe('Download Flow', () => {
  it('should complete full download workflow', async () => {
    // 1. 创建任务
    const task = await createDownloadTask({
      ossKey: 'test/file.zip',
      fileSize: 1024 * 1024,
      md5: 'abc123',
    })

    // 2. 开始下载
    await downloadManager.startTask(task.id)

    // 3. 等待完成
    await waitForTaskComplete(task.id)

    // 4. 验证文件
    const fileExists = await fs.existsSync(task.savePath)
    expect(fileExists).toBe(true)

    const fileMD5 = await calculateMD5(task.savePath)
    expect(fileMD5).toBe(task.md5)
  })
})
```

### 8.3 Mock数据生成

```typescript
// DownloadArea.vue中的Mock数据生成
const generateMockData = (): DownloadTask[] => {
  const tasks: DownloadTask[] = []
  const fileNames = [
    'CityScene_Render_001-100.zip',
    'CharacterAnimation_Final.mp4',
    'ProductShowcase_4K.mov',
    // ... 更多文件名
  ]

  const statuses = [
    DownloadStatus.DOWNLOADING,
    DownloadStatus.WAITING,
    DownloadStatus.SUCCESS,
    DownloadStatus.FAILED,
  ]

  for (let i = 0; i < 20; i++) {
    tasks.push({
      id: `task_${i}`,
      taskId: `render_${i}`,
      taskName: `渲染任务_${i}`,
      fileName: fileNames[i],
      fileSize: Math.random() * 5 * 1024 * 1024 * 1024, // 0-5GB
      status: statuses[i % statuses.length],
      progress: Math.random() * 100,
      // ... 其他字段
    })
  }

  return tasks
}
```

---

## 九、部署说明

### 9.1 开发环境配置

```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "electron:dev": "concurrently \"npm run dev\" \"electron .\"",
    "build": "vue-tsc && vite build",
    "electron:build": "npm run build && electron-builder"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^4.0.0",
    "electron": "^23.0.0",
    "electron-builder": "^23.6.0",
    "typescript": "^4.9.0",
    "vite": "^4.0.0",
    "vue-tsc": "^1.0.0"
  },
  "dependencies": {
    "ali-oss": "^6.17.1",
    "axios": "^1.3.0",
    "element-plus": "^2.2.0",
    "vue": "^3.2.0",
    "vue-router": "^4.1.0"
  }
}
```

### 9.2 Electron打包配置

```javascript
// electron-builder.yml
appId: com.yuntu.client
productName: 盛世云图
directories:
  output: dist-electron
files:
  - dist/**/*
  - dist-electron/**/*
mac:
  category: public.app-category.productivity
  target: dmg
win:
  target: nsis
linux:
  target: AppImage
```

### 9.3 环境变量配置

```bash
# .env.development
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000

# .env.production
VITE_API_BASE_URL=https://api.yuntu.com
VITE_WS_BASE_URL=wss://api.yuntu.com
```

---

## 十、未来优化方向

### 10.1 功能增强

1. **智能限速**: 根据网络状况自动调整下载速度
2. **P2P加速**: 支持从其他已下载用户获取文件片段
3. **预览功能**: 下载完成前支持在线预览
4. **批量操作**: 支持批量暂停、继续、删除
5. **下载历史**: 记录所有下载历史,支持再次下载

### 10.2 性能优化

1. **增量更新**: 只更新变化的UI部分,减少重渲染
2. **Web Worker**: 将MD5计算等CPU密集型任务移到Worker
3. **Service Worker**: 支持离线下载和后台下载
4. **内存池**: 复用Buffer对象,减少GC压力

### 10.3 用户体验

1. **下载提醒**: 下载完成后系统通知
2. **快捷操作**: 支持拖拽文件到任务列表快速下载
3. **主题定制**: 支持自定义UI主题
4. **快捷键**: 支持键盘快捷键操作

---

## 十一、总结

### 11.1 技术亮点

1. **断点续传**: 支持大文件可靠下载,网络中断后可继续
2. **并发控制**: 智能调度下载任务,充分利用带宽
3. **完整性校验**: MD5校验确保文件完整性
4. **凭证管理**: 自动刷新OSS临时凭证,无需用户干预
5. **响应式设计**: Vue 3 Composition API + TypeScript,代码可维护性强

### 11.2 架构优势

1. **分层架构**: UI层、业务逻辑层、核心管理层、执行层清晰分离
2. **单一职责**: 每个类和模块职责明确,易于测试和维护
3. **可扩展性**: 基于接口编程,易于扩展新的下载源
4. **状态管理**: 集中式状态管理,易于追踪和调试

### 11.3 项目文件清单

```
src/
├── views/
│   └── Downloads/
│       └── DownloadArea.vue          # 下载主页面
├── components/
│   └── DownloadTask.vue              # 下载任务卡片组件
├── composables/
│   └── useDownload.ts                # 下载业务逻辑Composable
├── utils/
│   └── download/
│       ├── DownloadManager.ts        # 下载管理器
│       └── OSSDownloader.ts          # OSS下载器
├── types/
│   └── download.ts                   # 下载相关类型定义
└── api/
    └── download.ts                   # 下载相关API

electron/
├── main.ts                           # Electron主进程(IPC处理)
└── preload.ts                        # 预加载脚本(API暴露)
```

---

## 附录

### A. 相关文档链接

- [阿里云OSS JavaScript SDK文档](https://help.aliyun.com/document_detail/64041.html)
- [Electron IPC通信文档](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Vue 3 Composition API文档](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Element Plus组件库文档](https://element-plus.org/)

### B. 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0.0 | 2025-01 | 初始版本,支持基础下载功能 |
| v1.1.0 | 待定 | 增加断点续传和并发控制 |
| v1.2.0 | 待定 | 增加MD5校验和错误重试 |

### C. 联系方式

- 项目地址: [GitHub仓库链接]
- 文档地址: https://wcny5qi2f0g5.feishu.cn/wiki/GpMFwD69KioulWkiZAPcw2CCnvg
- 技术支持: [技术支持邮箱]

---

*本文档最后更新时间: 2025-01-20*
