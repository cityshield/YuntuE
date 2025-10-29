# 盛世云图客户端 - 服务端配置说明

## 配置文件位置

客户端启动时会自动在**应用安装根目录**生成 `config.ini` 配置文件。

- **生产环境**：安装目录下（例如：`C:\Program Files\盛世云图\config.ini`）
- **开发环境**：项目根目录下（`config.ini`）

## 配置文件格式

配置文件采用 INI 格式，示例内容如下：

```ini
# 盛世云图客户端 - 服务端接口配置
# 修改此文件后需要重启客户端才能生效

# API 基础地址
# 开发环境示例: http://localhost:8000
# 测试环境示例: http://192.168.99.93:8000
# 生产环境示例: https://api.yuntu.com
apiBaseUrl=http://localhost:8000

# WebSocket 基础地址
# 开发环境示例: ws://localhost:8000
# 测试环境示例: ws://192.168.99.93:8000
# 生产环境示例: wss://api.yuntu.com
wsBaseUrl=ws://localhost:8000

# 当前环境
# 可选值: development, staging, production
environment=development
```

## 配置项说明

### apiBaseUrl
API 服务器基础地址，所有 HTTP 请求都会发送到此地址。

- 开发环境：`http://localhost:8000`
- 测试环境：`http://192.168.99.93:8000`
- 生产环境：`https://api.yuntu.com`

### wsBaseUrl
WebSocket 服务器基础地址，用于实时通信。

- 开发环境：`ws://localhost:8000`
- 测试环境：`ws://192.168.99.93:8000`
- 生产环境：`wss://api.yuntu.com`

### environment
当前运行环境标识，可选值：

- `development` - 开发环境
- `staging` - 测试/预发布环境
- `production` - 生产环境

## 如何切换环境

### 方法1：手动修改配置文件

1. 找到应用安装目录下的 `config.ini` 文件
2. 使用文本编辑器（如记事本）打开
3. 修改 `apiBaseUrl` 和 `wsBaseUrl` 为目标环境的地址
4. 修改 `environment` 为对应的环境名称
5. 保存文件
6. **重启客户端**使配置生效

### 方法2：删除配置文件重新生成

1. 关闭客户端
2. 删除 `config.ini` 文件
3. 启动客户端，会自动生成默认配置文件
4. 按方法1修改配置

## 常用环境配置示例

### 本地开发环境
```ini
apiBaseUrl=http://localhost:8000
wsBaseUrl=ws://localhost:8000
environment=development
```

### 内网测试环境
```ini
apiBaseUrl=http://192.168.99.93:8000
wsBaseUrl=ws://192.168.99.93:8000
environment=staging
```

### 生产环境
```ini
apiBaseUrl=https://api.yuntu.com
wsBaseUrl=wss://api.yuntu.com
environment=production
```

## 注意事项

1. **必须重启客户端**：修改配置文件后，必须完全退出并重新启动客户端才能使配置生效
2. **保持格式正确**：确保配置文件格式正确，`key=value` 之间没有多余空格
3. **HTTPS/WSS**：生产环境建议使用 HTTPS 和 WSS 协议保证安全性
4. **备份配置**：修改前建议备份原配置文件，避免配置错误导致无法连接服务器

## 故障排查

如果客户端无法连接服务器，请检查：

1. 配置文件中的 URL 是否正确
2. 服务器是否正常运行
3. 网络连接是否正常
4. 防火墙是否阻止了连接
5. 是否已重启客户端使配置生效

## 技术说明

配置文件由 Electron 主进程在应用启动时自动加载，前端应用会通过 IPC 通信获取配置信息并用于所有网络请求。
