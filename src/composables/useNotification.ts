/**
 * 系统通知 Composable
 */

export interface NotificationOptions {
  title: string
  body: string
  silent?: boolean
  urgency?: 'normal' | 'critical' | 'low'
}

export function useNotification() {
  /**
   * 显示系统通知
   */
  const showNotification = async (options: NotificationOptions) => {
    if (!window.electronAPI) {
      console.warn('Electron API not available, using web notification instead')
      // 降级到 Web Notification API
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(options.title, {
          body: options.body,
          silent: options.silent,
        })
      }
      return
    }

    // 检查免打扰时段
    const isDND = await window.electronAPI.checkDoNotDisturb()
    if (isDND && options.urgency !== 'critical') {
      console.log('Do not disturb mode is active, skipping notification')
      return
    }

    // 显示 Electron 系统通知
    window.electronAPI.showNotification(options)
  }

  /**
   * 上传完成通知
   */
  const notifyUploadComplete = (fileName: string, count: number = 1) => {
    showNotification({
      title: '上传完成',
      body: count === 1 ? `${fileName} 已上传完成` : `${count} 个文件已上传完成`,
      urgency: 'normal',
    })
  }

  /**
   * 上传失败通知
   */
  const notifyUploadFailed = (fileName: string, error: string) => {
    showNotification({
      title: '上传失败',
      body: `${fileName} 上传失败: ${error}`,
      urgency: 'normal',
    })
  }

  /**
   * 渲染完成通知
   */
  const notifyRenderComplete = (taskName: string, frameCount: number) => {
    showNotification({
      title: '渲染任务已完成',
      body: `${taskName} 已完成渲染,共 ${frameCount} 帧`,
      urgency: 'normal',
    })
  }

  /**
   * 渲染失败通知
   */
  const notifyRenderFailed = (taskName: string, error: string) => {
    showNotification({
      title: '渲染任务失败',
      body: `${taskName} 渲染失败: ${error}`,
      urgency: 'normal',
    })
  }

  /**
   * 余额不足通知
   */
  const notifyInsufficientBalance = () => {
    showNotification({
      title: '余额不足',
      body: '账户余额不足,请及时充值以免影响任务进行',
      urgency: 'critical',
    })
  }

  /**
   * 账号异地登录通知
   */
  const notifyRemoteLogin = (location: string) => {
    showNotification({
      title: '账号异地登录',
      body: `您的账号在 ${location} 登录,如非本人操作请及时修改密码`,
      urgency: 'critical',
    })
  }

  /**
   * 秒传成功通知
   */
  const notifyInstantUpload = (count: number, savedSize: number) => {
    const sizeStr = formatFileSize(savedSize)
    showNotification({
      title: '秒传成功',
      body: `${count} 个文件已秒传,节省 ${sizeStr} 存储空间`,
      urgency: 'normal',
    })
  }

  /**
   * 通用成功通知
   */
  const notifySuccess = (message: string) => {
    showNotification({
      title: '操作成功',
      body: message,
      urgency: 'normal',
    })
  }

  /**
   * 通用错误通知
   */
  const notifyError = (message: string) => {
    showNotification({
      title: '操作失败',
      body: message,
      urgency: 'normal',
    })
  }

  /**
   * 格式化文件大小
   */
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  return {
    showNotification,
    notifyUploadComplete,
    notifyUploadFailed,
    notifyRenderComplete,
    notifyRenderFailed,
    notifyInsufficientBalance,
    notifyRemoteLogin,
    notifyInstantUpload,
    notifySuccess,
    notifyError,
  }
}
