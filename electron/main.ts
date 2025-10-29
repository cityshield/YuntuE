import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { configStore } from './store'
import { loadServerConfig, saveServerConfig, getConfigFileLocation } from './configFile'
import type { ServerConfig } from './configFile'

// Electron 应用程序主进程

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let serverConfig: ServerConfig

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

// 应用准备就绪
app.whenReady().then(() => {
  // 加载服务端配置
  serverConfig = loadServerConfig()
  console.log('[App] Server config loaded:', serverConfig)

  createWindow()
  createTray()

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
ipcMain.on('server-config-set', (_event, newConfig: ServerConfig) => {
  try {
    saveServerConfig(newConfig)
    serverConfig = newConfig
    console.log('[IPC] Server config updated:', serverConfig)

    // 通知渲染进程配置已更新
    mainWindow?.webContents.send('server-config-updated', serverConfig)
  } catch (error) {
    console.error('[IPC] Failed to save server config:', error)
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
