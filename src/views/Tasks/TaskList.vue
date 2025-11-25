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

    <!-- 任务列表卡片 -->
    <div v-loading="loading" class="task-list" element-loading-text="加载中...">
      <!-- 空数据占位 -->
      <div v-if="tasks.length === 0 && !loading" class="empty-data">
        <el-icon class="empty-icon"><DocumentDelete /></el-icon>
        <p class="empty-text">当前没有渲染任务</p>
        <p class="empty-subtext">快去上传一个场景文件开始渲染吧</p>
        <el-button type="primary" @click="goToUpload" class="upload-btn">
          <el-icon><Upload /></el-icon>
          <span>去上传</span>
        </el-button>
      </div>

      <!-- 任务卡片列表 -->
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-card"
        @click="openTaskDetail(task)"
        @contextmenu.prevent="handleContextMenu(task, null, $event)"
      >
        <!-- 缩略图 -->
        <div class="task-thumbnail">
          <img
            :src="getTaskThumbnail(task)"
            :alt="task.task_name"
            class="thumbnail-image"
          />
        </div>

        <!-- 任务信息 -->
        <div class="task-info">
          <!-- 第一行：场景名 + 作业ID -->
          <div class="info-row info-header">
            <div class="scene-name">
              <img :src="getModelingSoftwareLogo(task)" class="modeling-software-icon" :alt="task.renderer" />
              <span class="task-name">{{ task.task_name }}</span>
            </div>
            <div class="task-id-wrapper">
              <span class="task-id-label">任务ID</span>
              <span class="task-id">{{ formatTaskId(task.id) }}</span>
              <el-icon class="copy-icon" @click.stop="copyTaskId(task.id)">
                <DocumentCopy />
              </el-icon>
            </div>
          </div>

          <!-- 第二行：状态 + 帧范围 + 渲染进度 -->
          <div class="info-row info-middle">
            <el-tag :type="getStatusType(task.status)" size="small" class="status-tag">
              {{ getStatusLabel(task.status) }}
            </el-tag>
            <span class="info-item">帧范围: {{ getFrameRange(task) }}</span>
            <span class="info-item">已渲染: {{ getRenderingProgress(task) }}</span>
          </div>

          <!-- 第三行：进度条 + 创建时间 -->
          <div class="info-row info-bottom">
            <div class="progress-wrapper">
              <el-progress
                :percentage="task.progress"
                :color="getProgressColor(task.progress)"
                :show-text="false"
                :stroke-width="6"
              />
              <span class="progress-text">{{ task.progress }}%</span>
            </div>
            <span class="create-time">{{ formatDate(task.created_at) }}</span>
          </div>
        </div>

        <!-- 右侧操作区 -->
        <div class="task-actions" @click.stop>
          <!-- 主按钮：开始/暂停 -->
          <el-button
            v-if="canStartTask(task)"
            type="primary"
            size="large"
            class="action-btn"
            @click="handleQuickAction(task, 'start')"
          >
            <el-icon><VideoPlay /></el-icon>
            开始
          </el-button>
          <el-button
            v-else-if="canPauseTask(task)"
            type="warning"
            size="large"
            class="action-btn"
            @click="handleQuickAction(task, 'pause')"
          >
            <el-icon><VideoPause /></el-icon>
            暂停
          </el-button>
          <el-button
            v-else
            type="info"
            size="large"
            class="action-btn"
            disabled
          >
            {{ getStatusLabel(task.status) }}
          </el-button>
        </div>
      </div>

      <!-- 加载更多提示 -->
      <div v-if="hasMore && !loading" class="load-more-hint">
        <span>滚动加载更多...</span>
      </div>
      <div v-if="!hasMore && tasks.length > 0" class="no-more-hint">
        <span>已加载全部 {{ tasks.length }} 条数据</span>
      </div>
    </div>

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

    <!-- 任务详情对话框 -->
    <TaskDetailDialog v-model="showTaskDetail" :task="selectedTaskForDetail" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search,
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
  DocumentCopy,
} from '@element-plus/icons-vue'
import { tasksAPI } from '@/api/tasks'
import { TaskStatus, TaskStatusLabels, TaskPriority, type TaskResponse } from '@/types/task'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'

const router = useRouter()
const activeTab = ref('tasks')

