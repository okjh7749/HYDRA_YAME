import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createMultiplayerHub } from '../src/multiplayer-hub.mjs';

class FakePeer extends EventEmitter {
  constructor() {
    super();
    this.closed = false;
    this.sent = [];
  }

  sendJson(message) {
    if (this.closed) return false;
    this.sent.push(message);
    return true;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}

test('last-player disconnect immediately publishes the authoritative match result', () => {
  const hub = createMultiplayerHub({ tickMs: 50 });
  const host = new FakePeer();
  const guest = new FakePeer();
  hub.connect(host);
  hub.connect(guest);

  host.emit('message', { type: 'create-room', name: 'Host' });
  const roomId = host.sent.find((message) => message.type === 'lobby').roomId;
  guest.emit('message', { type: 'join-room', roomId, name: 'Guest' });
  host.emit('message', { type: 'ready', ready: true });
  guest.emit('message', { type: 'ready', ready: true });
  host.emit('message', { type: 'start-room' });

  for (let tick = 0; tick < 70; tick += 1) hub.tick();
  const room = hub.rooms.get(roomId);
  assert.equal(room.state.match.phase, 'running');

  guest.sent = [];
  host.closed = true;
  host.emit('close');

  const finalSnapshot = guest.sent.find((message) => message.type === 'snapshot');
  const finalLobby = guest.sent.find((message) => message.type === 'lobby');
  assert.ok(finalSnapshot);
  assert.equal(finalSnapshot.match.phase, 'finished');
  assert.equal(finalSnapshot.match.result, 'victory');
  assert.equal(finalSnapshot.match.winnerTeam, 1);
  assert.equal(finalLobby.status, 'finished');

  hub.stop();
});
