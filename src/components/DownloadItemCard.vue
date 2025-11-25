<template>
  <div class="download-item-card">
    <div class="flex items-center gap-4">
      <!-- 文件图标 -->
      <div class="file-icon-container">
        <el-icon :size="24" :color="getFileIconColor()">
          <component :is="getFileIcon()" />
        </el-icon>
      </div>

      <!-- 内容区域 -->
      <div class="flex-1 min-w-0 grid grid-cols-1 gap-4 items-center" :class="mdGridClass">
        <!-- 文件信息 -->
        <div :class="mdColSpan5">
          <div class="file-info">
            <h3 :title="task.fileName">{{ task.fileName }}</h3>
            <div class="file-meta">
              <span :class="getStatusClass()">{{ getStatusText() }}</span>
              <span class="dot"></span>
              <span>{{ formatFileSize(task.downloadedSize) }} / {{ formatFileSize(task.fileSize) }}</span>
            </div>
          </div>
        </div>

        <!-- 进度和速度 -->
        <div :class="mdColSpan4">
          <div class="progress-section">
            <!-- 进行中的任务显示详细进度 -->
            <template v-if="task.status !== DownloadStatus.SUCCESS && task.status !== DownloadStatus.FAILED">
              <div class="progress-header">
                <span>{{ progress.toFixed(1) }}%</span>
                <span v-if="task.status === DownloadStatus.DOWNLOADING" class="tabular-nums opacity-80">
                  {{ formatFileSize(task.speed) }}/s · 剩余 {{ formatTime(task.remainingTime) }}
                </span>
              </div>
              <div class="progress-bar-bg">
                <div
                  class="progress-bar-fill"
                  :class="getProgressBarClass()"
                  :style="{ width: `${progress}%` }"
                />
              </div>
            </template>

            <!-- 已完成任务 -->
            <template v-else-if="task.status === DownloadStatus.SUCCESS">
              <div class="progress-bar-completed">
                <div class="fill" />
              </div>
            </template>

            <!-- 失败任务 -->
            <template v-else>
              <div class="progress-bar-failed">
                <div class="fill" />
              </div>
            </template>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div :class="mdColSpan3">
          <div class="action-buttons">
            <!-- 下载中状态 -->
            <template v-if="task.status === DownloadStatus.DOWNLOADING">
              <button class="action-btn pause-btn" @click="handlePause" title="暂停">
                <el-icon :size="16"><VideoPause /></el-icon>
              </button>
              <button class="action-btn cancel-btn" @click="handleCancel" title="取消">
                <el-icon :size="16"><Close /></el-icon>
              </button>
            </template>

            <!-- 暂停/等待状态 -->
            <template v-else-if="task.status === DownloadStatus.PAUSED || task.status === DownloadStatus.WAITING">
              <button class="action-btn resume-btn" @click="handleResume" title="继续">
                <el-icon :size="16"><VideoPlay /></el-icon>
              </button>
              <button class="action-btn cancel-btn" @click="handleCancel" title="取消">
                <el-icon :size="16"><Close /></el-icon>
              </button>
            </template>

            <!-- 失败状态 -->
            <template v-else-if="task.status === DownloadStatus.FAILED">
              <button class="action-btn" @click="handleRetry" title="重试">
                <el-icon :size="16"><RefreshRight /></el-icon>
              </button>
              <button class="action-btn delete-btn" @click="handleDelete" title="删除">
                <el-icon :size="16"><Delete /></el-icon>
              </button>
            </template>

            <!-- 已完成状态 -->
            <template v-else-if="task.status === DownloadStatus.SUCCESS">
              <button class="action-btn open-folder-btn" @click="handleOpenFolder">
                <el-icon :size="16"><FolderOpened /></el-icon>
                打开文件夹
              </button>
              <button class="action-btn delete-record-btn" @click="handleDelete" title="删除记录">
                <el-icon :size="16"><Delete /></el-icon>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  VideoPlay,
  VideoPause,
  Close,
  FolderOpened,
  RefreshRight,
  Delete,
  VideoCamera,
  Folder,
  Document,
  DocumentCopy,
} from '@element-plus/icons-vue'
import { DownloadStatus, type DownloadTask } from '@/types/download'
import { useDownload } from '@/composables/useDownload'

