<template>
  <el-dialog
    v-model="visible"
    title="Maya 场景打包详情"
    width="75%"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    class="package-detail-dialog"
  >
    <!-- 打包过程 -->
    <div
      v-if="packageInfo.status === 'analyzing' || packageInfo.status === 'packaging'"
      class="status-section processing"
    >
      <el-icon class="is-loading" :size="48">
        <Loading />
      </el-icon>
      <p class="status-text">
        {{ packageInfo.status === 'analyzing' ? '正在分析 Maya 场景...' : '正在打包场景文件...' }}
      </p>
      <p class="status-desc">{{ packageInfo.progress || '请稍候...' }}</p>
      <div class="process-content">
        <!-- 移除虚假的进度条，只显示实际日志 -->
        <div class="log-container" :ref="(el) => { if (el) logContainerRefs.push(el as HTMLElement) }">
          <ul class="process-log" v-if="packageInfo.progressLogs && packageInfo.progressLogs.length">
            <li v-for="(log, index) in packageInfo.progressLogs" :key="index" class="log-line">
              {{ log }}
            </li>
          </ul>
          <div v-else class="process-placeholder">正在准备执行流程...</div>
        </div>
      </div>
    </div>

    <div v-else-if="packageInfo.status === 'completed'" class="package-details">
      <!-- 场景文件信息 -->
      <div class="detail-section">
        <div class="section-header">
          <el-icon :size="20"><Document /></el-icon>
          <span class="section-title">场景文件</span>
        </div>
        <div class="section-content">
          <div class="info-row">
            <span class="label">名称:</span>
            <span class="value">{{ packageInfo.sceneFileName }}</span>
          </div>
          <div class="info-row">
            <span class="label">大小:</span>
            <span class="value">{{ formatSize(packageInfo.sceneFileSize) }}</span>
          </div>
        </div>
      </div>

      <!-- 依赖文件统计 -->
      <div class="detail-section">
        <div class="section-header">
          <el-icon :size="20"><FolderOpened /></el-icon>
          <span class="section-title">依赖文件</span>
        </div>
        <div class="section-content">
          <div class="dependency-stats">
            <div v-if="packageInfo.dependencies.textureCount > 0" class="stat-item">
              <el-icon :size="16" color="#409eff"><Picture /></el-icon>
              <span class="stat-label">贴图文件:</span>
              <span class="stat-value">{{ packageInfo.dependencies.textureCount }} 个</span>
              <span class="stat-size">{{ formatSize(packageInfo.dependencies.textureSize) }}</span>
            </div>
            <div v-if="packageInfo.dependencies.cacheCount > 0" class="stat-item">
              <el-icon :size="16" color="#67c23a"><Files /></el-icon>
              <span class="stat-label">缓存文件:</span>
              <span class="stat-value">{{ packageInfo.dependencies.cacheCount }} 个</span>
              <span class="stat-size">{{ formatSize(packageInfo.dependencies.cacheSize) }}</span>
            </div>
            <div v-if="packageInfo.dependencies.referenceCount > 0" class="stat-item">
              <el-icon :size="16" color="#e6a23c"><Link /></el-icon>
              <span class="stat-label">引用文件:</span>
              <span class="stat-value">{{ packageInfo.dependencies.referenceCount }} 个</span>
              <span class="stat-size">{{ formatSize(packageInfo.dependencies.referenceSize) }}</span>
            </div>
            <div v-if="packageInfo.dependencies.xgenCount > 0" class="stat-item">
              <el-icon :size="16" color="#f56c6c"><Grid /></el-icon>
              <span class="stat-label">XGen 文件:</span>
              <span class="stat-value">{{ packageInfo.dependencies.xgenCount }} 个</span>
              <span class="stat-size">{{ formatSize(packageInfo.dependencies.xgenSize) }}</span>
            </div>
            <div v-if="totalDependencies === 0" class="no-dependencies">
              <el-icon :size="16"><Warning /></el-icon>
              <span>未检测到依赖文件</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 渲染参数 -->
      <div class="detail-section" v-if="packageInfo.renderSettings">
        <div class="section-header">
          <el-icon :size="20"><Grid /></el-icon>
          <span class="section-title">渲染参数</span>
        </div>
        <div class="section-content render-settings">
          <div class="info-row">
            <span class="label">渲染器:</span>
            <span class="value">
              {{ packageInfo.renderSettings.renderer || '未知' }}
              <span v-if="packageInfo.renderSettings.renderer_version"> ({{ packageInfo.renderSettings.renderer_version }})</span>
            </span>
          </div>
          <div class="info-row">
            <span class="label">分辨率:</span>
            <span class="value">
              {{
                formatResolution(
                  packageInfo.renderSettings.resolution?.width,
                  packageInfo.renderSettings.resolution?.height
                )
              }}
            </span>
          </div>
          <div class="info-row">
            <span class="label">帧范围:</span>
            <span class="value">
              {{
                formatFrameRange(
                  packageInfo.renderSettings.frame_range?.start_frame,
                  packageInfo.renderSettings.frame_range?.end_frame,
                  packageInfo.renderSettings.frame_range?.by_frame_step
                )
              }}
            </span>
          </div>
          <div class="info-row" v-if="packageInfo.renderSettings.render_device">
            <span class="label">渲染设备:</span>
            <span class="value">{{ formatRenderDevice(packageInfo.renderSettings.render_device) }}</span>
          </div>
          <div class="info-row" v-if="packageInfo.renderSettings.output_format_actual">
            <span class="label">输出格式:</span>
            <span class="value">{{ packageInfo.renderSettings.output_format_actual }}</span>
          </div>
          <div class="info-row" v-if="packageInfo.renderSettings.output_path">
            <span class="label">输出路径:</span>
            <span class="value">{{ packageInfo.renderSettings.output_path }}</span>
          </div>
        </div>
      </div>

      <!-- 打包结果 -->
      <div class="detail-section highlight">
        <div class="section-header">
          <el-icon :size="20"><Box /></el-icon>
          <span class="section-title">打包结果</span>
        </div>
        <div class="section-content">
          <div class="info-row">
            <span class="label">文件名:</span>
            <span class="value">{{ packageInfo.zipFileName }}</span>
          </div>
          <div class="info-row">
            <span class="label">大小:</span>
            <span class="value">{{ formatSize(packageInfo.zipFileSize) }}</span>
          </div>
          <div class="info-row">
            <span class="label">包含:</span>
            <span class="value">场景文件 + {{ totalDependencies }} 个依赖文件</span>
          </div>
        </div>
      </div>

      <!-- 执行过程 -->
      <div class="detail-section">
        <div class="section-header">
          <el-icon :size="20"><Document /></el-icon>
          <span class="section-title">执行过程</span>
        </div>
        <div class="section-content process-content">
          <div class="log-container" :ref="(el) => { if (el && !logContainerRefs.includes(el as HTMLElement)) logContainerRefs.push(el as HTMLElement) }">
            <ul class="process-log" v-if="packageInfo.progressLogs && packageInfo.progressLogs.length">
              <li v-for="(log, index) in packageInfo.progressLogs" :key="index" class="log-line">
                {{ log }}
              </li>
            </ul>
            <div v-else class="process-placeholder">暂无执行日志</div>
          </div>
        </div>
      </div>

      <!-- 说明提示 -->
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="upload-tip"
      >
        <template #title>
          <span>将上传打包后的 ZIP 文件，服务器会自动解压并处理依赖关系</span>
        </template>
      </el-alert>
    </div>

    <div v-else-if="packageInfo.status === 'error'" class="status-section error">
      <el-icon :size="48" color="#f56c6c">
        <CircleClose />
      </el-icon>
      <p class="status-text error-text">打包失败</p>
      <p class="status-desc">{{ packageInfo.error || '请检查 Maya 环境后重试' }}</p>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        class="fallback-tip"
      >
        <template #title>
          <span>请修复错误或重新选择场景后重试打包</span>
        </template>
      </el-alert>
      <div class="process-content">
        <div class="log-container" ref="logContainerRef">
          <ul class="process-log error-log" v-if="packageInfo.progressLogs && packageInfo.progressLogs.length">
            <li v-for="(log, index) in packageInfo.progressLogs" :key="index" class="log-line">
              {{ log }}
            </li>
          </ul>
          <div v-else class="process-placeholder">暂无执行日志</div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <template #footer>
      <div class="dialog-footer">
        <el-button
          v-if="packageInfo.status !== 'completed'"
          @click="handleCancel"
          :disabled="loading"
        >
          {{ packageInfo.status === 'error' ? '关闭' : '取消打包' }}
        </el-button>
        <el-button
          v-if="packageInfo.status === 'completed' && showDetailButton"
          @click="showDetailList"
          :disabled="loading"
        >
          查看详细清单
        </el-button>
        <el-button
          v-if="packageInfo.status === 'completed'"
          @click="handleCancel"
          :disabled="loading"
        >
          取消
        </el-button>
        <el-button
          v-if="packageInfo.status === 'completed'"
          type="primary"
          @click="handleConfirm"
          :loading="loading"
        >
          确认上传
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import type { PackageInfo } from '@/types/upload'
import {
  Loading,
  Document,
  FolderOpened,
  Picture,
  Files,
  Link,
  Grid,
  Box,
  Warning,
  CircleClose,
} from '@element-plus/icons-vue'

