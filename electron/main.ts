import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell, dialog } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { join, dirname, basename } from 'path'
import { existsSync, readdirSync, statSync, readFileSync, mkdtempSync } from 'fs'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { configStore } from './store'
import { loadServerConfig, saveServerConfig, getConfigFileLocation } from './configFile'
import type { ServerConfig } from './configFile'
import { logger } from './logger'

// 设置控制台输出编码为 UTF-8（修复 Windows 控制台中文乱码）
if (process.platform === 'win32') {
  try {
    // 设置 Windows 控制台代码页为 UTF-8
    const { execSync } = require('child_process')
    // 同步执行，确保编码设置生效
    execSync('chcp 65001 >nul 2>&1', { stdio: 'ignore' })
    
    // 设置环境变量确保编码正确
    if (!process.env.PYTHONIOENCODING) {
      process.env.PYTHONIOENCODING = 'utf-8'
    }
  } catch (error) {
    // 忽略错误，不影响程序运行
    // 如果设置失败，日志仍会保存到文件中（UTF-8 编码）
  }
}

// Electron 应用程序主进程

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let serverConfig: ServerConfig
let autoUpdater: any = null // 延迟导入的 autoUpdater 实例

/**
 * 记录当前运行环境，避免 Vite/esbuild 在构建时错误地摇掉函数定义
 * 同时方便后续逻辑按需要重复使用
 */
const runtimeEnv = (() => {
  const hasViteDevServer = !!process.env.VITE_DEV_SERVER_URL
  const nodeEnv = process.env.NODE_ENV || ''
  const hasElectronReload = !!process.env.ELECTRON_RELOAD
  const isPackaged = app.isPackaged

  console.log('[Environment] 环境检测:')
  console.log('[Environment]   - VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL || '(未设置)')
  console.log('[Environment]   - NODE_ENV:', nodeEnv || '(未设置)')
  console.log('[Environment]   - ELECTRON_RELOAD:', process.env.ELECTRON_RELOAD || '(未设置)')
  console.log('[Environment]   - __dirname:', __dirname)
  console.log('[Environment]   - app.isPackaged:', isPackaged)

  return {
    hasViteDevServer,
    nodeEnv,
    hasElectronReload,
    isPackaged,
    isDevelopment: hasViteDevServer || nodeEnv === 'development' || !isPackaged,
  }
})()

// 配置将在 app.ready 后加载
// autoUpdater 也将在 app.ready 后延迟导入和配置

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
    logger.info(`[Tray Icon] Development mode, loading from: ${devPath}`)
    return devPath
  }

  // 生产环境：从 extraResources 加载
  // extraResources 被打包到 resources/public/icons
  const prodPath = join(process.resourcesPath, 'public/icons', fileName)
  logger.info(`[Tray Icon] Production mode, loading from: ${prodPath}`)

  // 验证文件是否存在
  if (existsSync(prodPath)) {
    logger.info(`[Tray Icon] Icon file exists: ${prodPath}`)
  } else {
    logger.error(`[Tray Icon] Icon file NOT found: ${prodPath}`)
    // 尝试备用路径
    const fallbackPath = join(__dirname, '../public/icons', fileName)
    logger.info(`[Tray Icon] Trying fallback path: ${fallbackPath}`)
    if (existsSync(fallbackPath)) {
      logger.info('[Tray Icon] Fallback icon found')
      return fallbackPath
    }
  }

  return prodPath
}

