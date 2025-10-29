# 端口配置说明

## 固定端口配置

为了避免CORS跨域问题,项目端口已固定如下:

### YuntuE (前端 Electron 应用)
- **端口**: `5173`
- **配置文件**: `vite.config.ts`
- **配置项**:
  ```typescript
  server: {
    port: 5173,
    strictPort: true, // 端口被占用时报错,不自动切换
  }
  ```

### YuntuServer (后端 API 服务)
- **端口**: `8000`
- **配置文件**: `.env`
- **配置项**: `PORT=8000`

### CORS 配置
- **配置文件**: `YuntuServer/.env`
- **配置项**:
  ```
  CORS_ORIGINS=["http://localhost:5173","https://yuntucv.com","https://www.yuntucv.com"]
  ```

## 重要提示

1. **不要修改端口号**: 如果修改了端口,需要同步更新CORS配置
2. **端口被占用**: 如果5173端口被占用,需要先关闭占用进程,而不是切换端口
3. **生产环境**: 生产环境使用域名访问,已在CORS中配置

## 查看端口占用

```bash
# 查看5173端口占用
lsof -i:5173

# 查看8000端口占用
lsof -i:8000

# 关闭端口占用进程
lsof -ti:5173 | xargs kill -9
```

## 启动顺序

1. 先启动后端: `cd YuntuServer && npm run dev` (或 `uvicorn app.main:app --reload`)
2. 再启动前端: `cd YuntuE && npm run dev`
