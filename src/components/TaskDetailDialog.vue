<template>
  <el-dialog
    v-model="visible"
    width="90%"
    :close-on-click-modal="false"
    class="task-detail-dialog"
    @close="handleClose"
  >
    <template #header>
      <div class="dialog-header">
        <span class="dialog-title">任务详情 - {{ task?.task_name || '' }}</span>
        <div v-if="task" class="dialog-task-id-wrapper">
          <span class="task-id-label">任务ID</span>
          <span class="task-id">{{ formatTaskId(task.id) }}</span>
          <el-icon class="copy-icon" @click.stop="copyTaskId(task.id)">
            <DocumentCopy />
          </el-icon>
        </div>
      </div>
    </template>
    <div v-if="task" class="task-detail-container">
      <!-- 标题栏信息 -->
      <div class="detail-header">
        <div class="header-item">
          <span class="label">帧范围</span>
          <span class="value">{{ getFrameRangeText() }}</span>
        </div>
        <div class="header-item">
          <span class="label">分辨率</span>
          <span class="value">{{ getResolutionText() }}</span>
        </div>
        <div class="header-item">
          <span class="label">渲染器版本</span>
          <span class="value">{{ getRendererText() }}</span>
        </div>
        <div class="header-item">
          <span class="label">提交时间</span>
          <span class="value">{{ formatDate(task.created_at) }}</span>
        </div>
      </div>

      <!-- 缩略图网格 -->
      <div class="thumbnails-grid">
        <div
          v-for="frame in frameThumbnails"
          :key="frame.frameNumber"
          class="thumbnail-item"
        >
          <div class="thumbnail-wrapper">
            <!-- 待渲染状态：显示纯色色块 -->
            <div v-if="frame.status === 'pending'" class="pending-placeholder">
              <span class="pending-text">待渲染</span>
            </div>
            <!-- 其他状态：显示缩略图 -->
            <template v-else>
              <img
                :src="getThumbnailImage(frame.frameNumber)"
                :alt="`第${frame.frameNumber}帧`"
                class="thumbnail-image"
              />
              <!-- 渲染状态覆盖层 -->
              <div
                v-if="frame.status !== 'completed'"
                :class="['status-overlay', `status-${frame.status}`]"
              >
                <el-icon v-if="frame.status === 'rendering'">
                  <Loading />
                </el-icon>
                <el-icon v-else-if="frame.status === 'failed'">
                  <CircleClose />
                </el-icon>
              </div>
            </template>
          </div>
          <div class="thumbnail-label">第{{ frame.frameNumber }}帧</div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  DocumentCopy,
  Loading,
  CircleClose,
} from '@element-plus/icons-vue'
import type { TaskResponse } from '@/types/task'

interface FrameThumbnail {
  frameNumber: number
  status: 'completed' | 'rendering' | 'pending' | 'failed'
}