function createWindow() {
  // 如果窗口已存在，先销毁它
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.info('[Window] 窗口已存在，先销毁旧窗口')
    mainWindow.destroy()
    mainWindow = null
  }

  // 从配置加载窗口尺寸
  const windowWidth = configStore.get('windowWidth')
  const windowHeight = configStore.get('windowHeight')
  const windowMaximized = configStore.get('windowMaximized')

  logger.info('[Window] 创建新窗口')
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 1200,
    minHeight: 700,
    frame: false, // 无边框窗口，自定义标题栏
    backgroundColor: '#1E1E1E', // 暗色背景
    show: false, // 初始隐藏，等待 ready-to-show
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: process.env.VITE_DEV_SERVER_URL ? false : true, // 开发环境禁用以绕过CORS
    },
  })

  // 加载应用
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  const isDevEnv = runtimeEnv.isDevelopment
  
  logger.info('[Window] 准备加载应用')
  logger.info(`[Window]   - 是否开发环境: ${isDevEnv}`)
  logger.info(`[Window]   - 开发服务器 URL: ${devServerUrl || '(未设置)'}`)
  logger.info(`[Window]   - app.isPackaged: ${app.isPackaged}`)
  
  if (devServerUrl && !app.isPackaged) {
    // 开发模式：从开发服务器加载
    logger.info(`[Window] >>> 开发模式：加载开发服务器: ${devServerUrl}`)
    mainWindow.loadURL(devServerUrl).catch(err => {
      logger.error(`[Window] 加载开发服务器失败: ${err}`)
    })
  } else if (!app.isPackaged && !devServerUrl) {
    // 开发模式但没有开发服务器 URL，尝试使用默认地址
    const defaultDevUrl = 'http://localhost:5173'
    logger.info(`[Window] >>> 开发模式：使用默认开发服务器: ${defaultDevUrl}`)
    mainWindow.loadURL(defaultDevUrl).catch(err => {
      logger.error(`[Window] 加载默认开发服务器失败: ${err}`)
      // 降级到生产模式
      const indexPath = join(__dirname, '../dist/index.html')
      logger.info(`[Window] 降级到生产模式文件: ${indexPath}`)
      mainWindow.loadFile(indexPath)
    })
  } else {
    // 生产模式：从文件加载
    const indexPath = join(__dirname, '../dist/index.html')
    logger.info(`[Window] >>> 生产模式：加载文件: ${indexPath}`)
    logger.info(`[Window]   - 文件是否存在: ${existsSync(indexPath)}`)
    mainWindow.loadFile(indexPath).catch(err => {
      logger.error(`[Window] 加载生产模式文件失败: ${err}`)
    })
  }

  // 页面加载完成后延迟显示窗口，确保 Vue 应用完全渲染
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Window] 页面加载完成 (did-finish-load)，等待 Vue 应用渲染...')
      
      // 延迟显示，确保 Vue 应用和路由完全渲染
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('[Window] 延迟结束，检查 DOM 内容...')
          
          // 检查 DOM 是否已经渲染了内容
          mainWindow.webContents.executeJavaScript(`
            (function() {
              const app = document.getElementById('app');
              if (!app) return { hasApp: false, hasContent: false };
              
              const hasContent = app.children.length > 0;
              const hasLogin = !!app.querySelector('.login-container');
              const hasMain = !!app.querySelector('.main-container');
              
              return {
                hasApp: true,
                hasContent,
                hasLogin,
                hasMain,
                childCount: app.children.length,
                innerHTML: hasContent ? app.innerHTML.substring(0, 100) : ''
              };
            })()
          `).then((result: any) => {
            console.log('[Window] DOM 检查结果:', result)
            
            if (result.hasApp && result.hasContent) {
              console.log('[Window] DOM 内容已渲染，显示窗口')
              
              // 如果上次是最大化状态，恢复最大化
              if (windowMaximized) {
                console.log('[Window] 恢复最大化状态')
                mainWindow.maximize()
              }
              
              // 显示窗口
              mainWindow.show()
              mainWindow.focus()
              console.log('[Window] 窗口已显示')
            } else {
              console.log('[Window] DOM 内容未完全渲染，再等待 300ms')
              // 如果 DOM 还没渲染，再等待一会儿
              setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                  console.log('[Window] 超时后强制显示窗口')
                  if (windowMaximized) {
                    mainWindow.maximize()
                  }
                  mainWindow.show()
                  mainWindow.focus()
                }
              }, 300)
            }
          }).catch((error) => {
            console.error('[Window] DOM 检查失败:', error)
            // 检查失败，直接显示
            if (mainWindow && !mainWindow.isDestroyed()) {
              if (windowMaximized) {
                mainWindow.maximize()
              }
              mainWindow.show()
              mainWindow.focus()
            }
          })
        }
      }, 500) // 延迟 500ms 等待 Vue 渲染
    }
  })

  // 窗口关闭事件 - 直接退出程序（不再最小化到托盘）
  mainWindow.on('close', (event) => {
    logger.info('[Window] 窗口关闭事件触发')
    
    // 保存窗口状态
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const [width, height] = mainWindow.getSize()
        const isMaximized = mainWindow.isMaximized()
        configStore.setAll({
          windowWidth: width,
          windowHeight: height,
          windowMaximized: isMaximized,
        })
        logger.info('[Window] 窗口状态已保存')
      } catch (error) {
        logger.error(`[Window] 保存窗口状态失败: ${error}`)
      }
    }
    
    // 标记正在退出
    isQuitting = true
    logger.info('[Window] 标记正在退出，强制退出应用')
    
    // 强制退出应用，确保所有进程都关闭
    app.quit()
    
    // 如果 app.quit() 没有立即生效，使用 process.exit() 强制退出
    setTimeout(() => {
      logger.info('[Window] 强制终止进程')
      process.exit(0)
    }, 100)
  })

  mainWindow.on('closed', () => {
    // 窗口已销毁，仅清理引用
    logger.info('[Window] 窗口已销毁')
    mainWindow = null
    
    // 确保应用退出
    if (!isQuitting) {
      logger.info('[Window] 窗口销毁后确保应用退出')
      isQuitting = true
      app.quit()
      
      // 强制退出进程
      setTimeout(() => {
        logger.info('[Window] 强制终止进程')
        process.exit(0)
      }, 100)
    }
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

// ------- get_maya_plug Python 集成 -------

/**
 * 查找 conda 环境中的 Python
 */
function findCondaPython(): string | null {
  // 1. 优先检查 CONDA_PREFIX（当前激活的 conda 环境）
  if (process.env.CONDA_PREFIX) {
    const condaPrefix = process.env.CONDA_PREFIX
    const pythonPath = join(condaPrefix, process.platform === 'win32' ? 'python.exe' : 'python')
    if (existsSync(pythonPath)) {
      console.log('[Python] Found Python from CONDA_PREFIX:', pythonPath)
      return pythonPath
    }
  }

  // 2. 检查环境变量中的 Python 路径
  if (process.env.PYTHON) {
    const pythonPath = process.env.PYTHON
    if (existsSync(pythonPath)) {
      console.log('[Python] Found Python from PYTHON env:', pythonPath)
      return pythonPath
    }
  }

  // 3. 检查 PATH 中的 python（可能是 conda 环境的）
  if (process.env.PATH) {
    const pathDirs = process.env.PATH.split(process.platform === 'win32' ? ';' : ':')
    for (const dir of pathDirs) {
      if ((dir.includes('conda') || dir.includes('anaconda')) && !dir.includes('Scripts')) {
        const pythonPath = join(dir, process.platform === 'win32' ? 'python.exe' : 'python')
        if (existsSync(pythonPath)) {
          console.log('[Python] Found Python in conda PATH:', pythonPath)
          return pythonPath
        }
      }
    }
  }

  // 4. 检查常见的 conda 环境路径
  const condaBasePaths: string[] = []
  
  // 从 CONDA_PREFIX 推断 conda base
  if (process.env.CONDA_PREFIX) {
    const condaPrefix = process.env.CONDA_PREFIX
    // 如果是环境路径（包含 envs），提取 base 路径
    if (condaPrefix.includes('envs')) {
      const basePath = join(condaPrefix, '..', '..')
      condaBasePaths.push(basePath)
    } else {
      condaBasePaths.push(condaPrefix)
    }
  }

  // 添加常见的 conda 安装路径
  const homeDir = process.env.USERPROFILE || process.env.HOME || ''
  if (homeDir) {
    condaBasePaths.push(join(homeDir, 'anaconda3'))
    condaBasePaths.push(join(homeDir, 'miniconda3'))
  }
  condaBasePaths.push('C:\\anaconda3', 'C:\\miniconda3', 'D:\\anaconda3', 'D:\\miniconda3')

  // 检查 conda base 下的 envs 目录
  for (const basePath of condaBasePaths) {
    if (!basePath) continue
    const envsDir = join(basePath, 'envs')
    if (existsSync(envsDir)) {
      try {
        const envs = readdirSync(envsDir)
        for (const env of envs) {
          const envPath = join(envsDir, env)
          const pythonPath = join(envPath, process.platform === 'win32' ? 'python.exe' : 'python')
          if (existsSync(pythonPath)) {
            console.log('[Python] Found Python in conda env:', pythonPath)
            return pythonPath
          }
        }
      } catch (e) {
        // 忽略读取错误
      }
    }
    
    // 也检查 base 路径本身
    const pythonPath = join(basePath, process.platform === 'win32' ? 'python.exe' : 'python')
    if (existsSync(pythonPath)) {
      console.log('[Python] Found Python in conda base:', pythonPath)
      return pythonPath
    }
  }

  return null
}

async function resolvePythonInterpreter(): Promise<string | null> {
  // 优先使用 conda 环境中的 Python（因为依赖包安装在 conda 环境中）
  const condaPython = findCondaPython()
  if (condaPython) {
    console.log('[Python] Using conda Python:', condaPython)
    return condaPython
  }

  // 回退：尝试 mayapy（Maya 自带的 Python）
  const mayapy = findMayaPath()
  if (mayapy && existsSync(mayapy)) {
    console.log('[Python] Using mayapy:', mayapy)
    return mayapy
  }

  // 最后回退：使用系统 python
  console.log('[Python] Using system python')
  return 'python'
}

// 存储当前打包任务的日志回调
const packageLogCallbacks = new Map<string, (log: string) => void>()

/**
 * 设置所有 IPC 处理器
 * 必须在 app.ready 之后调用，因为需要访问 electron 模块
 */
function setupIpcHandlers() {

ipcMain.handle(
  'maya-cli:package',
  async (
    event,
    payload: {
      scene: string
      outputDir?: string
      serverRoot: string
      outZip?: string
      logPath?: string
      taskId?: string // 用于标识任务，用于实时日志推送
    }
  ) => {
    try {
      // 创建临时工作目录
      const timestamp = Date.now()
      const tempWorkDir = mkdtempSync(join(tmpdir(), `yuntu_maya_package_${timestamp}_`))
      
      // 创建日志回调函数，实时发送日志到前端（必须在所有使用之前定义）
      const taskId = payload.taskId || `task_${timestamp}`
      const onLog = (log: string) => {
        // 通过 IPC 发送实时日志
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('maya-package-log', {
            taskId,
            log,
            timestamp: Date.now()
          })
        }
      }
      
      // 优先使用打包后的可执行文件（不依赖外部 Python 环境）
      const packagedExe = process.env.VITE_DEV_SERVER_URL
        ? join(__dirname, 'scripts', 'dist', 'maya_package_wrapper.exe')
        : join(process.resourcesPath, 'scripts', 'dist', 'maya_package_wrapper.exe')
      
      // 如果存在打包后的可执行文件，直接使用（不依赖外部 Python）
      if (existsSync(packagedExe)) {
        console.log('[Maya Package] 使用打包后的可执行文件（不依赖外部 Python）')
        console.log('[Maya Package] Executable path:', packagedExe)
        return await runPackagedExecutable(packagedExe, payload, tempWorkDir, onLog)
      }
      
      // 回退：使用 Python 脚本（需要外部 Python 环境）
      console.log('[Maya Package] 未找到打包后的可执行文件，使用 Python 脚本')
      const interpreter = await resolvePythonInterpreter() || 'python'
      
      // 根据环境选择脚本路径（与 maya_dependency_scanner.py 的处理方式一致）
      const wrapperScript = process.env.VITE_DEV_SERVER_URL
        ? join(__dirname, 'scripts', 'maya_package_wrapper.py')
        : join(process.resourcesPath, 'scripts', 'maya_package_wrapper.py')
      
      console.log('[Maya Package] Environment:', process.env.VITE_DEV_SERVER_URL ? 'development' : 'production')
      console.log('[Maya Package] Wrapper script path:', wrapperScript)
      console.log('[Maya Package] __dirname:', __dirname)
      console.log('[Maya Package] process.resourcesPath:', process.resourcesPath)
      
      // 检查脚本是否存在，如果不存在则尝试备用路径
      if (!existsSync(wrapperScript)) {
        console.warn('[Maya Package] Script not found at primary path:', wrapperScript)
        
        // 开发环境：尝试从项目根目录查找
        const devWrapperScript = join(process.cwd(), 'electron', 'scripts', 'maya_package_wrapper.py')
        if (existsSync(devWrapperScript)) {
          console.log('[Maya Package] Using dev script:', devWrapperScript)
          return await runPythonWrapper(interpreter, devWrapperScript, payload, tempWorkDir, onLog)
        }
        
        // 生产环境：尝试从 __dirname 查找（备用路径）
        const fallbackScript = join(__dirname, 'scripts', 'maya_package_wrapper.py')
        if (existsSync(fallbackScript)) {
          console.log('[Maya Package] Using fallback script:', fallbackScript)
          return await runPythonWrapper(interpreter, fallbackScript, payload, tempWorkDir, onLog)
        }
        
        return { error: `包装脚本不存在。尝试的路径：\n  主路径: ${wrapperScript}\n  开发路径: ${devWrapperScript}\n  备用路径: ${fallbackScript}` }
      }
      
      return await runPythonWrapper(interpreter, wrapperScript, payload, tempWorkDir, onLog)
    } catch (error: any) {
      console.error('[Maya Package] Error:', error)
      return { error: error.message || '打包失败' }
    }
  }
)

/**
 * 运行打包后的可执行文件（不依赖外部 Python）
 */
async function runPackagedExecutable(
  exePath: string,
  payload: {
    scene: string
    outputDir?: string
    serverRoot: string
    outZip?: string
    logPath?: string
  },
  tempWorkDir: string,
  onLog?: (log: string) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    // 构造输入 JSON
    const inputData = {
      scene: payload.scene,
      serverRoot: payload.serverRoot || '',
      tempWorkDir: tempWorkDir
    }
    
    const inputJson = JSON.stringify(inputData, null, 0)
    
    // 启动可执行文件
    const exeProcess = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: dirname(exePath),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1'
      }
    })
    
    let stdout = ''
    let stderr = ''
    
    // 发送输入（确保使用 UTF-8 编码）
    exeProcess.stdin.write(inputJson, 'utf-8')
    exeProcess.stdin.end()
    
    // 收集输出（明确指定 UTF-8 编码）
    exeProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8')
    })
    
    // 实时处理 stderr（日志输出，明确指定 UTF-8 编码）
    exeProcess.stderr.on('data', (data: Buffer) => {
      const logChunk = data.toString('utf-8')
      stderr += logChunk
      
      // 实时发送日志到前端
      if (onLog) {
        const lines = logChunk.split('\n').filter(line => line.trim())
        for (const line of lines) {
          onLog(line.trim())
        }
      }
    })
    
    // 处理完成
    exeProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('[Maya Package] Executable exited with code:', code)
        console.error('[Maya Package] stderr:', stderr)
        try {
          const errorResult = JSON.parse(stdout)
          resolve(errorResult)
        } catch {
          resolve({ error: stderr || `可执行文件退出，代码: ${code}` })
        }
        return
      }
      
      try {
        const cleanStdout = stdout.trim()
        let jsonStart = cleanStdout.indexOf('{')
        let jsonEnd = cleanStdout.lastIndexOf('}') + 1
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const jsonStr = cleanStdout.substring(jsonStart, jsonEnd)
          const result = JSON.parse(jsonStr)
          resolve(result)
        } else {
          throw new Error('未找到有效的 JSON 输出')
        }
      } catch (e) {
        console.error('[Maya Package] Failed to parse JSON:', stdout)
        resolve({ error: `解析输出失败: ${e instanceof Error ? e.message : String(e)}` })
      }
    })
    
    exeProcess.on('error', (error) => {
      console.error('[Maya Package] Executable error:', error)
      resolve({ error: `执行失败: ${error.message}` })
    })
  })
}

