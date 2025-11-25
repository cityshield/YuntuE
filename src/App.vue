<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTray } from '@/composables/useTray'

const { setupTrayWatcher, setupEventListeners } = useTray()

let trayInterval: NodeJS.Timeout | null = null

onMounted(() => {
  // 应用启动时的初始化逻辑
  console.log('[App] 组件已挂载')

  // 注意：initializeAxiosConfig 已在 main.ts 中完成
  // 注意：restoreSession 由路由守卫统一处理，避免重复调用

  // 设置暗色主题
  document.documentElement.classList.add('dark')

  // 设置托盘监听器
  if (window.electronAPI) {
    console.log('[App] 设置托盘监听器...')
    trayInterval = setupTrayWatcher()
    setupEventListeners()
  }
  
  // 不再需要通知 Electron，使用标准的 ready-to-show 事件即可
})

onUnmounted(() => {
  // 清理托盘定时器
  if (trayInterval) {
    clearInterval(trayInterval)
  }
})
</script>

<style lang="scss">
#app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
