/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Electron API
interface ElectronAPI {
  // Window controls
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  getAppVersion: () => Promise<string>
  openExternal: (url: string) => void

  // Tray controls
  updateTrayIcon: (status: 'normal' | 'uploading' | 'notification') => void
  updateTrayBadge: (count: number) => void

  // System notifications
  showNotification: (options: {
    title: string
    body: string
    silent?: boolean
    urgency?: 'normal' | 'critical' | 'low'
  }) => void
  checkDoNotDisturb: () => Promise<boolean>

  // Configuration management
  configGet: (key: string) => Promise<any>
  configGetAll: () => Promise<any>
  configSet: (key: string, value: any) => void
  configSetAll: (updates: any) => void
  configReset: () => void

  // Server configuration management
  serverConfigGet: () => Promise<{
    apiBaseUrl: string
    wsBaseUrl: string
    environment: string
  }>
  serverConfigGetPath: () => Promise<string>
  serverConfigSet: (config: {
    apiBaseUrl: string
    wsBaseUrl: string
    environment: string
  }) => void
  serverConfigReload: () => Promise<{
    apiBaseUrl: string
    wsBaseUrl: string
    environment: string
  }>
  onServerConfigUpdated: (
    callback: (config: {
      apiBaseUrl: string
      wsBaseUrl: string
      environment: string
    }) => void
  ) => void

  // Event listeners
  onPauseAllTasks: (callback: () => void) => void
  onOpenSettings: (callback: () => void) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
