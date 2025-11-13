import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell, dialog } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { join, dirname, basename } from 'path'
import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { spawn } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { configStore } from './store'
import { loadServerConfig, saveServerConfig, getConfigFileLocation } from './configFile'
import type { ServerConfig } from './configFile'

// Electron 应用程序主进程

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let serverConfig: ServerConfig

// 配置 autoUpdater
autoUpdater.autoDownload = false // 不自动下载，等用户确认
autoUpdater.autoInstallOnAppQuit = true // 退出时自动安装更新

/**
 * 获取托盘图标路径
 * 在开发环境和生产环境中使用不同的路径策略
 */
function getTrayIconPath(iconName: string): string {
  const iconExt = process.platform === 'win32' ? '.ico' : '@2x.png'
  const fileName = `${iconName}${iconExt}`

  // 开发环境：从项目根目录的 public/icons 加载
  if (process.env.VITE_DEV_SERVER_URL) {
    const devPath = join(__dirname, '../public/icons', fileName)
    console.log('[Tray Icon] Development mode, loading from:', devPath)
    return devPath
  }

  // 生产环境：从 extraResources 加载
  // extraResources 被打包到 resources/public/icons
  const prodPath = join(process.resourcesPath, 'public/icons', fileName)
  console.log('[Tray Icon] Production mode, loading from:', prodPath)

  // 验证文件是否存在
  if (existsSync(prodPath)) {
    console.log('[Tray Icon] Icon file exists:', prodPath)
  } else {
    console.error('[Tray Icon] Icon file NOT found:', prodPath)
    // 尝试备用路径
    const fallbackPath = join(__dirname, '../public/icons', fileName)
    console.log('[Tray Icon] Trying fallback path:', fallbackPath)
    if (existsSync(fallbackPath)) {
      console.log('[Tray Icon] Fallback icon found')
      return fallbackPath
    }
  }

  return prodPath
}

function createWindow() {
  // 从配置加载窗口尺寸
  const windowWidth = configStore.get('windowWidth')
  const windowHeight = configStore.get('windowHeight')
  const windowMaximized = configStore.get('windowMaximized')

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 1200,
    minHeight: 700,
    frame: false, // 无边框窗口，自定义标题栏
    backgroundColor: '#1E1E1E', // 暗色背景
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: process.env.VITE_DEV_SERVER_URL ? false : true, // 开发环境禁用以绕过CORS
    },
    show: false, // 初始隐藏，等待ready-to-show
  })

  // 如果上次是最大化状态，恢复最大化
  if (windowMaximized) {
    mainWindow.maximize()
  }

  // 窗口准备好后再显示，避免闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 加载应用
  if (process.env.VITE_DEV_SERVER_URL) {
    // 开发模式
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // 打开开发者工具
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  // 窗口关闭事件 - 最小化到托盘而不退出
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()

      // 首次最小化到托盘时提示用户
      if (!app.getLoginItemSettings().wasOpenedAtLogin) {
        tray?.displayBalloon({
          title: '盛世云图',
          content: '程序已最小化到系统托盘，点击托盘图标可恢复窗口',
        })
      }
    } else {
      // 真正退出时保存窗口状态
      // 必须在 close 事件中保存，因为 closed 事件触发时窗口已被销毁
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          const [width, height] = mainWindow.getSize()
          const isMaximized = mainWindow.isMaximized()

          configStore.setAll({
            windowWidth: width,
            windowHeight: height,
            windowMaximized: isMaximized,
          })
        } catch (error) {
          console.error('Failed to save window state:', error)
        }
      }
    }
  })

  mainWindow.on('closed', () => {
    // 窗口已销毁，仅清理引用
    mainWindow = null
  })

  // 添加开发者工具快捷键 (F12 和 Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F12 或 Ctrl+Shift+I (Windows/Linux) 或 Cmd+Option+I (macOS)
    const isDevToolsShortcut =
      input.key === 'F12' ||
      (input.control && input.shift && input.key === 'I') ||
      (input.meta && input.alt && input.key === 'I')

    if (isDevToolsShortcut) {
      event.preventDefault()
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow?.webContents.openDevTools()
      }
    }
  })
}

