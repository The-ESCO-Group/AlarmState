import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function staticResponse(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, service: 'alarmstate-multiplayer' }));
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { pathname = '/'; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relative);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const file = await import('node:fs/promises').then((fs) => fs.readFile(filePath));
    response.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=60',
      'x-content-type-options': 'nosniff',
    });
    response.end(file);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

export function createMultiplayerServer({ manager = new RoomManager() } = {}) {
  const server = http.createServer(staticResponse);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/ws') return socket.destroy();
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (ws) => {
    let room = null;
    let player = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      let message;
      try { message = JSON.parse(data.toString()); } catch { return manager.send(ws, { type: 'error', message: 'INVALID MESSAGE' }); }
      try {
        if (message.type === 'create') {
          if (room) throw new Error('ALREADY IN A ROOM');
          ({ room, player } = manager.createRoom(ws, message.name));
          manager.send(ws, { type: 'welcome', room: room.code, playerId: player.id, token: player.token });
        } else if (message.type === 'join') {
          if (room) throw new Error('ALREADY IN A ROOM');
          ({ room, player } = manager.joinRoom(ws, message.room, message.name, message.token));
          manager.send(ws, { type: 'welcome', room: room.code, playerId: player.id, token: player.token });
        } else {
          if (!room || !player) throw new Error('JOIN A ROOM FIRST');
          if (message.type === 'role') manager.setRole(room, player, message.role);
          else if (message.type === 'start') manager.startRoom(room, player);
          else if (message.type === 'position') manager.updatePosition(player, message);
          else if (message.type === 'submit') manager.submit(room, player, message.tag, message.requestId);
          else if (message.type === 'action') manager.recordAction(room, player, message.kind);
          else if (message.type === 'leave') ws.close(1000, 'Left room');
          else throw new Error('UNKNOWN COMMAND');
        }
        if (room) manager.broadcastState(room);
      } catch (error) {
        manager.send(ws, { type: 'error', message: String(error.message || error).slice(0, 160) });
      }
    });
    ws.on('close', () => {
      if (room && player) {
        manager.disconnect(room, player);
        manager.broadcastState(room);
      }
    });
  });

  const tick = setInterval(() => manager.tick(), 200);
  const broadcast = setInterval(() => {
    for (const room of manager.rooms.values()) manager.broadcastState(room);
  }, 250);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 15000);

  server.on('close', () => {
    clearInterval(tick);
    clearInterval(broadcast);
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  });
  return { server, wss, manager };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5191);
  const { server } = createMultiplayerServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`AlarmState multiplayer ready: http://127.0.0.1:${port}`);
    console.log(`LAN crews: http://<this-PC-ip>:${port}`);
  });
}
