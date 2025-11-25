<template>
  <el-dialog
    v-model="dialogVisible"
    title="系统设置"
    width="1000px"
    :close-on-click-modal="false"
    class="settings-dialog"
  >
    <div class="settings-container">
      <!-- 左侧导航 -->
      <div class="settings-sidebar">
        <div
          v-for="item in menuItems"
          :key="item.key"
          :class="['menu-item', { active: activeMenu === item.key }]"
          @click="activeMenu = item.key"
        >
          <el-icon :size="20">
            <component :is="item.icon" />
          </el-icon>
          <span class="menu-text">{{ item.label }}</span>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="settings-content">
        <!-- 通用设置 -->
        <div v-show="activeMenu === 'general'" class="settings-panel">
          <h3 class="panel-title">通用设置</h3>
          <p class="panel-desc">客户端通用设置项</p>

          <div class="setting-section">
            <div class="section-label">语言</div>
            <el-radio-group v-model="generalSettings.language">
              <el-radio label="zh-CN">简体中文</el-radio>
              <el-radio label="en">English</el-radio>
              <el-radio label="ja">日本語</el-radio>
              <el-radio label="ko">한국어</el-radio>
            </el-radio-group>
          </div>

          <div class="setting-section">
            <div class="section-label">开机设置</div>
            <el-checkbox v-model="generalSettings.autoStart">开机自动运行</el-checkbox>
            <el-checkbox v-model="generalSettings.autoLogin">自动登录</el-checkbox>
            <el-checkbox v-model="generalSettings.autoUpdate">自动检查客户端更新</el-checkbox>
          </div>

          <div class="setting-section">
            <div class="section-label">消息通知</div>
            <el-checkbox v-model="generalSettings.notification">开启消息通知</el-checkbox>
            <div class="section-hint">开启后消息将会在客户端右上角弹窗显示</div>
          </div>
        </div>

        <!-- 渲染设置 -->
        <div v-show="activeMenu === 'render'" class="settings-panel">
          <h3 class="panel-title">渲染设置</h3>
          <p class="panel-desc">针对场景作业的整个提交渲染流程的设置项</p>

          <div class="setting-section">
            <div class="section-label">文件拷贝</div>
            <el-radio-group v-model="renderSettings.fileCopy">
              <el-radio label="always">拖入场景文件时，弹出软件插件配置框</el-radio>
              <el-radio label="never">设置默认配置项，不再弹出软件插件配置框</el-radio>
            </el-radio-group>
          </div>

          <div class="setting-section" v-if="renderSettings.fileCopy === 'never'">
            <div class="form-row">
              <label>默认软件:</label>
              <el-select v-model="renderSettings.defaultSoftware" placeholder="请选择">
                <el-option label="Maya" value="maya" />
                <el-option label="3ds Max" value="3dsmax" />
                <el-option label="Cinema 4D" value="c4d" />
              </el-select>
            </div>
            <div class="form-row">
              <label>默认配置:</label>
              <el-select v-model="renderSettings.defaultConfig" placeholder="请选择">
                <el-option label="aaa" value="aaa" />
                <el-option label="bbb" value="bbb" />
              </el-select>
            </div>
          </div>

          <div class="setting-section">
            <div class="section-label">场景分析</div>
            <el-checkbox v-model="renderSettings.autoAnalysis">提交作业后手动开始分析</el-checkbox>
            <div class="section-hint">分析列表作业状态为 "等待手动开始分析"</div>
            <el-checkbox v-model="renderSettings.autoSubmit">分析完成后，修改参数手动提交作业</el-checkbox>
          </div>
        </div>

        <!-- 下载设置 -->
        <div v-show="activeMenu === 'download'" class="settings-panel">
          <h3 class="panel-title">下载设置</h3>
          <p class="panel-desc">客户端下载设置项</p>

          <div class="setting-section">
            <div class="section-label">自动下载</div>
            <el-checkbox v-model="downloadSettings.autoDownload">提交后自动下载</el-checkbox>
          </div>

          <div class="setting-section">
            <div class="section-label">默认下载路径</div>
            <el-input v-model="downloadSettings.downloadPath" placeholder="C:/RenderFarm/Download">
              <template #append>
                <el-button :icon="FolderOpened" @click="selectFolder" />
              </template>
            </el-input>
            <el-checkbox v-model="downloadSettings.useProjectPath">给以下项目设置下载路径</el-checkbox>
          </div>

          <div class="setting-section">
            <div class="section-label">下载策略</div>
            <el-select v-model="downloadSettings.strategy" placeholder="请选择">
              <el-option label="默认原始出图路径结构" value="default" />
              <el-option label="自定义路径结构" value="custom" />
            </el-select>
          </div>
        </div>

        <!-- 软件插件配置 -->
        <div v-show="activeMenu === 'plugins'" class="settings-panel">
          <h3 class="panel-title">软件插件配置</h3>
          <p class="panel-desc">管理软件插件配置</p>
          <div class="coming-soon">功能开发中...</div>
        </div>

        <!-- 插件管理 -->
        <div v-show="activeMenu === 'plugin-manager'" class="settings-panel">
          <h3 class="panel-title">插件管理</h3>
          <p class="panel-desc">管理应用插件</p>
          <div class="coming-soon">功能开发中...</div>
        </div>

        <!-- 网络设置 -->
        <div v-show="activeMenu === 'network'" class="settings-panel">
          <h3 class="panel-title">网络设置</h3>
          <p class="panel-desc">配置服务器连接地址和环境信息</p>

          <div class="setting-section">
            <div class="section-label">服务器地址</div>
            <div class="form-row">
              <label>API 地址:</label>
              <el-input
                v-model="networkSettings.apiBaseUrl"
                placeholder="http://localhost:8000"
                clearable
              />
            </div>
            <div class="section-hint">API 接口的基础地址，例如: http://192.168.99.93:8000</div>
          </div>

          <div class="setting-section">
            <div class="form-row">
              <label>WebSocket 地址:</label>
              <el-input
                v-model="networkSettings.wsBaseUrl"
                placeholder="ws://localhost:8000"
                clearable
              />
            </div>
            <div class="section-hint">WebSocket 连接的基础地址，例如: ws://192.168.99.93:8000</div>
          </div>

          <div class="setting-section">
            <div class="section-label">运行环境</div>
            <el-radio-group v-model="networkSettings.environment">
              <el-radio label="development">开发环境</el-radio>
              <el-radio label="staging">测试环境</el-radio>
              <el-radio label="production">生产环境</el-radio>
            </el-radio-group>
            <div class="section-hint">当前客户端连接的服务器环境</div>
          </div>

          <div class="setting-section">
            <div class="section-label">配置文件位置</div>
            <div class="config-path-info">
              <el-button text type="primary" @click="openConfigPath">
                打开配置文件目录
              </el-button>
            </div>
            <div class="section-hint">你也可以直接编辑 config.ini 文件来修改配置</div>
          </div>
        </div>

        <!-- 计划任务 -->
        <div v-show="activeMenu === 'schedule'" class="settings-panel">
          <h3 class="panel-title">计划任务</h3>
          <p class="panel-desc">管理计划任务</p>
          <div class="coming-soon">功能开发中...</div>
        </div>

        <!-- 高级设置 -->
        <div v-show="activeMenu === 'advanced'" class="settings-panel">
          <h3 class="panel-title">高级设置</h3>
          <p class="panel-desc">高级功能设置</p>
          <div class="coming-soon">功能开发中...</div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Setting,
  Monitor,
  Download,
  Connection,
  Calendar,
  Tools,
  Grid,
  FolderOpened,
} from '@element-plus/icons-vue'
import { useServerConfig } from '@/composables/useServerConfig'