// ------- get_maya_plug CLI 集成 -------

function resolveCliCandidate(paths: string[]): { path: string; isExe: boolean } | null {
  for (const base of paths) {
    const exe = join(base, 'dist/cli.exe')
    if (existsSync(exe)) return { path: exe, isExe: true }
    const script = join(base, 'cli.py')
    if (existsSync(script)) return { path: script, isExe: false }
  }
  return null
}

function getCliScriptPath(): { path: string; isExe: boolean } {
  const dev = Boolean(process.env.VITE_DEV_SERVER_URL)
  const searchOrder = (base: string) => [
    join(base, 'get_maya_plug4'),
    join(base, 'get_maya_plug3'),
  ]

  if (dev) {
    const devBase = join(__dirname, '..')
    const candidate = resolveCliCandidate(searchOrder(devBase))
    if (candidate) return candidate
  }

  const prodBase = join(process.resourcesPath, 'python')
  const candidate = resolveCliCandidate(searchOrder(prodBase))
  if (candidate) return candidate

  throw new Error('未找到 get_maya_plug4，请检查安装包是否包含该目录')
}

async function resolvePythonInterpreter(): Promise<string | null> {
  const mayapy = findMayaPath()
  if (mayapy && existsSync(mayapy)) return mayapy
  // 回退：尝试系统 python（不强制）
  return 'python'
}

function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(async (resolve) => {
    const interpreter = await resolvePythonInterpreter()
    const { path: cliPath, isExe } = getCliScriptPath()
    const child = isExe
      ? spawn(cliPath, args, { windowsHide: true })
      : spawn(interpreter || 'python', [cliPath, ...args], {
        windowsHide: true,
        // stdio: 'pipe'
      })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout: out, stderr: err }))
  })
}

ipcMain.handle(
  'maya-cli:package',
  async (
    _e,
    payload: {
      scene: string
      outputDir?: string
      serverRoot: string
      outZip?: string
      logPath?: string
    }
  ) => {
    const sceneDir = dirname(payload.scene)
    const timestamp = Date.now()
    const finalOutputDir = payload.outputDir || sceneDir
    const finalZipPath = payload.outZip || join(finalOutputDir, `yuntu_package_${timestamp}.zip`)
    const finalLogPath = payload.logPath

    const args = ['package', '--scene', payload.scene, '--output-dir', finalOutputDir, '--server-root', payload.serverRoot, '--out-zip', finalZipPath]
    if (finalLogPath) args.push('--log-file', finalLogPath)
    const res = await runCli(args)
    try {
      return JSON.parse(res.stdout || '{}')
    } catch (e) {
      return { error: `CLI package failed: ${(e as Error).message}`, detail: res.stderr, raw: res.stdout }
    }
  }
)

