# YuntuE Electron 桌面客户端开发指南

> ⚠️ **重要**：开发任何功能前必须先阅读本文件和业务蓝图文档！

> 📁 **路径说明**：本文档位于 YuntuE 项目的 `.ai-context` 目录。相对路径基于 Workspace 根目录。详见 `../../.workspace-config.md`

---

## 📘 业务蓝图规范

### 蓝图文档路径
**文档名称：** `云渲染平台业务架构设计文档_V2.0.md`
**位置：** Workspace 根目录
**相对路径：** `../../云渲染平台业务架构设计文档_V2.0.md`（从本项目目录访问）

### 本项目对应的蓝图章节

本项目是 **Electron 桌面客户端**，主要对应以下章节：

| 章节 | 名称 | 重要性 | 说明 |
|-----|------|-------|------|
| **第二章** | 账号与权限体系 | ⭐⭐ | 登录、Token 管理、会话保持 |
| **第三章** | 文件存储与管理模块 | ⭐⭐⭐ | 文件上传（核心功能）、本地文件分析 |
| **第四章** | 渲染任务模块 | ⭐⭐ | 任务列表、下载管理 |
| **第五章** | 费用与计费模块 | ⭐ | 余额显示 |
| **第六章** | 通知与消息系统 | ⭐⭐⭐ | 系统通知、托盘消息 |
| **第七章** | Windows 客户端核心功能 | ⭐⭐⭐ | 托盘、自启动、更新、缓存（重点！） |

---

## 🖥 Windows 客户端核心功能（必读！）

> 参考蓝图：第七章

### 1. 托盘常驻功能

**要求：**
- 关闭窗口 ≠ 退出程序
- 最小化到托盘
- 上传/下载任务继续在后台执行

**托盘菜单：**
```typescript
const trayMenu = [
  { label: '显示主窗口', click: showMainWindow },
  { label: '暂停所有上传/下载', click: pauseAll },
  { type: 'separator' },
  { label: '设置', click: openSettings },
  { label: '退出程序', click: quitApp }  // 需二次确认
]
```

**托盘图标状态：**
- 红点：有未读通知
- 数字角标：未完成任务数量
- 旋转动画：上传/下载进行中

**实现示例（Electron）：**
```typescript
import { app, BrowserWindow, Tray, Menu } from 'electron'

let tray: Tray
let mainWindow: BrowserWindow

app.on('ready', () => {
  // 创建托盘
  tray = new Tray('icon.png')
  tray.setContextMenu(Menu.buildFromTemplate(trayMenu))

  // 窗口关闭时隐藏，不退出
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
})
```

### 2. 开机自启动

**要求：**
- 默认开启
- 用户可在设置中关闭
- 启动后最小化到托盘

**实现示例：**
```typescript
import { app } from 'electron'

// 设置开机自启动
function setAutoLaunch(enable: boolean) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,  // 启动后隐藏到托盘
    path: app.getPath('exe')
  })
}

// 读取设置
const autoLaunch = store.get('settings.autoLaunch', true)  // 默认开启
setAutoLaunch(autoLaunch)
```

### 3. 本地存储配置

#### 3.1 文件保存路径

**默认路径逻辑：**
```typescript
import { app } from 'electron'
import * as path from 'path'
import * as os from 'os'

function getDefaultDownloadPath(): string {
  const drives = ['D:', 'E:', 'F:']

  // 检测非C盘的剩余空间最大的盘符
  for (const drive of drives) {
    const drivePath = path.join(drive, 'yuntu')
    if (fs.existsSync(drive)) {
      return drivePath
    }
  }

  // 如果都不存在，使用用户文档目录
  return path.join(app.getPath('documents'), 'yuntu')
}
```

**路径变更逻辑：**
```typescript
function changeDownloadPath(newPath: string) {
  const oldPath = store.get('settings.downloadPath')

  // 提示用户
  const result = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['是', '否'],
    title: '迁移文件',
    message: `是否迁移已下载文件到新路径？\n${newPath}`
  })

  if (result === 0) {  // 用户选择"是"
    // 后台迁移文件
    migrateFiles(oldPath, newPath)
  }

  store.set('settings.downloadPath', newPath)
}
```

#### 3.2 缓存管理

**缓存路径：**
```typescript
const cachePath = path.join(app.getPath('userData'), 'cache')
```