const dialogVisible = defineModel<boolean>()

// 使用服务器配置 composable
const { config: serverConfig, loadConfig, saveConfig } = useServerConfig()

const activeMenu = ref('general')

const menuItems = [
  { key: 'general', label: '通用设置', icon: Setting },
  { key: 'plugins', label: '软件插件配置', icon: Grid },
  { key: 'plugin-manager', label: '插件管理', icon: Tools },
  { key: 'render', label: '渲染设置', icon: Monitor },
  { key: 'download', label: '下载设置', icon: Download },
  { key: 'network', label: '网络设置', icon: Connection },
  { key: 'schedule', label: '计划任务', icon: Calendar },
  { key: 'advanced', label: '高级设置', icon: Setting },
]

const generalSettings = reactive({
  language: 'zh-CN',
  autoStart: false,
  autoLogin: true,
  autoUpdate: true,
  notification: true,
})

const renderSettings = reactive({
  fileCopy: 'always',
  defaultSoftware: 'maya',
  defaultConfig: 'aaa',
  autoAnalysis: false,
  autoSubmit: true,
})

const downloadSettings = reactive({
  autoDownload: true,
  downloadPath: 'C:/RenderFarm/Download',
  useProjectPath: false,
  strategy: 'default',
})

const networkSettings = reactive({
  apiBaseUrl: '',
  wsBaseUrl: '',
  environment: 'development' as 'development' | 'staging' | 'production',
})