interface Props {
  modelValue: boolean
  task: TaskResponse | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

// 生成帧缩略图数据
const frameThumbnails = computed<FrameThumbnail[]>(() => {
  if (!props.task) return []

  const frames: FrameThumbnail[] = []
  const startFrame = props.task.start_frame || 1
  const endFrame = props.task.end_frame || 100
  const frameStep = props.task.frame_step || 1

  // 根据任务状态和进度生成帧状态
  const taskStatus = props.task.status
  const progress = props.task.progress || 0

  // 计算总帧数
  const totalFrames = Math.floor((endFrame - startFrame) / frameStep) + 1
  const completedFrames = Math.floor((totalFrames * progress) / 100)

  // 生成Mock数据：24、48、72、96、192等帧号
  // 如果任务有实际帧范围，使用实际帧；否则使用Mock帧号
  const mockFrameNumbers = [24, 48, 72, 96, 192]
  const actualFrames: number[] = []

  // 如果任务有帧范围，生成实际帧号列表（限制数量，避免太多）
  if (startFrame && endFrame) {
    const maxFrames = 20 // 最多显示20帧
    let count = 0
    for (let i = startFrame; i <= endFrame && count < maxFrames; i += frameStep) {
      actualFrames.push(i)
      count++
    }
  } else {
    // 否则使用Mock帧号
    actualFrames.push(...mockFrameNumbers)
  }

  // 生成缩略图数据
  actualFrames.forEach((frameNumber, index) => {
    let status: FrameThumbnail['status'] = 'pending'

    if (taskStatus === 5) {
      // 已完成
      status = 'completed'
    } else if (taskStatus === 6) {
      // 失败
      status = index < completedFrames ? 'completed' : 'failed'
    } else if (taskStatus === 3) {
      // 渲染中
      if (index < completedFrames) {
        status = 'completed'
      } else if (index === completedFrames) {
        status = 'rendering'
      } else {
        status = 'pending'
      }
    } else {
      // 其他状态
      status = index < completedFrames ? 'completed' : 'pending'
    }

    frames.push({
      frameNumber,
      status,
    })
  })

  return frames
})

// 获取帧范围文本
const getFrameRangeText = (): string => {
  if (!props.task) return '-'
  const start = props.task.start_frame || 1
  const end = props.task.end_frame || 100
  const step = props.task.frame_step || 1

  if (step === 1) {
    return `${start}-${end}`
  }
  return `${start}-${end}[${step}]`
}

// 获取分辨率文本
const getResolutionText = (): string => {
  if (!props.task) return '-'
  const width = props.task.width || 1920
  const height = props.task.height || 1080
  return `${width} × ${height}`
}

// 获取渲染器文本
const getRendererText = (): string => {
  if (!props.task) return '-'
  const renderer = props.task.renderer || 'Unknown'
  const mayaVersion = props.task.maya_version || ''
  return mayaVersion ? `${renderer} (Maya ${mayaVersion})` : renderer
}

// 格式化任务ID（取前8位）
const formatTaskId = (id: string): string => {
  return id.substring(0, 8).toUpperCase()
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

// 获取缩略图图片
const getThumbnailImage = (frameNumber: number): string => {
  // 使用帧号计算缩略图索引（循环使用40张图片）
  const thumbnailIndex = (frameNumber % 40) + 1
  return `/thumbnails/thumbnail_${String(thumbnailIndex).padStart(2, '0')}.jpg`
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

// 关闭对话框
const handleClose = () => {
  visible.value = false
}
</script>

<style lang="scss" scoped>
.task-detail-dialog {
  :deep(.el-dialog) {
    position: fixed;
    top: 20px;
    margin-top: 0;
    margin-bottom: 20px;
    max-height: calc(100vh - 40px);
    display: flex;
    flex-direction: column;
  }

  :deep(.el-dialog__header) {
    padding: 20px 24px;
    border-bottom: 1px solid $border-color;
    flex-shrink: 0;
  }

  :deep(.el-dialog__body) {
    padding: 0;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }
}

// 对话框标题栏
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  .dialog-title {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $text-primary;
  }

  .dialog-task-id-wrapper {
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

  // hover时显示复制按钮
  &:hover .dialog-task-id-wrapper .copy-icon {
    opacity: 1;
  }
}

.task-detail-container {
  padding: 24px;
}

// 标题栏
.detail-header {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 20px 24px;
  background-color: $bg-darker;
  border-radius: $border-radius-medium;
  margin-bottom: 24px;
  flex-wrap: wrap;

  .header-item {
    display: flex;
    align-items: center;
    gap: 8px;

    .label {
      color: $text-secondary;
      font-size: $font-size-sm;
      white-space: nowrap;
    }

    .value {
      color: $text-primary;
      font-size: $font-size-md;
      font-weight: 500;
    }
  }
}

// 缩略图网格
.thumbnails-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  padding: 0;

  .thumbnail-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;

    .thumbnail-wrapper {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      border-radius: $border-radius-medium;
      overflow: hidden;
      background-color: $bg-darker;
      border: 1px solid $border-color;
      transition: all $transition-fast;

      &:hover {
        border-color: $primary-color;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transform: translateY(-2px);
      }

      // 待渲染占位符
      .pending-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: $bg-light;
        border: 1px solid $border-color;

        .pending-text {
          color: $text-secondary;
          font-size: $font-size-md;
          font-weight: 500;
        }
      }

      .thumbnail-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .status-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(2px);

        .el-icon {
          font-size: 32px;
        }

        &.status-rendering {
          background-color: rgba(37, 99, 235, 0.4);

          .el-icon {
            color: $primary-color;
            animation: rotating 1s linear infinite;
          }
        }

        &.status-failed {
          background-color: rgba(245, 108, 108, 0.4);

          .el-icon {
            color: $status-danger;
          }
        }
      }
    }

    .thumbnail-label {
      color: $text-secondary;
      font-size: $font-size-sm;
      text-align: center;
    }
  }
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