**缓存用途：**
- 上传任务 checkpoint
- 下载任务临时文件
- 预览图缓存
- 日志文件

**缓存大小限制：**
```typescript
interface CacheSettings {
  path: string
  maxSize: number  // GB，默认 10GB
  strategy: 'LRU'  // 最近最少使用
}

function cleanCache() {
  const cacheSize = getCacheSize()
  const maxSize = store.get('settings.cacheMaxSize', 10) * 1024 * 1024 * 1024

  if (cacheSize > maxSize) {
    // LRU 算法删除最旧的缓存
    deleteOldestCache(cacheSize - maxSize)
  }
}
```

**卸载时保留缓存：**
```typescript
// 卸载时提示
app.on('before-quit', () => {
  const result = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['保留', '删除'],
    title: '卸载确认',
    message: '是否保留缓存文件？\n保留后重装可恢复上传任务。'
  })

  if (result === 1) {  // 删除
    fs.removeSync(cachePath)
  }
})
```

### 4. 版本更新机制

#### 4.1 更新检测

**检测时机：**
- 每次启动时检测
- 后台每4小时检测一次

**实现示例：**
```typescript
import { autoUpdater } from 'electron-updater'

autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://cdn.yuntu.com/client/updates/'
})

// 每次启动检测
app.on('ready', () => {
  autoUpdater.checkForUpdates()
})

// 后台定时检测
setInterval(() => {
  autoUpdater.checkForUpdates()
}, 4 * 60 * 60 * 1000)  // 4小时
```

#### 4.2 更新类型

**普通更新：**
```typescript
autoUpdater.on('update-available', (info) => {
  const result = dialog.showMessageBoxSync({
    type: 'info',
    buttons: ['立即更新', '稍后提醒', '忽略此版本'],
    title: '发现新版本',
    message: `发现新版本 ${info.version}，是否立即更新？\n\n更新内容：\n${info.releaseNotes}`
  })

  if (result === 0) {
    autoUpdater.downloadUpdate()
  } else if (result === 2) {
    store.set('ignoredVersion', info.version)
  }
})
```

**强制更新：**
```typescript
autoUpdater.on('update-available', (info) => {
  if (info.forceUpdate) {
    // 全屏阻断弹窗
    const updateWindow = new BrowserWindow({
      width: 600,
      height: 400,
      frame: false,
      alwaysOnTop: true,
      modal: true,
      closable: false,  // 无法关闭
      title: '强制更新'
    })

    updateWindow.loadURL('update.html')
    autoUpdater.downloadUpdate()  // 自动开始下载
  }
})
```

#### 4.3 更新流程

```typescript
// 1. 下载进度
autoUpdater.on('download-progress', (progress) => {
  // 显示进度条
  mainWindow.webContents.send('update-progress', progress.percent)
})

// 2. 下载完成
autoUpdater.on('update-downloaded', () => {
  // 保存当前状态
  saveAppState()

  // 退出并安装
  autoUpdater.quitAndInstall(true, true)
})
```

### 5. 反馈功能

**反馈表单：**
```typescript
interface FeedbackForm {
  type: 'bug' | 'feature' | 'question' | 'other'
  description: string  // 最多500字
  screenshots: string[]  // 最多5张
  phone: string  // 自动填充
}

async function submitFeedback(form: FeedbackForm) {
  const response = await api.post('/api/v1/feedback', {
    ...form,
    clientVersion: app.getVersion(),
    os: process.platform,
    osVersion: os.release()
  })

  // 显示工单号
  dialog.showMessageBox({
    type: 'info',
    message: `反馈已提交\n工单号：${response.ticketId}`
  })
}
```

---

## 📁 文件上传功能（核心！）

> 参考蓝图：第 3.1 节

### 1. 上传前智能检查

**依赖文件完整性检查：**
```typescript
interface DependencyCheckResult {
  missingFiles: string[]      // 缺失的文件
  invalidPaths: string[]       // 非法路径
  warnings: string[]           // 警告信息
}

async function checkDependencies(sceneFile: string): Promise<DependencyCheckResult> {
  // 解析 .ma 文件，提取引用的纹理、模型等
  const dependencies = parseSceneFile(sceneFile)

  const missingFiles = []
  const invalidPaths = []

  for (const dep of dependencies) {
    // 检查文件是否存在
    if (!fs.existsSync(dep.path)) {
      missingFiles.push(dep.path)
    }

    // 检查路径合法性
    if (hasChineseChars(dep.path) || hasSpecialChars(dep.path)) {
      invalidPaths.push(dep.path)
    }
  }

  return { missingFiles, invalidPaths, warnings: [] }
}
```

