/**
 * 前端渲染进程日志模块
 * 参考 Python logger.py 的实现
 */

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
 */
export class Logger {
  private consoleOutput: boolean
  private logLevel: LogLevel
  private logBuffer: Array<{ message: string; level: LogLevel; timestamp: Date }> = []
  private maxBufferSize: number = 1000

  constructor(options: {
    consoleOutput?: boolean
    logLevel?: LogLevel
    maxBufferSize?: number
  } = {}) {
    this.consoleOutput = options.consoleOutput ?? true
    this.logLevel = options.logLevel ?? LogLevel.INFO
    this.maxBufferSize = options.maxBufferSize ?? 1000
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

    const style = this._getConsoleStyle(level)
    
    switch (level) {
      case LogLevel.ERROR:
        console.error(`%c${formattedMessage}`, style)
        break
      case LogLevel.WARNING:
        console.warn(`%c${formattedMessage}`, style)
        break
      case LogLevel.DEBUG:
        console.debug(`%c${formattedMessage}`, style)
        break
      default:
        console.log(`%c${formattedMessage}`, style)
    }
  }

  /**
   * 获取控制台样式
   */
  private _getConsoleStyle(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR:
        return 'color: #ef4444; font-weight: bold;'
      case LogLevel.WARNING:
        return 'color: #f59e0b; font-weight: bold;'
      case LogLevel.DEBUG:
        return 'color: #6b7280;'
      default:
        return 'color: #3b82f6;'
    }
  }

  /**
   * 添加到日志缓冲区
   */
  private _addToBuffer(message: string, level: LogLevel): void {
    this.logBuffer.push({
      message,
      level,
      timestamp: new Date(),
    })

    // 限制缓冲区大小
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift()
    }

    // 如果 Electron API 可用，发送到主进程保存到文件
    if (window.electronAPI) {
      this._sendToMainProcess(message, level)
    }
  }

  /**
   * 发送日志到主进程保存
   */
  private _sendToMainProcess(_message: string, _level: LogLevel): void {
    // 未来可以通过 IPC 发送到主进程保存到文件
    // const formattedMessage = this._formatMessage(_message, _level)
    // 暂时先在控制台显示
  }

  /**
   * 输出日志
   */
  log(message: string, level: LogLevel = LogLevel.INFO): void {
    if (!this._shouldLog(level)) return

    const formattedMessage = this._formatMessage(message, level)

    this._writeToConsole(formattedMessage, level)
    this._addToBuffer(message, level)
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
   * 获取日志缓冲区
   */
  getLogBuffer(): Array<{ message: string; level: LogLevel; timestamp: Date }> {
    return [...this.logBuffer]
  }

  /**
   * 清空日志缓冲区
   */
  clearLogBuffer(): void {
    this.logBuffer = []
  }

  /**
   * 导出日志为文本
   */
  exportLogs(): string {
    return this.logBuffer
      .map((log) => {
        const timestamp = log.timestamp.toLocaleString('zh-CN')
        const levelName = LogLevel[log.level]
        return `[${timestamp}] [${levelName}] ${log.message}`
      })
      .join('\n')
  }
}

// 全局默认日志实例
let _defaultLogger: Logger | null = null

/**
 * 获取默认日志实例
 */
export function getDefaultLogger(): Logger {
  if (!_defaultLogger) {
    _defaultLogger = new Logger({
      consoleOutput: true,
      logLevel: LogLevel.INFO,
      maxBufferSize: 1000,
    })
  }
  return _defaultLogger
}

/**
 * 设置默认日志实例
 */
export function setDefaultLogger(logger: Logger): void {
  _defaultLogger = logger
}

// 导出全局日志实例
export const logger = getDefaultLogger()

// 导出便捷函数
export const log = {
  debug: (msg: string) => logger.debug(msg),
  info: (msg: string) => logger.info(msg),
  warning: (msg: string) => logger.warning(msg),
  error: (msg: string) => logger.error(msg),
}

