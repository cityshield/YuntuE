<template>
  <div class="login-container">
    <!-- 自定义标题栏 -->
    <div class="titlebar titlebar-drag-region">
      <div class="titlebar-left">
        <div class="logo">云</div>
        <span class="app-name">盛世云图</span>
      </div>
      <div class="titlebar-controls titlebar-no-drag">
        <el-dropdown trigger="click" @command="handleSettingsCommand" class="settings-dropdown">
          <el-button :icon="Setting" circle size="small" title="设置" />
          <template #dropdown>
            <el-dropdown-menu class="settings-menu">
              <el-dropdown-item command="proxy">代理设置</el-dropdown-item>
              <el-dropdown-item command="network">网络检测</el-dropdown-item>
              <el-dropdown-item command="language" class="language-item">
                <div class="language-item-content">
                  <span>语言设置</span>
                  <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                </div>
                <div class="language-submenu">
                  <div
                    v-for="lang in languages"
                    :key="lang.value"
                    :class="['language-option', { 'is-active': currentLanguage === lang.value }]"
                    @click.stop="handleLanguageChange(lang.value)"
                  >
                    <el-icon v-if="currentLanguage === lang.value" class="check-icon"><Select /></el-icon>
                    <span>{{ lang.label }}</span>
                  </div>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button class="titlebar-button" @click="minimizeWindow">
          <el-icon><Minus /></el-icon>
        </button>
        <button class="titlebar-button" @click="closeWindow">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>

    <div class="login-content">
      <!-- 左侧宣传区域 -->
      <div class="promo-section">
        <h1 class="promo-brand">盛世云图</h1>
        <h2 class="promo-title">引领AI技术未来</h2>
        <p class="promo-description">
          专注于为影视动漫行业提供高速GPU渲染云服务以及AI图像处理、视频增强、3D建模等创新技术解决方案。
        </p>
        <div class="promo-features">
          <div class="feature-item">
            <div class="feature-icon">🚀</div>
            <div class="feature-content">
              <h3>高速GPU渲染</h3>
              <p>专业影视动漫渲染服务</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">🎨</div>
            <div class="feature-content">
              <h3>AI图像处理</h3>
              <p>智能提升画质与分辨率</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">🎬</div>
            <div class="feature-content">
              <h3>3D建模动画</h3>
              <p>从图片到动画的AI转换</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧登录表单 -->
      <div class="login-section">
        <!-- 右上角切换按钮 -->
        <div class="login-type-switch">
          <button
            @click="toggleLoginType"
            class="switch-btn-custom"
            title="切换登录方式"
          >
            <svg v-if="activeTab === 'phone'" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <!-- 简化的二维码图标 -->
              <rect x="5" y="5" width="35" height="35" fill="none" stroke="currentColor" stroke-width="5"/>
              <rect x="15" y="15" width="15" height="15" fill="currentColor"/>

              <rect x="60" y="5" width="35" height="35" fill="none" stroke="currentColor" stroke-width="5"/>
              <rect x="70" y="15" width="15" height="15" fill="currentColor"/>

              <rect x="5" y="60" width="35" height="35" fill="none" stroke="currentColor" stroke-width="5"/>
              <rect x="15" y="70" width="15" height="15" fill="currentColor"/>

              <rect x="50" y="50" width="8" height="8" fill="currentColor"/>
              <rect x="62" y="50" width="8" height="8" fill="currentColor"/>
              <rect x="74" y="50" width="8" height="8" fill="currentColor"/>
              <rect x="50" y="62" width="8" height="8" fill="currentColor"/>
              <rect x="62" y="74" width="8" height="8" fill="currentColor"/>
              <rect x="74" y="86" width="8" height="8" fill="currentColor"/>
            </svg>
            <svg v-else viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
              <!-- 手机图标 -->
              <path d="M744.727273 0H279.272727C209.454545 0 151.272727 58.181818 151.272727 128v768c0 69.818182 58.181818 128 128 128h465.454546c69.818182 0 128-58.181818 128-128V128c0-69.818182-58.181818-128-128-128z m46.545454 896c0 25.6-20.945455 46.545455-46.545454 46.545455H279.272727c-25.6 0-46.545455-20.945455-46.545454-46.545455V128c0-25.6 20.945455-46.545455 46.545454-46.545455h465.454546c25.6 0 46.545455 20.945455 46.545454 46.545455v768z" fill="currentColor"/>
              <path d="M558.545455 848.290909h-93.090910c-18.618182 0-34.909091 16.290909-34.909091 34.909091s16.290909 34.909091 34.909091 34.909091h93.090910c18.618182 0 34.909091-16.290909 34.909091-34.909091s-16.290909-34.909091-34.909091-34.909091z" fill="currentColor"/>
            </svg>
          </button>
        </div>

        <div class="login-content-wrapper">
          <!-- 微信登录 -->
          <Transition name="fade-slide" mode="out-in">
            <div v-if="activeTab === 'wechat'" key="wechat" class="wechat-login">
              <h2 class="login-title">微信扫码登录</h2>
              <p class="login-subtitle">请打开微信扫一扫</p>
              <div class="qr-code-container">
              <div class="qr-placeholder">
                <svg class="qr-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                  <!-- 左上角定位点 -->
                  <rect x="5" y="5" width="30" height="30" fill="none" stroke="#000" stroke-width="4"/>
                  <rect x="12" y="12" width="16" height="16" fill="#000"/>

                  <!-- 右上角定位点 -->
                  <rect x="65" y="5" width="30" height="30" fill="none" stroke="#000" stroke-width="4"/>
                  <rect x="72" y="12" width="16" height="16" fill="#000"/>

                  <!-- 左下角定位点 -->
                  <rect x="5" y="65" width="30" height="30" fill="none" stroke="#000" stroke-width="4"/>
                  <rect x="12" y="72" width="16" height="16" fill="#000"/>

                  <!-- 中间的数据点 -->
                  <rect x="45" y="15" width="6" height="6" fill="#000"/>
                  <rect x="55" y="15" width="6" height="6" fill="#000"/>
                  <rect x="45" y="25" width="6" height="6" fill="#000"/>
                  <rect x="55" y="25" width="6" height="6" fill="#000"/>

                  <rect x="15" y="45" width="6" height="6" fill="#000"/>
                  <rect x="25" y="45" width="6" height="6" fill="#000"/>
                  <rect x="15" y="55" width="6" height="6" fill="#000"/>
                  <rect x="25" y="55" width="6" height="6" fill="#000"/>

                  <rect x="45" y="45" width="6" height="6" fill="#000"/>
                  <rect x="55" y="45" width="6" height="6" fill="#000"/>
                  <rect x="45" y="55" width="6" height="6" fill="#000"/>
                  <rect x="55" y="55" width="6" height="6" fill="#000"/>

                  <rect x="65" y="45" width="6" height="6" fill="#000"/>
                  <rect x="75" y="45" width="6" height="6" fill="#000"/>
                  <rect x="85" y="45" width="6" height="6" fill="#000"/>
                  <rect x="65" y="55" width="6" height="6" fill="#000"/>
                  <rect x="75" y="55" width="6" height="6" fill="#000"/>
                  <rect x="85" y="55" width="6" height="6" fill="#000"/>

                  <rect x="45" y="65" width="6" height="6" fill="#000"/>
                  <rect x="55" y="65" width="6" height="6" fill="#000"/>
                  <rect x="45" y="75" width="6" height="6" fill="#000"/>
                  <rect x="55" y="75" width="6" height="6" fill="#000"/>
                  <rect x="45" y="85" width="6" height="6" fill="#000"/>
                  <rect x="55" y="85" width="6" height="6" fill="#000"/>
                </svg>
              </div>
            </div>
              <div class="remember-me">
                <el-checkbox v-model="rememberLogin">记住我的登录状态</el-checkbox>
              </div>
            </div>

            <!-- 手机号登录 -->
            <div v-else key="phone" class="phone-login">
              <h2 class="login-title">手机号登录</h2>
            <el-form :model="phoneLoginForm" :rules="phoneRules" ref="phoneLoginFormRef" class="login-form">
              <el-form-item prop="phone">
                <el-input
                  v-model="phoneLoginForm.phone"
                  placeholder="手机号"
                  size="large"
                  :prefix-icon="User"
                  maxlength="11"
                />
              </el-form-item>
              <el-form-item prop="password">
                <el-input
                  v-model="phoneLoginForm.password"
                  type="password"
                  placeholder="密码"
                  size="large"
                  :prefix-icon="Lock"
                  show-password
                />
              </el-form-item>
              <el-form-item>
                <div class="login-options">
                  <div class="login-checkboxes">
                    <el-checkbox v-model="phoneLoginForm.remember">记住密码</el-checkbox>
                    <el-checkbox v-model="phoneLoginForm.autoLogin">自动登录</el-checkbox>
                  </div>
                  <el-link type="primary" :underline="false" @click="handleForgotPassword">忘记密码</el-link>
                </div>
              </el-form-item>
              <el-form-item>
                <el-button
                  type="primary"
                  size="large"
                  class="login-button"
                  :loading="loading"
                  @click="handlePhoneLogin"
                >
                  登录
                </el-button>
              </el-form-item>
            </el-form>
            </div>
          </Transition>
        </div>

        <div class="login-footer">
          <el-link type="primary" @click="handleRegister">立即注册</el-link>
          <div class="agreement">
            <el-checkbox v-model="agreedToTerms" />
            我已阅读并同意《平台用户协议》和《隐私保护声明》
          </div>
        </div>
      </div>
    </div>

    <!-- 左下角服务器连接状态 -->
    <div class="server-status" :class="{ 'is-collapsed': serverStatusCollapsed }">
      <!-- 收起时的呼出按钮 -->
      <button
        v-if="serverStatusCollapsed"
        class="toggle-btn collapsed"
        @click="toggleServerStatus"
        title="展开服务器状态"
      >
        <el-icon><ArrowRight /></el-icon>
      </button>

      <!-- 展开时的内容 -->
      <div v-if="!serverStatusCollapsed" class="status-content">
        <div class="status-header">
          <span class="status-title">服务器状态</span>
          <div class="header-actions">
            <el-button
              v-if="!serverStatus.checking"
              @click="checkServerStatus"
              size="small"
              text
              class="refresh-btn"
            >
              刷新
            </el-button>
            <el-icon v-else class="is-loading">
              <Loading />
            </el-icon>
            <button class="collapse-btn" @click="toggleServerStatus" title="收起">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      <div class="status-item">
        <span class="status-label">服务器地址:</span>
        <span class="status-value">{{ serverStatus.apiUrl || '加载中...' }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">环境:</span>
        <span class="status-value">{{ environmentText }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">API 连接:</span>
        <el-icon :class="['status-icon', serverStatus.apiConnected ? 'success' : 'error']">
          <component :is="serverStatus.apiConnected ? 'CircleCheck' : 'CircleClose'" />
        </el-icon>
        <span :class="['status-text', serverStatus.apiConnected ? 'success' : 'error']">
          {{ serverStatus.apiConnected ? '正常' : '失败' }}
        </span>
      </div>
      <div class="status-item">
        <span class="status-label">WebSocket:</span>
        <el-icon :class="['status-icon', serverStatus.wsConnected ? 'success' : 'error']">
          <component :is="serverStatus.wsConnected ? 'CircleCheck' : 'CircleClose'" />
        </el-icon>
        <span :class="['status-text', serverStatus.wsConnected ? 'success' : 'error']">
          {{ serverStatus.wsConnected ? '正常' : '失败' }}
        </span>
      </div>
      <div v-if="serverStatus.error" class="status-error">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ serverStatus.error }}</span>
      </div>
      <!-- WebSocket 详细错误信息 -->
      <div v-if="serverStatus.wsError" class="status-detail">
        <div class="detail-title">WebSocket 错误详情:</div>
        <div class="detail-item">{{ serverStatus.wsError }}</div>
        <div v-if="serverStatus.wsCloseCode" class="detail-item">
          关闭码: {{ serverStatus.wsCloseCode }}
        </div>
        <div v-if="serverStatus.wsCloseReason" class="detail-item">
          原因: {{ serverStatus.wsCloseReason }}
        </div>
      </div>
      <div v-if="serverStatus.lastCheckTime" class="status-time">
        最后检查: {{ serverStatus.lastCheckTime }}
      </div>
        <!-- 配置服务器地址按钮 -->
        <div class="status-actions">
          <el-button size="small" @click="openServerConfigDialog" class="config-btn">
            配置服务器
          </el-button>
        </div>
      </div>
    </div>

    <!-- 服务器配置对话框 -->
    <el-dialog
      v-model="showServerConfigDialog"
      title="服务器配置"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="serverConfigForm" label-width="120px">
        <el-form-item label="API 地址">
          <el-input
            v-model="serverConfigForm.apiBaseUrl"
            placeholder="例如: http://192.168.1.100:8000"
          />
          <div class="form-hint">请输入完整的 HTTP 地址,包括端口号</div>
        </el-form-item>
        <el-form-item label="WebSocket 地址">
          <el-input
            v-model="serverConfigForm.wsBaseUrl"
            placeholder="例如: ws://192.168.1.100:8000"
          />
          <div class="form-hint">请输入完整的 WebSocket 地址,包括端口号</div>
        </el-form-item>
        <el-form-item label="环境">
          <el-select v-model="serverConfigForm.environment" style="width: 100%">
            <el-option label="开发环境" value="development" />
            <el-option label="测试环境" value="staging" />
            <el-option label="生产环境" value="production" />
          </el-select>
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          style="margin-top: 10px"
        >
          <template #title>
            <div style="font-size: 12px;">修改配置后将自动重新检测服务器连接状态</div>
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="showServerConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="saveServerConfig">保存配置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import {
  User,
  Lock,
  Minus,
  Close,
  Setting,
  ArrowRight,
  Select,
  Loading,
  // @ts-ignore - 用于动态组件
  CircleCheck,
  // @ts-ignore - 用于动态组件
  CircleClose,
  WarningFilled,
} from '@element-plus/icons-vue'
import { authAPI } from '@/api/auth'
import { useServerStatus } from '@/composables/useServerStatus'

