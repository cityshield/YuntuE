# 盛世云图 - Electron 客户端

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Electron](https://img.shields.io/badge/Electron-28.2.0-47848f.svg)
![Vue](https://img.shields.io/badge/Vue-3.5.22-4fc08d.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.2-3178c6.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

一款基于 Electron + Vue 3 的云渲染桌面客户端，提供高效的文件上传、渲染任务管理和文件下载功能。

[功能特性](#-功能特性) • [技术架构](#-技术架构) • [快速开始](#-快速开始) • [项目结构](#-项目结构) • [开发路线](#-开发路线)

</div>

---

## 📖 项目简介

盛世云图客户端是一款专为 3D 渲染工作者打造的桌面应用程序，旨在简化云渲染工作流程。通过集成 OSS 对象存储、智能上传管理和实时任务监控，为用户提供便捷高效的云渲染体验。

### 核心优势

- **🚀 高性能上传**：支持分片上传、断点续传、MD5 秒传
- **💾 智能存储**：OSS 对象存储集成，自动文件去重
- **🔔 实时通知**：系统托盘常驻，重要事件即时提醒
- **⚙️ 灵活配置**：支持外部服务器配置，适应多环境部署
- **🎨 现代 UI**：基于 Element Plus 的暗色主题设计

---

## ✨ 功能特性

### 已实现功能

#### 🔐 认证系统 (100%)
- ✅ 用户名/密码登录
- ✅ 手机号注册 + 短信验证码
- ✅ JWT Token 自动刷新
- ✅ 路由守卫保护
- ✅ 安全退出登录

#### 📤 文件上传系统 (95%)
- ✅ **智能上传引擎**
  - 阿里云 OSS 直传集成
  - 分片上传（自动调整分片大小）
  - 断点续传（支持暂停/恢复）
  - 并发控制（最多 3 个任务）
  - 上传进度实时追踪
- ✅ **MD5 秒传检测**
  - 文件 MD5 自动计算（分块计算，支持大文件）
  - 服务端去重检查
  - 秒传成功自动跳过上传
  - 节省存储空间统计
- ✅ **文件校验**
  - 格式白名单验证（.ma, .mb, .max 等）
  - 大小限制检查（最大 20GB）
  - 上传前预检查
- ✅ **任务管理**
  - 批量文件上传
  - 任务队列管理
  - 失败任务自动重试
  - 上传统计（速度、进度、剩余时间）

#### 🖥️ Electron 窗口管理 (100%)
- ✅ **窗口特性**
  - 无边框自定义窗口
  - 拖拽区域支持
  - 窗口最小化/最大化/关闭
  - 窗口状态持久化（尺寸、位置、最大化状态）
- ✅ **系统托盘**
  - 关闭窗口自动最小化到托盘
  - 托盘右键菜单（显示、暂停、设置、退出）
  - 双击托盘恢复窗口
  - 动态图标状态（normal/uploading/notification）
  - 任务数量角标显示
- ✅ **系统通知**
  - 上传完成/失败/秒传通知
  - 免打扰时段支持（可配置时间段）
  - 点击通知唤起窗口
  - 通知优先级控制
- ✅ **配置管理**
  - 本地配置持久化（JSON 格式）
  - 服务器配置外部化（config.ini）
  - 窗口状态自动保存
  - 开机自启动设置
  - 下载路径配置
  - 上传并发数配置

#### 🎨 用户界面 (70%)
- ✅ 登录/注册页面
- ✅ 主框架布局（侧边栏 + 内容区）
- ✅ 文件上传区域（拖拽上传）
- ✅ 任务列表视图
- ✅ 设置对话框
- ✅ Element Plus 组件库
- ✅ 暗色主题适配

#### 📡 API 集成 (60%)
- ✅ Axios HTTP 客户端配置
- ✅ 请求/响应拦截器
- ✅ Token 自动注入
- ✅ 错误统一处理
- ✅ 认证 API（登录/注册/登出）
- ✅ 上传 API（OSS 凭证/MD5 检查/任务创建）
- ✅ 盘符 API（盘符列表）

### 待实现功能

#### 🔴 高优先级
- ⏳ 渲染任务管理 UI
- ⏳ WebSocket 实时推送
- ⏳ 任务 API 完整集成
- ⏳ 用户余额/会员系统
- ⏳ 完善状态管理（Settings Store、Tasks Store）

#### 🟡 中优先级
- ⏳ 文件管理器（盘符系统、文件树）
- ⏳ 下载管理
- ⏳ 版本自动更新
- ⏳ 反馈系统
- ⏳ 微信扫码登录

#### 🟢 低优先级
- ⏳ 数据统计与分析
- ⏳ 多语言支持
- ⏳ 主题切换（亮/暗）
- ⏳ 日志系统
- ⏳ 单元测试

---

## 🏗️ 技术架构

### 技术栈

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **桌面框架** | Electron | 28.2.0 | 跨平台桌面应用 |
| **前端框架** | Vue | 3.5.22 | 渐进式前端框架 |
| **开发语言** | TypeScript | 5.4.2 | 类型安全的 JavaScript |
| **UI 组件库** | Element Plus | 2.11.5 | Vue 3 组件库 |
| **状态管理** | Pinia | 3.0.3 | Vue 官方状态管理 |
| **路由管理** | Vue Router | 4.6.3 | 单页面应用路由 |
| **HTTP 客户端** | Axios | 1.7.2 | Promise 风格的 HTTP 库 |
| **对象存储** | Ali-OSS | 6.23.0 | 阿里云 OSS SDK |
| **实时通信** | Socket.IO | 4.7.5 | WebSocket 封装库 |
| **文件哈希** | SparkMD5 | 3.0.2 | MD5 计算库 |
| **构建工具** | Vite | 5.1.6 | 下一代前端构建工具 |
| **打包工具** | electron-builder | 24.13.3 | Electron 应用打包 |
| **CSS 预处理器** | Sass | 1.71.1 | CSS 扩展语言 |

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     YuntuE Desktop Client                    │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│  Main Process  │  │ Renderer Process │  │   Preload API   │
│  (Electron)    │  │   (Vue 3 SPA)    │  │  (IPC Bridge)   │
├────────────────┤  ├─────────────────┤  ├─────────────────┤
│ • Window Mgmt  │  │ • Vue Router    │  │ • Window API    │
│ • Tray Menu    │  │ • Pinia Store   │  │ • Tray API      │
│ • Notification │  │ • Composables   │  │ • Notification  │
│ • Config Store │  │ • Components    │  │ • Config API    │
│ • IPC Handler  │  │ • API Clients   │  │ • Server Config │
└────────────────┘  └─────────────────┘  └─────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
┌───────▼────────┐                        ┌────────▼────────┐
│  Local Storage │                        │  Backend Server │
├────────────────┤                        ├─────────────────┤
│ • config.json  │                        │ • REST API      │
│ • config.ini   │                        │ • WebSocket     │
│ • Token Cache  │                        │ • OSS Gateway   │
└────────────────┘                        └─────────────────┘
```

### 业务架构

```
┌─────────────────────────────────────────────────────────────┐
│                        业务层架构                            │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  认证模块    │  │  上传模块    │  │  任务模块    │  │  文件模块    │
├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤
│ • 登录/注册  │  │ • OSS上传    │  │ • 任务列表   │  │ • 文件浏览   │
│ • Token管理  │  │ • 秒传检测   │  │ • 状态监控   │  │ • 文件下载   │
│ • 会话保持   │  │ • 进度追踪   │  │ • 实时通知   │  │ • 盘符管理   │
│ • 路由守卫   │  │ • 任务队列   │  │ • 日志查看   │  │ • 文件搜索   │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
        │                 │                 │                 │
        └─────────────────┴─────────────────┴─────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
┌───────▼────────┐                        ┌────────▼────────┐
│  共享服务层    │                        │  基础设施层     │
├────────────────┤                        ├─────────────────┤
│ • HTTP Client  │                        │ • Config Store  │
│ • WebSocket    │                        │ • Notification  │
│ • Error Handler│                        │ • Tray Service  │
│ • Logger       │                        │ • IPC Bridge    │
└────────────────┘                        └─────────────────┘
```

---

## 🚀 快速开始

### 环境要求

- **Node.js**: >= 16.x
- **npm**: >= 8.x
- **操作系统**: Windows 10+, macOS 10.13+, Linux

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/cityshield/YuntuE.git
cd YuntuE

# 安装依赖
npm install
```

### 配置服务器

编辑根目录下的 `config.ini` 文件，配置后端服务器地址：

```ini
# API 基础地址
apiBaseUrl=http://localhost:8000

# WebSocket 基础地址
wsBaseUrl=ws://localhost:8000

# 当前环境 (development/staging/production)
environment=development
```

### 开发模式

```bash
# 启动开发服务器
npm run dev
```

应用将在开发模式下启动，支持热重载和开发者工具。

### 生产构建

```bash
# 构建 Windows 安装包
npm run build:win

# 构建 macOS 安装包
npm run build:mac

# 构建所有平台
npm run build:all
```

构建产物将生成在 `release/` 目录：

```
release/
├── 盛世云图-v1.0.0-{timestamp}.exe         # Windows NSIS 安装包
├── 盛世云图-v1.0.0-{timestamp}-Portable.exe # Windows 便携版
└── win-unpacked/                           # Windows 未打包版本
```

---

## 📁 项目结构

```
YuntuE/
├── electron/                    # Electron 主进程代码
│   ├── main.ts                 # 主进程入口
│   ├── preload.ts              # 预加载脚本（IPC 桥接）
│   ├── store.ts                # 本地配置存储
│   └── configFile.ts           # 服务器配置管理
├── src/                        # Vue 应用源码
│   ├── api/                    # API 客户端
│   │   ├── axios-config.ts     # Axios 配置
│   │   ├── auth.ts             # 认证 API
│   │   ├── upload.ts           # 上传 API
│   │   ├── tasks.ts            # 任务 API
│   │   └── drives.ts           # 盘符 API
│   ├── assets/                 # 静态资源
│   │   └── styles/             # 全局样式
│   │       ├── global.scss     # 全局样式
│   │       └── variables.scss  # SCSS 变量
│   ├── components/             # 通用组件
│   │   ├── UploadTask.vue      # 上传任务组件
│   │   └── PreCheckDialog.vue  # 预检查对话框
│   ├── composables/            # 可组合函数
│   │   ├── useUpload.ts        # 上传逻辑
│   │   ├── useTray.ts          # 托盘控制
│   │   ├── useNotification.ts  # 通知管理
│   │   ├── useConfig.ts        # 配置管理
│   │   └── useServerConfig.ts  # 服务器配置
│   ├── router/                 # 路由配置
│   │   └── index.ts            # 路由定义
│   ├── stores/                 # Pinia 状态管理
│   │   └── user.ts             # 用户状态
│   ├── types/                  # TypeScript 类型定义
│   │   ├── task.ts             # 任务类型
│   │   ├── upload.ts           # 上传类型
│   │   └── ali-oss.d.ts        # OSS 类型声明
│   ├── utils/                  # 工具函数
│   │   ├── md5.ts              # MD5 计算工具
│   │   └── upload/             # 上传工具
│   │       ├── OSSUploader.ts  # OSS 上传器
│   │       └── UploadManager.ts # 上传管理器
│   ├── views/                  # 页面组件
│   │   ├── Login.vue           # 登录页
│   │   ├── Main.vue            # 主框架
│   │   ├── Upload/             # 上传模块
│   │   │   └── UploadArea.vue  # 上传区域
│   │   ├── Tasks/              # 任务模块
│   │   │   └── TaskList.vue    # 任务列表
│   │   └── Settings/           # 设置模块
│   │       └── SettingsDialog.vue # 设置对话框
│   ├── App.vue                 # 根组件
│   ├── main.ts                 # 应用入口
│   └── env.d.ts                # 环境类型声明
├── public/                     # 公共资源
│   └── icons/                  # 托盘图标
│       ├── tray-icon.ico       # 普通状态
│       ├── tray-icon-uploading.ico # 上传状态
│       └── tray-icon-notification.ico # 通知状态
├── build/                      # 构建资源（图标等）
├── config.ini                  # 服务器配置模板
├── package.json                # 项目配置
├── tsconfig.json               # TypeScript 配置
├── vite.config.ts              # Vite 配置
└── README.md                   # 项目文档
```

---

## 🎯 开发路线

### 第一阶段：核心功能补全 ✅ (已完成)

**目标**：完成桌面客户端核心特性，提升用户体验

| 功能 | 状态 | 完成时间 |
|-----|------|---------|
| 托盘常驻功能 | ✅ 已完成 | 2025-10-24 |
| MD5 秒传检测 | ✅ 已完成 | 2025-10-24 |
| 系统通知 | ✅ 已完成 | 2025-10-24 |
| 本地存储配置 | ✅ 已完成 | 2025-10-24 |

**成果**：
- ✅ TypeScript 零错误编译
- ✅ 所有核心功能代码审查通过
- ✅ 详细功能测试报告

### 第二阶段：功能完善 (进行中)

**目标**：完善业务功能，提升稳定性

| 功能 | 优先级 | 状态 | 预估工时 |
|-----|-------|------|---------|
| 开机自启动 | P1 | ⏳ 待开始 | 1h |
| 完善 User/Settings Store | P1 | ⏳ 待开始 | 2-3h |
| 任务 API 集成 | P1 | ⏳ 待开始 | 3-4h |
| WebSocket 实时推送 | P1 | ⏳ 待开始 | 3-4h |
| 渲染任务管理 UI | P1 | ⏳ 待开始 | 6-8h |

**预估总工时**: 15-20 小时

### 第三阶段：高级功能 (规划中)

**目标**：添加高级功能，完善用户体验

| 功能 | 优先级 | 状态 | 预估工时 |
|-----|-------|------|---------|
| 文件管理器（盘符系统） | P2 | ⏳ 待开始 | 8-10h |
| 版本更新机制 | P2 | ⏳ 待开始 | 4-6h |
| 反馈系统 | P2 | ⏳ 待开始 | 2-3h |
| 微信扫码登录 | P2 | ⏳ 待开始 | 4-6h |

**预估总工时**: 18-25 小时

---

## 📊 项目统计

### 代码规模

- **总文件数**: 64 个
- **代码行数**: ~19,500 行
- **Vue 组件**: 8 个
- **API 模块**: 5 个
- **Composables**: 6 个
- **Store 模块**: 1 个

### 完成度

| 模块 | 完成度 | 状态 |
|-----|-------|------|
| 认证系统 | 100% | ✅ 已完成 |
| 文件上传 | 95% | 🟢 基本完成 |
| Electron 窗口 | 100% | ✅ 已完成 |
| UI 界面 | 70% | 🟡 进行中 |
| 状态管理 | 30% | 🔴 待完善 |
| API 集成 | 60% | 🟡 进行中 |
| 通知系统 | 100% | ✅ 已完成 |
| 配置管理 | 100% | ✅ 已完成 |

**总体完成度**: 约 70%

---

## 🔧 配置说明

### 客户端配置 (config.json)

自动生成在用户数据目录（`~/Library/Application Support/yuntue/config.json`）：

```json
{
  "downloadPath": "~/Documents/YuntuDownloads",
  "autoDownload": false,
  "maxConcurrent": 3,
  "chunkSize": 10485760,
  "notificationEnabled": true,
  "doNotDisturbEnabled": true,
  "doNotDisturbStart": 22,
  "doNotDisturbEnd": 8,
  "windowWidth": 1400,
  "windowHeight": 900,
  "windowMaximized": false,
  "autoLaunch": true,
  "language": "zh-CN",
  "theme": "dark"
}
```

### 服务器配置 (config.ini)

位于应用安装目录，可手动修改：

```ini
# API 基础地址
apiBaseUrl=http://api.yuntucv.com

# WebSocket 基础地址
wsBaseUrl=ws://api.yuntucv.com

# 当前环境 (development/staging/production)
environment=production
```

修改后需要重启客户端才能生效。

---

## 📝 开发指南

### 代码规范

- 使用 TypeScript 进行类型安全开发
- 遵循 Vue 3 Composition API 风格
- 使用 ESLint + Prettier 格式化代码
- 组件命名采用 PascalCase
- 文件命名采用 kebab-case

### 调试技巧

1. **开发模式调试**
   ```bash
   npm run dev
   ```
   - 自动打开 Chrome DevTools
   - 支持 Vue DevTools 扩展
   - 热重载自动生效

2. **主进程调试**
   - 在 `electron/main.ts` 中使用 `console.log`
   - 查看终端输出

3. **渲染进程调试**
   - 在 Vue 组件中使用 `console.log`
   - 查看 Chrome DevTools Console

### 常见问题

**Q: 如何切换后端服务器地址？**

A: 修改 `config.ini` 文件中的 `apiBaseUrl` 和 `wsBaseUrl`，重启客户端即可。

**Q: 如何关闭通知功能？**

A: 在设置对话框中关闭"启用系统通知"选项。

**Q: 上传失败如何重试？**

A: 在任务列表中点击失败任务的"重试"按钮。

**Q: 如何清除本地配置？**

A: 调用 `window.electronAPI.configReset()` 或删除 `config.json` 文件。

---

## 🤝 贡献指南

欢迎贡献代码！请遵循以下流程：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat`: 新功能
- `fix`: 修复 Bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 📮 联系方式

- **项目主页**: https://github.com/cityshield/YuntuE
- **问题反馈**: https://github.com/cityshield/YuntuE/issues
- **团队**: YunTu Team

---

## 🙏 致谢

感谢以下开源项目：

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Element Plus](https://element-plus.org/) - Vue 3 组件库
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
- [TypeScript](https://www.typescriptlang.org/) - JavaScript 的超集

---

<div align="center">

**用心打造，为云渲染工作者提供最佳体验** ❤️

Made with ❤️ by YunTu Team

</div>
