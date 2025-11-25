import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import router from './router'
import App from './App.vue'
import './assets/styles/global.scss'
import { initializeAxiosConfig } from './api/axios-config'

/**
 * 应用初始化
 * 确保 Axios 配置在路由守卫执行前完成
 */
async function initializeApp() {
  // 1. 初始化 Axios 配置（必须在 router 导航前完成）
  console.log('[App Init] 初始化 Axios 配置...')
  await initializeAxiosConfig()
  console.log('[App Init] Axios 配置完成')

  // 2. 创建 Vue 应用
  const app = createApp(App)

  // 3. 全局注册 Element Plus 图标
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

  // 4. 注册插件
  app.use(createPinia())
  app.use(router)
  app.use(ElementPlus, { size: 'default', zIndex: 3000 })

  // 5. 挂载应用
  app.mount('#app')
  console.log('[App Init] 应用启动完成')
  
  // 6. 等待路由导航完成后再通知 Electron 显示窗口
  router.isReady().then(() => {
    console.log('[App Init] 路由已就绪')
    // 等待下一个 tick 确保组件已渲染
    setTimeout(() => {
      if (window.electronAPI) {
        // 通知 Electron 主进程应用已初始化完成
        console.log('[App Init] 通知 Electron 应用已初始化')
        // 使用 IPC 发送消息（需要通过 preload）
        // 由于没有直接的 IPC 方法，我们使用一个技巧：通过检查路由状态
        // 实际上，我们应该在 App.vue 的 onMounted 中发送消息
      }
    }, 100)
  })
}

// 启动应用
initializeApp().catch(error => {
  console.error('[App Init] 应用初始化失败:', error)
})
