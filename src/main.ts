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
}

// 启动应用
initializeApp().catch(error => {
  console.error('[App Init] 应用初始化失败:', error)
})
