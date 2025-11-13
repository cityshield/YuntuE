<template>
  <el-dialog
    v-model="dialogVisible"
    title="软件更新"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="updateStatus !== 'progress'"
    class="update-dialog"
  >
    <!-- 检查更新中 -->
    <div v-if="updateStatus === 'checking'" class="update-content">
      <el-icon class="is-loading" :size="48">
        <Loading />
      </el-icon>
      <p class="status-text">正在检查更新...</p>
    </div>

    <!-- 发现新版本 -->
    <div v-else-if="updateStatus === 'available'" class="update-content">
      <el-icon :size="48" color="#2563eb">
        <Download />
      </el-icon>
      <p class="status-text">发现新版本</p>
      <div class="version-info">
        <div class="info-row">
          <span class="label">当前版本:</span>
          <span class="value">{{ currentVersion }}</span>
        </div>
        <div class="info-row">
          <span class="label">最新版本:</span>
          <span class="value highlight">{{ newVersion }}</span>
        </div>
      </div>
      <div v-if="releaseNotes" class="release-notes">
        <div class="notes-title">更新内容:</div>
        <div class="notes-content" v-html="releaseNotes"></div>
      </div>
    </div>

    <!-- 下载进度 -->
    <div v-else-if="updateStatus === 'progress'" class="update-content">
      <p class="status-text">正在下载更新...</p>
      <el-progress
        :percentage="downloadPercent"
        :stroke-width="12"
        striped
        striped-flow
      />
      <div class="download-info">
        <span>{{ formatBytes(downloadTransferred) }} / {{ formatBytes(downloadTotal) }}</span>
        <span>{{ formatSpeed(downloadSpeed) }}</span>
      </div>
    </div>

    <!-- 下载完成 -->
    <div v-else-if="updateStatus === 'downloaded'" class="update-content">
      <el-icon :size="48" color="#67c23a">
        <CircleCheck />
      </el-icon>
      <p class="status-text">更新已下载完成</p>
      <p class="status-hint">点击"立即安装"重启应用以完成更新</p>
    </div>

    <!-- 已是最新版本 -->
    <div v-else-if="updateStatus === 'not-available'" class="update-content">
      <el-icon :size="48" color="#67c23a">
        <CircleCheck />
      </el-icon>
      <p class="status-text">已是最新版本</p>
      <p class="status-hint">当前版本: {{ currentVersion }}</p>
    </div>

    <!-- 错误 -->
    <div v-else-if="updateStatus === 'error'" class="update-content">
      <el-icon :size="48" color="#f56c6c">
        <CircleClose />
      </el-icon>
      <p class="status-text">更新失败</p>
      <p class="error-message">{{ errorMessage }}</p>
    </div>

    <template #footer v-if="updateStatus !== 'checking' && updateStatus !== 'progress'">
      <div class="dialog-footer">
        <el-button
          v-if="updateStatus === 'available'"
          @click="handleCancel"
        >
          稍后提醒
        </el-button>
        <el-button
          v-if="updateStatus === 'available'"
          type="primary"
          @click="handleDownload"
          :loading="downloading"
        >
          立即下载
        </el-button>
        <el-button
          v-if="updateStatus === 'downloaded'"
          @click="handleCancel"
        >
          稍后安装
        </el-button>
        <el-button
          v-if="updateStatus === 'downloaded'"
          type="primary"
          @click="handleInstall"
        >
          立即安装
        </el-button>
        <el-button
          v-if="updateStatus === 'not-available' || updateStatus === 'error'"
          type="primary"
          @click="handleClose"
        >
          确定
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Loading,
  Download,
  CircleCheck,
  CircleClose,
} from '@element-plus/icons-vue'

const dialogVisible = ref(false)
const updateStatus = ref<'checking' | 'available' | 'progress' | 'downloaded' | 'not-available' | 'error' | null>(null)
const currentVersion = ref('')
const newVersion = ref('')
const releaseNotes = ref('')
const downloadPercent = ref(0)
const downloadTransferred = ref(0)
const downloadTotal = ref(0)
const downloadSpeed = ref(0)
const downloading = ref(false)
const errorMessage = ref('')

// 获取当前版本
onMounted(async () => {
  if (window.electronAPI) {
    currentVersion.value = await window.electronAPI.getAppVersion()

    // 监听更新状态
    window.electronAPI.onUpdateStatus((status: any) => {
      console.log('[UpdateDialog] Received update status:', status)

      switch (status.type) {
        case 'checking':
          updateStatus.value = 'checking'
          dialogVisible.value = true
          break

        case 'available':
          updateStatus.value = 'available'
          newVersion.value = status.version
          releaseNotes.value = formatReleaseNotes(status.releaseNotes)
          dialogVisible.value = true
          break

        case 'not-available':
          // 只有手动检查时才显示"已是最新"对话框
          if (dialogVisible.value) {
            updateStatus.value = 'not-available'
          }
          break

        case 'progress':
          updateStatus.value = 'progress'
          downloadPercent.value = Math.floor(status.percent)
          downloadTransferred.value = status.transferred
          downloadTotal.value = status.total
          downloadSpeed.value = status.bytesPerSecond
          break

        case 'downloaded':
          updateStatus.value = 'downloaded'
          downloading.value = false
          break

        case 'error':
          updateStatus.value = 'error'
          errorMessage.value = status.message
          downloading.value = false
          dialogVisible.value = true
          break
      }
    })
  }
})

