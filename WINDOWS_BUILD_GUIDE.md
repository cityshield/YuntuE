# Windows 打包和测试指南

> **最后更新**: 2025-10-24
> **适用平台**: Windows 10/11 (x64)
> **打包环境**: macOS / Windows / Linux

---

## 📦 打包方式选择

### 方式 1: 在 macOS 上打包 (推荐) ✅

**优点**:
- ✅ electron-builder 已配置完成
- ✅ 可以同时打包 macOS 和 Windows 版本
- ✅ 无需额外配置

**限制**:
- ⚠️ 无法进行代码签名 (需要 Windows 证书)
- ⚠️ 无法打包 ARM64 版本 (需要在 Windows ARM 上打包)

**适用场景**: 内部测试、开发版本、快速迭代

### 方式 2: 使用 GitHub Actions 自动化打包

**优点**:
- ✅ 自动化构建
- ✅ 支持多平台同时打包
- ✅ 可配置代码签名
- ✅ 直接发布到 GitHub Releases

**限制**:
- ⚠️ 需要配置 GitHub Actions workflow
- ⚠️ 代码签名需要存储证书密钥

**适用场景**: 正式发布、CI/CD 流程

### 方式 3: 在 Windows 上打包

**优点**:
- ✅ 可以进行代码签名
- ✅ 可以打包 ARM64 版本
- ✅ 测试更方便

**限制**:
- ⚠️ 需要 Windows 环境
- ⚠️ 不能同时打包 macOS 版本

**适用场景**: Windows 独占功能、代码签名、ARM64 支持

---

## 🚀 在 macOS 上打包 Windows 版本

### 前提条件

1. **Node.js**: v16+ (已安装: v22.19.0 ✅)
2. **npm**: v8+ (已安装: v10.9.3 ✅)
3. **依赖已安装**: `npm install` ✅

### 快速打包

#### 方式 A: 使用脚本 (推荐)

```bash
# 进入项目目录
cd /Users/pretty/Documents/Workspace/YuntuE

# 运行打包脚本
./build-win.sh
```

脚本会自动:
1. 清理旧的构建文件
2. 编译 TypeScript
3. 构建 Vue 应用
4. 打包 Electron 应用
5. 生成 Windows 安装程序

#### 方式 B: 使用 npm 命令

```bash
# 打包所有格式 (NSIS + Portable)
npm run build:win

# 仅打包 Portable 版本 (最快)
npm run build:win:portable

# 打包所有平台 (macOS + Windows)
npm run build:all
```

### 打包输出

打包成功后，文件位于 `release/` 目录：

```
release/
├── 瑞云渲染-1.0.0-Setup.exe        # NSIS 安装程序 (~100MB)
└── 瑞云渲染-1.0.0-Portable.exe     # 免安装版本 (~100MB)
```

### 打包时间

- **首次打包**: 约 3-5 分钟 (包含依赖下载)
- **后续打包**: 约 1-2 分钟

---

## 📋 打包配置详解

### package.json 打包配置

```json
{
  "build": {
    "appId": "com.yuntu.renderer",
    "productName": "瑞云渲染",
    "win": {
      "icon": "build/icon.ico",          // 应用图标
      "target": ["nsis", "portable"]     // 打包格式
    },
    "nsis": {
      "oneClick": false,                 // 允许自定义安装路径
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,     // 创建桌面快捷方式
      "createStartMenuShortcut": true    // 创建开始菜单快捷方式
    }
  }
}
```

### 文件打包策略

**打包内容**:
- ✅ `dist/` - Vue 编译后的文件
- ✅ `dist-electron/` - Electron 主进程和 Preload 脚本
- ✅ `public/` - 静态资源 (包括托盘图标)
- ✅ `node_modules/` - 必需的依赖 (自动筛选)

**不打包内容**:
- ❌ `src/` - 源代码
- ❌ `electron/` - TypeScript 源码 (已编译到 dist-electron)
- ❌ `devDependencies` - 开发依赖

---

## 🧪 Windows 测试清单

### 测试环境要求

- **操作系统**: Windows 10 (1809+) / Windows 11
- **架构**: x64 (64位)
- **.NET Framework**: 4.5+ (通常已预装)

### 安装测试

#### 测试 NSIS 安装程序

1. **下载文件**: 将 `瑞云渲染-1.0.0-Setup.exe` 传输到 Windows 电脑

2. **运行安装程序**:
   - 双击 Setup.exe
   - 选择安装路径 (默认: `C:\Program Files\瑞云渲染`)
   - 勾选"创建桌面快捷方式"
   - 点击"安装"

3. **验证安装**:
   - [ ] 桌面上出现快捷方式
   - [ ] 开始菜单中出现程序图标
   - [ ] 安装目录包含所有必要文件

4. **启动应用**:
   - 双击桌面快捷方式
   - 应用正常启动