/**
 * 运行 Python 包装脚本
 */
async function runPythonWrapper(
  interpreter: string,
  wrapperScript: string,
  payload: {
    scene: string
    outputDir?: string
    serverRoot: string
    outZip?: string
    logPath?: string
  },
  tempWorkDir: string,
  onLog?: (log: string) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    // 构造输入 JSON
    const inputData = {
      scene: payload.scene,
      serverRoot: payload.serverRoot || '',
      tempWorkDir: tempWorkDir
    }
    
    const inputJson = JSON.stringify(inputData, null, 0)
    
    // 启动 Python 进程
    const pythonProcess = spawn(interpreter, [wrapperScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: dirname(wrapperScript),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8', // 确保 Python 输出使用 UTF-8 编码
        PYTHONUNBUFFERED: '1' // 禁用 Python 输出缓冲
      }
    })
    
    let stdout = ''
    let stderr = ''
    
    // 发送输入（确保使用 UTF-8 编码）
    pythonProcess.stdin.write(inputJson, 'utf-8')
    pythonProcess.stdin.end()
    
    // 收集输出（明确指定 UTF-8 编码）
    pythonProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8')
    })
    
    // 实时处理 stderr（日志输出，明确指定 UTF-8 编码）
    pythonProcess.stderr.on('data', (data: Buffer) => {
      const logChunk = data.toString('utf-8')
      stderr += logChunk
      
      // 实时发送日志到前端
      if (onLog) {
        // 按行分割并发送每一行
        const lines = logChunk.split('\n').filter(line => line.trim())
        for (const line of lines) {
          onLog(line.trim())
        }
      }
    })
    
    // 处理完成
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('[Maya Package] Python process exited with code:', code)
        console.error('[Maya Package] stderr:', stderr)
        try {
          // 尝试解析错误 JSON
          const errorResult = JSON.parse(stdout)
          resolve(errorResult)
        } catch {
          resolve({ error: stderr || `Python 进程退出，代码: ${code}` })
        }
        return
      }
      
      try {
        // 清理输出：移除可能的警告信息（Python 可能输出到 stdout）
        const cleanStdout = stdout.trim()
        // 尝试找到 JSON 部分（可能包含其他输出）
        let jsonStart = cleanStdout.indexOf('{')
        let jsonEnd = cleanStdout.lastIndexOf('}') + 1
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const jsonStr = cleanStdout.substring(jsonStart, jsonEnd)
          const result = JSON.parse(jsonStr)
          resolve(result)
        } else {
          throw new Error('未找到有效的 JSON 输出')
        }
      } catch (e) {
        console.error('[Maya Package] Failed to parse JSON:', stdout)
        console.error('[Maya Package] stdout length:', stdout.length)
        resolve({ error: `JSON 解析失败: ${(e as Error).message}`, raw: stdout.substring(0, 500) })
      }
    })
    
    pythonProcess.on('error', (error) => {
      console.error('[Maya Package] Process error:', error)
      resolve({ error: `无法启动 Python 进程: ${error.message}` })
    })
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

