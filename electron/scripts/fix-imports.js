#!/usr/bin/env node
/**
 * Post-build script to fix electron import issues in bundled output
 */

const fs = require('fs')
const path = require('path')

const mainJsPath = path.join(__dirname, '../../dist-electron/main.js')

if (fs.existsSync(mainJsPath)) {
  let content = fs.readFileSync(mainJsPath, 'utf-8')

  // Replace electron.app references with proper require
  const hasError = content.includes('electron.app') && !content.includes('const { app } = require("electron")')

  if (hasError) {
    console.log('[fix-imports] Fixing electron.app references...')

    // Add destructured import at the top after the first electron require
    content = content.replace(
      /const electron = require\("electron"\);/,
      `const electron = require("electron");\nconst { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell, dialog } = electron;`
    )

    fs.writeFileSync(mainJsPath, content, 'utf-8')
    console.log('[fix-imports] Fixed electron imports in main.js')
  } else {
    console.log('[fix-imports] No fixes needed')
  }
} else {
  console.warn('[fix-imports] main.js not found at', mainJsPath)
}
