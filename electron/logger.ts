import { app } from 'electron'
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
}

/**
 * 日志管理器类
 * 参考 Python logger.py 的实现
 */
export class Logger {
  private logDir: string
  private currentDay: string | null = null
  private logFile: string | null = null
  private consoleOutput: boolean
  private fileOutput: boolean
  private logLevel: LogLevel
  private appendMode: boolean

  constructor(options: {
    logDir?: string
    consoleOutput?: boolean
    fileOutput?: boolean
    logLevel?: LogLevel
    appendMode?: boolean
  } = {}) {
    this.consoleOutput = options.consoleOutput ?? true
    this.fileOutput = options.fileOutput ?? true
    this.logLevel = options.logLevel ?? LogLevel.INFO
    this.appendMode = options.appendMode ?? true

    // 默认日志目录：根据环境选择
    if (options.logDir) {
      this.logDir = options.logDir
    } else {
      try {
        // 开发环境：使用项目根目录的 logs
        if (process.env.VITE_DEV_SERVER_URL) {
          const appPath = process.cwd()
          this.logDir = join(appPath, 'logs')
        } else {
          // 生产环境：使用 userData 目录（安装版和便携版都可写）
          // 延迟获取，避免在 app 未准备好时调用
          try {
            const userDataPath = app.getPath('userData')
            this.logDir = join(userDataPath, 'logs')
          } catch (appError) {
            // 如果 app 还未准备好，先使用临时目录，后续会重新初始化
            this.logDir = join(tmpdir(), 'yuntue-logs')
            console.warn('[Logger] app 未准备好，使用临时目录，将在 app ready 后重新初始化')
          }
        }
      } catch (error) {
        // 如果获取失败，使用临时目录
        console.error('[Logger] 无法获取日志目录，将禁用文件输出:', error)
        this.fileOutput = false
        this.logDir = ''
        return
      }
    }

    // 确保日志目录存在
    if (this.fileOutput) {
      this._ensureLogDirectory()
      
      // 初始化日志文件
      this._ensureDailyLogFile(true)
    }
  }

  /**
   * 格式化日志消息
   */
  private _formatMessage(message: string, level: LogLevel): string {
    const timestamp = new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const levelName = LogLevel[level]
    return `[${timestamp}] [${levelName}] ${message}`
  }

  /**
   * 判断是否应该输出此级别的日志
   */
  private _shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel
  }

  /**
   * 输出到控制台
   */
  private _writeToConsole(formattedMessage: string, level: LogLevel): void {
    if (!this.consoleOutput) return

    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage)
        break
      case LogLevel.WARNING:
        console.warn(formattedMessage)
        break
      case LogLevel.DEBUG:
        console.debug(formattedMessage)
        break
      default:
        console.log(formattedMessage)
    }
  }

  /**
   * 输出到文件
   */
  private _writeToFile(formattedMessage: string): void {
    if (!this.fileOutput) return

    this._ensureDailyLogFile()

    if (this.logFile) {
      try {
        appendFileSync(this.logFile, formattedMessage + '\n', 'utf-8')
      } catch (error) {
        console.error('写入日志文件失败:', error)
      }
    }
  }

  /**
   * 确保日志目录存在
   */
  private _ensureLogDirectory(): void {
    if (!this.logDir) {
      this.fileOutput = false
      return
    }

    if (!existsSync(this.logDir)) {
      try {
        mkdirSync(this.logDir, { recursive: true })
        console.log('[Logger] 创建日志目录:', this.logDir)
      } catch (error) {
        console.error('[Logger] 创建日志目录失败，禁用文件输出:', error)
        this.fileOutput = false
      }
    }
  }

  /**
   * 确保按天创建日志文件
   */
  private _ensureDailyLogFile(force: boolean = false): void {
    if (!this.fileOutput) return

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    
    if (!force && this.currentDay === today && this.logFile && existsSync(this.logFile)) {
      return
    }

    this.currentDay = today
    const fileName = `main-${today}.log`
    this.logFile = join(this.logDir, fileName)

    // 如果文件不存在则创建；appendMode=false 时清空旧文件
    try {
      // 确保目录存在
      this._ensureLogDirectory()
      
      if (!existsSync(this.logFile)) {
        writeFileSync(this.logFile, '', 'utf-8')
      } else if (!this.appendMode) {
        writeFileSync(this.logFile, '', 'utf-8')
      }
    } catch (error) {
      console.error('[Logger] 无法创建日志文件，禁用文件输出:', error)
      this.fileOutput = false // 禁用文件输出以避免后续错误
    }
  }

  /**
   * 输出日志
   */
  log(message: string, level: LogLevel = LogLevel.INFO): void {
    if (!this._shouldLog(level)) return

    const formattedMessage = this._formatMessage(message, level)

    this._writeToConsole(formattedMessage, level)
    this._writeToFile(formattedMessage)
  }

  /**
   * 输出 DEBUG 级别日志
   */
  debug(message: string): void {
    this.log(message, LogLevel.DEBUG)
  }

  /**
   * 输出 INFO 级别日志
   */
  info(message: string): void {
    this.log(message, LogLevel.INFO)
  }

  /**
   * 输出 WARNING 级别日志
   */
  warning(message: string): void {
    this.log(message, LogLevel.WARNING)
  }

  /**
   * 输出 ERROR 级别日志
   */
  error(message: string): void {
    this.log(message, LogLevel.ERROR)
  }

  /**
   * 获取日志目录路径
   */
  getLogDir(): string {
    return this.logDir
  }

  /**
   * 获取当前日志文件路径
   */
  getCurrentLogFile(): string | null {
    return this.logFile
  }
}

// 全局默认日志实例
let _defaultLogger: Logger | null = null

/**
 * 获取默认日志实例
 */
export function getDefaultLogger(): Logger {
  if (!_defaultLogger) {
    try {
      _defaultLogger = new Logger({
        consoleOutput: true,
        fileOutput: true,
        logLevel: LogLevel.INFO,
        appendMode: true,
      })
    } catch (error) {
      // 如果初始化失败（例如 app 还未准备好），创建一个仅控制台输出的 logger
      console.error('[Logger] 初始化失败，使用仅控制台输出模式:', error)
      _defaultLogger = new Logger({
        consoleOutput: true,
        fileOutput: false,
        logLevel: LogLevel.INFO,
        appendMode: true,
      })
    }
  }
  return _defaultLogger
}

/**
 * 设置默认日志实例
 */
export function setDefaultLogger(logger: Logger): void {
  _defaultLogger = logger
}

// 导出全局日志实例（使用 getter，延迟初始化）
let _loggerInstance: Logger | null = null

function getLogger(): Logger {
  if (!_loggerInstance) {
    try {
      _loggerInstance = getDefaultLogger()
    } catch (error) {
      // 如果获取失败，返回一个临时的仅控制台 logger
      _loggerInstance = new Logger({
        consoleOutput: true,
        fileOutput: false,
        logLevel: LogLevel.INFO,
      })
    }
  }
  return _loggerInstance
}

// 导出 logger 对象，使用 getter 属性
export const logger = {
  info: (msg: string) => getLogger().info(msg),
  error: (msg: string) => getLogger().error(msg),
  warning: (msg: string) => getLogger().warning(msg),
  debug: (msg: string) => getLogger().debug(msg),
  log: (msg: string, level?: LogLevel) => getLogger().log(msg, level),
}