// 创建系统托盘
function createTray() {
  // 获取托盘图标路径
  const iconPath = getTrayIconPath('tray-icon')
  console.log('[Tray] Creating tray with icon:', iconPath)

  const icon = nativeImage.createFromPath(iconPath)

  // 检查图标是否为空
  if (icon.isEmpty()) {
    console.error('[Tray] Failed to load icon, icon is empty')
  } else {
    console.log('[Tray] Icon loaded successfully, size:', icon.getSize())
  }

  tray = new Tray(icon)

  // 设置托盘提示文字
  tray.setToolTip('盛世云图')

  // 创建托盘菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore()
          }
          // 如果窗口是隐藏的，先显示再重新加载内容
          if (!mainWindow.isVisible()) {
            mainWindow.show()
            mainWindow.focus()
            // 重新加载页面以确保内容正常显示
            if (process.env.VITE_DEV_SERVER_URL) {
              mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
            } else {
              mainWindow.reload()
            }
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
    },
    {
      label: '暂停所有上传/下载',
      click: () => {
        mainWindow?.webContents.send('pause-all-tasks')
      },
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore()
          }
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('open-settings')
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出程序',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // 双击托盘图标显示主窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      // 如果窗口是隐藏的，先显示再重新加载内容
      if (!mainWindow.isVisible()) {
        mainWindow.show()
        mainWindow.focus()
        // 重新加载页面以确保内容正常显示
        if (process.env.VITE_DEV_SERVER_URL) {
          mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
        } else {
          mainWindow.reload()
        }
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

// ========================================
// 自动更新功能
// ========================================

/**
 * 初始化自动更新
 */
function initAutoUpdater() {
  // 开发环境不启用自动更新
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[AutoUpdater] Disabled in development mode')
    return
  }

  console.log('[AutoUpdater] Initializing...')
  console.log('[AutoUpdater] App version:', app.getVersion())

  // 监听更新事件
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...')
    mainWindow?.webContents.send('update-status', {
      type: 'checking',
      message: '正在检查更新...',
    })
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version)
    mainWindow?.webContents.send('update-status', {
      type: 'available',
      message: `发现新版本 ${info.version}`,
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Already up to date:', info.version)
    mainWindow?.webContents.send('update-status', {
      type: 'not-available',
      message: '当前已是最新版本',
      version: info.version,
    })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(
      `[AutoUpdater] Download progress: ${progressObj.percent.toFixed(2)}%`
    )
    mainWindow?.webContents.send('update-status', {
      type: 'progress',
      message: '正在下载更新...',
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version)
    mainWindow?.webContents.send('update-status', {
      type: 'downloaded',
      message: '更新已下载完成',
      version: info.version,
    })
  })

  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater] Error:', error)
    mainWindow?.webContents.send('update-status', {
      type: 'error',
      message: `更新失败: ${error.message}`,
      error: error.message,
    })
  })

  // 启动时检查更新
  setTimeout(() => {
    checkForUpdates()
  }, 3000) // 延迟3秒，等待应用完全启动

  // 定期检查更新（每30分钟）
  setInterval(() => {
    checkForUpdates()
  }, 30 * 60 * 1000)
}

/**
 * 检查更新
 */
function checkForUpdates() {
  if (process.env.VITE_DEV_SERVER_URL) {
    return
  }

  console.log('[AutoUpdater] Starting update check...')
  autoUpdater.checkForUpdates().catch((error) => {
    console.error('[AutoUpdater] Check failed:', error)
  })
}

// IPC 通信：手动检查更新
ipcMain.handle('check-for-updates', async () => {
  console.log('[IPC] Manual update check requested')
  try {
    const result = await autoUpdater.checkForUpdates()
    return {
      success: true,
      updateInfo: result?.updateInfo,
    }
  } catch (error: any) {
    console.error('[IPC] Manual check failed:', error)
    return {
      success: false,
      error: error.message,
    }
  }
})

// IPC 通信：开始下载更新
ipcMain.handle('download-update', async () => {
  console.log('[IPC] Download update requested')
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (error: any) {
    console.error('[IPC] Download failed:', error)
    return {
      success: false,
      error: error.message,
    }
  }
})

// IPC 通信：安装更新并重启
ipcMain.handle('install-update', () => {
  console.log('[IPC] Install update requested')
  isQuitting = true
  autoUpdater.quitAndInstall(false, true)
})

