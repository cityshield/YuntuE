<template>
  <div
    class="upload-area-container"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <!-- Tab 导航 -->
    <el-tabs v-model="activeTab" class="task-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="分析列表" name="analysis" />
      <el-tab-pane label="我的上传" name="upload" />
      <el-tab-pane label="渲染作业" name="tasks" />
      <el-tab-pane label="我的下载" name="download" />
    </el-tabs>

    <!-- 隐藏的文件输入 - 全局可用 -->
    <input
      ref="fileInput"
      type="file"
      multiple
      accept=".ma,.mb,.zip,.rar,.blend,.c4d,.max,.fbx"
      style="display: none"
      @change="handleFileSelect"
    />

    <!-- 拖拽上传区域 - 仅在无任务时显示 -->
    <div
      v-if="tasks.length === 0"
      class="drop-zone"
      :class="{ 'is-dragover': isDragOver }"
      @click="triggerFileSelect"
    >
      <el-icon class="upload-icon" :size="64">
        <Upload />
      </el-icon>
      <div class="upload-text">
        <p class="primary-text">将文件拖拽到此处，或点击选择文件</p>
        <p class="secondary-text">
          支持格式：.ma, .mb, .zip, .rar, .blend, .c4d, .max, .fbx
        </p>
        <p class="secondary-text">最大文件大小：20GB</p>
      </div>
    </div>

    <!-- 全局拖拽热区覆盖层 - 拖拽时显示 -->
    <div v-if="isDragOver && tasks.length > 0" class="drop-zone-overlay">
      <div class="overlay-content">
        <el-icon class="upload-icon" :size="80">
          <Upload />
        </el-icon>
        <p class="overlay-text">松开鼠标添加文件到上传队列</p>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div v-if="tasks.length > 0" class="action-buttons">
      <el-button @click="triggerFileSelect" type="primary">
        上传新文件
      </el-button>
      <el-button v-if="false" @click="clearUploadCache" type="warning" size="small">
        清除上传缓存
      </el-button>
      <el-button @click="clearCompleted" :disabled="statistics.successTasks === 0">
        清空已完成
      </el-button>
    </div>

    <!-- 上传任务列表 -->
    <div class="upload-list">
      <div v-if="tasks.length === 0" class="empty-state">
        <el-icon :size="48" style="color: var(--el-text-color-secondary)">
          <FolderOpened />
        </el-icon>
        <p>暂无上传任务</p>
      </div>

      <UploadTask
        v-for="task in tasks"
        :key="task.id + updateTrigger"
        :task="task"
        @pause="pauseTask"
        @resume="resumeTask"
        @cancel="cancelTask"
        @remove="removeTask"
      />
    </div>

    <!-- 打包详情对话框 -->
    <PackageDetailDialog
      v-if="showPackageDialog && packageInfo"
      :package-info="packageInfo"
      @confirm="onPackageConfirm"
      @cancel="onPackageCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, FolderOpened } from '@element-plus/icons-vue'
import { useUpload } from '@/composables/useUpload'
import UploadTask from '@/components/UploadTask.vue'
import PackageDetailDialog from '@/components/PackageDetailDialog.vue'
import { drivesAPI } from '@/api/drives'
import type { PackageInfo } from '@/types/upload'
// 依赖确认流程由 Python CLI 打包替代，不再引入旧的扫描类型

const router = useRouter()

const {
  tasks,
  statistics,
  updateTrigger,
  addFiles,
  pauseTask,
  resumeTask,
  cancelTask,
  removeTask,
  clearCompleted,
  setPackageConfirmCallback,
} = useUpload()

const activeTab = ref('upload')
const isDragOver = ref(false)
const fileInput = ref<HTMLInputElement>()
const defaultDriveId = ref<string>('')
// 打包详情对话框状态
const packageInfo = ref<PackageInfo | null>(null)
const showPackageDialog = ref(false)
let packageResolve: ((value: boolean) => void) | null = null

