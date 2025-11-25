<template>
  <div class="main-container">
    <!-- 设置对话框 -->
    <SettingsDialog v-model="showSettingsDialog" />
    <!-- 更新对话框 -->
    <UpdateDialog ref="updateDialogRef" />
    <!-- 自定义标题栏 -->
    <div class="titlebar titlebar-drag-region">
      <div class="titlebar-left">
        <img src="/yuntu-logo.svg" class="logo" alt="盛世云图" />
        <span class="app-name">盛世云图</span>
      </div>
      <div class="titlebar-right titlebar-no-drag">
        <el-button :icon="Service" circle size="small" title="在线客服" />
        <el-badge :value="3" class="notification-badge">
          <el-button :icon="Bell" circle size="small" title="通知" />
        </el-badge>
        <el-dropdown trigger="click" @command="handleSettingsCommand" class="settings-dropdown">
          <el-button :icon="Setting" circle size="small" title="设置" />
          <template #dropdown>
            <el-dropdown-menu class="settings-menu">
              <el-dropdown-item command="settings">设置</el-dropdown-item>
              <el-dropdown-item command="plugins">插件管理</el-dropdown-item>
              <el-dropdown-item command="console">控制台</el-dropdown-item>
              <el-dropdown-item command="update">检查更新</el-dropdown-item>
              <el-dropdown-item command="about">关于我们</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="handleUserCommand" class="user-dropdown">
          <div class="user-avatar-btn" title="用户菜单">
            <el-avatar
              :size="28"
              :src="userStore.user?.avatar"
              :style="{ backgroundColor: userStore.user?.avatar ? 'transparent' : '#00D9B6' }"
            >
              {{ userStore.user?.username?.charAt(0)?.toUpperCase() || 'U' }}
            </el-avatar>
          </div>
          <template #dropdown>
            <el-dropdown-menu class="user-menu">
              <el-dropdown-item disabled>
                <div class="user-info">
                  <div class="username">{{ userStore.user?.username || '用户' }}</div>
                  <div class="user-phone">{{ userStore.user?.phone || '' }}</div>
                </div>
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>
                <span style="margin-left: 8px;">退出登录</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <div class="window-controls">
          <button class="titlebar-button" @click="minimizeWindow">
            <el-icon><Minus /></el-icon>
          </button>
          <button class="titlebar-button" @click="maximizeWindow">
            <el-icon><FullScreen /></el-icon>
          </button>
          <button class="titlebar-button close-button" @click="closeWindow">
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧边栏 -->
      <div class="sidebar">
        <div class="sidebar-item active" title="渲染">
          <el-icon size="24"><Film /></el-icon>
        </div>
        <div class="sidebar-item" title="统计">
          <el-icon size="24"><DataLine /></el-icon>
        </div>
        <div class="sidebar-item" title="游戏">
          <el-icon size="24"><Box /></el-icon>
        </div>
        <div class="sidebar-item" title="消息">
          <el-icon size="24"><ChatLineRound /></el-icon>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="content-area">
        <router-view />
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="statusbar">
      <div class="statusbar-left">
        <el-icon><Mute /></el-icon>
        <span class="status-text">线程在线稳定</span>
      </div>
      <div class="statusbar-right">
        <span class="proxy-info">RaySyncProxy(电信)</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ElMessageBox, ElMessage, ElNotification } from 'element-plus'
import {
  Setting,
  Service,
  Bell,
  Minus,
  FullScreen,
  Close,
  Film,
  DataLine,
  Box,
  ChatLineRound,
  Mute,
  SwitchButton,
} from '@element-plus/icons-vue'
import SettingsDialog from './Settings/SettingsDialog.vue'
import UpdateDialog from '@/components/UpdateDialog.vue'
import { downloadManager } from '@/utils/download/DownloadManager'
import type { TaskResponse } from '@/types/task'

const router = useRouter()
const userStore = useUserStore()
const showSettingsDialog = ref(false)
const updateDialogRef = ref<InstanceType<typeof UpdateDialog> | null>(null)

// WebSocket连接 (后续实现)
let websocket: WebSocket | null = null

// 初始化WebSocket连接并监听任务完成事件
onMounted(() => {
  // TODO: 实际项目中从配置获取WebSocket URL
  // 这里仅作示例,实际应使用 useServerStatus composable
  const wsUrl = `ws://localhost:8000/ws?user_id=${userStore.user?.id}`

  try {
    websocket = new WebSocket(wsUrl)

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data)

      // 监听任务完成事件
      if (message.type === 'task_completed') {
        const task: TaskResponse = message.task

        // 弹出通知,询问是否立即下载
        ElNotification({
          title: '渲染完成',
          message: `任务 "${task.task_name}" 已完成渲染,是否立即下载?`,
          type: 'success',
          duration: 0, // 不自动关闭
          onClick: async () => {
            try {
              await downloadManager.addTaskFromRenderTask(task)
              router.push('/main/downloads')
            } catch (error: any) {
              ElMessage.error(error.message || '添加下载任务失败')
            }
          },
        })
      }
    }

    websocket.onerror = (error) => {
      console.error('[WebSocket] Connection error:', error)
    }

    websocket.onclose = () => {
      console.log('[WebSocket] Connection closed')
    }
  } catch (error) {
    console.error('[WebSocket] Failed to connect:', error)
  }
})