// 应用准备就绪
app.whenReady().then(() => {
  // 加载服务端配置
  serverConfig = loadServerConfig()
  console.log('[App] Server config loaded:', serverConfig)

  createWindow()
  createTray()

  // 初始化自动更新
  initAutoUpdater()

  app.on('activate', () => {
    // macOS: 点击 Dock 图标时重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时不退出应用（保持托盘常驻）
app.on('window-all-closed', () => {
  // 不退出应用，保持托盘常驻
  // 用户必须通过托盘菜单的"退出程序"才能真正退出
})

// 应用退出前清理
app.on('before-quit', () => {
  isQuitting = true
})

// IPC 通信：窗口控制
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('window-close', () => {
  mainWindow?.close()
})

// IPC 通信：获取应用版本
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// IPC 通信：更新托盘图标状态
ipcMain.on('update-tray-icon', (_event, status: 'normal' | 'uploading' | 'notification') => {
  if (!tray) return

  // 根据状态确定图标名称和提示
  let iconBaseName = 'tray-icon'
  let tooltip = '盛世云图'

  switch (status) {
    case 'uploading':
      iconBaseName = 'tray-icon-uploading'
      tooltip = '盛世云图 - 上传中...'
      break
    case 'notification':
      iconBaseName = 'tray-icon-notification'
      tooltip = '盛世云图 - 有新通知'
      break
    default:
      iconBaseName = 'tray-icon'
      tooltip = '盛世云图'
  }

  // 获取图标路径
  const iconPath = getTrayIconPath(iconBaseName)
  console.log('[Tray] Updating icon to:', status, 'path:', iconPath)

  const icon = nativeImage.createFromPath(iconPath)

  // 检查图标是否为空
  if (icon.isEmpty()) {
    console.error('[Tray] Failed to load icon for status:', status)
  } else {
    console.log('[Tray] Icon updated successfully, size:', icon.getSize())
  }

  tray.setImage(icon)

  // 更新提示文字
  tray.setToolTip(tooltip)
})

// IPC 通信：更新托盘未读数
ipcMain.on('update-tray-badge', (_event, count: number) => {
  if (!tray) return

  // Windows: 更新托盘提示文字
  if (count > 0) {
    tray.setToolTip(`盛世云图 - ${count} 个未完成任务`)
  } else {
    tray.setToolTip('盛世云图')
  }

  // macOS: 更新 Dock 角标
  if (process.platform === 'darwin') {
    app.dock.setBadge(count > 0 ? count.toString() : '')
  }
})

// IPC 通信：显示系统通知
ipcMain.on(
  'show-notification',
  (
    _event,
    options: {
      title: string
      body: string
      silent?: boolean
      urgency?: 'normal' | 'critical' | 'low'
    }
  ) => {
    // 检查是否支持通知
    if (!Notification.isSupported()) {
      console.warn('System notifications are not supported')
      return
    }

    const notification = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent ?? false,
      urgency: options.urgency ?? 'normal',
      timeoutType: 'default',
    })

    // 点击通知时显示主窗口
    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })

    notification.show()
  }
)

// IPC 通信：检查免打扰时段
ipcMain.handle('check-do-not-disturb', () => {
  if (!configStore.get('doNotDisturbEnabled')) {
    return false
  }

  const now = new Date()
  const hour = now.getHours()
  const startHour = configStore.get('doNotDisturbStart')
  const endHour = configStore.get('doNotDisturbEnd')

  // 判断当前是否在免打扰时段
  if (startHour < endHour) {
    // 例如 8:00 - 22:00
    return hour >= startHour && hour < endHour
  } else {
    // 例如 22:00 - 08:00 (跨天)
    return hour >= startHour || hour < endHour
  }
})

// IPC 通信：获取配置
ipcMain.handle('config-get', (_event, key: string) => {
  return configStore.get(key as any)
})

ipcMain.handle('config-get-all', () => {
  return configStore.getAll()
})

ipcMain.handle('dialog:select-directory', async (_event, options: OpenDialogOptions = {}) => {
  const properties = new Set(options.properties ?? [])
  properties.add('openDirectory')
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    ...options,
    properties: Array.from(properties),
  })
  return result
})

// IPC 通信：设置配置
ipcMain.on('config-set', (_event, key: string, value: any) => {
  configStore.set(key as any, value)

  // 特殊处理：开机自启动
  if (key === 'autoLaunch') {
    app.setLoginItemSettings({
      openAtLogin: value,
      openAsHidden: true,
    })
  }
})

ipcMain.on('config-set-all', (_event, updates: any) => {
  configStore.setAll(updates)

  // 特殊处理：开机自启动
  if ('autoLaunch' in updates) {
    app.setLoginItemSettings({
      openAtLogin: updates.autoLaunch,
      openAsHidden: true,
    })
  }
})

// IPC 通信：重置配置
ipcMain.on('config-reset', () => {
  configStore.reset()
})

