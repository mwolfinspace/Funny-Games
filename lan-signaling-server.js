const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
const rooms = new Map();

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { host: null, guest: null });
  }
  return rooms.get(roomId);
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (!room.host && !room.guest) {
    rooms.delete(roomId);
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let data = null;
    try {
      data = JSON.parse(msg.toString());
    } catch (err) {
      send(ws, { type: 'error', message: 'Bad JSON' });
      return;
    }
    if (!data || !data.type) return;

    if (data.type === 'host') {
      const roomId = String(data.room || '').trim().toUpperCase();
      if (!roomId) {
        send(ws, { type: 'error', message: 'Missing room code' });
        return;
      }
      const room = getRoom(roomId);
      if (room.host && room.host !== ws) {
        send(ws, { type: 'error', message: 'Room already hosted' });
        return;
      }
      room.host = ws;
      ws.roomId = roomId;
      ws.role = 'host';
      send(ws, { type: 'hosted', room: roomId });
    } else if (data.type === 'join') {
      const roomId = String(data.room || '').trim().toUpperCase();
      const room = rooms.get(roomId);
      if (!room || !room.host) {
        send(ws, { type: 'error', message: 'Room not found' });
        return;
      }
      if (room.guest && room.guest !== ws) {
        send(ws, { type: 'error', message: 'Room full' });
        return;
      }
      room.guest = ws;
      ws.roomId = roomId;
      ws.role = 'guest';
      send(ws, { type: 'joined', room: roomId });
      send(room.host, { type: 'join', room: roomId });
    } else if (data.type === 'offer' || data.type === 'answer' || data.type === 'candidate') {
      const roomId = ws.roomId;
      const room = rooms.get(roomId);
      if (!room) return;
      const target = ws.role === 'host' ? room.guest : room.host;
      if (!target) {
        send(ws, { type: 'error', message: 'Peer not connected' });
        return;
      }
      send(target, data);
    }
  });

  ws.on('close', () => {
    const roomId = ws.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.host === ws) {
      room.host = null;
      send(room.guest, { type: 'error', message: 'Host disconnected' });
    } else if (room.guest === ws) {
      room.guest = null;
      send(room.host, { type: 'error', message: 'Guest disconnected' });
    }
    cleanupRoom(roomId);
  });
});

console.log(`LAN signaling server running on ws://0.0.0.0:${PORT}`);
