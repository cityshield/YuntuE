// 正确的 Electron 主进程代码
const { app, BrowserWindow } = require('electron')

console.log('app type:', typeof app)
console.log('BrowserWindow type:', typeof BrowserWindow)

app.whenReady().then(() => {
  console.log('App is ready!')
  app.quit()
})
