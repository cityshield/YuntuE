/**
 * WebSocket 信令服务器
 * 用于协调 WebRTC 对等连接
 */

const WebSocket = require('ws');
const os = require('os');

const PORT = 9000;
const HOST = '0.0.0.0';
const wss = new WebSocket.Server({ port: PORT, host: HOST });

// 存储配对码和对应的连接
// 格式: { pairingCode: { sender: WebSocket, receiver: WebSocket } }
const rooms = new Map();

// 获取本机局域网 IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 跳过内部和非 IPv4 地址
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

console.log(`\n🚀 WebRTC 信令服务器已启动`);
console.log(`   监听地址: ${HOST}`);
console.log(`   端口: ${PORT}`);
console.log(`   局域网地址: ws://${localIP}:${PORT}`);
console.log(`   本地地址: ws://localhost:${PORT}`);
console.log(`\n💡 在另一台电脑上使用: ws://${localIP}:${PORT}`);
console.log(`   等待连接...\n`);

wss.on('connection', (ws) => {
  console.log('✅ 新客户端连接');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { type, pairingCode, role, signal } = data;

      switch (type) {
        case 'register':
          handleRegister(ws, pairingCode, role);
          break;

        case 'signal':
          handleSignal(ws, pairingCode, role, signal);
          break;

        case 'disconnect':
          handleDisconnect(pairingCode);
          break;

        default:
          console.warn('⚠️  未知消息类型:', type);
      }
    } catch (error) {
      console.error('❌ 消息解析错误:', error.message);
    }
  });

  ws.on('close', () => {
    console.log('❌ 客户端断开连接');
    // 清理断开连接的客户端
    for (const [code, room] of rooms.entries()) {
      if (room.sender === ws || room.receiver === ws) {
        rooms.delete(code);
        console.log(`🗑️  清理房间: ${code}`);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket 错误:', error.message);
  });
});

/**
 * 处理客户端注册
 */
function handleRegister(ws, pairingCode, role) {
  console.log(`📝 注册: 配对码=${pairingCode}, 角色=${role}`);

  if (!rooms.has(pairingCode)) {
    rooms.set(pairingCode, {});
  }

  const room = rooms.get(pairingCode);
  room[role] = ws;

  // 发送注册确认
  ws.send(JSON.stringify({
    type: 'registered',
    pairingCode,
    role
  }));

  // 如果发送方和接收方都已注册，通知双方可以开始连接
  if (room.sender && room.receiver) {
    console.log(`🔗 房间 ${pairingCode} 双方就绪，开始信令交换`);

    room.sender.send(JSON.stringify({
      type: 'ready',
      message: '接收方已就绪，可以开始发送文件'
    }));

    room.receiver.send(JSON.stringify({
      type: 'ready',
      message: '发送方已就绪，等待连接'
    }));
  }
}

/**
 * 处理信令消息（WebRTC offer/answer/ICE candidates）
 */
function handleSignal(ws, pairingCode, role, signal) {
  const room = rooms.get(pairingCode);

  if (!room) {
    console.warn(`⚠️  房间不存在: ${pairingCode}`);
    return;
  }

  // 转发信令消息给对方
  const targetRole = role === 'sender' ? 'receiver' : 'sender';
  const target = room[targetRole];

  if (target && target.readyState === WebSocket.OPEN) {
    target.send(JSON.stringify({
      type: 'signal',
      signal
    }));
    console.log(`📡 转发信令: ${role} -> ${targetRole}`);
  } else {
    console.warn(`⚠️  目标客户端未连接: ${targetRole}`);
  }
}

/**
 * 处理断开连接
 */
function handleDisconnect(pairingCode) {
  if (rooms.has(pairingCode)) {
    rooms.delete(pairingCode);
    console.log(`🗑️  房间已关闭: ${pairingCode}`);
  }
}

// 定时清理空房间
setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    const senderClosed = room.sender && room.sender.readyState !== WebSocket.OPEN;
    const receiverClosed = room.receiver && room.receiver.readyState !== WebSocket.OPEN;

    if (senderClosed && receiverClosed) {
      rooms.delete(code);
      console.log(`🧹 自动清理空房间: ${code}`);
    }
  }
}, 30000); // 每30秒清理一次

process.on('SIGINT', () => {
  console.log('\n\n👋 服务器关闭中...');
  wss.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});
