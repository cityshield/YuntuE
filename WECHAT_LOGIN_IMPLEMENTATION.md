# 微信登录前端实现文档

## 📋 实现总览

已完成微信扫码登录的完整前端实现，包括：
- ✅ 二维码动态生成和显示
- ✅ 自动轮询登录状态（2秒间隔）
- ✅ 5种状态界面（加载、等待扫码、已扫码、已过期、错误）
- ✅ 完整的用户交互流程
- ✅ 登录成功后自动跳转

---

## 🗂️ 文件结构

```
src/
├── api/
│   └── wechat.ts                    # 微信登录 API 接口
├── composables/
│   └── useWeChatLogin.ts            # 微信登录状态管理 Composable
└── views/
    └── Login.vue                     # 登录页面（已更新）
```

---

## 🎯 用户交互流程

### 1. 初始状态（加载中）
```
用户打开登录页 → 前端调用 generateQRCode()
                ↓
          显示加载动画
                ↓
          后端返回二维码数据
                ↓
          显示二维码 + 开始轮询
```

### 2. 等待扫码（pending）
```
┌─────────────────────────┐
│    微信扫码登录         │
│  请使用微信扫一扫       │
│  ┌─────────────────┐    │
│  │   [二维码显示]   │    │
│  └─────────────────┘    │
│  每2秒轮询一次状态      │
└─────────────────────────┘
```

### 3. 用户扫码（scanned）
```
用户扫码 → 后端状态变为 scanned
            ↓
    前端轮询检测到状态变化
            ↓
    界面显示：
    ┌─────────────────────┐
    │      ✓              │ ← 绿色成功图标 + 动画
    │    扫码成功         │
    │  请在手机上确认登录  │
    └─────────────────────┘
            ↓
    继续轮询等待用户确认
```

### 4. 用户确认（confirmed）
```
用户在手机上点击确认 → 后端状态变为 confirmed
                      ↓
              前端轮询检测到状态
                      ↓
              停止轮询 + 保存用户信息
                      ↓
              显示"登录成功" + 跳转到主界面
```

### 5. 二维码过期（expired）
```
超过5分钟未扫码 → 后端状态变为 expired
                  ↓
          前端轮询检测到过期
                  ↓
          停止轮询 + 显示：
          ┌─────────────────┐
          │      ✗          │ ← 红色错误图标
          │  二维码已过期    │
          │  [刷新二维码]    │ ← 可点击按钮
          └─────────────────┘
                  ↓
      用户点击刷新 → 重新生成二维码
```

---

## 📡 后端 API 接口规范

### 1. 生成二维码

**请求：**
```http
POST /api/v1/auth/wechat/qrcode
Content-Type: application/json

{
  "client_type": "desktop"
}
```

**响应示例：**
```json
{
  "scene_id": "550e8400-e29b-41d4-a716-446655440000",
  "qr_code_url": "weixin://wxpay/bizpayurl?pr=abc123xyz",
  "expires_in": 300,
  "created_at": "2025-11-03T13:00:00Z"
}
```

**字段说明：**
- `scene_id`: 唯一场景ID，用于后续状态查询
- `qr_code_url`: 微信扫码跳转链接（不是图片URL）
- `expires_in`: 二维码有效期（秒），通常为300秒（5分钟）
- `created_at`: 创建时间

**后端实现要点：**
1. 生成唯一的 `scene_id`（建议使用 UUID）
2. 将 `scene_id` 存储到 Redis，设置5分钟过期时间
3. 初始状态设为 `pending`
4. 生成微信登录二维码链接（需要微信开放平台配置）

---

### 2. 查询登录状态

**请求：**
```http
GET /api/v1/auth/wechat/status/{scene_id}
```

**响应示例（等待扫码）：**
```json
{
  "status": "pending"
}
```

**响应示例（已扫码）：**
```json
{
  "status": "scanned"
}
```