const router = useRouter()
const userStore = useUserStore()

// 服务器状态检测
const { status: serverStatus, checkServerStatus } = useServerStatus()

// 环境文本映射
const environmentText = computed(() => {
  const envMap: Record<string, string> = {
    development: '开发环境',
    staging: '测试环境',
    production: '生产环境',
  }
  return envMap[serverStatus.value.environment] || '未知'
})

const activeTab = ref('wechat')
const loading = ref(false)
const agreedToTerms = ref(true)
const rememberLogin = ref(true)
const currentLanguage = ref('zh-CN')
const showServerConfigDialog = ref(false)
const serverStatusCollapsed = ref(false)

// 切换登录方式
const toggleLoginType = () => {
  activeTab.value = activeTab.value === 'wechat' ? 'phone' : 'wechat'
}

// 切换服务器状态面板
const toggleServerStatus = () => {
  serverStatusCollapsed.value = !serverStatusCollapsed.value
}

// 服务器配置表单
const serverConfigForm = reactive({
  apiBaseUrl: '',
  wsBaseUrl: '',
  environment: 'development',
})

const languages = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
]

const phoneLoginForm = reactive({
  phone: '',
  password: '',
  remember: true,
  autoLogin: false,
})

const phoneRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    {
      pattern: /^1[3-9]\d{9}$/,
      message: '请输入正确的手机号格式',
      trigger: 'blur',
    },
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const phoneLoginFormRef = ref()

