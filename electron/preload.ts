import { contextBridge, ipcRenderer } from 'electron'
import type { OpenDialogOptions, OpenDialogReturnValue } from 'electron'

// 预加载脚本：在渲染进程中暴露安全的 API

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // 获取应用信息
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 打开外部链接
  openExternal: (url: string) => ipcRenderer.send('open-external', url),

  // 托盘控制
  updateTrayIcon: (status: 'normal' | 'uploading' | 'notification') =>
    ipcRenderer.send('update-tray-icon', status),
  updateTrayBadge: (count: number) => ipcRenderer.send('update-tray-badge', count),

  // 系统通知
  showNotification: (options: {
    title: string
    body: string
    silent?: boolean
    urgency?: 'normal' | 'critical' | 'low'
  }) => ipcRenderer.send('show-notification', options),
  checkDoNotDisturb: () => ipcRenderer.invoke('check-do-not-disturb'),

  // 配置管理
  configGet: (key: string) => ipcRenderer.invoke('config-get', key),
  configGetAll: () => ipcRenderer.invoke('config-get-all'),
  configSet: (key: string, value: any) => ipcRenderer.send('config-set', key, value),
  configSetAll: (updates: any) => ipcRenderer.send('config-set-all', updates),
  configReset: () => ipcRenderer.send('config-reset'),

  // 服务端配置管理
  serverConfigGet: () => ipcRenderer.invoke('server-config-get'),
  serverConfigGetPath: () => ipcRenderer.invoke('server-config-get-path'),
  serverConfigSet: (config: any) => ipcRenderer.invoke('server-config-set', config),
  serverConfigReload: () => ipcRenderer.invoke('server-config-reload'),
  onServerConfigUpdated: (callback: (config: any) => void) =>
    ipcRenderer.on('server-config-updated', (_event, config) => callback(config)),

  // 监听主进程消息
  onPauseAllTasks: (callback: () => void) => ipcRenderer.on('pause-all-tasks', callback),
  onOpenSettings: (callback: () => void) => ipcRenderer.on('open-settings', callback),

  // 文件系统操作（用于依赖扫描）
  pathExists: (path: string) => ipcRenderer.invoke('path-exists', path),
  readDirectory: (path: string, recursive?: boolean) =>
    ipcRenderer.invoke('read-directory', path, recursive),
  pathDirname: (path: string) => ipcRenderer.invoke('path-dirname', path),
  pathBasename: (path: string) => ipcRenderer.invoke('path-basename', path),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  writeFile: (path: string, data: ArrayBuffer) => ipcRenderer.invoke('write-file', path, data),
  calculateFileMD5: (path: string) => ipcRenderer.invoke('calculate-file-md5', path),
  selectDirectory: (options?: OpenDialogOptions) => ipcRenderer.invoke('dialog:select-directory', options),
  selectFiles: (options?: OpenDialogOptions) => ipcRenderer.invoke('dialog:select-files', options),
  selectSavePath: (defaultName: string) => ipcRenderer.invoke('dialog:select-save-path', defaultName),

  // Maya 依赖扫描（使用 mayapy）
  scanMayaDependencies: (sceneFilePath: string) =>
    ipcRenderer.invoke('scan-maya-dependencies', sceneFilePath),

  // Maya CLI（get_maya_plug4）
  mayaCliPackage: (payload: { scene: string; serverRoot: string; taskId?: string }) =>
    ipcRenderer.invoke('maya-cli:package', payload),
  // 监听 Maya 打包实时日志
  onMayaPackageLog: (callback: (data: { taskId: string; log: string; timestamp: number }) => void) =>
    ipcRenderer.on('maya-package-log', (_event, data) => callback(data)),
  offMayaPackageLog: (callback: (data: { taskId: string; log: string; timestamp: number }) => void) =>
    ipcRenderer.removeListener('maya-package-log', callback),

  // 自动更新
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback: (status: any) => void) =>
    ipcRenderer.on('update-status', (_event, status) => callback(status)),
  
  // 应用初始化完成通知
  notifyAppInitialized: () => ipcRenderer.send('app-initialized'),
})

// TypeScript 类型声明
export interface ElectronAPI {
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  getAppVersion: () => Promise<string>
  openExternal: (url: string) => void
  updateTrayIcon: (status: 'normal' | 'uploading' | 'notification') => void
  updateTrayBadge: (count: number) => void
  showNotification: (options: {
    title: string
    body: string
    silent?: boolean
    urgency?: 'normal' | 'critical' | 'low'
  }) => void
  checkDoNotDisturb: () => Promise<boolean>
  configGet: (key: string) => Promise<any>
  configGetAll: () => Promise<any>
  configSet: (key: string, value: any) => void
  configSetAll: (updates: any) => void
  configReset: () => void
  serverConfigGet: () => Promise<any>
  serverConfigGetPath: () => Promise<string>
  serverConfigSet: (config: any) => Promise<void>
  serverConfigReload: () => Promise<any>
  onServerConfigUpdated: (callback: (config: any) => void) => void
  onPauseAllTasks: (callback: () => void) => void
  onOpenSettings: (callback: () => void) => void
  pathExists: (path: string) => Promise<boolean>
  readDirectory: (path: string, recursive?: boolean) => Promise<File[]>
  pathDirname: (path: string) => Promise<string>
  pathBasename: (path: string) => Promise<string>
  readFile: (path: string) => Promise<ArrayBuffer>
  writeFile: (path: string, data: ArrayBuffer) => Promise<void>
  calculateFileMD5: (path: string) => Promise<string>
  selectDirectory: (options?: OpenDialogOptions) => Promise<OpenDialogReturnValue>
  selectFiles: (options?: OpenDialogOptions) => Promise<OpenDialogReturnValue>
  selectSavePath: (defaultName: string) => Promise<{ canceled: boolean; filePath?: string }>
  scanMayaDependencies: (sceneFilePath: string) => Promise<{
    success: boolean
    error?: string
    textures: Array<{ path: string; node: string }>
    caches: Array<{ path: string; node: string; type: string }>
    references: Array<{ path: string }>
    xgen: Array<{ path: string; node: string }>
    other: Array<{ path: string; node: string; type: string }>
  }>
  mayaCliPackage: (payload: { scene: string; outputDir?: string; serverRoot: string; outZip?: string; logPath?: string }) => Promise<any>
  checkForUpdates: () => Promise<{ success: boolean; updateInfo?: any; error?: string }>
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => void
  onUpdateStatus: (callback: (status: any) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