// IPC 通信：获取服务端配置
ipcMain.handle('server-config-get', () => {
  return serverConfig
})

// IPC 通信：获取配置文件路径
ipcMain.handle('server-config-get-path', () => {
  return getConfigFileLocation()
})

// IPC 通信：保存服务端配置
ipcMain.handle('server-config-set', async (_event, newConfig: ServerConfig) => {
  try {
    saveServerConfig(newConfig)
    serverConfig = newConfig
    console.log('[IPC] Server config updated:', serverConfig)

    // 通知渲染进程配置已更新
    mainWindow?.webContents.send('server-config-updated', serverConfig)
  } catch (error) {
    console.error('[IPC] Failed to save server config:', error)
    throw error
  }
})

// IPC 通信：重新加载服务端配置
ipcMain.handle('server-config-reload', () => {
  try {
    serverConfig = loadServerConfig()
    console.log('[IPC] Server config reloaded:', serverConfig)
    return serverConfig
  } catch (error) {
    console.error('[IPC] Failed to reload server config:', error)
    throw error
  }
})

// IPC 通信：打开外部链接
ipcMain.on('open-external', (_event, url: string) => {
  console.log('[IPC] Opening external URL:', url)
  shell.openExternal(url)
})

// ========================================
// 文件系统操作（用于依赖扫描）
// ========================================

// IPC 通信：检查路径是否存在
ipcMain.handle('path-exists', (_event, path: string) => {
  try {
    return existsSync(path)
  } catch (error) {
    console.error('[IPC] path-exists error:', error)
    return false
  }
})

// IPC 通信：读取目录内容
ipcMain.handle('read-directory', async (_event, dirPath: string, recursive = false) => {
  try {
    const files: any[] = []

    const readDir = (currentPath: string, basePath: string) => {
      const entries = readdirSync(currentPath)

      for (const entry of entries) {
        const fullPath = join(currentPath, entry)
        const stat = statSync(fullPath)

        if (stat.isFile()) {
          // 计算相对路径
          const relativePath = fullPath.substring(basePath.length + 1)

          files.push({
            name: entry,
            path: fullPath,
            relativePath,
            size: stat.size,
            type: '', // 浏览器环境会自动推断
            lastModified: stat.mtimeMs,
          })
        } else if (stat.isDirectory() && recursive) {
          // 递归读取子目录
          readDir(fullPath, basePath)
        }
      }
    }

    readDir(dirPath, dirPath)

    return files
  } catch (error) {
    console.error('[IPC] read-directory error:', error)
    return []
  }
})

// IPC 通信：获取目录名
ipcMain.handle('path-dirname', (_event, path: string) => {
  try {
    return dirname(path)
  } catch (error) {
    console.error('[IPC] path-dirname error:', error)
    return ''
  }
})

// IPC 通信：获取文件名
ipcMain.handle('path-basename', (_event, path: string) => {
  try {
    return basename(path)
  } catch (error) {
    console.error('[IPC] path-basename error:', error)
    return ''
  }
})

// IPC 通信：读取文件内容（返回ArrayBuffer）
ipcMain.handle('read-file', (_event, path: string) => {
  try {
    const buffer = readFileSync(path)
    // 将 Node Buffer 转换为 ArrayBuffer
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  } catch (error) {
    console.error('[IPC] read-file error:', error)
    throw error
  }
})

// ========================================
// Maya 依赖文件扫描
// ========================================

/**
 * 检测系统中安装的 Maya 路径
 * 支持 Windows 和 macOS
 */
function findMayaPath(): string | null {
  const mayaVersions = ['2024', '2023', '2022', '2021', '2020']

  if (process.platform === 'win32') {
    // Windows 路径
    const possiblePaths: string[] = []

    for (const version of mayaVersions) {
      possiblePaths.push(`C:/Program Files/Autodesk/Maya${version}/bin/mayapy.exe`)
      possiblePaths.push(`C:/Program Files (x86)/Autodesk/Maya${version}/bin/mayapy.exe`)
    }

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        console.log('[Maya] Found mayapy at:', path)
        return path
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS 路径
    const possiblePaths: string[] = []

    for (const version of mayaVersions) {
      possiblePaths.push(`/Applications/Autodesk/maya${version}/Maya.app/Contents/bin/mayapy`)
    }

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        console.log('[Maya] Found mayapy at:', path)
        return path
      }
    }
  }

  console.warn('[Maya] mayapy not found on this system')
  return null
}