// 加载服务器配置
onMounted(async () => {
  await loadConfig()
  if (serverConfig.value) {
    networkSettings.apiBaseUrl = serverConfig.value.apiBaseUrl
    networkSettings.wsBaseUrl = serverConfig.value.wsBaseUrl
    networkSettings.environment = serverConfig.value.environment
  }
})

const selectFolder = () => {
  ElMessage.info('选择文件夹功能需要 Electron API 支持')
}

const openConfigPath = async () => {
  try {
    if (!window.electronAPI) {
      ElMessage.error('Electron API 不可用')
      return
    }
    const configPath = await (window.electronAPI as any).serverConfigGetPath()
    const pathModule = require('path')
    const configDir = pathModule.dirname(configPath)

    // 使用 Electron 打开文件夹
    ;(window.electronAPI as any).openExternal(`file://${configDir}`)
  } catch (error) {
    console.error('打开配置文件目录失败:', error)
    ElMessage.error('打开配置文件目录失败')
  }
}

const handleSave = async () => {
  try {
    // 保存服务器配置
    if (networkSettings.apiBaseUrl || networkSettings.wsBaseUrl) {
      await saveConfig({
        apiBaseUrl: networkSettings.apiBaseUrl,
        wsBaseUrl: networkSettings.wsBaseUrl,
        environment: networkSettings.environment,
      })
    }

    ElMessage.success('设置已保存')
    dialogVisible.value = false
  } catch (error) {
    console.error('保存设置失败:', error)
    ElMessage.error('保存设置失败，请重试')
  }
}

const handleCancel = () => {
  dialogVisible.value = false
}
</script>

<style lang="scss" scoped>
.settings-dialog {
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
    padding: 0;
    background-color: $bg-dark;
  }

  :deep(.el-dialog__footer) {
    background-color: $bg-darker;
    border-top: 1px solid $border-color;
    padding: 16px 20px;
  }
}

.settings-container {
  display: flex;
  height: 600px;
}

.settings-sidebar {
  width: 240px;
  background-color: $bg-darker;
  border-right: 1px solid $border-color;
  padding: 16px 0;

  .menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    color: $text-secondary;
    cursor: pointer;
    transition: all $transition-fast;

    .menu-text {
      font-size: $font-size-sm;
    }

    &:hover {
      background-color: $bg-hover;
      color: $text-primary;
    }

    &.active {
      background-color: $bg-light;
      color: $primary-color;
      border-left: 3px solid $primary-color;
      padding-left: 17px;
    }
  }
}

.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background-color: $bg-dark;
}

.settings-panel {
  .panel-title {
    font-size: $font-size-xl;
    font-weight: 500;
    color: $text-primary;
    margin-bottom: 8px;
  }

  .panel-desc {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-bottom: 32px;
    padding-bottom: 16px;
    border-bottom: 1px solid $border-color;
  }

  .setting-section {
    margin-bottom: 32px;

    .section-label {
      font-size: $font-size-md;
      color: $text-primary;
      margin-bottom: 16px;
      font-weight: 500;
    }

    .section-hint {
      font-size: $font-size-xs;
      color: $text-secondary;
      margin-top: 8px;
    }

    :deep(.el-checkbox) {
      display: block;
      margin-bottom: 12px;
      color: $text-primary;
    }

    :deep(.el-radio) {
      display: block;
      margin-bottom: 12px;
      color: $text-primary;
    }

    .form-row {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;

      label {
        min-width: 80px;
        color: $text-secondary;
        font-size: $font-size-sm;
      }

      .el-select {
        flex: 1;
        max-width: 400px;
      }
    }

    :deep(.el-input) {
      max-width: 600px;
    }
  }

  .coming-soon {
    text-align: center;
    padding: 60px 0;
    color: $text-secondary;
    font-size: $font-size-md;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