// 支持的文件格式
const SUPPORTED_FORMATS = ['.ma', '.mb', '.zip', '.rar', '.blend', '.c4d', '.max', '.fbx']

// 打包确认回调
const handlePackageConfirm = async (info: PackageInfo): Promise<boolean> => {
  return new Promise((resolve) => {
    packageInfo.value = reactive(info)
    showPackageDialog.value = true
    packageResolve = resolve
  })
}

// 打包对话框确认
const onPackageConfirm = () => {
  showPackageDialog.value = false
  if (packageResolve) {
    packageResolve(true)
    packageResolve = null
  }
}

// 打包对话框取消
const onPackageCancel = () => {
  showPackageDialog.value = false
  if (packageResolve) {
    packageResolve(false)
    packageResolve = null
  }
}

// 获取默认盘符
onMounted(async () => {
  try {
    const drive = await drivesAPI.getDefaultDrive()
    defaultDriveId.value = drive.id
    console.log('Default drive loaded:', drive.name, drive.id)
  } catch (error) {
    console.error('Failed to load default drive:', error)
    ElMessage.error('获取默认盘符失败，上传功能可能无法正常使用')
  }

  // 设置打包确认回调
  setPackageConfirmCallback(handlePackageConfirm)

})

// 验证文件类型
const validateFileTypes = (files: File[]): { valid: File[]; invalid: File[] } => {
  const valid: File[] = []
  const invalid: File[] = []

  files.forEach(file => {
    const fileName = file.name.toLowerCase()
    const isSupported = SUPPORTED_FORMATS.some(format => fileName.endsWith(format))

    if (isSupported) {
      valid.push(file)
    } else {
      invalid.push(file)
    }
  })

  return { valid, invalid }
}

// 显示文件格式不支持的提示对话框
const showUnsupportedFormatDialog = (invalidFiles: File[]) => {
  const fileList = invalidFiles.map(f => `<li>${f.name}</li>`).join('')
  const formatList = SUPPORTED_FORMATS.join('、')

  ElMessageBox({
    title: '文件格式不支持',
    dangerouslyUseHTMLString: true,
    message: `
      <div class="unsupported-files-dialog">
        <div class="dialog-section">
          <div class="section-title">以下文件格式不支持：</div>
          <ul class="file-list">${fileList}</ul>
        </div>
        <div class="dialog-section">
          <div class="section-title">支持的文件格式：</div>
          <div class="format-list">${formatList}</div>
        </div>
      </div>
    `,
    confirmButtonText: '确定',
    type: 'warning',
    customClass: 'file-format-dialog',
  })
}

// 处理Tab切换
const handleTabChange = (tabName: string) => {
  if (tabName === 'upload') {
    router.push('/main/upload')
  } else if (tabName === 'tasks') {
    router.push('/main/tasks')
  } else if (tabName === 'download') {
    router.push('/main/downloads')
  } else if (tabName === 'analysis') {
    ElMessage.info('分析列表功能开发中')
  }
}

// 处理拖拽进入
const handleDragOver = (_e: DragEvent) => {
  isDragOver.value = true
}

// 处理拖拽离开
const handleDragLeave = (e: DragEvent) => {
  // 只有当鼠标真正离开容器时才重置状态
  // relatedTarget 为 null 表示离开了窗口
  if (!e.relatedTarget || !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
    isDragOver.value = false
  }
}

// 依赖确认逻辑已移除，统一由 UploadManager 调用 Python CLI 打包

