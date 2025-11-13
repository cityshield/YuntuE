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
  }) => Promise<void>
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

  // File system operations (for dependency scanning)
  pathExists: (path: string) => Promise<boolean>
  readDirectory: (path: string, recursive?: boolean) => Promise<File[]>
  pathDirname: (path: string) => Promise<string>
  pathBasename: (path: string) => Promise<string>
  readFile: (path: string) => Promise<ArrayBuffer>
  selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<{
    canceled: boolean
    filePaths: string[]
  }>

  // Maya dependency scanning (using mayapy)
  scanMayaDependencies: (sceneFilePath: string) => Promise<{
    success: boolean
    error?: string
    textures: Array<{ path: string; node: string }>
    caches: Array<{ path: string; node: string; type: string }>
    references: Array<{ path: string }>
    xgen: Array<{ path: string; node: string }>
    other: Array<{ path: string; node: string; type: string }>
  }>

  // Maya CLI (Python)
  mayaCliPackage: (payload: { scene: string; outputDir?: string; serverRoot: string; outZip?: string; logPath?: string }) => Promise<any>

  // Auto update
  checkForUpdates: () => Promise<{ success: boolean; updateInfo?: any; error?: string }>
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => void
  onUpdateStatus: (callback: (status: any) => void) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