#### 测试 Portable 免安装版

1. **解压文件**: 将 `瑞云渲染-1.0.0-Portable.exe` 复制到任意目录

2. **直接运行**:
   - 双击 Portable.exe
   - 应用直接启动 (无需安装)

3. **验证便携性**:
   - [ ] 配置文件保存在应用目录 (非用户目录)
   - [ ] 可以复制到其他电脑直接运行

### 功能测试

#### 1. 托盘图标测试

**位置**: Windows 系统托盘 (任务栏右下角)

**测试步骤**:

1. **验证图标显示**:
   - [ ] 启动后托盘区域显示蓝色图标
   - [ ] 图标清晰，没有模糊或失真
   - [ ] 鼠标悬停显示"云图渲染客户端"

2. **右键菜单测试**:
   - [ ] 右键点击图标
   - [ ] 菜单显示 5 个项目
   - [ ] "显示主窗口" - 恢复窗口
   - [ ] "暂停所有上传/下载" - 暂停任务
   - [ ] "设置" - 打开设置界面
   - [ ] "退出程序" - 完全退出

3. **双击行为测试**:
   - [ ] 关闭主窗口
   - [ ] 双击托盘图标
   - [ ] 窗口恢复显示

4. **图标状态切换**:
   打开开发者工具 Console，运行:
   ```javascript
   window.electronAPI.updateTrayIcon('uploading')  // 绿色
   window.electronAPI.updateTrayIcon('notification')  // 黄色
   window.electronAPI.updateTrayIcon('normal')  // 蓝色
   ```
   - [ ] 图标颜色正确切换
   - [ ] 提示文字同步更新

5. **气泡通知**:
   - [ ] 首次关闭窗口时显示气泡提示
   - [ ] 提示内容："程序已最小化到系统托盘..."

#### 2. 窗口管理测试

1. **窗口关闭行为**:
   - [ ] 点击关闭按钮
   - [ ] 窗口隐藏到托盘 (不退出)
   - [ ] 托盘图标保留

2. **窗口状态保存**:
   - [ ] 调整窗口大小
   - [ ] 最大化窗口
   - [ ] 关闭应用 (托盘菜单 → 退出程序)
   - [ ] 重新启动
   - [ ] 窗口尺寸和最大化状态恢复

3. **最小化到托盘**:
   - [ ] 点击最小化按钮
   - [ ] 窗口隐藏
   - [ ] 托盘图标闪烁或高亮 (可选)

#### 3. 系统通知测试

1. **通知显示**:
   在 Console 中运行:
   ```javascript
   window.electronAPI.showNotification({
     title: '测试通知',
     body: '这是一条测试通知',
     urgency: 'normal'
   })
   ```
   - [ ] Windows 通知中心显示通知
   - [ ] 点击通知后窗口恢复

2. **免打扰时段**:
   - [ ] 修改配置启用免打扰 (22:00-08:00)
   - [ ] 在免打扰时段内测试通知
   - [ ] 通知被抑制 (不显示)
   - [ ] 紧急通知 (urgency: 'critical') 仍然显示

#### 4. 配置管理测试