const handlePhoneLogin = async () => {
  if (!agreedToTerms.value) {
    ElMessage.warning('请先阅读并同意用户协议')
    return
  }

  await phoneLoginFormRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    loading.value = true
    try {
      // 调用登录 API，将手机号作为 username 传递
      const response = await authAPI.login({
        username: phoneLoginForm.phone,
        password: phoneLoginForm.password,
      })

      // 保存用户信息和 token (包含 refresh_token)
      userStore.login(
        {
          id: response.user.id,
          username: response.user.username,
          phone: response.user.phone,
          avatar: response.user.avatar,
          balance: response.user.balance,
          memberLevel: response.user.member_level,
        },
        response.access_token,
        response.refresh_token
      )

      ElMessage.success('登录成功')
      router.push('/main/tasks')
    } catch (error: any) {
      ElMessage.error(error.message || '登录失败，请检查手机号和密码')
    } finally {
      loading.value = false
    }
  })
}

const handleRegister = () => {
  // 打开浏览器跳转到官网注册页面
  if (window.electronAPI) {
    window.electronAPI.openExternal('http://www.yuntucv.com/auth.html')
  } else {
    // 如果不在 Electron 环境中，使用 window.open
    window.open('http://www.yuntucv.com/auth.html', '_blank')
  }
}