**用户确认流程：**
```typescript
async function uploadFile(file: string) {
  // 1. 智能检查
  const checkResult = await checkDependencies(file)

  // 2. 显示检查结果
  if (checkResult.missingFiles.length > 0 || checkResult.invalidPaths.length > 0) {
    const result = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['忽略并继续', '返回修改'],
      title: '文件检查',
      message: `发现以下问题：\n\n缺失文件：\n${checkResult.missingFiles.join('\n')}\n\n非法路径：\n${checkResult.invalidPaths.join('\n')}`
    })

    if (result === 1) {
      return  // 用户选择返回修改
    }
  }

  // 3. 开始上传
  startUpload(file)
}
```

### 2. 上传管理

**并发控制：**
```typescript
class UploadQueue {
  private maxConcurrent = 3
  private runningTasks: UploadTask[] = []
  private pendingTasks: UploadTask[] = []

  addTask(task: UploadTask) {
    if (this.runningTasks.length < this.maxConcurrent) {
      this.startTask(task)
    } else {
      this.pendingTasks.push(task)
      task.status = 'queued'
    }
  }

  private startTask(task: UploadTask) {
    this.runningTasks.push(task)
    task.status = 'uploading'
    task.start()
  }
}
```

**断点续传：**
```typescript
interface Checkpoint {
  taskId: string
  uploadId: string
  objectKey: string
  doneParts: number[]
  file: FileInfo
  timestamp: number
}

function saveCheckpoint(checkpoint: Checkpoint) {
  // 保存到本地文件
  const checkpointPath = path.join(cachePath, `checkpoint_${checkpoint.taskId}.json`)
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint))
}

function loadCheckpoint(taskId: string): Checkpoint | null {
  const checkpointPath = path.join(cachePath, `checkpoint_${taskId}.json`)

  if (!fs.existsSync(checkpointPath)) {
    return null
  }

  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'))

  // 检查是否过期（24小时）
  const now = Date.now()
  if (now - checkpoint.timestamp > 24 * 60 * 60 * 1000) {
    fs.unlinkSync(checkpointPath)
    return null
  }

  return checkpoint
}
```

### 3. 文件格式限制

```typescript
const ALLOWED_EXTENSIONS = ['.ma', '.mb', '.zip', '.rar', '.blend', '.c4d', '.max', '.fbx']

function validateFile(filePath: string): { valid: boolean; error?: string } {
  const ext = path.extname(filePath).toLowerCase()

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `不支持的文件格式：${ext}` }
  }

  const stats = fs.statSync(filePath)
  const maxSize = 20 * 1024 * 1024 * 1024  // 20GB

  if (stats.size > maxSize) {
    return { valid: false, error: `文件过大：${formatFileSize(stats.size)}，最大支持 20GB` }
  }

  return { valid: true }
}
```

---

## 🔔 通知系统

> 参考蓝图：第 6.1、第 6.2 节

### 系统通知

```typescript
import { Notification } from 'electron'

function showNotification(title: string, body: string, onclick?: () => void) {
  const notification = new Notification({
    title,
    body,
    icon: 'icon.png',
    silent: false  // 播放提示音
  })

  if (onclick) {
    notification.on('click', onclick)
  }

  notification.show()

  // 托盘图标显示红点
  tray.setImage('icon-unread.png')
}

// 渲染完成通知
showNotification(
  '渲染任务已完成',
  'MyProject_20251023 已完成渲染，共240帧',
  () => {
    // 唤起主窗口并跳转到任务详情
    mainWindow.show()
    mainWindow.webContents.send('navigate-to-task', taskId)
  }
)
```

### 免打扰时段

```typescript
function shouldShowNotification(): boolean {
  const settings = store.get('settings.notification')

  if (!settings.enabled) {
    return false
  }

  // 检查免打扰时段
  if (settings.doNotDisturb) {
    const now = new Date()
    const hour = now.getHours()

    // 22:00 - 08:00 静默（P0紧急通知除外）
    if (hour >= 22 || hour < 8) {
      return false
    }
  }

  return true
}
```

---

## 🔐 认证与会话管理

> 参考蓝图：第 2.2 节

### Token 存储