interface Props {
  packageInfo: PackageInfo
  showDetailButton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showDetailButton: false,
})

const emit = defineEmits<{
  confirm: []
  cancel: []
  showDetail: []
}>()

const visible = ref(true)
const loading = ref(false)
const logContainerRefs = ref<HTMLElement[]>([])

// 自动滚动日志到底部
const scrollToBottom = () => {
  nextTick(() => {
    // 滚动所有日志容器到底部
    logContainerRefs.value.forEach((container) => {
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  })
}

// 监听日志更新，自动滚动
watch(
  () => props.packageInfo.progressLogs,
  () => {
    scrollToBottom()
  },
  { deep: true }
)

onMounted(() => {
  scrollToBottom()
})

const totalDependencies = computed(() => {
  if (typeof props.packageInfo.totalDependencies === 'number') {
    return props.packageInfo.totalDependencies
  }
  const deps = props.packageInfo.dependencies
  return (
    deps.textureCount +
    deps.cacheCount +
    deps.referenceCount +
    deps.xgenCount +
    (deps.otherCount || 0)
  )
})

const formatSize = (bytes: number | undefined): string => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const formatResolution = (width?: number, height?: number): string => {
  if (!width || !height) return '未知'
  return `${width} x ${height}`
}

const formatFrameRange = (start?: number, end?: number, step?: number): string => {
  if (start == null && end == null) return '未知'
  const range = `${start ?? '?'} ~ ${end ?? '?'}`
  return step && step !== 1 ? `${range} （步长 ${step}）` : range
}

const formatRenderDevice = (device?: string): string => {
  if (!device) return '未知'
  
  // 将常见的设备类型转换为友好的显示文本
  const deviceMap: Record<string, string> = {
    'cpu': 'CPU',
    'gpu': 'GPU',
    'GPU': 'GPU',
    'CPU': 'CPU',
    'cuda': 'CUDA (GPU)',
    'CUDA': 'CUDA (GPU)',
    'optix': 'OptiX (GPU)',
    'OptiX': 'OptiX (GPU)',
    'opencl': 'OpenCL (GPU)',
    'OpenCL': 'OpenCL (GPU)',
  }
  
  return deviceMap[device] || device
}

const handleConfirm = () => {
  loading.value = true
  emit('confirm')
}

const handleCancel = () => {
  visible.value = false
  emit('cancel')
}

const showDetailList = () => {
  emit('showDetail')
}
</script>

<style lang="scss" scoped>
.package-detail-dialog {
  .status-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;

    .el-icon {
      margin-bottom: 20px;
      color: #409eff;

      &.is-loading {
        animation: rotating 2s linear infinite;
      }
    }

    .status-text {
      font-size: 18px;
      font-weight: 500;
      color: #303133;
      margin: 0 0 12px 0;

      &.error-text {
        color: #f56c6c;
      }
    }

    .status-desc {
      font-size: 14px;
      color: #909399;
      margin: 0;
    }

    &.error {
      .el-icon {
        color: #f56c6c;
      }
    }

    .fallback-tip {
      margin-top: 24px;
      width: 100%;
    }
  }

  .package-details {
    .detail-section {
      margin-bottom: 20px;
      padding: 16px;
      background-color: #f5f7fa;
      border-radius: 8px;
      border: 1px solid #e4e7ed;

      &.highlight {
        background-color: #ecf5ff;
        border-color: #b3d8ff;
      }

      &:last-of-type {
        margin-bottom: 0;
      }

      .section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;

        .section-title {
          font-size: 15px;
          font-weight: 600;
          color: #303133;
        }
      }

      .section-content {
        padding-left: 28px;

        .info-row {
          display: flex;
          align-items: center;
          margin-bottom: 8px;

          &:last-child {
            margin-bottom: 0;
          }

          .label {
            font-size: 13px;
            color: #606266;
            width: 80px;
            flex-shrink: 0;
          }

          .value {
            font-size: 13px;
            color: #303133;
            font-weight: 500;
            word-break: break-all;
          }
        }

        .dependency-stats {
          .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 0;
            border-bottom: 1px dashed #dcdfe6;

            &:last-child {
              border-bottom: none;
              padding-bottom: 0;
            }

            &:first-child {
              padding-top: 0;
            }

            .stat-label {
              font-size: 13px;
              color: #606266;
              min-width: 70px;
            }

            .stat-value {
              font-size: 13px;
              color: #303133;
              font-weight: 500;
              min-width: 50px;
            }

            .stat-size {
              font-size: 12px;
              color: #909399;
              margin-left: auto;
            }
          }

          .no-dependencies {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 16px 0;
            color: #909399;
            font-size: 13px;
            justify-content: center;
          }
        }

      }
    }

    .upload-tip {
      margin-top: 20px;
    }
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .process-content {
    width: 100%;
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;

    .log-container {
      width: 100%;
      background-color: #1e1e1e;
      border-radius: 4px;
      padding: 12px;
      max-height: 400px;
      overflow-y: auto;
      overflow-x: hidden;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      border: 1px solid #3c3c3c;
      text-align: left;
      
      // 自定义滚动条样式
      &::-webkit-scrollbar {
        width: 8px;
      }
      
      &::-webkit-scrollbar-track {
        background: #2a2a2a;
        border-radius: 4px;
      }
      
      &::-webkit-scrollbar-thumb {
        background: #555;
        border-radius: 4px;
        
        &:hover {
          background: #666;
        }
      }
    }

    .process-log {
      list-style: none;
      padding: 0;
      margin: 0;
      font-size: 13px;
      color: #d4d4d4;
      line-height: 1.6;
      text-align: left;

      &.error-log {
        color: #f48771;
      }

      .log-line {
        padding: 2px 0;
        word-break: break-all;
        white-space: pre-wrap;
        text-align: left;

        &:hover {
          background-color: rgba(255, 255, 255, 0.05);
        }
      }
    }

    .process-placeholder {
      font-size: 12px;
      color: #909399;
      text-align: center;
      padding: 20px 0;
    }
  }
}

@keyframes rotating {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>

<style lang="scss">
.package-detail-dialog {
  .el-dialog__header {
    border-bottom: 1px solid #e4e7ed;
    padding: 20px 24px;
  }

  .el-dialog__body {
    padding: 24px;
  }

  .el-dialog__footer {
    border-top: 1px solid #e4e7ed;
    padding: 16px 24px;
  }
}
</style>