const handleForgotPassword = () => {
  ElMessage.info('忘记密码功能开发中')
}

// 窗口控制
const minimizeWindow = () => {
  window.electronAPI?.minimizeWindow()
}

const closeWindow = () => {
  window.electronAPI?.closeWindow()
}

// 设置菜单处理
const handleSettingsCommand = (command: string) => {
  if (command === 'proxy') {
    ElMessage.info('代理设置功能开发中')
  } else if (command === 'network') {
    ElMessage.info('网络检测功能开发中')
  }
  // language 通过子菜单直接处理
}

// 语言切换处理
const handleLanguageChange = (lang: string) => {
  currentLanguage.value = lang
  const langMap: Record<string, string> = {
    'zh-CN': '简体中文',
    'en': 'English',
    'ja': '日本語',
    'ko': '한국어',
  }
  ElMessage.success(`语言已切换为: ${langMap[lang]}`)
  // TODO: 实际的多语言切换逻辑
}

// 初始化服务器配置表单
const initServerConfigForm = async () => {
  if (window.electronAPI) {
    const config = await window.electronAPI.serverConfigGet()
    serverConfigForm.apiBaseUrl = config.apiBaseUrl
    serverConfigForm.wsBaseUrl = config.wsBaseUrl
    serverConfigForm.environment = config.environment
  }
}

