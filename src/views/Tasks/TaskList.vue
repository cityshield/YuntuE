<template>
  <div class="task-list-container">
    <!-- Tab 导航 -->
    <el-tabs v-model="activeTab" class="task-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="分析列表" name="analysis" />
      <el-tab-pane label="我的上传" name="upload" />
      <el-tab-pane label="渲染作业" name="tasks" />
      <el-tab-pane label="我的下载" name="download" />
    </el-tabs>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-select v-model="timeRange" placeholder="选择时间范围" style="width: 160px" @change="handleTimeRangeChange">
        <el-option label="最近一周" value="week" />
        <el-option label="最近一个月" value="month" />
        <el-option label="最近三个月" value="quarter" />
      </el-select>
      <el-input
        v-model="searchKeyword"
        placeholder="搜索 作业号/场景名"
        style="width: 300px"
        clearable
        @input="handleSearch"
      >
        <template #suffix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button :icon="Refresh" @click="loadTasks" :loading="loading">刷新</el-button>
    </div>

    <!-- 任务列表表格 -->
    <el-table
      v-loading="loading"
      :data="tasks"
      style="width: 100%"
      class="task-table"
      height="calc(100vh - 340px)"
      @row-contextmenu="handleContextMenu"
      element-loading-text="加载中..."
    >
      <!-- 空数据占位 -->
      <template #empty>
        <div class="empty-data">
          <el-icon class="empty-icon"><DocumentDelete /></el-icon>
          <p class="empty-text">当前没有渲染任务</p>
          <p class="empty-subtext">快去上传一个场景文件开始渲染吧</p>
          <el-button type="primary" @click="goToUpload" class="upload-btn">
            <el-icon><Upload /></el-icon>
            <span>去上传</span>
          </el-button>
        </div>
      </template>

      <el-table-column prop="task_name" label="场景名" min-width="200">
        <template #default="{ row }">
          <div class="scene-name">
            <el-icon size="20" style="margin-right: 8px">
              <Film v-if="row.renderer?.toLowerCase().includes('arnold')" />
              <Box v-else />
            </el-icon>
            {{ row.task_name }}
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="作业ID" width="120">
        <template #default="{ row }">
          <span class="task-id">{{ formatTaskId(row.id) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="150">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="progress" label="完成进度" width="200">
        <template #default="{ row }">
          <div class="progress-cell">
            <el-progress :percentage="row.progress" :color="getProgressColor(row.progress)" />
          </div>
        </template>
      </el-table-column>
      <el-table-column label="渲染中" width="120">
        <template #default="{ row }">
          <span>{{ getRenderingProgress(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="帧范围" width="150">
        <template #default="{ row }">
          <span>{{ getFrameRange(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          <span>{{ formatDate(row.created_at) }}</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 右键菜单 -->
    <div
      v-show="showContextMenu"
      ref="contextMenuRef"
      class="task-context-menu"
      :style="{ left: menuPosition.x + 'px', top: menuPosition.y + 'px' }"
    >
      <div class="menu-content">
        <div class="menu-item" @click="handleMenuAction('refresh')">
          <el-icon><Refresh /></el-icon>
          <span>刷新作业</span>
        </div>
        <div
          class="menu-item"
          @click="handleMenuAction('start')"
          :class="{ disabled: !canStartTask(selectedTask) }"
        >
          <el-icon><VideoPlay /></el-icon>
          <span>开始作业</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="handleMenuAction('full-speed')">
          <el-icon><Odometer /></el-icon>
          <span>全速渲染</span>
        </div>
        <div
          class="menu-item"
          @click="handleMenuAction('pause')"
          :class="{ disabled: !canPauseTask(selectedTask) }"
        >
          <el-icon><VideoPause /></el-icon>
          <span>暂停作业</span>
        </div>
        <div class="menu-item">
          <el-icon><Setting /></el-icon>
          <span>重提</span>
          <el-icon class="arrow-right"><ArrowRight /></el-icon>
        </div>
        <div class="menu-item">
          <el-icon><Edit /></el-icon>
          <span>修改渲染机型</span>
          <el-icon class="arrow-right"><ArrowRight /></el-icon>
        </div>
        <div class="menu-item">
          <el-icon><Edit /></el-icon>
          <span>修改作业等级</span>
          <el-icon class="arrow-right"><ArrowRight /></el-icon>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="handleMenuAction('start-download')">
          <el-icon><Download /></el-icon>
          <span>开始下载</span>
        </div>
        <div class="menu-item" @click="handleMenuAction('another')">
          <el-icon><FolderOpened /></el-icon>
          <span>另存为...</span>
        </div>
        <div class="menu-item" @click="handleMenuAction('select-download')">
          <el-icon><Select /></el-icon>
          <span>选择结果下载</span>
        </div>
        <div class="menu-item" @click="handleMenuAction('open-local')">
          <el-icon><Folder /></el-icon>
          <span>打开本地下载目录</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="handleMenuAction('view-details')">
          <el-icon><View /></el-icon>
          <span>查看作业详情</span>
        </div>
        <div class="menu-item" @click="handleMenuAction('filter-failed')">
          <el-icon><Warning /></el-icon>
          <span>筛选失败帧</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="handleMenuAction('add-note')">
          <el-icon><EditPen /></el-icon>
          <span>添加备注</span>
        </div>
        <div class="menu-item">
          <el-icon><CopyDocument /></el-icon>
          <span>复制</span>
          <el-icon class="arrow-right"><ArrowRight /></el-icon>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item danger" @click="handleMenuAction('delete')">
          <el-icon><Delete /></el-icon>
          <span>删除作业</span>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination">
      <span class="total">共 {{ total }} 条</span>
      <el-pagination
        layout="prev, pager, next, jumper"
        :total="total"
        :page-size="pageSize"
        v-model:current-page="currentPage"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search,
  Film,
  Box,
  Refresh,
  VideoPlay,
  VideoPause,
  Odometer,
  Setting,
  Edit,
  Download,
  FolderOpened,
  Select,
  Folder,
  View,
  Warning,
  EditPen,
  CopyDocument,
  Delete,
  ArrowRight,
  Upload,
  DocumentDelete,
} from '@element-plus/icons-vue'
import { tasksAPI } from '@/api/tasks'
import { TaskStatus, TaskStatusLabels, type TaskResponse } from '@/types/task'

const router = useRouter()
const activeTab = ref('tasks')

// 处理Tab切换
const handleTabChange = (tabName: string) => {
  if (tabName === 'upload') {
    router.push('/main/upload')
  } else if (tabName === 'tasks') {
    router.push('/main/tasks')
  } else {
    ElMessage.info(`${tabName === 'analysis' ? '分析列表' : '我的下载'}功能开发中`)
  }
}

// 跳转到上传页面
const goToUpload = () => {
  router.push('/main/upload')
}

// 筛选和搜索
const timeRange = ref('month')
const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const loading = ref(false)

// 任务列表数据
const tasks = ref<TaskResponse[]>([])

// 加载任务列表
const loadTasks = async () => {
  loading.value = true
  try {
    const params = {
      skip: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
      search: searchKeyword.value || undefined,
      time_range: timeRange.value as 'week' | 'month' | 'quarter',
    }

    const response = await tasksAPI.getTasks(params)
    tasks.value = response.tasks
    total.value = response.total

    console.log('✅ 任务列表加载成功:', {
      total: total.value,
      count: tasks.value.length,
      page: currentPage.value,
    })
  } catch (error: any) {
    console.error('❌ 加载任务列表失败:', error)
    ElMessage.error(error.message || '加载任务列表失败')
  } finally {
    loading.value = false
  }
}

// 时间范围变化
const handleTimeRangeChange = () => {
  currentPage.value = 1
  loadTasks()
}

// 搜索
const handleSearch = () => {
  currentPage.value = 1
  loadTasks()
}

// 分页变化
const handlePageChange = (page: number) => {
  currentPage.value = page
  loadTasks()
}

// 格式化任务ID（取前8位）
const formatTaskId = (id: string): string => {
  return id.substring(0, 8).toUpperCase()
}

// 获取状态类型
const getStatusType = (status: number): string => {
  const typeMap: Record<number, string> = {
    [TaskStatus.DRAFT]: 'info',
    [TaskStatus.PENDING]: 'info',
    [TaskStatus.QUEUED]: 'warning',
    [TaskStatus.RENDERING]: 'primary',
    [TaskStatus.PAUSED]: 'warning',
    [TaskStatus.COMPLETED]: 'success',
    [TaskStatus.FAILED]: 'danger',
    [TaskStatus.CANCELLED]: 'info',
  }
  return typeMap[status] || 'info'
}

// 获取状态标签
const getStatusLabel = (status: number): string => {
  return TaskStatusLabels[status as TaskStatus] || '未知'
}

// 获取进度颜色
const getProgressColor = (progress: number): string => {
  if (progress === 100) return '#67C23A'
  if (progress > 50) return '#409EFF'
  if (progress > 0) return '#E6A23C'
  return '#909399'
}

// 获取渲染进度
const getRenderingProgress = (task: TaskResponse): string => {
  if (!task.start_frame || !task.end_frame) return '-'

  const totalFrames = Math.floor((task.end_frame - task.start_frame) / task.frame_step) + 1
  const renderedFrames = Math.floor((totalFrames * task.progress) / 100)

  return `${renderedFrames} / ${totalFrames}`
}

// 获取帧范围
const getFrameRange = (task: TaskResponse): string => {
  if (!task.start_frame || !task.end_frame) return '-'

  if (task.frame_step === 1) {
    return `${task.start_frame}-${task.end_frame}`
  }
  return `${task.start_frame}-${task.end_frame}[${task.frame_step}]`
}

// 格式化日期
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-'

  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

// 判断是否可以开始任务
const canStartTask = (task: TaskResponse | null): boolean => {
  if (!task) return false
  return [TaskStatus.DRAFT, TaskStatus.PAUSED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(task.status)
}

// 判断是否可以暂停任务
const canPauseTask = (task: TaskResponse | null): boolean => {
  if (!task) return false
  return [TaskStatus.RENDERING, TaskStatus.QUEUED].includes(task.status)
}

// 右键菜单相关
const showContextMenu = ref(false)
const menuPosition = ref({ x: 0, y: 0 })
const selectedTask = ref<TaskResponse | null>(null)

const handleContextMenu = (row: TaskResponse, _column: any, event: MouseEvent) => {
  event.preventDefault()
  selectedTask.value = row
  menuPosition.value = {
    x: event.clientX,
    y: event.clientY,
  }
  showContextMenu.value = true
}

// 点击其他地方关闭菜单
const closeMenu = () => {
  showContextMenu.value = false
}

// 监听全局点击事件
if (typeof window !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('.task-context-menu')) {
      closeMenu()
    }
  })
}

const handleMenuAction = async (action: string) => {
  if (!selectedTask.value) return

  // 关闭菜单
  showContextMenu.value = false

  const task = selectedTask.value

  try {
    switch (action) {
      case 'refresh':
        await loadTasks()
        ElMessage.success('刷新成功')
        break

      case 'start':
        if (!canStartTask(task)) {
          ElMessage.warning('当前任务状态不支持开始操作')
          return
        }
        await tasksAPI.resumeTask(task.id)
        ElMessage.success('任务已开始')
        await loadTasks()
        break

      case 'pause':
        if (!canPauseTask(task)) {
          ElMessage.warning('当前任务状态不支持暂停操作')
          return
        }
        await tasksAPI.pauseTask(task.id)
        ElMessage.success('任务已暂停')
        await loadTasks()
        break

      case 'delete':
        await ElMessageBox.confirm(
          `确定要删除任务 "${task.task_name}" 吗？删除后无法恢复。`,
          '删除确认',
          {
            confirmButtonText: '确定删除',
            cancelButtonText: '取消',
            type: 'warning',
          }
        )
        await tasksAPI.deleteTask(task.id)
        ElMessage.success('任务已删除')
        await loadTasks()
        break

      case 'view-details':
        ElMessage.info(`查看任务详情: ${formatTaskId(task.id)}`)
        // TODO: 打开任务详情对话框
        break

      case 'full-speed':
      case 'start-download':
      case 'another':
      case 'select-download':
      case 'open-local':
      case 'filter-failed':
      case 'add-note':
        ElMessage.info(`${getActionName(action)}功能开发中... (作业ID: ${formatTaskId(task.id)})`)
        break

      default:
        break
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('操作失败:', error)
      ElMessage.error(error.message || '操作失败')
    }
  }
}

// 获取操作名称
const getActionName = (action: string): string => {
  const actionMap: Record<string, string> = {
    'full-speed': '全速渲染',
    'start-download': '开始下载',
    another: '另存为',
    'select-download': '选择结果下载',
    'open-local': '打开本地下载目录',
    'filter-failed': '筛选失败帧',
    'add-note': '添加备注',
  }
  return actionMap[action] || action
}

// 组件挂载时加载任务列表
onMounted(() => {
  loadTasks()
})
</script>

<style lang="scss" scoped>
.task-list-container {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

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

.toolbar {
  display: flex;
  gap: 16px;
  margin: 16px 0;
}

.scene-name {
  display: flex;
  align-items: center;
}

.task-id {
  font-family: monospace;
  color: $text-secondary;
}

.progress-cell {
  padding: 0 16px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .total {
    font-size: $font-size-sm;
    color: $text-secondary;
  }
}

// 空数据占位样式
.empty-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;

  .empty-icon {
    font-size: 80px;
    color: $text-disabled;
    margin-bottom: 24px;
    opacity: 0.5;
  }

  .empty-text {
    font-size: $font-size-lg;
    color: $text-primary;
    margin: 0 0 8px 0;
    font-weight: 500;
  }

  .empty-subtext {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin: 0 0 32px 0;
  }

  .upload-btn {
    background-color: $primary-color;
    border-color: $primary-color;
    padding: 12px 32px;
    font-size: $font-size-md;

    &:hover {
      background-color: $primary-hover;
      border-color: $primary-hover;
    }

    &:active {
      background-color: $primary-active;
      border-color: $primary-active;
    }

    .el-icon {
      margin-right: 8px;
    }
  }
}

// 右键菜单样式
.task-context-menu {
  position: fixed;
  z-index: 9999;
  background-color: $bg-dark;
  border: 1px solid $border-color;
  border-radius: $border-radius-small;
  box-shadow: $shadow-large;
  min-width: 200px;
  padding: 4px 0;

  .menu-content {
    .menu-item {
      color: $text-primary;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: all $transition-fast;
      user-select: none;

      &:hover:not(.disabled) {
        background-color: $bg-hover;
        color: $primary-color;
      }

      &.disabled {
        color: $text-disabled;
        cursor: not-allowed;
      }

      &.danger:hover {
        background-color: rgba($status-danger, 0.1);
        color: $status-danger;
      }

      .el-icon {
        font-size: 16px;
        flex-shrink: 0;
      }

      span {
        flex: 1;
        font-size: $font-size-sm;
      }

      .arrow-right {
        margin-left: auto;
        font-size: 12px;
        color: $text-secondary;
      }
    }

    .menu-divider {
      height: 1px;
      background-color: $border-color;
      margin: 4px 0;
    }
  }
}
</style>
