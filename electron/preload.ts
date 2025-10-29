import { contextBridge, ipcRenderer } from 'electron'

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
  serverConfigSet: (config: any) => ipcRenderer.send('server-config-set', config),
  serverConfigReload: () => ipcRenderer.invoke('server-config-reload'),
  onServerConfigUpdated: (callback: (config: any) => void) =>
    ipcRenderer.on('server-config-updated', (_event, config) => callback(config)),

  // 监听主进程消息
  onPauseAllTasks: (callback: () => void) => ipcRenderer.on('pause-all-tasks', callback),
  onOpenSettings: (callback: () => void) => ipcRenderer.on('open-settings', callback),
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
  serverConfigSet: (config: any) => void
  serverConfigReload: () => Promise<any>
  onServerConfigUpdated: (callback: (config: any) => void) => void
  onPauseAllTasks: (callback: () => void) => void
  onOpenSettings: (callback: () => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