// 当对话框打开时,加载当前配置
const openServerConfigDialog = () => {
  initServerConfigForm()
  showServerConfigDialog.value = true
}

// 保存服务器配置
const saveServerConfig = async () => {
  // 验证输入
  if (!serverConfigForm.apiBaseUrl || !serverConfigForm.wsBaseUrl) {
    ElMessage.warning('请填写完整的服务器地址')
    return
  }

  // 验证 API 地址格式
  if (!serverConfigForm.apiBaseUrl.startsWith('http://') && !serverConfigForm.apiBaseUrl.startsWith('https://')) {
    ElMessage.warning('API 地址必须以 http:// 或 https:// 开头')
    return
  }

  // 验证 WebSocket 地址格式
  if (!serverConfigForm.wsBaseUrl.startsWith('ws://') && !serverConfigForm.wsBaseUrl.startsWith('wss://')) {
    ElMessage.warning('WebSocket 地址必须以 ws:// 或 wss:// 开头')
    return
  }

  try {
    if (window.electronAPI) {
      // 保存配置
      await window.electronAPI.serverConfigSet({
        apiBaseUrl: serverConfigForm.apiBaseUrl,
        wsBaseUrl: serverConfigForm.wsBaseUrl,
        environment: serverConfigForm.environment,
      })

      ElMessage.success('服务器配置已保存')
      showServerConfigDialog.value = false

      // 重新检测服务器连接
      setTimeout(() => {
        checkServerStatus()
      }, 500)
    }
  } catch (error: any) {
    ElMessage.error('保存配置失败: ' + (error.message || '未知错误'))
  }
}