// 处理文件拖放
const handleDrop = async (e: DragEvent) => {
  isDragOver.value = false

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) {
    return
  }

  const fileArray = Array.from(files)
  
  // 在 Electron 环境中，拖拽的文件可能没有路径信息
  // 对于 Maya 文件，提示用户使用文件选择器
  const mayaFiles = fileArray.filter(f => {
    const name = f.name.toLowerCase()
    return name.endsWith('.ma') || name.endsWith('.mb')
  })
  
  if (mayaFiles.length > 0 && window.electronAPI) {
    ElMessage.warning('Maya 场景文件请使用"上传新文件"按钮选择，以确保能正确获取文件路径进行打包')
    // 仍然允许添加，但可能无法打包
  }
  
  const { valid, invalid } = validateFileTypes(fileArray)

  // 如果有不支持的文件，显示对话框
  if (invalid.length > 0) {
    showUnsupportedFormatDialog(invalid)
  }

  // 如果有有效文件，添加到上传队列
  if (valid.length > 0) {
    if (!defaultDriveId.value) {
      ElMessage.error('默认盘符未加载，请刷新页面重试')
      return
    }
    // 传入预检回调
    try {
      await addFiles(valid, 'default', defaultDriveId.value)
      ElMessage.success(`已添加 ${valid.length} 个文件到上传队列`)
    } catch (error: any) {
      console.error('Failed to add files:', error)
      const message = error?.message || '上传任务创建失败，请重试'
      if (message.includes('取消')) {
        ElMessage.info(message)
      } else {
        ElMessage.error(message)
      }
    }
  }
}

// 触发文件选择
const triggerFileSelect = async () => {
  // 在 Electron 环境中，优先使用原生文件对话框以获取文件路径
  if (window.electronAPI?.selectFiles) {
    try {
      const result = await window.electronAPI.selectFiles({
        properties: ['multiSelections', 'openFile'],
        filters: [
          { name: '3D Scene Files', extensions: ['ma', 'mb', 'zip', 'rar', 'blend', 'c4d', 'max', 'fbx'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return
      }

      // 将文件路径转换为 File 对象
      const files: File[] = []
      for (const filePath of result.filePaths) {
        try {
          const buffer = await window.electronAPI!.readFile(filePath)
          const fileName = filePath.split(/[/\\]/).pop() || 'unknown'
          const file = new File([buffer as ArrayBuffer], fileName, {
            lastModified: Date.now(),
          })
          // 附加原生路径，供 Maya 打包使用
          ;(file as any).path = filePath
          ;(file as any).nativePath = filePath
          files.push(file)
        } catch (error) {
          console.error(`Failed to read file ${filePath}:`, error)
          ElMessage.error(`无法读取文件: ${filePath}`)
        }
      }

      if (files.length === 0) {
        return
      }

      const { valid, invalid } = validateFileTypes(files)

      if (invalid.length > 0) {
        showUnsupportedFormatDialog(invalid)
      }

      if (valid.length > 0) {
        if (!defaultDriveId.value) {
          ElMessage.error('默认盘符未加载，请刷新页面重试')
          return
        }
        try {
          await addFiles(valid, 'default', defaultDriveId.value)
          ElMessage.success(`已添加 ${valid.length} 个文件到上传队列`)
        } catch (error: any) {
          console.error('Failed to add files:', error)
          const message = error?.message || '上传任务创建失败，请重试'
          if (message.includes('取消')) {
            ElMessage.info(message)
          } else {
            ElMessage.error(message)
          }
        }
      }
    } catch (error) {
      console.error('Failed to select files via Electron dialog:', error)
      // 回退到普通文件选择器
      fileInput.value?.click()
    }
  } else {
    // 非 Electron 环境，使用普通文件选择器
    fileInput.value?.click()
  }
}

// 处理文件选择（普通文件选择器，作为回退方案）
const handleFileSelect = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const files = target.files

  if (!files || files.length === 0) {
    return
  }

  const fileArray = Array.from(files)
  const { valid, invalid } = validateFileTypes(fileArray)

  // 如果有不支持的文件，显示对话框
  if (invalid.length > 0) {
    showUnsupportedFormatDialog(invalid)
  }

  // 如果有有效文件，添加到上传队列
  if (valid.length > 0) {
    if (!defaultDriveId.value) {
      ElMessage.error('默认盘符未加载，请刷新页面重试')
      return
    }
    // 传入预检回调
    try {
      await addFiles(valid, 'default', defaultDriveId.value)
      ElMessage.success(`已添加 ${valid.length} 个文件到上传队列`)
    } catch (error: any) {
      console.error('Failed to add files:', error)
      const message = error?.message || '上传任务创建失败，请重试'
      if (message.includes('取消')) {
        ElMessage.info(message)
      } else {
        ElMessage.error(message)
      }
    }
  }

  // 清空input，允许重复选择相同文件
  target.value = ''
}

// 清除上传缓存
const clearUploadCache = () => {
  let count = 0
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('upload_checkpoint_')) {
      localStorage.removeItem(key)
      count++
    }
  })

  if (count > 0) {
    ElMessage.success(`已清除 ${count} 个上传缓存记录`)
  } else {
    ElMessage.info('没有需要清除的上传缓存')
  }
}
</script>

