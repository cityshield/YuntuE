<template>
  <div class="download-task-card" :class="`status-${task.status}`">
    <!-- 文件图标 -->
    <div class="file-icon">
      <el-icon :size="32" color="#409EFF">
        <Document />
      </el-icon>
    </div>

    <!-- 任务信息 -->
    <div class="task-info">
      <!-- 文件名 -->
      <div class="file-name">{{ task.fileName }}</div>

      <!-- 进度信息 -->
      <div class="progress-info">
        <template v-if="task.status === DownloadStatus.DOWNLOADING">
          <span class="size-info">{{ formatSize(task.downloadedSize) }} / {{ formatSize(task.fileSize) }}</span>
          <span class="separator">•</span>
          <span class="speed">{{ formatSpeed(task.speed) }}</span>
          <span class="separator">•</span>
          <span class="remaining-time">剩余 {{ formatTime(task.remainingTime) }}</span>
        </template>

        <template v-else-if="task.status === DownloadStatus.SUCCESS">
          <span class="success-text">下载完成 - {{ formatSize(task.fileSize) }}</span>
        </template>

        <template v-else-if="task.status === DownloadStatus.FAILED">
          <span class="error-text">{{ task.error || '下载失败' }}</span>
        </template>

        <template v-else-if="task.status === DownloadStatus.WAITING">
          <span class="waiting-text">等待下载 - {{ formatSize(task.fileSize) }}</span>
        </template>

        <template v-else-if="task.status === DownloadStatus.PAUSED">
          <span class="paused-text">已暂停 - {{ formatSize(task.downloadedSize) }} / {{ formatSize(task.fileSize) }}</span>
        </template>

        <template v-else-if="task.status === DownloadStatus.VERIFYING">
          <span class="verifying-text">校验中...</span>
        </template>
      </div>

      <!-- 进度条 -->
      <div class="progress-bar-container">
        <el-progress
          :percentage="task.progress"
          :status="getProgressStatus()"
          :show-text="false"
          :stroke-width="4"
        />
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="task-actions">
      <!-- 下载中: 暂停按钮 -->
      <el-button
        v-if="task.status === DownloadStatus.DOWNLOADING"
        link
        type="warning"
        @click="$emit('pause', task.id)"
      >
        <el-icon><VideoPause /></el-icon>
        暂停
      </el-button>

      <!-- 暂停/等待: 继续按钮 -->
      <el-button
        v-else-if="task.status === DownloadStatus.PAUSED || task.status === DownloadStatus.WAITING"
        link
        type="primary"
        @click="$emit('resume', task.id)"
      >
        <el-icon><VideoPlay /></el-icon>
        继续
      </el-button>

      <!-- 失败: 重试按钮 -->
      <el-button
        v-else-if="task.status === DownloadStatus.FAILED"
        link
        type="primary"
        @click="$emit('retry', task.id)"
      >
        <el-icon><Refresh /></el-icon>
        重试
      </el-button>

      <!-- 成功: 打开文件夹按钮 -->
      <el-button
        v-else-if="task.status === DownloadStatus.SUCCESS"
        link
        type="success"
        @click="openFolder"
      >
        <el-icon><FolderOpened /></el-icon>
        打开文件夹
      </el-button>

      <!-- 取消/删除按钮 -->
      <el-button
        link
        type="danger"
        @click="$emit('cancel', task.id)"
      >
        <el-icon><Delete /></el-icon>
        {{ task.status === DownloadStatus.SUCCESS ? '删除' : '取消' }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Document, VideoPause, VideoPlay, Refresh, FolderOpened, Delete } from '@element-plus/icons-vue'
import { DownloadStatus, type DownloadTask } from '@/types/download'
import { useDownload } from '@/composables/useDownload'

// Props
interface Props {
  task: DownloadTask
}

const props = defineProps<Props>()

// Emits
defineEmits<{
  pause: [taskId: string]
  resume: [taskId: string]
  retry: [taskId: string]
  cancel: [taskId: string]
}>()

// Composables
const { formatFileSize, formatSpeed, formatRemainingTime } = useDownload()

// 格式化文件大小
const formatSize = (bytes: number): string => {
  return formatFileSize(bytes)
}

// 格式化时间
const formatTime = (seconds: number): string => {
  return formatRemainingTime(seconds)
}

// 获取进度条状态
const getProgressStatus = (): 'success' | 'exception' | 'warning' | undefined => {
  if (props.task.status === DownloadStatus.SUCCESS) {
    return 'success'
  }
  if (props.task.status === DownloadStatus.FAILED) {
    return 'exception'
  }
  if (props.task.status === DownloadStatus.PAUSED) {
    return 'warning'
  }
  return undefined
}

// 打开文件所在文件夹
const openFolder = () => {
  if (window.electronAPI?.openExternal) {
    // 获取文件所在目录
    const dirPath = props.task.savePath.substring(0, props.task.savePath.lastIndexOf('/'))
    window.electronAPI.openExternal(`file://${dirPath}`)
  }
}
</script>

<style scoped lang="scss">
$border-radius: 8px;
$spacing: 12px;

.download-task-card {
  display: flex;
  align-items: center;
  gap: $spacing;
  padding: $spacing;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: $border-radius;
  transition: all 0.3s;

  &:hover {
    background-color: var(--el-fill-color-light);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  // 根据状态调整样式
  &.status-downloading {
    border-left: 3px solid #409EFF;
  }

  &.status-success {
    border-left: 3px solid #67C23A;
  }

  &.status-failed {
    border-left: 3px solid #F56C6C;
  }

  &.status-paused {
    border-left: 3px solid #E6A23C;
  }

  .file-icon {
    flex-shrink: 0;
  }

  .task-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;

    .file-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--el-text-color-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .progress-info {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      display: flex;
      align-items: center;
      gap: 6px;

      .separator {
        color: var(--el-text-color-disabled);
      }

      .success-text {
        color: #67C23A;
      }

      .error-text {
        color: #F56C6C;
      }

      .waiting-text {
        color: #909399;
      }

      .paused-text {
        color: #E6A23C;
      }

      .verifying-text {
        color: #409EFF;
      }
    }

    .progress-bar-container {
      width: 100%;
    }
  }

  .task-actions {
    flex-shrink: 0;
    display: flex;
    gap: 8px;
  }
}
</style>