// 清理WebSocket连接
onUnmounted(() => {
  if (websocket) {
    websocket.close()
    websocket = null
  }
})

// 窗口控制
const minimizeWindow = () => {
  window.electronAPI?.minimizeWindow()
}

const maximizeWindow = () => {
  window.electronAPI?.maximizeWindow()
}

const closeWindow = () => {
  window.electronAPI?.closeWindow()
}

// 设置菜单处理
const handleSettingsCommand = (command: string) => {
  switch (command) {
    case 'settings':
      showSettingsDialog.value = true
      break
    case 'plugins':
      ElMessage.info('插件管理功能开发中')
      break
    case 'console':
      ElMessage.info('控制台功能开发中')
      break
    case 'update':
      // 手动检查更新
      updateDialogRef.value?.checkForUpdates()
      break
    case 'about':
      ElMessage.info('关于我们功能开发中')
      break
    default:
      break
  }
}

// 用户菜单处理
const handleUserCommand = async (command: string) => {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })

      // 执行退出登录
      userStore.logout()
      ElMessage.success('已退出登录')
      router.push('/login')
    } catch {
      // 用户取消了操作
    }
  }
}
</script>

<style lang="scss" scoped>
.main-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: $bg-dark;
}

.titlebar {
  height: 48px;
  background-color: $bg-darker;
  border-bottom: 1px solid $border-color;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  color: $text-primary;

  .titlebar-left {
    display: flex;
    align-items: center;
    gap: 12px;

    .logo {
      width: 32px;
      height: 32px;
      object-fit: contain;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .app-name {
      font-size: $font-size-md;
      font-weight: 500;
    }
  }

  .titlebar-right {
    display: flex;
    align-items: center;
    gap: 12px;

    .notification-badge {
      :deep(.el-badge__content) {
        background-color: $status-danger;
      }
    }

    .user-dropdown {
      .user-avatar-btn {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all $transition-fast;

        &:hover {
          opacity: 0.8;
        }
      }
    }

    .window-controls {
      display: flex;
      margin-left: 8px;

      .titlebar-button {
        width: 40px;
        height: 32px;
        border: none;
        background: transparent;
        color: $text-primary;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background $transition-fast;

        &:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        &.close-button:hover {
          background: $status-danger;
        }
      }
    }
  }
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 80px;
  background-color: $bg-darker;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  gap: 8px;

  .sidebar-item {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $text-secondary;
    cursor: pointer;
    position: relative;
    transition: all $transition-fast;

    &:hover {
      background-color: $bg-hover;
      color: $primary-color;
    }

    &.active {
      color: $primary-color;

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 4px;
        height: 32px;
        background-color: $primary-color;
        border-radius: 0 2px 2px 0;
      }
    }
  }
}

.content-area {
  flex: 1;
  overflow: auto;
  background-color: $bg-dark;
}

.statusbar {
  height: 32px;
  background-color: $bg-darker;
  border-top: 1px solid $border-color;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: $font-size-xs;
  color: $text-secondary;

  .statusbar-left,
  .statusbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

// 设置菜单样式
.settings-menu {
  background-color: $bg-dark !important;
  border: 1px solid $border-color !important;
  padding: 4px 0;
  min-width: 140px;

  :deep(.el-dropdown-menu__item) {
    color: $text-primary;
    padding: 10px 16px;

    &:hover {
      background-color: $bg-hover !important;
      color: $primary-color;
    }
  }
}

// 用户菜单样式
.user-menu {
  background-color: $bg-dark !important;
  border: 1px solid $border-color !important;
  padding: 4px 0;
  min-width: 180px;

  :deep(.el-dropdown-menu__item) {
    color: $text-primary;
    padding: 10px 16px;

    &:hover:not(.is-disabled) {
      background-color: $bg-hover !important;
      color: $primary-color;
    }

    &.is-disabled {
      opacity: 1;
      cursor: default;

      &:hover {
        background-color: transparent !important;
      }
    }
  }

  .user-info {
    padding: 4px 0;

    .username {
      font-size: $font-size-md;
      font-weight: 500;
      color: $text-primary;
      margin-bottom: 4px;
    }

    .user-phone {
      font-size: $font-size-xs;
      color: $text-secondary;
    }
  }
}
</style>
