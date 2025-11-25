import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import { resolve } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    electron([
      {
        // Main process entry file
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['electron'],
              plugins: [
                {
                  name: 'fix-electron-imports',
                  writeBundle() {
                    // Fix electron imports immediately after build, before any file reads
                    try {
                      const mainJsPath = resolve(__dirname, 'dist-electron/main.js')
                      if (existsSync(mainJsPath)) {
                        let content = readFileSync(mainJsPath, 'utf-8')
                        const hasError = content.includes('electron.app') && !content.includes('const { app } = require("electron")')
                        if (hasError) {
                          // Add destructured imports
                          content = content.replace(
                            /const electron = require\("electron"\);/,
                            `const electron = require("electron");\nconst { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell, dialog } = electron;`
                          )

                          // Replace all electron.XXX references with direct XXX
                          content = content.replace(/electron\.app\b/g, 'app')
                          content = content.replace(/electron\.BrowserWindow\b/g, 'BrowserWindow')
                          content = content.replace(/electron\.ipcMain\b/g, 'ipcMain')
                          content = content.replace(/electron\.Tray\b/g, 'Tray')
                          content = content.replace(/electron\.Menu\b/g, 'Menu')
                          content = content.replace(/electron\.nativeImage\b/g, 'nativeImage')
                          content = content.replace(/electron\.Notification\b/g, 'Notification')
                          content = content.replace(/electron\.shell\b/g, 'shell')
                          content = content.replace(/electron\.dialog\b/g, 'dialog')

                          writeFileSync(mainJsPath, content, 'utf-8')
                          console.log('[fix-electron-imports] Fixed electron imports in main.js')
                        }
                      }
                    } catch (error) {
                      console.error('[fix-electron-imports] Failed:', error)
                    }
                  }
                }
              ]
            }
          }
        }
      },
      {
        // Preload script
        entry: 'electron/preload.ts',
        onstart(options) {
          // Notify the Renderer process to reload the page when the Preload scripts build is complete
          options.reload()
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/assets/styles/variables.scss";`,
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true, // 如果端口被占用则报错,而不是自动切换端口
  },
})