// 初始化时加载配置
initServerConfigForm()
</script>

<style lang="scss" scoped>
.login-container {
  width: 100%;
  height: 100vh;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  // 动态渐变背景
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg,
      #0D1117 0%,
      #1a1f2e 25%,
      #162447 50%,
      #1f4068 75%,
      #1b1b2f 100%
    );
    background-size: 400% 400%;
    animation: gradientShift 15s ease infinite;
    z-index: 0;
  }

  // 浮动光斑效果
  &::after {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(
      circle at 30% 50%,
      rgba(37, 99, 235, 0.15) 0%,
      transparent 50%
    ),
    radial-gradient(
      circle at 70% 50%,
      rgba(124, 58, 237, 0.1) 0%,
      transparent 50%
    ),
    radial-gradient(
      circle at 50% 30%,
      rgba(6, 182, 212, 0.08) 0%,
      transparent 50%
    );
    animation: floatingOrbs 20s ease-in-out infinite;
    z-index: 1;
  }

  // 确保内容在背景之上
  > * {
    position: relative;
    z-index: 2;
  }
}

// 渐变移动动画
@keyframes gradientShift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

// 光斑浮动动画
@keyframes floatingOrbs {
  0%, 100% {
    transform: translate(0, 0) rotate(0deg);
  }
  25% {
    transform: translate(5%, 5%) rotate(90deg);
  }
  50% {
    transform: translate(0, 10%) rotate(180deg);
  }
  75% {
    transform: translate(-5%, 5%) rotate(270deg);
  }
}

.titlebar {
  height: 32px;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  color: $text-primary;

  .titlebar-left {
    display: flex;
    align-items: center;
    gap: 8px;

    .logo {
      width: 20px;
      height: 20px;
      background: $primary-color;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }

    .app-name {
      font-size: $font-size-sm;
      font-weight: 500;
    }
  }

  .titlebar-controls {
    display: flex;
    align-items: center;
    gap: 8px;

    .settings-dropdown {
      margin-right: 4px;
    }

    .titlebar-button {
      width: 32px;
      height: 24px;
      border: none;
      background: transparent;
      color: $text-primary;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background $transition-fast;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    }
  }
}

// 设置菜单样式
.settings-menu {
  background-color: $bg-dark !important;
  border: 1px solid $border-color !important;
  padding: 4px 0;
  min-width: 160px;

  :deep(.el-dropdown-menu__item) {
    color: $text-primary;
    padding: 10px 16px;
    position: relative;

    &:hover {
      background-color: $bg-hover !important;
      color: $primary-color;
    }
  }

  .language-item {
    position: relative;

    .language-item-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;

      .arrow-icon {
        margin-left: 8px;
        font-size: 12px;
      }
    }

    &:hover .language-submenu {
      display: block;
    }

    .language-submenu {
      display: none;
      position: absolute;
      left: 100%;
      top: 0;
      background-color: $bg-dark;
      border: 1px solid $border-color;
      border-radius: 4px;
      padding: 4px 0;
      min-width: 140px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      z-index: 10;

      .language-option {
        padding: 10px 16px;
        color: $text-primary;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all $transition-fast;

        .check-icon {
          font-size: 14px;
          color: $primary-color;
        }

        &:hover {
          background-color: $bg-hover;
          color: $primary-color;
        }

        &.is-active {
          color: $primary-color;
        }
      }
    }
  }
}

