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

test('hub sends reliable lockstep frames and supports bootstrap resync', () => {
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

  const bootstrap = host.sent.find((message) => message.type === 'lockstep-bootstrap');
  assert.ok(bootstrap);
  assert.equal(bootstrap.bootstrap.tick, 0);
  assert.equal(bootstrap.bootstrap.checksumTick, 0);

  host.canSendRealtime = () => false;
  guest.canSendRealtime = () => false;
  for (let tick = 0; tick < 70; tick += 1) hub.tick();

  const room = hub.rooms.get(roomId);
  assert.equal(room.state.match.phase, 'running');
  const own = room.state.units.find(
    (unit) => unit.type === 'hydra' && unit.ownerSlot === 0,
  );
  assert.ok(own);

  host.sent = [];
  guest.sent = [];
  host.emit('message', {
    type: 'command',
    requestId: 99,
    command: {
      type: 'move',
      unitIds: [own.id],
      x: room.map.zones[12].x,
      y: room.map.zones[12].y,
    },
  });

  const commandResult = host.sent.find((message) => message.type === 'command-result');
  assert.equal(commandResult.result.queued, true);
  assert.equal(host.sent.some((message) => message.type === 'lockstep-command'), false);
  assert.equal(guest.sent.some((message) => message.type === 'lockstep-command'), false);

  host.sent = [];
  guest.sent = [];
  for (let tick = 0; tick < 3; tick += 1) hub.tick();

  const commandFrame = host.sent.find(
    (message) => message.type === 'lockstep-frame'
      && message.commands.some((command) => command.type === 'move'),
  );
  assert.ok(commandFrame);
  assert.equal(
    guest.sent.some(
      (message) => message.type === 'lockstep-frame'
        && message.commands.some((command) => command.type === 'move'),
    ),
    true,
  );

  host.sent = [];
  host.emit('message', { type: 'lockstep-resync', requestId: 100 });
  const resync = host.sent.find((message) => message.type === 'lockstep-bootstrap');
  assert.ok(resync);
  assert.equal(resync.bootstrap.tick, room.tick);
  assert.equal(resync.bootstrap.checksumTick, room.tick);

  hub.stop();
});