// ========================================
// 自动更新功能
// ========================================

/**
 * 初始化自动更新
 */
function initAutoUpdater() {
  // 开发环境不启用自动更新
  if (runtimeEnv.isDevelopment) {
    console.log('[AutoUpdater] Disabled in development mode')
    return
  }

  console.log('[AutoUpdater] Initializing...')
  console.log('[AutoUpdater] App version:', app.getVersion())

  // 使用 require 导入 autoUpdater（延迟到运行时，避免在模块加载时初始化）
  const { autoUpdater: updater } = require('electron-updater')
  autoUpdater = updater // 保存到全局变量

  // 配置 autoUpdater
  autoUpdater.autoDownload = false // 不自动下载，等用户确认
  autoUpdater.autoInstallOnAppQuit = true // 退出时自动安装更新

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
  if (process.env.VITE_DEV_SERVER_URL || !autoUpdater) {
    return
  }

  console.log('[AutoUpdater] Starting update check...')
  autoUpdater.checkForUpdates().catch((error) => {
    console.error('[AutoUpdater] Check failed:', error)
  })
}

// 防止构建时 Tree Shaking 误删自动更新相关函数
;(globalThis as any).__YuntuAutoUpdaterHooks = {
  initAutoUpdater,
  checkForUpdates,
}