**响应示例（登录成功）：**
```json
{
  "status": "confirmed",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "张三",
    "phone": "13800138000",
    "avatar": "https://example.com/avatar.jpg",
    "balance": 1000.50,
    "member_level": 1
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**响应示例（已过期）：**
```json
{
  "status": "expired",
  "message": "二维码已过期"
}
```

**响应示例（用户取消）：**
```json
{
  "status": "canceled",
  "message": "用户已取消登录"
}
```

**状态说明：**
- `pending`: 等待用户扫码
- `scanned`: 用户已扫码，等待确认
- `confirmed`: 用户已确认，登录成功
- `expired`: 二维码已过期（超过5分钟）
- `canceled`: 用户在手机上取消登录

**后端实现要点：**
1. 从 Redis 中查询 `scene_id` 对应的状态
2. 如果不存在，返回 `expired` 状态
3. 根据实际状态返回对应数据
4. 登录成功时，返回完整的用户信息和 token

---

### 3. 取消登录（可选）

**请求：**
```http
POST /api/v1/auth/wechat/cancel/{scene_id}
```

**响应：**
```json
{
  "success": true
}
```

**说明：**
- 用户关闭登录页面时，前端会调用此接口通知后端
- 后端可以清理 Redis 中的数据
- 此接口为可选，不实现也不影响核心功能

---

## 🔧 后端实现建议

### 技术方案

#### 方案 A：轮询 + Redis（推荐）
```python
# 伪代码
async def generate_qrcode():
    scene_id = str(uuid.uuid4())

    # 存储到 Redis，5分钟过期
    await redis.setex(
        f"wechat_login:{scene_id}",
        300,  # 5分钟
        json.dumps({"status": "pending"})
    )

    # 生成微信登录链接
    qr_url = generate_wechat_url(scene_id)

    return {
        "scene_id": scene_id,
        "qr_code_url": qr_url,
        "expires_in": 300,
        "created_at": datetime.now().isoformat()
    }

async def check_status(scene_id: str):
    # 从 Redis 查询状态
    data = await redis.get(f"wechat_login:{scene_id}")

    if not data:
        return {"status": "expired"}

    status_data = json.loads(data)
    return status_data

# 微信回调处理
async def wechat_callback(code: str, state: str):
    # state 就是 scene_id
    scene_id = state

    # 1. 使用 code 向微信获取 access_token
    wx_token = await get_wechat_access_token(code)

    # 2. 使用 access_token 获取用户信息
    wx_user_info = await get_wechat_user_info(wx_token)

    # 3. 查询或创建本地用户
    user = await get_or_create_user(wx_user_info)

    # 4. 生成本地 JWT token
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    # 5. 更新 Redis 状态为 confirmed
    await redis.setex(
        f"wechat_login:{scene_id}",
        60,  # 保留1分钟供前端查询
        json.dumps({
            "status": "confirmed",
            "user": user.dict(),
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "Bearer",
            "expires_in": 3600
        })
    )

    return "登录成功"
```

#### 方案 B：WebSocket（可选增强）
如果想要更实时的体验，可以在方案 A 的基础上增加 WebSocket 推送：

```python
# 前端建立 WebSocket 连接
ws = WebSocket(f"ws://api.example.com/ws/wechat/login/{scene_id}")

# 后端在状态变化时推送
async def update_login_status(scene_id: str, status: dict):
    # 更新 Redis
    await redis.setex(f"wechat_login:{scene_id}", 300, json.dumps(status))

    # 推送到 WebSocket（如果连接存在）
    await websocket_manager.send(scene_id, status)
```

---

## 🧪 前端测试方法

### 方法 1：等待后端完成
后端实现完整的 API 后，前端会自动工作。

### 方法 2：Mock 数据测试（开发中）
可以在浏览器控制台手动模拟状态变化：

```javascript
// 打开登录页后，在控制台执行：

// 1. 模拟扫码成功
window.__wechatLoginTest = {
  mockScanned: () => {
    // 需要修改 composable 暴露测试接口
  }
}

// 2. 模拟登录成功
// 手动调用 handleWeChatLoginSuccess 函数

// 3. 模拟过期
// 修改 qrCodeUrl 为空，状态为 expired
```

### 方法 3：使用 Mock Service Worker
创建 MSW mock：

```typescript
// src/mocks/handlers.ts
import { rest } from 'msw'

