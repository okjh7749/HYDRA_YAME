import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import test from 'node:test';

import { WebSocketPeer } from '../src/websocket-server.mjs';

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.writes = [];
  }

  write(value) {
    this.writes.push(Buffer.from(value));
    return true;
  }

  end() {
    this.emit('end');
    this.emit('close');
  }
}

test('graceful peer close emits one close event so room sessions can be released', () => {
  const socket = new FakeSocket();
  const peer = new WebSocketPeer(socket);
  let closeEvents = 0;
  peer.on('close', () => {
    closeEvents += 1;
  });

  peer.close(1000, 'done');

  assert.equal(peer.closed, true);
  assert.equal(closeEvents, 1);
  assert.equal(socket.writes.length, 1);
});

test('upgrade head data is delivered after the connection handler can subscribe', async () => {
  const { attachWebSocketServer } = await import('../src/websocket-server.mjs');
  const { encodeWebSocketFrame } = await import('../src/websocket-protocol.mjs');
  const server = new EventEmitter();
  const socket = new FakeSocket();
  let received = null;
  const detach = attachWebSocketServer(server, {
    path: '/ws',
    onConnection(peer) {
      peer.on('message', (message) => {
        received = message;
      });
    },
  });
  const head = encodeWebSocketFrame(JSON.stringify({ type: 'ping', value: 9 }), {
    masked: true,
    maskKey: Buffer.from([1, 2, 3, 4]),
  });

  server.emit('upgrade', {
    url: '/ws',
    method: 'GET',
    headers: {
      upgrade: 'websocket',
      connection: 'Upgrade',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
    },
  }, socket, head);

  assert.deepEqual(received, { type: 'ping', value: 9 });
  detach();
});