```typescript
import Store from 'electron-store'

const store = new Store({
  encryptionKey: 'your-encryption-key'  // 加密存储
})

// 保存 Token
function saveTokens(accessToken: string, refreshToken: string) {
  store.set('auth.accessToken', accessToken)
  store.set('auth.refreshToken', refreshToken)
  store.set('auth.timestamp', Date.now())
}

// 读取 Token
function getTokens() {
  return {
    accessToken: store.get('auth.accessToken'),
    refreshToken: store.get('auth.refreshToken')
  }
}
```

### 会话保持

**有效期：**
- 默认：7天
- 最长：30天（用户设置）
- 无活动仍保持登录

```typescript
function checkTokenExpiration() {
  const timestamp = store.get('auth.timestamp')
  const maxAge = store.get('settings.sessionMaxAge', 7) * 24 * 60 * 60 * 1000

  if (Date.now() - timestamp > maxAge) {
    // Token 过期，清除并跳转登录
    clearTokens()
    showLoginWindow()
  }
}

// 每次启动时检查
app.on('ready', () => {
  checkTokenExpiration()
})
```

### 单点登录

```typescript
// 检测到其他设备登录
ipcMain.on('kicked-out', () => {
  dialog.showMessageBox({
    type: 'warning',
    title: '账号已在其他设备登录',
    message: '您的账号已在其他设备登录，当前设备已被踢出。',
    buttons: ['确定']
  })

  clearTokens()
  showLoginWindow()
})
```

---

## 🧪 测试要求

### 功能测试
- 托盘功能（最小化、右键菜单、通知红点）
- 开机自启动
- 文件上传（正常、格式错误、过大、并发限制）
- 断点续传（暂停、恢复、24小时过期）
- 版本更新（普通更新、强制更新）
- 缓存管理（LRU删除、卸载保留）

### 边界测试
- 同时上传3个文件（正常）
- 同时上传4个文件（第4个排队）
- 网络中断后恢复（断点续传）
- 磁盘空间不足（提示用户）

---

## 📝 开发流程

### 1. 新功能开发
```
1. 阅读蓝图对应章节
   ↓
2. 设计 Electron 主进程/渲染进程交互
   ↓
3. 实现业务逻辑
   ↓
4. 添加错误处理
   ↓
5. 添加用户提示（Toast/Dialog）
   ↓
6. 测试（功能 + 边界）
   ↓
7. 使用 CROSS-PROJECT-CHECKLIST.md 自查
```

### 2. 打包发布
```bash
# 开发模式
npm run dev

# 打包
npm run build

# 生成安装包（Windows）
npm run dist:win
```

---

## 🔗 相关文档

**全局文档（Workspace 根目录）：**
- **目录结构约定：** `../../.workspace-config.md`
- **业务蓝图：** `../../云渲染平台业务架构设计文档_V2.0.md`
- **AI 开发指南：** `../../AI-DEVELOPMENT-GUIDE.md`
- **跨项目检查清单：** `../../CROSS-PROJECT-CHECKLIST.md`
- **提示词模板库：** `../../PROMPT-TEMPLATES.md`

---

## 💡 如何向 AI 提问？

**方式1：实现托盘功能**
```
"根据蓝图第 7.1 节，实现 Electron 托盘常驻功能。
要求：
1. 关闭窗口不退出程序
2. 托盘图标显示红点和数字角标
3. 右键菜单包含：显示主窗口、暂停所有、设置、退出
请使用 Electron 的 Tray API 实现。"
```

**方式2：实现文件上传检查**
```
"根据蓝图第 3.1.2 节，实现上传前智能检查功能。
需要：
1. 解析 .ma 文件提取依赖文件列表
2. 检查文件是否存在
3. 检查路径是否包含中文或特殊字符
4. 显示检查结果并让用户确认
请先设计方案，确认后再实现。"
```

**方式3：实现版本更新**
```
"根据蓝图第 7.3 节，实现 Electron 版本更新功能。
要求：
1. 启动时检测更新
2. 支持普通更新和强制更新
3. 下载进度显示
4. 更新后保持登录状态
请使用 electron-updater 库实现。"
```

---

**最后更新：** 2025-10-23
**项目类型：** Electron 桌面客户端
**技术栈：** Electron + Vue 3 + TypeScript
**平台：** Windows（主要）、macOS（待定）
**蓝图版本：** V2.0