.login-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 60px;
}

.promo-section {
  flex: 1;
  max-width: 550px;
  color: white;

  .promo-brand {
    font-size: 56px;
    font-weight: bold;
    margin-bottom: 16px;
    line-height: 1.2;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .promo-title {
    font-size: 42px;
    font-weight: bold;
    margin-bottom: 24px;
    line-height: 1.3;
  }

  .promo-description {
    font-size: $font-size-md;
    line-height: 1.8;
    color: rgba(255, 255, 255, 0.85);
    margin-bottom: 40px;
  }

  .promo-features {
    display: flex;
    flex-direction: column;
    gap: 20px;

    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: $border-radius-large;
      backdrop-filter: blur(10px);
      transition: all $transition-normal;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(37, 99, 235, 0.5);
        transform: translateX(8px);
      }

      .feature-icon {
        font-size: 32px;
        flex-shrink: 0;
      }

      .feature-content {
        flex: 1;

        h3 {
          font-size: $font-size-lg;
          font-weight: 600;
          margin-bottom: 6px;
          color: white;
        }

        p {
          font-size: $font-size-sm;
          color: rgba(255, 255, 255, 0.7);
          margin: 0;
        }
      }
    }
  }
}

.login-section {
  width: 420px;
  background: $bg-dark;
  border-radius: $border-radius-large;
  padding: 40px;
  box-shadow: $shadow-large;
  position: relative;

  .login-type-switch {
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 10;

    .switch-btn-custom {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 1px solid $border-color;
      background: $bg-light;
      color: $text-primary;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      transition: all $transition-fast;

      svg {
        width: 100%;
        height: 100%;
      }

      .el-icon {
        font-size: 20px;
      }

      &:hover {
        border-color: $primary-color;
        color: $primary-color;
      }
    }
  }

  .login-content-wrapper {
    min-height: 480px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  // 登录方式切换动画
  .fade-slide-enter-active,
  .fade-slide-leave-active {
    transition: all 0.4s ease;
  }

  .fade-slide-enter-from {
    opacity: 0;
    transform: translateX(30px);
  }

  .fade-slide-leave-to {
    opacity: 0;
    transform: translateX(-30px);
  }

  .fade-slide-enter-to,
  .fade-slide-leave-from {
    opacity: 1;
    transform: translateX(0);
  }

  .login-title {
    font-size: $font-size-xxl;
    font-weight: bold;
    margin-bottom: 12px;
    text-align: center;
  }

  .login-subtitle {
    font-size: $font-size-sm;
    color: $text-secondary;
    text-align: center;
    margin-bottom: 32px;
  }

  .login-form {
    margin-top: 24px;

    .login-options {
      display: flex;
      justify-content: space-between;
      width: 100%;
    }

    .login-button {
      width: 100%;
      background-color: $primary-color;
      border-color: $primary-color;
      font-size: $font-size-md;
      height: 44px;
    }
  }

  .wechat-login {
    display: flex;
    flex-direction: column;
    align-items: center;

    .qr-code-container {
      width: 196px;
      height: 196px;
      background: white;
      border-radius: $border-radius-medium;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 32px;
      padding: 14px;

      .qr-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;

        .qr-icon {
          width: 100%;
          height: 100%;
        }
      }
    }

    .remember-me {
      width: 100%;
      display: flex;
      justify-content: center;

      :deep(.el-checkbox__label) {
        color: $text-primary;
      }
    }
  }

  .phone-login {
    .login-title {
      margin-bottom: 24px;
    }
  }

  .sub-account-hint {
    text-align: center;
    color: $text-secondary;
    padding: 40px 0;
  }

  .login-footer {
    margin-top: 24px;
    text-align: center;

    .agreement {
      margin-top: 16px;
      font-size: $font-size-xs;
      color: $text-secondary;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
  }
}

// 服务器状态面板
.server-status {
  position: fixed;
  left: 20px;
  bottom: 20px;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid $border-color;
  border-radius: $border-radius-medium;
  padding: 16px;
  min-width: 320px;
  max-width: 400px;
  box-shadow: $shadow-large;
  z-index: 100;
  color: $text-primary;
  font-size: $font-size-sm;
  transition: all $transition-normal;

  // 收起状态
  &.is-collapsed {
    min-width: auto;
    max-width: auto;
    width: 48px;
    height: 48px;
    padding: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    left: -16px;
    transform: translateX(0);
    background: rgba(37, 99, 235, 0.15);
    border-color: $primary-color;

    &:hover {
      background: rgba(37, 99, 235, 0.3);
      border-color: $primary-color;
      transform: translateX(8px);
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }
  }

  // 展开/收起按钮（收起时）
  .toggle-btn.collapsed {
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    color: $primary-color;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    transition: transform $transition-fast;

    &:hover {
      transform: scale(1.1);
    }
  }

  // 内容容器
  .status-content {
    width: 100%;
  }

  .status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid $border-color;

    .status-title {
      font-size: $font-size-md;
      font-weight: 600;
      color: $primary-color;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .refresh-btn {
      padding: 4px 8px;
      font-size: $font-size-xs;
      color: $text-secondary;

      &:hover {
        color: $primary-color;
      }
    }

    .collapse-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: $text-secondary;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all $transition-fast;

      .el-icon {
        transform: rotate(180deg);
        transition: transform $transition-fast;
      }

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: $primary-color;
      }
    }

    .is-loading {
      animation: rotating 1s linear infinite;
      color: $primary-color;
    }
  }

  .status-item {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    gap: 8px;

    .status-label {
      color: $text-secondary;
      min-width: 85px;
    }

    .status-value {
      color: $text-primary;
      font-family: monospace;
      font-size: $font-size-xs;
      word-break: break-all;
    }

    .status-icon {
      font-size: 16px;

      &.success {
        color: #67c23a;
      }

      &.error {
        color: #f56c6c;
      }
    }

    .status-text {
      font-weight: 500;

      &.success {
        color: #67c23a;
      }

      &.error {
        color: #f56c6c;
      }
    }
  }

  .status-error {
    margin-top: 12px;
    padding: 8px;
    background: rgba(245, 108, 108, 0.1);
    border: 1px solid rgba(245, 108, 108, 0.3);
    border-radius: $border-radius-small;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: $font-size-xs;
    color: #f56c6c;

    .el-icon {
      flex-shrink: 0;
      margin-top: 2px;
    }

    span {
      flex: 1;
      word-break: break-word;
    }
  }

  .status-detail {
    margin-top: 12px;
    padding: 8px;
    background: rgba(230, 162, 60, 0.1);
    border: 1px solid rgba(230, 162, 60, 0.3);
    border-radius: $border-radius-small;
    font-size: $font-size-xs;
    color: #e6a23c;

    .detail-title {
      font-weight: 600;
      margin-bottom: 6px;
      color: #e6a23c;
    }

    .detail-item {
      margin-bottom: 4px;
      padding-left: 8px;
      color: $text-primary;
      word-break: break-word;
      font-family: monospace;

      &:last-child {
        margin-bottom: 0;
      }
    }
  }

  .status-time {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid $border-color;
    font-size: $font-size-xs;
    color: $text-secondary;
    text-align: right;
  }

  .status-actions {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid $border-color;
    display: flex;
    justify-content: center;

    .config-btn {
      width: 100%;
      background-color: transparent;
      border-color: $primary-color;
      color: $primary-color;
      font-size: $font-size-xs;

      &:hover {
        background-color: rgba(0, 204, 163, 0.1);
        border-color: $primary-color;
        color: $primary-color;
      }
    }
  }
}

// 服务器配置对话框样式
.form-hint {
  font-size: $font-size-xs;
  color: $text-secondary;
  margin-top: 4px;
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
