<template>
  <div class="upload-task-card">
    <div class="task-header">
      <div class="task-info">
        <el-icon class="file-icon" :size="24">
          <Document />
        </el-icon>
        <div class="file-details">
          <div class="file-name">{{ task.fileName }}</div>
          <div class="file-size">{{ formatFileSize(task.fileSize) }}</div>
        </div>
      </div>
      <div class="task-actions">
        <!-- 暂停按钮 -->
        <el-button
          v-if="task.status === 'uploading'"
          :icon="VideoPause"
          circle
          size="small"
          @click="$emit('pause', task.id)"
          title="暂停"
        />
        <!-- 恢复按钮 -->
        <el-button
          v-if="task.status === 'paused'"
          :icon="VideoPlay"
          circle
          size="small"
          @click="$emit('resume', task.id)"
          title="恢复"
        />
        <!-- 重试按钮 -->
        <el-button
          v-if="task.status === 'failed'"
          :icon="Refresh"
          circle
          size="small"
          @click="$emit('resume', task.id)"
          title="重试"
        />
        <!-- 删除按钮 -->
        <el-button
          :icon="Delete"
          circle
          size="small"
          @click="$emit('remove', task.id)"
          title="删除"
        />
      </div>
    </div>

    <!-- 进度条 -->
    <div v-if="status !== 'success'" class="task-progress">
      <el-progress
        :percentage="progress"
        :status="getProgressStatus(status)"
        :stroke-width="8"
        :format="(percentage: number) => getProgressFormat(percentage, status)"
      />
    </div>

    <!-- 状态信息 -->
    <div class="task-status">
      <div class="status-left">
        <!-- 状态标签 (无动画) -->
        <span class="status-label" :class="getStatusClass(status)">
          {{ getStatusText(status) }}
        </span>

        <!-- 状态提示信息（打包依赖等） -->
        <span v-if="task.statusMessage" class="status-message">
          {{ task.statusMessage }}
        </span>

        <!-- 上传速度和剩余时间 -->
        <span v-else-if="status === 'uploading'" class="status-info">
          {{ formatSpeed(speed) }} · 剩余 {{ formatTime(remainingTime) }}
        </span>

        <!-- 错误信息 -->
        <span v-if="status === 'failed' && task.error" class="error-info">
          {{ task.error }}
        </span>
      </div>

      <div class="status-right">
        <span class="uploaded-size">
          {{ formatFileSize(uploadedSize) }} / {{ formatFileSize(task.fileSize) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Document, VideoPause, VideoPlay, Refresh, Delete } from '@element-plus/icons-vue'
import type { UploadTask, UploadStatus } from '@/types/upload'

const props = defineProps<{
  task: UploadTask
}>()

// 使用 computed 确保响应式更新
const progress = computed(() => props.task.progress)
const uploadedSize = computed(() => props.task.uploadedSize)
const speed = computed(() => props.task.speed)
const remainingTime = computed(() => props.task.remainingTime)
const status = computed(() => props.task.status)

defineEmits<{
  pause: [taskId: string]
  resume: [taskId: string]
  cancel: [taskId: string]
  remove: [taskId: string]
}>()

const getStatusClass = (status: UploadStatus): string => {
  const classMap: Record<string, string> = {
    waiting: 'status-waiting',
    uploading: 'status-uploading',
    paused: 'status-paused',
    success: 'status-success',
    failed: 'status-failed',
    canceled: 'status-canceled',
  }
  return classMap[status] || 'status-default'
}

const getStatusText = (status: UploadStatus): string => {
  const textMap: Record<string, string> = {
    waiting: '等待中',
    uploading: '上传中',
    paused: '已暂停',
    success: '上传成功',
    failed: '上传失败',
    canceled: '已取消',
  }
  return textMap[status] || status
}

const getProgressStatus = (status: UploadStatus): '' | 'success' | 'exception' | 'warning' => {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'exception'
  // 暂停时不使用 warning 状态，保持默认样式并显示百分比
  return ''
}

const getProgressFormat = (percentage: number, status: UploadStatus): string => {
  // 暂停时显示百分比
  if (status === 'paused') {
    return `${percentage}%`
  }
  // 其他状态使用默认格式
  return `${percentage}%`
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatFileSize(bytesPerSecond)}/s`
}

const formatTime = (seconds: number): string => {
  if (!seconds || !isFinite(seconds)) return '--:--'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
</script>

<style lang="scss" scoped>
.upload-task-card {
  background-color: $bg-light;
  border: 1px solid $border-color;
  border-radius: $border-radius-medium;
  padding: 16px;
  margin-bottom: 12px;
  transition: all $transition-fast;

  &:hover {
    background-color: $bg-hover;
    box-shadow: $shadow-medium;
  }

  .task-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;

    .task-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;

      .file-icon {
        color: $primary-color;
        flex-shrink: 0;
      }

      .file-details {
        flex: 1;
        min-width: 0;

        .file-name {
          font-size: $font-size-md;
          font-weight: 500;
          color: $text-primary;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-size {
          font-size: $font-size-xs;
          color: $text-secondary;
          margin-top: 4px;
        }
      }
    }

    .task-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
  }

  .task-progress {
    margin-bottom: 12px;
  }

  .task-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: $font-size-xs;

    .status-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;

      .status-label {
        display: inline-block;
        padding: 2px 10px;
        font-size: $font-size-xs;
        border-radius: 4px;
        font-weight: 500;
        white-space: nowrap;

        // 移除所有动画效果
        transition: none;
        animation: none;

        &.status-waiting {
          background-color: rgba(144, 147, 153, 0.1);
          color: #909399;
        }

        &.status-uploading {
          background-color: rgba(230, 162, 60, 0.1);
          color: #e6a23c;
        }

        &.status-paused {
          background-color: rgba(144, 147, 153, 0.1);
          color: #909399;
        }

        &.status-success {
          background-color: rgba(103, 194, 58, 0.1);
          color: #67c23a;
        }

        &.status-failed {
          background-color: rgba(245, 108, 108, 0.1);
          color: #f56c6c;
        }

        &.status-canceled {
          background-color: rgba(144, 147, 153, 0.1);
          color: #909399;
        }

        &.status-default {
          background-color: rgba(144, 147, 153, 0.1);
          color: #909399;
        }
      }

      .status-message {
        color: $primary-color;
        font-weight: 500;
      }

      .status-info {
        color: $text-secondary;
      }

      .error-info {
        color: $status-danger;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .status-right {
      flex-shrink: 0;

      .uploaded-size {
        color: $text-secondary;
      }
    }
  }
}
</style>