interface Props {
  task: DownloadTask
}

interface Emits {
  (e: 'pause', taskId: string): void
  (e: 'resume', taskId: string): void
  (e: 'cancel', taskId: string): void
  (e: 'retry', taskId: string): void
  (e: 'delete', taskId: string): void
  (e: 'open-folder', taskId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { formatFileSize, formatRemainingTime } = useDownload()

// 计算进度百分比
const progress = computed(() => {
  if (props.task.fileSize === 0) return 0
  return (props.task.downloadedSize / props.task.fileSize) * 100
})

// 获取文件图标
const getFileIcon = () => {
  const ext = props.task.fileName.split('.').pop()?.toLowerCase()
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext || '')) return VideoCamera
  if (['zip', 'rar', '7z', 'tar'].includes(ext || '')) return Folder
  if (['js', 'ts', 'json', 'py', 'exr'].includes(ext || '')) return DocumentCopy
  return Document
}

// 获取文件图标颜色
const getFileIconColor = () => {
  const ext = props.task.fileName.split('.').pop()?.toLowerCase()
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext || '')) return '#818cf8' // indigo-400
  if (['zip', 'rar', '7z', 'tar'].includes(ext || '')) return '#fbbf24' // amber-400
  if (['js', 'ts', 'json', 'py', 'exr'].includes(ext || '')) return '#34d399' // emerald-400
  return '#94a3b8' // slate-400
}

// 获取状态文本
const getStatusText = () => {
  switch (props.task.status) {
    case DownloadStatus.DOWNLOADING:
      return '下载中...'
    case DownloadStatus.PAUSED:
      return '已暂停'
    case DownloadStatus.WAITING:
      return '等待中'
    case DownloadStatus.SUCCESS:
      return '下载完成'
    case DownloadStatus.FAILED:
      return '下载失败'
    case DownloadStatus.VERIFYING:
      return 'MD5校验中'
    default:
      return '未知状态'
  }
}

// 获取状态样式类
const getStatusClass = () => {
  switch (props.task.status) {
    case DownloadStatus.DOWNLOADING:
      return 'status-downloading'
    case DownloadStatus.SUCCESS:
      return 'status-completed'
    case DownloadStatus.FAILED:
      return 'status-failed'
    case DownloadStatus.PAUSED:
      return 'status-paused'
    default:
      return 'status-waiting'
  }
}

// 获取进度条样式类
const getProgressBarClass = () => {
  switch (props.task.status) {
    case DownloadStatus.DOWNLOADING:
      return 'downloading'
    case DownloadStatus.PAUSED:
      return 'paused'
    case DownloadStatus.WAITING:
      return 'waiting'
    default:
      return ''
  }
}

// 格式化时间
const formatTime = (seconds: number) => {
  return formatRemainingTime(seconds)
}

// 响应式网格类
const mdGridClass = computed(() => {
  // 在中等屏幕及以上使用 12 列网格
  return window.innerWidth >= 768 ? 'md:grid-cols-12' : ''
})

const mdColSpan5 = computed(() => {
  return window.innerWidth >= 768 ? 'md-col-span-5' : ''
})

const mdColSpan4 = computed(() => {
  return window.innerWidth >= 768 ? 'md-col-span-4' : ''
})

const mdColSpan3 = computed(() => {
  return window.innerWidth >= 768 ? 'md-col-span-3' : ''
})

// 事件处理
const handlePause = () => {
  emit('pause', props.task.id)
}

const handleResume = () => {
  emit('resume', props.task.id)
}

const handleCancel = () => {
  emit('cancel', props.task.id)
}

const handleRetry = () => {
  emit('retry', props.task.id)
}

const handleDelete = () => {
  emit('delete', props.task.id)
}

const handleOpenFolder = () => {
  emit('open-folder', props.task.id)
}
</script>

<style scoped lang="scss">
@import '@/assets/styles/download.scss';
</style>
