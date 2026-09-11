import { EventEmitter } from 'node:events';
import {
  decodeJsonPayload,
  decodeWebSocketFrames,
  encodeJsonMessage,
  encodeWebSocketFrame,
  websocketAcceptValue,
} from './websocket-protocol.mjs';

export const REALTIME_BACKPRESSURE_BYTES = 128 * 1024;

function connectionHeaderIncludesUpgrade(value) {
  return String(value ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .includes('upgrade');
}

export class WebSocketPeer extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.closeEmitted = false;

    socket.on('data', (chunk) => this.#onData(chunk));
    socket.on('close', () => this.#finish());
    socket.on('end', () => this.#finish());
    socket.on('error', (error) => {
      this.emit('error', error);
      this.#finish();
    });
  }

  canSendRealtime(maxBufferedBytes = REALTIME_BACKPRESSURE_BYTES) {
    return !this.closed
      && !this.socket.destroyed
      && (this.socket.writableLength ?? 0) <= maxBufferedBytes;
  }

  sendJson(value, { realtime = false } = {}) {
    if (this.closed || this.socket.destroyed) return false;
    if (realtime && !this.canSendRealtime()) return false;
    return this.socket.write(encodeJsonMessage(value));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const reasonBytes = Buffer.from(String(reason).slice(0, 120));
    const payload = Buffer.alloc(2 + reasonBytes.length);
    payload.writeUInt16BE(code, 0);
    reasonBytes.copy(payload, 2);
    this.socket.write(encodeWebSocketFrame(payload, { opcode: 0x8 }));
    this.closed = true;
    this.socket.end();
  }

  #finish() {
    this.closed = true;
    if (this.closeEmitted) return;
    this.closeEmitted = true;
    this.emit('close');
  }

  #onData(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);

    let decoded;
    try {
      decoded = decodeWebSocketFrames(this.buffer, { requireMasked: true });
    } catch (error) {
      this.emit('protocol-error', error);
      this.close(1002, 'Protocol error');
      return;
    }
    this.buffer = Buffer.from(decoded.remaining);

    for (const frame of decoded.frames) {
      if (frame.opcode === 0x8) {
        this.close(1000);
        return;
      }
      if (frame.opcode === 0x9) {
        if (!this.closed) this.socket.write(encodeWebSocketFrame(frame.payload, { opcode: 0xa }));
        continue;
      }
      if (frame.opcode === 0xa) continue;
      if (frame.opcode !== 0x1) {
        this.close(1003, 'Text frames only');
        return;
      }

      try {
        this.emit('message', decodeJsonPayload(frame.payload));
      } catch (error) {
        this.emit('message-error', error);
        this.sendJson({ type: 'error', reason: 'invalid-json' });
      }
    }
  }
}

export function attachWebSocketServer(server, { path = '/ws', onConnection }) {
  const handleUpgrade = (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== path) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = request.headers['sec-websocket-key'];
    const version = request.headers['sec-websocket-version'];
    const valid = request.method === 'GET'
      && String(request.headers.upgrade ?? '').toLowerCase() === 'websocket'
      && connectionHeaderIncludesUpgrade(request.headers.connection)
      && typeof key === 'string'
      && version === '13';

    if (!valid) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = websocketAcceptValue(key);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${accept}\r\n`
      + '\r\n',
    );

    const peer = new WebSocketPeer(socket);
    onConnection(peer, request);
    if (head?.length) peer.socket.emit('data', head);
  };

  server.on('upgrade', handleUpgrade);
  return () => server.off('upgrade', handleUpgrade);
}