// 处理Tab切换
const handleTabChange = (tabName: string) => {
  if (tabName === 'upload') {
    router.push('/main/upload')
  } else if (tabName === 'tasks') {
    router.push('/main/tasks')
  } else if (tabName === 'download') {
    router.push('/main/downloads')
  } else {
    ElMessage.info('分析列表功能开发中')
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
const hasMore = ref(true)

// 任务列表数据
const tasks = ref<TaskResponse[]>([])

// 全部数据缓存（Mock模式用）
let allMockTasks: TaskResponse[] = []

// Mock 数据开关（用于测试，当后端无数据时）
const USE_MOCK_DATA = true

// Mock 测试数据生成器
const generateMockTasks = (count: number = 35): TaskResponse[] => {
  const tasks: TaskResponse[] = []

  const sceneNames = [
    'Living_Room_Final', 'Character_Animation', 'Product_Shot', 'Outdoor_Scene',
    'Interior_Kitchen', 'Bedroom_Night', 'Office_Space', 'Car_Showroom',
    'Forest_Environment', 'Urban_Street', 'Sci_Fi_Corridor', 'Medieval_Castle',
    'Modern_Apartment', 'Industrial_Factory', 'Restaurant_Interior', 'Hotel_Lobby',
    'Swimming_Pool', 'Garden_Landscape', 'Mountain_Scene', 'Beach_Sunset',
    'City_Skyline', 'Underground_Parking', 'Mall_Interior', 'Airport_Terminal',
    'Stadium_Arena', 'Concert_Hall', 'Museum_Gallery', 'Library_Reading_Room',
    'Gym_Fitness_Center', 'Spa_Wellness', 'Rooftop_Terrace', 'Warehouse_Storage',
    'Laboratory_Research', 'Hospital_Ward', 'School_Classroom'
  ]

  const renderers = ['Arnold', 'Redshift', 'V-Ray', 'Octane', 'Corona']
  const mayaVersions = ['2024', '2023', '2022']
  const statuses = [
    TaskStatus.RENDERING,
    TaskStatus.QUEUED,
    TaskStatus.COMPLETED,
    TaskStatus.PAUSED,
    TaskStatus.FAILED,
    TaskStatus.PENDING,
    TaskStatus.CANCELLED,
  ]
  const priorities = [TaskPriority.LOW, TaskPriority.NORMAL, TaskPriority.HIGH, TaskPriority.URGENT]
  const formats = ['exr', 'png', 'jpg', 'tiff', 'tga']

  for (let i = 0; i < count; i++) {
    const status = statuses[i % statuses.length]
    const progress =
      status === TaskStatus.COMPLETED ? 100 :
      status === TaskStatus.QUEUED || status === TaskStatus.PENDING ? 0 :
      status === TaskStatus.CANCELLED ? 0 :
      Math.floor(Math.random() * 90) + 5 // 5-95%

    const sceneName = sceneNames[i % sceneNames.length]
    const version = i > 0 ? `_v${Math.floor(i / sceneNames.length) + 1}` : ''
    const taskName = `${sceneName}${version}`

    const startFrame = Math.floor(Math.random() * 50) + 1
    const endFrame = startFrame + Math.floor(Math.random() * 300) + 100
    const frameStep = [1, 1, 1, 2, 3][Math.floor(Math.random() * 5)] // 大多数是1

    const hoursAgo = Math.random() * 7 * 24 // 0-7天前
    const createdAt = new Date(Date.now() - hoursAgo * 3600 * 1000)
    const startedAt = status !== TaskStatus.PENDING && status !== TaskStatus.QUEUED
      ? new Date(createdAt.getTime() + Math.random() * 3600 * 1000)
      : undefined
    const completedAt = status === TaskStatus.COMPLETED
      ? new Date(startedAt!.getTime() + Math.random() * 10 * 3600 * 1000)
      : undefined

    const estimatedCost = Math.random() * 150 + 30
    const actualCost = progress > 0 ? (estimatedCost * progress) / 100 : undefined

    tasks.push({
      id: `${String(i).padStart(8, '0')}-${Math.random().toString(36).substr(2, 4)}-${Math.random().toString(36).substr(2, 4)}-${Math.random().toString(36).substr(2, 4)}-${Math.random().toString(36).substr(2, 12)}`,
      user_id: 'user-123',
      task_name: taskName,
      scene_file: `scenes/${taskName}.${Math.random() > 0.5 ? 'ma' : 'mb'}`,
      maya_version: mayaVersions[i % mayaVersions.length],
      renderer: renderers[i % renderers.length],
      status,
      priority: priorities[i % priorities.length],
      progress,
      start_frame: startFrame,
      end_frame: endFrame,
      frame_step: frameStep,
      width: [1920, 2560, 3840, 1280, 1920][Math.floor(Math.random() * 5)],
      height: [1080, 1440, 2160, 720, 1080][Math.floor(Math.random() * 5)],
      output_path: `/renders/${sceneName.toLowerCase()}/`,
      output_format: formats[i % formats.length],
      estimated_cost: parseFloat(estimatedCost.toFixed(2)),
      actual_cost: actualCost ? parseFloat(actualCost.toFixed(2)) : undefined,
      error_message: status === TaskStatus.FAILED
        ? ['Missing texture file', 'Out of memory', 'License error', 'Network timeout', 'Plugin not found'][i % 5]
        : undefined,
      created_at: createdAt.toISOString(),
      started_at: startedAt?.toISOString(),
      completed_at: completedAt?.toISOString(),
      updated_at: new Date(Date.now() - Math.random() * 3600 * 1000).toISOString(),
    })
  }

  return tasks
}

// Mock 测试数据
const getMockTasks = (): TaskResponse[] => {
  return generateMockTasks(35)
}

// 加载任务列表（初始加载或重新加载）
const loadTasks = async (reset = true) => {
  if (loading.value) return

  loading.value = true
  try {
    if (reset) {
      currentPage.value = 1
      tasks.value = []
      hasMore.value = true
    }

    // 如果启用 Mock 数据，直接使用本地数据
    if (USE_MOCK_DATA) {
      await new Promise((resolve) => setTimeout(resolve, 500)) // 模拟网络延迟

      // 初始化或重新生成 Mock 数据
      if (reset || allMockTasks.length === 0) {
        allMockTasks = getMockTasks()
      }

      // 应用搜索过滤
      let filteredTasks = allMockTasks
      if (searchKeyword.value) {
        const keyword = searchKeyword.value.toLowerCase()
        filteredTasks = allMockTasks.filter(
          (task) =>
            task.task_name.toLowerCase().includes(keyword) ||
            task.id.toLowerCase().includes(keyword)
        )
      }

      // 懒加载分页
      const start = (currentPage.value - 1) * pageSize.value
      const end = start + pageSize.value
      const newTasks = filteredTasks.slice(start, end)

      if (reset) {
        tasks.value = newTasks
      } else {
        tasks.value = [...tasks.value, ...newTasks]
      }

      total.value = filteredTasks.length
      hasMore.value = end < filteredTasks.length

      console.log('✅ Mock 任务列表加载成功:', {
        total: total.value,
        current: tasks.value.length,
        hasMore: hasMore.value,
        page: currentPage.value,
      })
      return
    }

    // 使用真实 API
    const params = {
      skip: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
      search: searchKeyword.value || undefined,
      time_range: timeRange.value as 'week' | 'month' | 'quarter',
    }

    const response = await tasksAPI.getTasks(params)

    if (reset) {
      tasks.value = response.tasks
    } else {
      tasks.value = [...tasks.value, ...response.tasks]
    }

    total.value = response.total
    hasMore.value = tasks.value.length < total.value

    console.log('✅ 任务列表加载成功:', {
      total: total.value,
      current: tasks.value.length,
      hasMore: hasMore.value,
      page: currentPage.value,
    })
  } catch (error: any) {
    console.error('❌ 加载任务列表失败:', error)
    ElMessage.error(error.message || '加载任务列表失败')
  } finally {
    loading.value = false
  }
}

// 加载更多
const loadMore = async () => {
  if (!hasMore.value || loading.value) return

  currentPage.value++
  await loadTasks(false)
}

// 滚动监听
const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  const scrollHeight = target.scrollHeight
  const scrollTop = target.scrollTop
  const clientHeight = target.clientHeight

  // 距离底部100px时触发加载
  if (scrollHeight - scrollTop - clientHeight < 100) {
    loadMore()
  }
}

// 时间范围变化
const handleTimeRangeChange = () => {
  loadTasks(true)
}

// 搜索
const handleSearch = () => {
  loadTasks(true)
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

// 任务详情相关
const showTaskDetail = ref(false)
const selectedTaskForDetail = ref<TaskResponse | null>(null)

// 打开任务详情
const openTaskDetail = (task: TaskResponse) => {
  selectedTaskForDetail.value = task
  showTaskDetail.value = true
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
        openTaskDetail(task)
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

// 获取任务缩略图
const getTaskThumbnail = (task: TaskResponse): string => {
  // TODO: 后续从后端获取真实的缩略图路径
  // 现在使用本地下载的缩略图（循环使用 40 张图片）
  const thumbnailIndex = (parseInt(task.id.substring(0, 8), 36) % 40) + 1
  return `/thumbnails/thumbnail_${String(thumbnailIndex).padStart(2, '0')}.jpg`
}

// 获取建模软件 Logo
const getModelingSoftwareLogo = (task: TaskResponse): string => {
  const logos = [
    '/logos/maya.svg',
    '/logos/3dsmax.svg',
    '/logos/houdini.svg',
    '/logos/cinema4d.svg',
    '/logos/blender.svg',
    '/logos/unreal-engine.svg',
  ]
  // 根据任务ID的哈希值随机选择一个logo（确保同一个任务总是显示相同的logo）
  const hash = task.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return logos[hash % logos.length]
}

// 快速操作（开始/暂停）
const handleQuickAction = async (task: TaskResponse, action: 'start' | 'pause') => {
  try {
    if (action === 'start') {
      if (USE_MOCK_DATA) {
        ElMessage.success(`任务 "${task.task_name}" 已开始 (Mock模式)`)
        return
      }
      await tasksAPI.resumeTask(task.id)
      ElMessage.success('任务已开始')
    } else {
      if (USE_MOCK_DATA) {
        ElMessage.success(`任务 "${task.task_name}" 已暂停 (Mock模式)`)
        return
      }
      await tasksAPI.pauseTask(task.id)
      ElMessage.success('任务已暂停')
    }
    await loadTasks()
  } catch (error: any) {
    console.error('操作失败:', error)
    ElMessage.error(error.message || '操作失败')
  }
}

// 复制任务ID
const copyTaskId = async (taskId: string) => {
  try {
    await navigator.clipboard.writeText(taskId)
    ElMessage.success('任务ID 已复制')
  } catch (error) {
    console.error('复制失败:', error)
    ElMessage.error('复制失败')
  }
}

// 组件挂载时加载任务列表
onMounted(() => {
  loadTasks()

  // 添加滚动监听
  const taskListEl = document.querySelector('.task-list')
  if (taskListEl) {
    taskListEl.addEventListener('scroll', handleScroll)
  }
})

// 组件卸载时移除监听
onUnmounted(() => {
  const taskListEl = document.querySelector('.task-list')
  if (taskListEl) {
    taskListEl.removeEventListener('scroll', handleScroll)
  }
})
</script>

<style lang="scss" scoped>
.task-list-container {
  padding: 16px 16px 0 16px;
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

// 任务列表容器
.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  min-height: calc(100vh - 340px);
}

// 任务卡片
.task-card {
  display: flex;
  align-items: stretch;
  background-color: $bg-dark;
  border: 1px solid $border-color;
  border-radius: 12px;
  margin-bottom: 16px;
  padding: 16px;
  transition: all $transition-normal;
  cursor: pointer;
  position: relative;
  height: 140px; // 增加列表高度

  &:hover {
    border-color: $primary-color;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transform: translateY(-2px);

    .task-id-wrapper .copy-icon {
      opacity: 1;
    }
  }

  &:last-child {
    margin-bottom: 0;
  }
}

// 缩略图
.task-thumbnail {
  position: relative;
  width: 192px;
  height: 108px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  margin-right: 16px;
  background-color: $bg-darker;

  .thumbnail-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

// 任务信息
.task-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px 0;
  min-width: 0;
  gap: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 28px;
}

.info-header {
  justify-content: space-between;

  .scene-name {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;

    .modeling-software-icon {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      object-fit: contain;
    }

    .task-name {
      font-size: 15px;
      font-weight: 600;
      color: $text-primary;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .task-id-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 12px;
    flex-shrink: 0;

    .task-id-label {
      color: $text-secondary;
      font-size: 11px;
    }

    .task-id {
      font-family: monospace;
      color: $text-secondary;
      font-size: 11px;
    }

    .copy-icon {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.9);
      cursor: pointer;
      opacity: 0;
      transition: all $transition-fast;
      padding: 1px;

      &:hover {
        color: $primary-color;
      }
    }
  }
}

.info-middle {
  .status-tag {
    flex-shrink: 0;
  }

  .info-item {
    color: $text-secondary;
    font-size: 12px;
    flex-shrink: 0;
  }
}

.info-bottom {
  justify-content: space-between;

  .progress-wrapper {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    max-width: 400px;

    :deep(.el-progress) {
      flex: 1;
    }

    .progress-text {
      font-size: 12px;
      color: $text-secondary;
      font-weight: 500;
      min-width: 40px;
      text-align: right;
      flex-shrink: 0;
    }
  }

  .create-time {
    color: $text-disabled;
    font-size: 12px;
    flex-shrink: 0;
    margin-left: 12px;
  }
}

// 右侧操作区
.task-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
  min-width: auto;

  .action-btn {
    width: 100px;
    height: 40px;
    font-size: 14px;
    font-weight: 500;
    flex-shrink: 0;

    .el-icon {
      margin-right: 4px;
      font-size: 16px;
    }
  }
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

// 加载更多提示样式
.load-more-hint,
.no-more-hint {
  text-align: center;
  padding: 20px;
  color: $text-secondary;
  font-size: $font-size-sm;
}
</style>