// IPC 通信：手动检查更新
ipcMain.handle('check-for-updates', async () => {
  console.log('[IPC] Manual update check requested')
  if (!autoUpdater) {
    return { success: false, error: 'AutoUpdater not initialized' }
  }
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
  if (!autoUpdater) {
    return { success: false, error: 'AutoUpdater not initialized' }
  }
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
  if (!autoUpdater) {
    return
  }
  isQuitting = true
  autoUpdater.quitAndInstall(false, true)
})

} // end of setupIpcHandlers()

// 防止多个实例同时运行
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 已有实例在运行，直接退出
  console.log('[App] 已有实例在运行，退出当前实例')
  app.quit()
} else {
  // 当第二个实例尝试启动时，聚焦到第一个实例的窗口
  app.on('second-instance', () => {
    console.log('[App] 检测到第二个实例启动，聚焦到当前窗口')
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  // 应用准备就绪
  app.whenReady().then(() => {
    // 设置应用名称，避免出现额外的窗口
    app.setName('盛世云图')
    logger.info('[App Init] 应用名称已设置为: 盛世云图')
    
    // 禁用系统代理，让 OSS 上传直接使用本地网络（绕过 VPN）
    app.commandLine.appendSwitch('no-proxy-server')
    logger.info('[App Init] 已禁用系统代理，OSS 上传将使用直连网络')

    // 首次加载服务端配置（必须在 app.ready 之后）
    logger.info('[App Init] 应用就绪，开始加载配置文件...')
    serverConfig = loadServerConfig()
    logger.info(`[App Init] 配置文件加载完成: apiBaseUrl=${serverConfig.apiBaseUrl}, wsBaseUrl=${serverConfig.wsBaseUrl}, environment=${serverConfig.environment}`)

    // 设置 IPC 处理器（必须在 app.ready 之后，因为需要访问 electron 模块）
    logger.info('[App Init] 开始注册 IPC 处理器...')
    setupIpcHandlers()
    logger.info('[App Init] IPC 处理器注册完成')

    createWindow()
    // 不再创建系统托盘（移除守护进程功能）
    // createTray()

    // 初始化自动更新
    initAutoUpdater()

    app.on('activate', () => {
      // macOS: 点击 Dock 图标时重新创建窗口
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      } else if (mainWindow) {
        // 如果窗口已存在但被隐藏，显示它
        if (mainWindow.isMinimized()) {
          mainWindow.restore()
        }
        mainWindow.show()
        mainWindow.focus()
      }
    })
  })
}

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  logger.info('[App] 所有窗口已关闭，强制退出应用')
  isQuitting = true
  
  // 直接退出应用（不再保持托盘常驻）
  app.quit()
  
  // 强制退出进程，确保所有子进程都被杀死
  setTimeout(() => {
    logger.info('[App] 强制终止所有进程')
    process.exit(0)
  }, 200)
})