export const handlers = [
  // 生成二维码
  rest.post('/api/v1/auth/wechat/qrcode', (req, res, ctx) => {
    const sceneId = Math.random().toString(36).substring(7)
    return res(
      ctx.json({
        scene_id: sceneId,
        qr_code_url: `weixin://wxpay/bizpayurl?pr=${sceneId}`,
        expires_in: 300,
        created_at: new Date().toISOString()
      })
    )
  }),

  // 查询状态（模拟流程）
  rest.get('/api/v1/auth/wechat/status/:sceneId', (req, res, ctx) => {
    // 第1-2次返回 pending
    // 第3-4次返回 scanned
    // 第5次返回 confirmed
    const callCount = window.__mockCallCount || 0
    window.__mockCallCount = callCount + 1

    if (callCount < 2) {
      return res(ctx.json({ status: 'pending' }))
    } else if (callCount < 4) {
      return res(ctx.json({ status: 'scanned' }))
    } else {
      return res(ctx.json({
        status: 'confirmed',
        user: {
          id: 'test-user-id',
          username: '测试用户',
          phone: '13800138000',
          avatar: null,
          balance: 0,
          member_level: 1
        },
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600
      }))
    }
  })
]
```

---

## 📝 代码位置索引

### `src/api/wechat.ts`
- **generateQRCode()** (第43-65行) - 生成二维码
- **checkLoginStatus()** (第70-98行) - 检查登录状态
- **cancelLogin()** (第103-112行) - 取消登录

### `src/composables/useWeChatLogin.ts`
- **generateQRCode()** (第61-81行) - 生成二维码
- **checkStatus()** (第86-122行) - 检查状态（轮询调用）
- **startPolling()** (第127-140行) - 开始轮询
- **stopPolling()** (第145-151行) - 停止轮询
- **refreshQRCode()** (第156-168行) - 刷新二维码

### `src/views/Login.vue`
- **模板部分** (第116-176行) - 微信登录UI
- **handleWeChatLoginSuccess()** (第411-433行) - 登录成功处理
- **watch(activeTab)** (第465-473行) - 监听切换登录方式
- **onMounted()** (第476-480行) - 页面加载时初始化
- **样式部分** (第1098-1205行) - 微信登录样式

---

## ⚠️ 注意事项

1. **安全性**
   - 确保 `scene_id` 足够随机，使用 UUID v4
   - Redis 数据必须设置过期时间
   - JWT token 需要包含过期时间验证

2. **性能优化**
   - 前端轮询间隔为 2 秒，不要设置太短
   - Redis 数据在 confirmed 后可以缩短过期时间（如1分钟）
   - 考虑使用 WebSocket 减少轮询请求

3. **用户体验**
   - 过期后自动停止轮询
   - 切换登录方式时停止轮询
   - 提供刷新按钮方便用户重试

4. **微信配置**
   - 需要在微信开放平台注册应用
   - 配置回调域名
   - 获取 AppID 和 AppSecret

---

## 📞 问题解答

### Q1: 扫码后，客户端会显示已扫码，让用户在手机上确认吗？
**A:** 是的。当用户扫码后，后端将状态更新为 `scanned`，前端轮询检测到后会立即显示：
- ✓ 绿色成功图标（带动画）
- "扫码成功"文字
- "请在手机上确认登录"提示

### Q2: 如果二维码过期被用户扫到了，怎么处理的？
**A:** 有两种情况：
1. **过期后扫码**：微信会直接提示"二维码已失效"，用户无法继续操作
2. **前端检测**：前端轮询会检测到 `expired` 状态，自动停止轮询并显示"刷新二维码"按钮

流程：
```
二维码生成 → 5分钟倒计时 → 过期
                            ↓
                前端检测到 expired 状态
                            ↓
            显示：✗ 二维码已过期 [刷新二维码]
                            ↓
            用户点击刷新 → 重新生成新二维码
```

---

## ✅ 实现检查清单

### 前端（已完成）
- [x] API 接口定义 (`src/api/wechat.ts`)
- [x] 状态管理 Composable (`src/composables/useWeChatLogin.ts`)
- [x] 登录界面更新 (`src/views/Login.vue`)
- [x] 二维码组件集成 (`qrcode.vue`)
- [x] 5种状态界面实现
- [x] 轮询机制实现
- [x] 生命周期管理
- [x] 动画效果
- [x] TypeScript 类型定义

### 后端（待实现）
- [ ] POST `/api/v1/auth/wechat/qrcode` - 生成二维码
- [ ] GET `/api/v1/auth/wechat/status/:scene_id` - 查询状态
- [ ] POST `/api/v1/auth/wechat/cancel/:scene_id` - 取消登录（可选）
- [ ] 微信回调处理
- [ ] Redis 状态管理
- [ ] 用户信息关联
- [ ] JWT token 生成

---

## 🚀 下一步行动

1. **立即可做：**
   - 在浏览器中查看登录页面效果
   - 切换登录方式测试动画
   - 查看二维码占位符显示

2. **后端开发：**
   - 实现三个 API 接口
   - 配置微信开放平台
   - 实现微信回调处理
   - 测试完整流程

3. **联调测试：**
   - 前后端接口联调
   - 测试完整登录流程
   - 测试过期和错误场景
   - 性能优化

---

生成时间: 2025-11-03 21:00
前端开发: Claude Code ✨
