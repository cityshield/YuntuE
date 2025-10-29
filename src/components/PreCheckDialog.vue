<template>
  <el-dialog
    v-model="visible"
    title="上传前检查"
    width="650px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="pre-check-dialog"
  >
    <div class="pre-check-content">
      <!-- 总览 -->
      <div class="summary">
        <el-alert
          :type="getSummaryType()"
          :title="getSummaryTitle()"
          :description="getSummaryDesc()"
          show-icon
          :closable="false"
        />
      </div>

      <!-- 问题列表 -->
      <div v-if="hasIssues" class="issues-list">
        <div v-for="(fileResult, idx) in result.results" :key="idx" class="file-section">
          <!-- 文件头部 -->
          <div class="file-header">
            <el-icon class="file-icon"><Document /></el-icon>
            <span class="file-name">{{ fileResult.file_name }}</span>
            <el-tag
              :type="getSeverityTagType(fileResult.severity)"
              size="small"
              class="severity-tag"
            >
              {{ getSeverityText(fileResult.severity) }}
            </el-tag>
          </div>

          <!-- 问题列表 -->
          <div
            v-for="(issue, issueIdx) in fileResult.issues"
            :key="issueIdx"
            class="issue-item"
            :class="`issue-${issue.severity}`"
          >
            <el-icon class="issue-icon">
              <WarningFilled v-if="issue.severity === 'error'" />
              <Warning v-else-if="issue.severity === 'warning'" />
              <InfoFilled v-else />
            </el-icon>
            <div class="issue-content">
              <div class="issue-message">{{ issue.message }}</div>
              <div v-if="issue.details" class="issue-details">
                <div v-if="typeof issue.details === 'string'">{{ issue.details }}</div>
                <pre v-else>{{ formatDetails(issue.details) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 无问题状态 -->
      <div v-else class="no-issues">
        <el-icon :size="48" color="#67c23a"><SuccessFilled /></el-icon>
        <p>所有文件检查通过，可以安全上传</p>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel" :disabled="loading">
          返回修改
        </el-button>
        <el-button
          type="primary"
          @click="handleConfirm"
          :disabled="!canProceed || loading"
          :loading="loading"
        >
          {{ getConfirmButtonText() }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Document, WarningFilled, Warning, InfoFilled, SuccessFilled } from '@element-plus/icons-vue'
import type { PreCheckResponse } from '@/api/upload'

interface Props {
  result: PreCheckResponse
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const visible = ref(true)

const hasIssues = computed(() =>
  props.result.summary.error_count > 0 || props.result.summary.warning_count > 0
)

const canProceed = computed(() => props.result.summary.can_proceed)

const getSummaryType = (): 'success' | 'warning' | 'error' | 'info' => {
  if (props.result.summary.error_count > 0) return 'error'
  if (props.result.summary.warning_count > 0) return 'warning'
  return 'success'
}

const getSummaryTitle = (): string => {
  const { error_count, warning_count, total_files } = props.result.summary
  if (error_count > 0) return `发现 ${error_count} 个错误`
  if (warning_count > 0) return `发现 ${warning_count} 个警告`
  return `检查通过 (${total_files} 个文件)`
}

const getSummaryDesc = (): string => {
  if (!props.result.summary.can_proceed) {
    return '存在严重错误，必须修复后才能上传'
  }
  if (props.result.summary.warning_count > 0) {
    return '可以继续上传，但建议先修复警告项'
  }
  return '所有文件符合要求，可以安全上传'
}

const getSeverityTagType = (severity: string): 'success' | 'warning' | 'danger' | 'info' => {
  switch (severity) {
    case 'error':
      return 'danger'
    case 'warning':
      return 'warning'
    case 'success':
      return 'success'
    default:
      return 'info'
  }
}

const getSeverityText = (severity: string): string => {
  switch (severity) {
    case 'error':
      return '错误'
    case 'warning':
      return '警告'
    case 'success':
      return '通过'
    default:
      return '信息'
  }
}

const formatDetails = (details: any): string => {
  if (typeof details === 'string') return details
  return JSON.stringify(details, null, 2)
}

const getConfirmButtonText = (): string => {
  if (!props.result.summary.can_proceed) {
    return '无法继续(存在错误)'
  }
  if (props.result.summary.warning_count > 0) {
    return '忽略警告并继续'
  }
  return '开始上传'
}

const handleConfirm = () => {
  visible.value = false
  emit('confirm')
}

const handleCancel = () => {
  visible.value = false
  emit('cancel')
}
</script>

<style lang="scss" scoped>
.pre-check-dialog {
  :deep(.el-dialog__header) {
    background-color: $bg-dark;
    border-bottom: 1px solid $border-color;
    padding: 16px 20px;
  }

  :deep(.el-dialog__body) {
    padding: 20px;
    background-color: $bg-dark;
    max-height: 60vh;
    overflow-y: auto;
  }

  :deep(.el-dialog__footer) {
    background-color: $bg-dark;
    border-top: 1px solid $border-color;
    padding: 16px 20px;
  }
}

.pre-check-content {
  .summary {
    margin-bottom: 24px;
  }

  .issues-list {
    .file-section {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid $border-color;

      &:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
      }

      .file-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        margin-bottom: 12px;
        padding: 8px 12px;
        background-color: $bg-light;
        border-radius: $border-radius-small;

        .file-icon {
          color: $primary-color;
          font-size: 18px;
        }

        .file-name {
          flex: 1;
          font-size: $font-size-md;
          color: $text-primary;
        }

        .severity-tag {
          flex-shrink: 0;
        }
      }

      .issue-item {
        display: flex;
        gap: 12px;
        padding: 12px;
        margin-bottom: 8px;
        border-radius: $border-radius-small;
        transition: all $transition-fast;

        &:last-child {
          margin-bottom: 0;
        }

        &.issue-error {
          background-color: rgba(245, 108, 108, 0.1);
          border-left: 3px solid $status-danger;

          .issue-icon {
            color: $status-danger;
          }
        }

        &.issue-warning {
          background-color: rgba(230, 162, 60, 0.1);
          border-left: 3px solid $status-warning;

          .issue-icon {
            color: $status-warning;
          }
        }

        &.issue-info {
          background-color: rgba(64, 158, 255, 0.1);
          border-left: 3px solid $status-info;

          .issue-icon {
            color: $status-info;
          }
        }

        .issue-icon {
          font-size: 18px;
          margin-top: 2px;
          flex-shrink: 0;
        }

        .issue-content {
          flex: 1;
          min-width: 0;

          .issue-message {
            font-size: $font-size-sm;
            color: $text-primary;
            margin-bottom: 4px;
            font-weight: 500;
            word-break: break-word;
          }

          .issue-details {
            font-size: $font-size-xs;
            color: $text-secondary;
            margin-top: 8px;

            pre {
              margin: 0;
              white-space: pre-wrap;
              word-break: break-all;
              font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
              background-color: rgba(0, 0, 0, 0.2);
              padding: 8px;
              border-radius: 4px;
            }
          }
        }
      }
    }
  }

  .no-issues {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: $text-secondary;

    p {
      margin-top: 16px;
      font-size: $font-size-md;
      color: $text-primary;
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