/**
 * 使用 mayapy 扫描 Maya 场景文件的依赖
 */
ipcMain.handle('scan-maya-dependencies', async (_event, sceneFilePath: string) => {
  console.log('[Maya] Scanning dependencies for:', sceneFilePath)

  // 检测 Maya 安装
  const mayapyPath = findMayaPath()

  if (!mayapyPath) {
    return {
      success: false,
      error: 'Maya not found. Please install Maya 2020-2024 or specify Maya path in settings.',
      textures: [],
      caches: [],
      references: [],
      xgen: [],
      other: []
    }
  }

  // Python 脚本路径
  const scriptPath = process.env.VITE_DEV_SERVER_URL
    ? join(__dirname, 'scripts/maya_dependency_scanner.py')
    : join(process.resourcesPath, 'scripts/maya_dependency_scanner.py')

  console.log('[Maya] Using mayapy:', mayapyPath)
  console.log('[Maya] Using script:', scriptPath)

  if (!existsSync(scriptPath)) {
    console.error('[Maya] Script not found:', scriptPath)
    // 尝试备用路径
    const fallbackScript = join(__dirname, 'scripts/maya_dependency_scanner.py')
    if (existsSync(fallbackScript)) {
      console.log('[Maya] Using fallback script:', fallbackScript)
    } else {
      return {
        success: false,
        error: 'Maya scanner script not found',
        textures: [],
        caches: [],
        references: [],
        xgen: [],
        other: []
      }
    }
  }

  return new Promise((resolve) => {
    const mayapy = spawn(mayapyPath, [scriptPath, sceneFilePath])

    let output = ''
    let errorOutput = ''

    // 收集标准输出
    mayapy.stdout.on('data', (data) => {
      output += data.toString()
    })

    // 收集错误输出
    mayapy.stderr.on('data', (data) => {
      errorOutput += data.toString()
      console.error('[Maya] stderr:', data.toString())
    })

    // 进程结束
    mayapy.on('close', (code) => {
      console.log('[Maya] mayapy exited with code:', code)

      if (code === 0) {
        try {
          // 解析 JSON 输出
          const dependencies = JSON.parse(output)
          console.log('[Maya] Successfully parsed dependencies:', {
            textures: dependencies.textures?.length || 0,
            caches: dependencies.caches?.length || 0,
            references: dependencies.references?.length || 0,
            xgen: dependencies.xgen?.length || 0,
            other: dependencies.other?.length || 0
          })
          resolve(dependencies)
        } catch (error) {
          console.error('[Maya] Failed to parse JSON output:', error)
          console.error('[Maya] Raw output:', output)
          resolve({
            success: false,
            error: 'Failed to parse Maya output: ' + (error as Error).message,
            textures: [],
            caches: [],
            references: [],
            xgen: [],
            other: []
          })
        }
      } else {
        // 执行失败
        console.error('[Maya] mayapy execution failed')
        console.error('[Maya] Error output:', errorOutput)

        // 尝试解析输出中的 JSON 错误信息
        try {
          const errorResult = JSON.parse(output || errorOutput)
          resolve(errorResult)
        } catch {
          resolve({
            success: false,
            error: `mayapy exited with code ${code}: ${errorOutput || 'Unknown error'}`,
            textures: [],
            caches: [],
            references: [],
            xgen: [],
            other: []
          })
        }
      }
    })

    // 超时处理（30秒）
    setTimeout(() => {
      mayapy.kill()
      resolve({
        success: false,
        error: 'Maya dependency scan timed out (30s)',
        textures: [],
        caches: [],
        references: [],
        xgen: [],
        other: []
      })
    }, 30000)
  })
})
