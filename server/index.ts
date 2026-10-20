/**
 * Mira sync server.
 *
 * Speaks the y-websocket protocol (sync + awareness), keeps one Yjs document per
 * board in memory and saves it to DATA_DIR/<board>.bin. In production it also
 * serves the built web app from dist/, so one process is the whole service.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Board } from '../src/model/board';
import { sampleBoard } from '../src/model/sample';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? process.env.MIRA_PORT ?? 1234);
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(ROOT, 'data'));
const DIST = path.join(ROOT, 'dist');
const SERVE_APP = process.env.NODE_ENV === 'production';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SAVE_DELAY = 1000;
const PING_EVERY = 30_000;

fs.mkdirSync(DATA_DIR, { recursive: true });

interface Room {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
  saveTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Room>();
const fileFor = (name: string) => path.join(DATA_DIR, `${name}.bin`);

function save(room: Room): void {
  if (room.saveTimer) { clearTimeout(room.saveTimer); room.saveTimer = null; }
  const tmp = fileFor(room.name) + '.tmp';
  fs.writeFileSync(tmp, Y.encodeStateAsUpdate(room.doc));
  fs.renameSync(tmp, fileFor(room.name));
}

function getRoom(name: string): Room {
  let room = rooms.get(name);
  if (room) return room;
  const doc = new Y.Doc();
  const file = fileFor(name);
  if (fs.existsSync(file)) Y.applyUpdate(doc, fs.readFileSync(file));
  else if (name === 'demo') {
    const s = sampleBoard();
    new Board(doc).replaceAll(s.items, s.links, s.title);
  }
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  const r: Room = { name, doc, awareness, conns: new Map(), saveTimer: null };
  room = r;

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    r.conns.forEach((_, conn) => { if (conn !== origin) send(r, conn, msg); });
    r.saveTimer ??= setTimeout(() => save(r), SAVE_DELAY);
  });

  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    const changed = added.concat(updated, removed);
    const ids = r.conns.get(origin as WebSocket);
    if (ids) {
      added.forEach((id) => ids.add(id));
      removed.forEach((id) => ids.delete(id));
    }
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
    const msg = encoding.toUint8Array(enc);
    r.conns.forEach((_, conn) => send(r, conn, msg));
  });

  rooms.set(name, r);
  return r;
}

function send(room: Room, conn: WebSocket, msg: Uint8Array): void {
  if (conn.readyState !== WebSocket.OPEN) { close(room, conn); return; }
  conn.send(msg, (err) => { if (err) close(room, conn); });
}

function close(room: Room, conn: WebSocket): void {
  const ids = room.conns.get(conn);
  if (!ids) return;
  room.conns.delete(conn);
  awarenessProtocol.removeAwarenessStates(room.awareness, [...ids], null);
  if (room.conns.size === 0) {
    save(room);
    room.doc.destroy();
    rooms.delete(room.name);
  }
  conn.close();
}

function onConnection(conn: WebSocket, roomName: string): void {
  conn.binaryType = 'arraybuffer';
  const room = getRoom(roomName);
  room.conns.set(conn, new Set());

  conn.on('message', (data: ArrayBuffer) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const type = decoding.readVarUint(decoder);
      if (type === MSG_SYNC) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, enc, room.doc, conn);
        if (encoding.length(enc) > 1) send(room, conn, encoding.toUint8Array(enc));
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn);
      }
    } catch (err) {
      console.error(`[${roomName}] bad message`, err);
    }
  });

  let alive = true;
  conn.on('pong', () => { alive = true; });
  const ping = setInterval(() => {
    if (!alive) { clearInterval(ping); close(room, conn); return; }
    alive = false;
    try { conn.ping(); } catch { clearInterval(ping); close(room, conn); }
  }, PING_EVERY);
  conn.on('close', () => { clearInterval(ping); close(room, conn); });

  // Start the handshake: our state vector, then everyone who is here.
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  send(room, conn, encoding.toUint8Array(enc));
  const states = room.awareness.getStates();
  if (states.size) {
    const a = encoding.createEncoder();
    encoding.writeVarUint(a, MSG_AWARENESS);
    encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]));
    send(room, conn, encoding.toUint8Array(a));
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, boards: rooms.size }));
    return;
  }
  if (!SERVE_APP) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Mira sync server. Open the app at http://localhost:5173');
    return;
  }
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': type, 'cache-control': cache });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const m = /^\/ws\/([A-Za-z0-9_-]{1,64})\/?(?:\?.*)?$/.exec(req.url ?? '');
  if (!m) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, m[1]));
});

function shutdown(): void {
  rooms.forEach((r) => save(r));
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`Mira sync server on :${PORT}, boards saved in ${DATA_DIR}${SERVE_APP ? ', serving dist/' : ''}`);
});