<style lang="scss" scoped>
.upload-area-container {
  padding: 16px 16px 0 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.maya-path-alert {
  margin: 16px 0 24px;

  .maya-alert-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .path-text {
    color: $text-secondary;
    word-break: break-all;
    flex: 1;
  }

  .maya-alert-actions {
    display: flex;
    gap: 8px;
  }
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

.drop-zone {
  border: 2px dashed $border-color;
  border-radius: $border-radius-large;
  padding: 60px 40px;
  text-align: center;
  cursor: pointer;
  transition: all $transition-fast;
  background-color: $bg-light;
  margin-bottom: 24px;

  &:hover {
    border-color: $primary-color;
    background-color: $bg-hover;
  }

  &.is-dragover {
    border-color: $primary-color;
    background-color: rgba($primary-color, 0.1);
    transform: scale(1.02);
  }

  .upload-icon {
    color: $primary-color;
    margin-bottom: 16px;
  }

  .upload-text {
    .primary-text {
      font-size: $font-size-lg;
      font-weight: 500;
      color: $text-primary;
      margin-bottom: 12px;
    }

    .secondary-text {
      font-size: $font-size-sm;
      color: $text-secondary;
      margin: 4px 0;
    }
  }
}

.drop-zone-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);

  .overlay-content {
    text-align: center;
    color: $text-primary;

    .upload-icon {
      color: $primary-color;
      margin-bottom: 20px;
    }

    .overlay-text {
      font-size: $font-size-xl;
      font-weight: 500;
    }
  }
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  margin: 16px 0;
  gap: 12px;
}

.upload-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: $text-secondary;

    p {
      margin-top: 16px;
      font-size: $font-size-md;
    }
  }

  /* 滚动条样式 */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: $border-color;
    border-radius: 4px;

    &:hover {
      background: darken($border-color, 10%);
    }
  }
}
</style>

<style lang="scss">
/* 文件格式不支持对话框样式 - 全局样式 */
.file-format-dialog {
  .el-message-box__message {
    padding: 0;
  }

  .unsupported-files-dialog {
    .dialog-section {
      margin-bottom: 20px;

      &:last-child {
        margin-bottom: 0;
      }

      .section-title {
        font-size: 14px;
        font-weight: 600;
        color: #303133;
        margin-bottom: 12px;
      }

      .file-list {
        margin: 0;
        padding-left: 20px;
        list-style: disc;

        li {
          font-size: 13px;
          color: #606266;
          line-height: 1.8;
          word-break: break-all;
        }
      }

      .format-list {
        font-size: 13px;
        color: #67c23a;
        font-weight: 500;
        line-height: 1.8;
        background-color: rgba(103, 194, 58, 0.1);
        padding: 12px 16px;
        border-radius: 4px;
        border-left: 3px solid #67c23a;
      }
    }
  }
}
</style>
