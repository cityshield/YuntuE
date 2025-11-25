<template>
  <div class="download-area-container">
    <!-- Tab 导航栏 -->
    <el-tabs v-model="activeTab" class="task-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="分析列表" name="analysis" />
      <el-tab-pane label="我的上传" name="upload" />
      <el-tab-pane label="渲染作业" name="tasks" />
      <el-tab-pane label="我的下载" name="download" />
    </el-tabs>

    <!-- 测试面板对话框 -->
    <el-dialog
      v-model="showTestPanel"
      title="🧪 下载模块测试面板"
      width="90%"
      :close-on-click-modal="false"
      :close-on-press-escape="true"
      destroy-on-close
    >
      <DownloadTestPanel />
    </el-dialog>

    <!-- 筛选标签栏 -->
    <div class="filter-section">
      <div class="flex justify-between items-start">
        <DownloadFilterTabs
          :current-filter="currentFilter"
          :counts="counts"
          @filter-change="handleFilterChange"
          @clear-completed="handleClearCompleted"
        />

        <!-- 全局统计信息 -->
        <div class="flex gap-6 text-sm" style="color: #94a3b8; margin-right: 0.5rem;">
          <div class="flex flex-col items-end">
            <span class="text-xs font-medium uppercase" style="color: #64748b; letter-spacing: 0.05em;">速度</span>
            <span class="font-mono" style="color: white; margin-top: 0.25rem;">{{ formatSpeed(totalSpeed) }}</span>
          </div>
          <div class="flex flex-col items-end">
            <span class="text-xs font-medium uppercase" style="color: #64748b; letter-spacing: 0.05em;">剩余时间</span>
            <span class="font-mono" style="color: white; margin-top: 0.25rem;">{{ estimatedTimeRemaining }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 主列表区域 -->
    <main class="download-list">
      <!-- 空状态 -->
      <div v-if="filteredTasks.length === 0" class="empty-state">
        <p>暂无任务</p>
      </div>

      <!-- 任务列表 -->
      <div v-else>
        <DownloadItemCard
          v-for="task in filteredTasks"
          :key="task.id"
          :task="task"
          @pause="handlePause"
          @resume="handleResume"
          @cancel="handleCancel"
          @retry="handleRetry"
          @delete="handleDelete"
          @open-folder="handleOpenFolder"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import DownloadItemCard from '@/components/DownloadItemCard.vue'
import DownloadFilterTabs, { type FilterType } from '@/components/DownloadFilterTabs.vue'
import DownloadTestPanel from '@/components/DownloadTestPanel.vue'
import { useDownload } from '@/composables/useDownload'
import { DownloadStatus } from '@/types/download'

const router = useRouter()

// Tab 导航
const activeTab = ref('download')

// 处理Tab切换
const handleTabChange = (tabName: string) => {
  if (tabName === 'upload') {
    router.push('/main/upload')
  } else if (tabName === 'tasks') {
    router.push('/main/tasks')
  } else if (tabName === 'analysis') {
    ElMessage.info('分析列表功能开发中')
  }
}

// 测试面板显示状态
const showTestPanel = ref(false)

// 键盘快捷键: Ctrl+Shift+T 或 Cmd+Shift+T (Mac)
const handleKeyPress = (e: KeyboardEvent) => {
  // 仅在开发环境启用
  if (import.meta.env.DEV) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
      e.preventDefault()
      showTestPanel.value = !showTestPanel.value
      if (showTestPanel.value) {
        ElMessage.info('已打开测试面板 (开发模式)')
      }
    }
  }
}

// 挂载和卸载事件监听
onMounted(() => {
  window.addEventListener('keydown', handleKeyPress)

  // 开发环境提示
  if (import.meta.env.DEV) {
    console.log('💡 提示: 按 Ctrl+Shift+T (Mac: Cmd+Shift+T) 打开测试面板')
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyPress)
})

// Composables
const {
  tasks,
  stats,
  pauseTask,
  resumeTask,
  retryTask,
  cancelTask,
  clearCompletedTasks,
  formatSpeed,
  formatRemainingTime,
} = useDownload()