1. **配置文件位置**:
   - [ ] 打开 `%APPDATA%\yuntue\` 目录
   - [ ] 存在 `config.json` 文件

2. **配置保存**:
   - [ ] 修改设置 (如免打扰时段)
   - [ ] 重启应用
   - [ ] 配置保留

3. **配置重置**:
   在 Console 中运行:
   ```javascript
   window.electronAPI.configReset()
   ```
   - [ ] 配置恢复为默认值

#### 5. 开机自启动测试

1. **启用开机自启**:
   在 Console 中运行:
   ```javascript
   window.electronAPI.configSet('autoLaunch', true)
   ```

2. **验证注册表项**:
   - [ ] 打开注册表编辑器 (regedit)
   - [ ] 导航到 `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`
   - [ ] 存在"瑞云渲染"项

3. **重启测试**:
   - [ ] 重启 Windows
   - [ ] 应用自动启动 (后台运行)
   - [ ] 托盘图标显示

#### 6. 上传功能测试

1. **文件上传**:
   - [ ] 选择测试文件上传
   - [ ] 上传过程中托盘图标变为绿色
   - [ ] 上传完成后显示系统通知

2. **MD5 秒传测试**:
   - [ ] 上传同一文件两次
   - [ ] 第二次上传直接秒传
   - [ ] 显示"秒传成功"通知

3. **断点续传测试**:
   - [ ] 开始上传大文件
   - [ ] 暂停上传
   - [ ] 关闭应用
   - [ ] 重新启动
   - [ ] 恢复上传

---

## 🐛 常见问题排查

### 问题 1: 托盘图标不显示

**可能原因**:
- 图标文件未正确打包
- 文件路径错误

**解决方法**:
1. 检查打包后的应用目录:
   ```
   C:\Program Files\瑞云渲染\resources\app.asar.unpacked\public\icons\
   ```
2. 确认存在以下文件:
   - `tray-icon.ico`
   - `tray-icon-uploading.ico`
   - `tray-icon-notification.ico`

### 问题 2: 安装程序无法运行

**可能原因**:
- SmartScreen 拦截 (未签名应用)

**解决方法**:
1. 右键点击 Setup.exe → 属性
2. 勾选"解除锁定" (Unblock)
3. 点击"应用"
4. 重新运行安装程序

### 问题 3: 应用无法启动

**可能原因**:
- .NET Framework 版本过低
- 缺少 VC++ 运行库

**解决方法**:
1. 安装 .NET Framework 4.8
2. 安装 Visual C++ Redistributable 2019

### 问题 4: 通知不显示

**可能原因**:
- Windows 通知设置关闭

**解决方法**:
1. 打开 Windows 设置 → 系统 → 通知
2. 确保"获取来自应用的通知"已启用
3. 确保"瑞云渲染"的通知权限已启用

### 问题 5: 开机自启动失败

**可能原因**:
- 安装路径包含中文或特殊字符
- 用户权限不足

**解决方法**:
1. 使用英文路径安装
2. 以管理员身份运行应用
3. 手动添加注册表项

---

## 📊 打包产物对比

| 格式 | 文件大小 | 安装方式 | 卸载方式 | 更新方式 | 推荐场景 |
|------|---------|---------|---------|---------|---------|
| **NSIS 安装程序** | ~100MB | 向导安装 | 控制面板卸载 | 覆盖安装 | 正式发布 |
| **Portable 免安装版** | ~100MB | 直接运行 | 删除文件夹 | 替换文件 | 便携使用 |

---

## 🔐 代码签名 (可选)

### 为什么需要代码签名?

- ✅ 消除 SmartScreen 警告
- ✅ 提升用户信任度
- ✅ 防止被杀毒软件误报

### 如何签名?

**方式 1: 购买代码签名证书**

1. 购买 EV (Extended Validation) 代码签名证书 (~$300/年)
2. 获取证书文件 (.pfx)
3. 配置 electron-builder:
   ```json
   {
     "win": {
       "certificateFile": "path/to/cert.pfx",
       "certificatePassword": "YOUR_PASSWORD",
       "signingHashAlgorithms": ["sha256"]
     }
   }
   ```

**方式 2: 使用 GitHub Actions + Azure Key Vault**

适用于开源项目或团队协作，具体配置见 GitHub Actions 文档。

---

## 📦 文件传输建议

### 方式 1: U 盘拷贝 (最简单)

1. 将 `.exe` 文件复制到 U 盘
2. 插入 Windows 电脑
3. 直接运行

### 方式 2: 局域网传输 (最快)

```bash
# 在 macOS 上启动 HTTP 服务器
cd release
python3 -m http.server 8000

# 在 Windows 浏览器访问
http://192.168.x.x:8000/
# 下载 .exe 文件
```

### 方式 3: 云存储 (最方便)

- 上传到 Google Drive / OneDrive / 百度网盘
- 在 Windows 上下载

---

## ✅ 测试完成检查表

打包和测试完成后，请确认以下事项:

### 打包检查
- [ ] NSIS 安装程序生成成功
- [ ] Portable 版本生成成功
- [ ] 文件大小合理 (~100MB)
- [ ] 图标文件已打包

### 安装检查
- [ ] NSIS 安装程序可以正常安装
- [ ] Portable 版本可以直接运行
- [ ] 桌面快捷方式创建成功
- [ ] 开始菜单项创建成功

### 功能检查
- [ ] 应用可以正常启动
- [ ] 托盘图标正确显示
- [ ] 托盘菜单功能正常
- [ ] 图标状态可以切换
- [ ] 系统通知正常显示
- [ ] 窗口状态正确保存
- [ ] 配置持久化正常
- [ ] 开机自启动设置生效

### 上传功能检查
- [ ] 文件上传功能正常
- [ ] MD5 秒传功能正常
- [ ] 断点续传功能正常
- [ ] 上传通知正常显示

---

## 📚 相关文档

- **托盘功能测试**: `TRAY_ICON_TEST_GUIDE.md`
- **项目状态报告**: `PROJECT_STATUS.md`
- **Phase 1 测试结果**: `PHASE1_TEST_RESULTS.md`
- **打包配置**: `package.json` (build 字段)

---

## 🆘 获取帮助

如果遇到无法解决的问题:

1. 检查 Console 错误日志
2. 检查 Windows 事件查看器
3. 查看 electron-builder 日志: `release/builder-debug.yml`
4. 提交 Issue 到项目仓库

---

**祝打包和测试顺利！** 🚀
