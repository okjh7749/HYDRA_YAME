import assert from 'node:assert/strict';
import test from 'node:test';

import { computeStableLockstepChecksum } from '../src/lockstep-checksum.mjs';
import {
  createRoom,
  handleRoomCommand,
  joinRoom,
  setRoomReady,
  startRoom,
  tickRoom,
} from '../src/game-room.mjs';
import {
  applyLockstepFrame,
  projectLockstepSnapshot,
  restoreLockstepRoom,
  serializeLockstepBootstrap,
} from '../src/lockstep-sync.mjs';

function createStartedRoom() {
  const room = createRoom({ id: 'LOCK', hostId: 'host', hostName: 'Host' });
  assert.equal(joinRoom(room, { clientId: 'guest', name: 'Guest' }).ok, true);
  setRoomReady(room, 'host', true);
  setRoomReady(room, 'guest', true);
  assert.equal(startRoom(room, 'host').ok, true);
  return room;
}

function frameAfterTick(room, frameTick) {
  const checksumReady = room.stateChecksumTick === room.tick;
  return {
    type: 'lockstep-frame',
    roomId: room.id,
    tick: frameTick,
    serverTick: room.tick,
    commands: (room.lastLockstepExecutions ?? []).map((entry) => entry.command),
    checksum: checksumReady ? room.stateChecksum >>> 0 : null,
    checksumTick: checksumReady ? room.stateChecksumTick : null,
  };
}

function advancePair(server, shadow) {
  const frameTick = server.tick;
  tickRoom(server, 50);
  const result = applyLockstepFrame(shadow, frameAfterTick(server, frameTick));
  assert.equal(result.ok, true, result.reason ?? 'lockstep frame should apply');
  assert.equal(shadow.tick, server.tick);
  assert.equal(
    computeStableLockstepChecksum(shadow.state, shadow.map),
    computeStableLockstepChecksum(server.state, server.map),
  );
  return result;
}

test('bootstrap round trip restores deterministic maps and checksum', () => {
  const server = createStartedRoom();
  const bootstrap = serializeLockstepBootstrap(server);
  const shadow = restoreLockstepRoom(bootstrap);

  assert.equal(shadow.bootstrapChecksumMatches, true);
  assert.equal(shadow.tick, server.tick);
  assert.ok(shadow.state.spawnAccumulators instanceof Map);
  assert.ok(shadow.state.spawnSequence instanceof Map);
  assert.ok(shadow.state.beaconCenters instanceof Map);
  assert.equal(
    computeStableLockstepChecksum(shadow.state, shadow.map),
    computeStableLockstepChecksum(server.state, server.map),
  );
});

test('shadow simulation replays server frames through movement and upgrades', () => {
  const server = createStartedRoom();
  const shadow = restoreLockstepRoom(serializeLockstepBootstrap(server));

  for (let tick = 0; tick < 75; tick += 1) advancePair(server, shadow);
  assert.equal(server.state.match.phase, 'running');

  const own = server.state.units.find(
    (unit) => unit.type === 'hydra' && unit.ownerSlot === 0,
  );
  assert.ok(own);
  const target = server.map.zones[12];
  const move = handleRoomCommand(server, 'host', {
    type: 'attack-move',
    unitIds: [own.id],
    x: target.x,
    y: target.y,
  });
  const upgrade = handleRoomCommand(server, 'host', {
    type: 'upgrade',
    buildingId: 'upgrade-0-evolution',
    upgradeKey: 'attack',
  });

  assert.equal(move.queued, true);
  assert.equal(upgrade.queued, true);
  for (let tick = 0; tick < 5; tick += 1) advancePair(server, shadow);

  const shadowOwn = shadow.state.units.find((unit) => unit.id === own.id);
  assert.equal(shadowOwn.orderType, 'attack-move');
  assert.equal(
    shadow.state.players[0].upgrades.attack,
    server.state.players[0].upgrades.attack,
  );
  assert.equal(
    computeStableLockstepChecksum(shadow.state, shadow.map),
    computeStableLockstepChecksum(server.state, server.map),
  );
});

test('shadow detects a missing lockstep frame before advancing', () => {
  const server = createStartedRoom();
  const shadow = restoreLockstepRoom(serializeLockstepBootstrap(server));

  const result = applyLockstepFrame(shadow, {
    type: 'lockstep-frame',
    roomId: server.id,
    tick: shadow.tick + 1,
    serverTick: shadow.tick + 2,
    commands: [],
    checksum: null,
    checksumTick: null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'frame-gap');
  assert.equal(shadow.tick, server.tick);
});

test('local lockstep projection preserves the authoritative client visibility filter', () => {
  const server = createStartedRoom();
  const shadow = restoreLockstepRoom(serializeLockstepBootstrap(server));
  const projected = projectLockstepSnapshot(shadow, 'host', 7);
  const hiddenEnemy = server.state.units.find(
    (unit) => unit.type === 'zealot' && unit.team === 1,
  );

  assert.ok(projected);
  assert.ok(hiddenEnemy);
  assert.equal(projected.sequence, 7);
  assert.equal(projected.source, 'lockstep-local');
  assert.equal(projected.serverTick, shadow.tick);
  assert.equal(projected.snapshotIntervalMs, 50);
  assert.equal(projected.units.some((unit) => unit.id === hiddenEnemy.id), false);
  assert.equal(projected.beacons.every((pad) => pad.ownerSlot === projected.self.slot), true);
  assert.equal(projected.buildings.every((building) => building.ownerSlot === projected.self.slot), true);
  assert.equal(projected.teams.find((team) => team.team === 1).minerals, '?');
});