// 当前筛选条件
const currentFilter = ref<FilterType>('all')

// 计算任务数量
const counts = computed<Record<FilterType, number>>(() => ({
  all: tasks.value.length,
  [DownloadStatus.DOWNLOADING]: stats.value.downloading,
  [DownloadStatus.WAITING]: stats.value.waiting,
  [DownloadStatus.PAUSED]: stats.value.paused || 0,
  [DownloadStatus.SUCCESS]: stats.value.success,
  [DownloadStatus.FAILED]: stats.value.failed,
  [DownloadStatus.VERIFYING]: 0, // 如果需要可以添加
}))

// 筛选后的任务列表
const filteredTasks = computed(() => {
  if (currentFilter.value === 'all') {
    return tasks.value
  }
  return tasks.value.filter(task => task.status === currentFilter.value)
})

// 计算总下载速度
const totalSpeed = computed(() => {
  return tasks.value
    .filter(task => task.status === DownloadStatus.DOWNLOADING)
    .reduce((sum, task) => sum + task.speed, 0)
})

// 估算剩余时间
const estimatedTimeRemaining = computed(() => {
  const downloadingTasks = tasks.value.filter(task => task.status === DownloadStatus.DOWNLOADING)
  if (downloadingTasks.length === 0) {
    return '--:--'
  }

  // 计算所有下载中任务的平均剩余时间
  const totalRemaining = downloadingTasks.reduce((sum, task) => {
    return sum + (task.remainingTime || 0)
  }, 0)

  const avgRemaining = totalRemaining / downloadingTasks.length
  return formatRemainingTime(avgRemaining)
})

// 处理筛选变更
const handleFilterChange = (filter: FilterType) => {
  currentFilter.value = filter
}

// 暂停下载
const handlePause = (taskId: string) => {
  pauseTask(taskId)
  ElMessage.success('已暂停下载')
}

// 继续下载
const handleResume = (taskId: string) => {
  resumeTask(taskId)
  ElMessage.success('继续下载')
}

// 重试下载
const handleRetry = (taskId: string) => {
  retryTask(taskId)
  ElMessage.success('重新开始下载')
}

// 取消下载
const handleCancel = async (taskId: string) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task) return

  try {
    await ElMessageBox.confirm(
      '确定要取消该下载任务吗?',
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    cancelTask(taskId)
    ElMessage.success('已取消')
  } catch {
    // 用户取消
  }
}

// 删除任务
const handleDelete = async (taskId: string) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task) return

  const action = task.status === DownloadStatus.SUCCESS ? '删除' : '取消'

  try {
    await ElMessageBox.confirm(
      `确定要${action}该下载任务吗?`,
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    cancelTask(taskId)
    ElMessage.success(`已${action}`)
  } catch {
    // 用户取消
  }
}

// 打开文件夹
const handleOpenFolder = (taskId: string) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task) return

  // 通过 Electron API 打开文件夹
  if (window.electron?.openPath) {
    window.electron.openPath(task.savePath)
  } else {
    ElMessage.info(`文件路径: ${task.savePath}`)
  }
}

// 清除已完成的任务
const handleClearCompleted = async () => {
  if (stats.value.success === 0) {
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要清除所有已完成的下载任务吗? (共 ${stats.value.success} 个)`,
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    clearCompletedTasks()
    ElMessage.success('已清除所有已完成的任务')
  } catch {
    // 用户取消
  }
}
</script>

<style scoped lang="scss">
@import '@/assets/styles/download.scss';

// 容器样式 - 与TaskList.vue保持一致
.download-area-container {
  padding: 16px 16px 0 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

// Tab样式 - 与TaskList.vue完全一致
.task-tabs {
  :deep(.el-tabs__nav-wrap::after) {
    background-color: $border-color;
  }

  :deep(.el-tabs__active-bar) {
    background-color: $primary-color;
  }

  :deep(.el-tabs__item) {
    color: $text-secondary;

    &.is-active {
      color: $primary-color;
    }
  }
}

// 筛选区域 - 与TaskList.vue保持一致
.filter-section {
  margin: 16px 0;
}

// 下载列表 - 与TaskList.vue保持一致
.download-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
</style>