// 格式化更新说明
const formatReleaseNotes = (notes: string | string[]): string => {
  if (!notes) return ''

  if (Array.isArray(notes)) {
    return notes.map(note => `<p>${note}</p>`).join('')
  }

  return notes
}

// 格式化文件大小
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

// 格式化下载速度
const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatBytes(bytesPerSecond)}/s`
}

// 开始下载
const handleDownload = async () => {
  downloading.value = true

  try {
    if (!window.electronAPI) return
    const result = await window.electronAPI.downloadUpdate()
    if (!result.success) {
      ElMessage.error(`下载失败: ${result.error}`)
      downloading.value = false
    }
  } catch (error: any) {
    console.error('[UpdateDialog] Download error:', error)
    ElMessage.error(`下载失败: ${error.message}`)
    downloading.value = false
  }
}

// 安装更新
const handleInstall = () => {
  if (!window.electronAPI) return
  window.electronAPI.installUpdate()
}

// 取消/稍后提醒
const handleCancel = () => {
  dialogVisible.value = false
  updateStatus.value = null
}

// 关闭对话框
const handleClose = () => {
  dialogVisible.value = false
  updateStatus.value = null
}

// 暴露方法供外部调用
defineExpose({
  checkForUpdates: async () => {
    dialogVisible.value = true
    updateStatus.value = 'checking'

    try {
      if (!window.electronAPI) return
      const result = await window.electronAPI.checkForUpdates()
      if (!result.success) {
        updateStatus.value = 'error'
        errorMessage.value = result.error || '检查更新失败'
      }
    } catch (error: any) {
      console.error('[UpdateDialog] Check error:', error)
      updateStatus.value = 'error'
      errorMessage.value = error.message || '检查更新失败'
    }
  },
})
</script>

<style lang="scss" scoped>
.update-dialog {
  :deep(.el-dialog__header) {
    background-color: $bg-darker;
    border-bottom: 1px solid $border-color;
    padding: 16px 20px;

    .el-dialog__title {
      color: $text-primary;
      font-size: $font-size-lg;
      font-weight: 500;
    }
  }

  :deep(.el-dialog__body) {
    padding: 32px 24px;
    background-color: $bg-dark;
  }

  :deep(.el-dialog__footer) {
    background-color: $bg-darker;
    border-top: 1px solid $border-color;
    padding: 16px 20px;
  }
}

.update-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-height: 200px;
  justify-content: center;

  .el-icon {
    margin-bottom: 20px;

    &.is-loading {
      animation: rotating 2s linear infinite;
    }
  }

  .status-text {
    font-size: 18px;
    font-weight: 500;
    color: $text-primary;
    margin: 0 0 12px 0;
  }

  .status-hint {
    font-size: 14px;
    color: $text-secondary;
    margin: 0;
  }

  .error-message {
    font-size: 14px;
    color: #f56c6c;
    margin: 12px 0 0 0;
    padding: 12px;
    background-color: rgba(245, 108, 108, 0.1);
    border-radius: 4px;
    width: 100%;
  }
}

.version-info {
  width: 100%;
  margin: 20px 0;
  padding: 16px;
  background-color: $bg-light;
  border-radius: 8px;

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;

    &:not(:last-child) {
      border-bottom: 1px solid $border-color;
    }

    .label {
      font-size: 14px;
      color: $text-secondary;
    }

    .value {
      font-size: 14px;
      color: $text-primary;
      font-weight: 500;

      &.highlight {
        color: #2563eb;
        font-size: 16px;
      }
    }
  }
}

.release-notes {
  width: 100%;
  margin-top: 20px;
  text-align: left;

  .notes-title {
    font-size: 14px;
    font-weight: 500;
    color: $text-primary;
    margin-bottom: 12px;
  }

  .notes-content {
    max-height: 200px;
    overflow-y: auto;
    padding: 12px;
    background-color: $bg-light;
    border-radius: 4px;
    font-size: 13px;
    color: $text-secondary;
    line-height: 1.6;

    :deep(p) {
      margin: 8px 0;
    }
  }
}

.download-info {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 12px;
  font-size: 13px;
  color: $text-secondary;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
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
