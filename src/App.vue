<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTray } from '@/composables/useTray'
import { initializeAxiosConfig } from '@/api/axios-config'

const { setupTrayWatcher, setupEventListeners } = useTray()

let trayInterval: NodeJS.Timeout | null = null

onMounted(async () => {
  // 应用启动时的初始化逻辑
  console.log('YuntuE 应用已启动')

  // 初始化 Axios 配置 - 从 Electron 读取服务器地址
  await initializeAxiosConfig()

  // 设置暗色主题
  document.documentElement.classList.add('dark')

  // 设置托盘监听器
  if (window.electronAPI) {
    console.log('Setting up tray watchers...')
    trayInterval = setupTrayWatcher()
    setupEventListeners()
  }
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