// 应用退出前清理
app.on('before-quit', (event) => {
  logger.info('[App] 应用即将退出')
  isQuitting = true
})

// 应用即将退出时，强制清理所有资源
app.on('will-quit', (event) => {
  logger.info('[App] 应用正在退出，清理资源')
  
  // 销毁所有窗口
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      logger.info(`[App] 销毁窗口: ${win.id}`)
      win.destroy()
    }
  })
})

// 监听进程退出信号
process.on('exit', (code) => {
  logger.info(`[Process] 进程退出，退出码: ${code}`)
})

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error(`[Process] 未捕获的异常: ${error}`)
  // 强制退出
  process.exit(1)
})

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`[Process] 未处理的 Promise 拒绝: ${reason}`)
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

// IPC 通信：选择文件（支持多选）
ipcMain.handle('dialog:select-files', async (_event, options: OpenDialogOptions = {}) => {
  const properties = new Set(options.properties ?? [])
  properties.add('openFile')
  if (options.properties?.includes('multiSelections')) {
    properties.add('multiSelections')
  }
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    ...options,
    properties: Array.from(properties),
    filters: options.filters || [
      { name: '3D Scene Files', extensions: ['ma', 'mb', 'zip', 'rar', 'blend', 'c4d', 'max', 'fbx'] },
      { name: 'All Files', extensions: ['*'] }
    ],
  })
  return result
})

// IPC 通信：选择保存路径（用于下载功能）
ipcMain.handle('dialog:select-save-path', async (_event, defaultPath: string) => {
  const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
    defaultPath,
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ],
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

// IPC 通信：写入文件（用于下载功能）
ipcMain.handle('write-file', async (_event, path: string, data: ArrayBuffer) => {
  try {
    const buffer = Buffer.from(data)
    const { writeFile } = await import('fs/promises')
    await writeFile(path, buffer)
    console.log('[IPC] File written:', path)
  } catch (error) {
    console.error('[IPC] write-file error:', error)
    throw error
  }
})

// IPC 通信：计算文件MD5（用于下载完整性校验）
ipcMain.handle('calculate-file-md5', async (_event, path: string) => {
  try {
    const crypto = await import('crypto')
    const { readFile } = await import('fs/promises')
    const buffer = await readFile(path)
    const hash = crypto.createHash('md5')
    hash.update(buffer)
    const md5 = hash.digest('hex')
    console.log('[IPC] MD5 calculated:', path, md5)
    return md5
  } catch (error) {
    console.error('[IPC] calculate-file-md5 error:', error)
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
