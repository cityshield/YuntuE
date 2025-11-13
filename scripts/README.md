# 打包脚本说明

## 自动打包脚本 (auto-pack.js)

### 功能
1. **自动递增版本号**：读取 `package.json` 中的版本号，最后一位小版本号 +1
2. **执行 Windows 打包**：运行 `npm run build:win` 构建 Windows 安装包
3. **复制到服务器目录**：自动将构建产物复制到服务器的更新目录

### 使用方法

只需要运行一个命令：

```bash
npm run pack
```

### 执行流程

```
当前版本 1.0.1
    ↓
自动变为 1.0.2
    ↓
执行 Windows 打包
    ↓
复制文件到服务器
    ↓
完成！
```

### 输出位置

- **本地构建产物**：`release/` 目录
- **服务器更新目录**：`/Users/pretty/Documents/Workspace/YuntuServer/static/client-updates/`
- **客户端访问地址**：`http://192.168.99.183:8000/client-updates/`

### 生成的文件

每次打包会生成：
- `盛世云图-v[版本号]-[时间戳].exe` - NSIS 安装包
- `盛世云图-v[版本号]-[时间戳]-Portable.exe` - 便携版
- `latest.yml` - 更新元数据文件

### 示例

```bash
$ npm run pack

[Auto Pack] ============================================================
[Auto Pack] Starting automatic packaging process...
[Auto Pack] ============================================================

[Auto Pack] Current version: 1.0.1
[Auto Pack] New version: 1.0.2
✓ Version updated: 1.0.1 → 1.0.2

[Auto Pack] Starting build process...
# ... 构建输出 ...
✓ Build completed!

[Auto Pack] Copying files to server update directory...
[Auto Pack]   Copied: 盛世云图-v1.0.2-20251107183000.exe
[Auto Pack]   Copied: 盛世云图-v1.0.2-20251107183000-Portable.exe
[Auto Pack]   Copied: latest.yml
✓ Copied 3 files to server update directory

[Auto Pack] ============================================================
✓ All done! 🎉
[Auto Pack] ============================================================

[Auto Pack] Version: 1.0.2
[Auto Pack] Files location: /Users/pretty/Documents/Workspace/YuntuServer/static/client-updates
[Auto Pack] Update URL: http://192.168.99.183:8000/client-updates/
```

### 注意事项

1. 确保 FastAPI 服务器正在运行
2. 确保服务器目录存在并有写入权限
3. 打包过程可能需要几分钟，请耐心等待
4. 所有已安装 v1.0.1+ 的客户端会自动检测到新版本

### 手动打包（不自动更新版本号）

如果需要手动控制版本号，可以使用：

```bash
npm run build:win
```

这不会自动修改版本号，也不会自动复制到服务器目录。
