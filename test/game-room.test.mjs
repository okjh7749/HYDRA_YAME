import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUSY_SNAPSHOT_INTERVAL_MS,
  HEAVY_SNAPSHOT_INTERVAL_MS,
  MAX_ROOM_PLAYERS,
  SLOT_JOIN_ORDER,
  createRoom,
  handleRoomCommand,
  joinRoom,
  leaveRoom,
  roomNeedsSnapshot,
  snapshotIntervalForRoom,
  setRoomReady,
  snapshotForClient,
  startRoom,
  tickRoom,
} from '../src/game-room.mjs';

function createTwoPlayerRoom() {
  const room = createRoom({ id: 'ABCD', hostId: 'host', hostName: 'Host' });
  assert.equal(joinRoom(room, { clientId: 'guest', name: 'Guest' }).ok, true);
  setRoomReady(room, 'host', true);
  setRoomReady(room, 'guest', true);
  return room;
}

function startAndAdvance(room) {
  assert.equal(startRoom(room, 'host').ok, true);
  for (let tick = 0; tick < 70; tick += 1) tickRoom(room, 50);
}

test('fills eight seats across four teams before using teammate slots', () => {
  const room = createRoom({ id: 'seat', hostId: 'p0', hostName: 'P0' });
  for (let index = 1; index < MAX_ROOM_PLAYERS; index += 1) {
    const result = joinRoom(room, { clientId: `p${index}`, name: `P${index}` });
    assert.equal(result.ok, true);
  }

  assert.deepEqual(room.players.map((player) => player.slot), SLOT_JOIN_ORDER);
  assert.deepEqual(room.players.map((player) => player.team), [0, 1, 2, 3, 0, 1, 2, 3]);
  assert.deepEqual(
    joinRoom(room, { clientId: 'overflow', name: 'Overflow' }),
    { ok: false, reason: 'room-full' },
  );
});

test('host can start only after two players are ready', () => {
  const room = createRoom({ id: 'ready', hostId: 'host', hostName: 'Host' });

  assert.deepEqual(startRoom(room, 'host'), { ok: false, reason: 'need-more-players' });
  joinRoom(room, { clientId: 'guest', name: 'Guest' });
  setRoomReady(room, 'host', true);
  assert.deepEqual(startRoom(room, 'host'), { ok: false, reason: 'not-ready' });
  setRoomReady(room, 'guest', true);

  const result = startRoom(room, 'host');
  assert.equal(result.ok, true);
  assert.deepEqual(result.teams, [0, 1]);
  assert.equal(room.state.match.phase, 'countdown');
  assert.equal(room.state.players[1].status, 'eliminated');
  assert.equal(room.state.players[2].status, 'active');
  assert.equal(room.map.zones.some((zone) => zone.ownerTeam === 2), false);
});

test('authoritative room advances at 50ms ticks and emits snapshots every 100ms', () => {
  const room = createTwoPlayerRoom();
  assert.equal(startRoom(room, 'host').ok, true);

  tickRoom(room, 50);
  assert.equal(room.tick, 1);
  assert.equal(room.state.match.countdownMs, 2950);
  assert.equal(roomNeedsSnapshot(room), false);

  tickRoom(room, 50);
  assert.equal(room.tick, 2);
  assert.equal(roomNeedsSnapshot(room), true);
  assert.equal(room.snapshotSequence, 1);

  for (let tick = 0; tick < 58; tick += 1) tickRoom(room, 50);
  assert.equal(room.state.match.phase, 'running');

  for (let tick = 0; tick < 10; tick += 1) tickRoom(room, 50);
  const hydraTeams = new Set(
    room.state.units.filter((unit) => unit.type === 'hydra').map((unit) => unit.team),
  );
  assert.equal(hydraTeams.has(0), true);
  assert.equal(hydraTeams.has(1), true);
});

test('snapshot cadence relaxes automatically for large armies', () => {
  const room = createRoom({ id: 'load', hostId: 'host', hostName: 'Host' });

  room.state.units = Array.from({ length: 120 }, () => ({}));
  assert.equal(snapshotIntervalForRoom(room), BUSY_SNAPSHOT_INTERVAL_MS);
  room.snapshotAccumulatorMs = BUSY_SNAPSHOT_INTERVAL_MS - 1;
  assert.equal(roomNeedsSnapshot(room), false);
  room.snapshotAccumulatorMs += 1;
  assert.equal(roomNeedsSnapshot(room), true);

  room.state.units = Array.from({ length: 240 }, () => ({}));
  assert.equal(snapshotIntervalForRoom(room), HEAVY_SNAPSHOT_INTERVAL_MS);
});

test('server move command ignores enemy ids and moves only the callers team', () => {
  const room = createTwoPlayerRoom();
  startAndAdvance(room);

  const own = room.state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  const enemy = room.state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 2);
  assert.ok(own);
  assert.ok(enemy);

  const result = handleRoomCommand(room, 'host', {
    type: 'move',
    unitIds: [own.id, enemy.id],
    x: room.map.zones[16].x,
    y: room.map.zones[16].y,
  });

  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(result.ordered, 1);
  assert.equal(own.path.length, 0);
  for (let tick = 0; tick < 3; tick += 1) tickRoom(room, 50);
  assert.equal(own.path.length > 0, true);
  assert.equal(enemy.path.length, 0);
});

test('server attack-move keeps ownership validation and records the combat order', () => {
  const room = createTwoPlayerRoom();
  startAndAdvance(room);

  const own = room.state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  const enemy = room.state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 2);
  assert.ok(own);
  assert.ok(enemy);

  const target = room.map.zones[16];
  const result = handleRoomCommand(room, 'host', {
    type: 'attack-move',
    unitIds: [own.id, enemy.id],
    x: target.x,
    y: target.y,
  });

  assert.equal(result.ok, true);
  assert.equal(result.type, 'attack-move');
  assert.equal(result.queued, true);
  assert.equal(result.ordered, 1);
  assert.equal(own.orderType, undefined);
  for (let tick = 0; tick < 3; tick += 1) tickRoom(room, 50);
  assert.equal(own.orderType, 'attack-move');
  assert.deepEqual(own.attackMoveTarget, { x: target.x, y: target.y });
  assert.equal(enemy.orderType, undefined);
});

test('server validates and applies upgrades for the callers team', () => {
  const room = createTwoPlayerRoom();
  startAndAdvance(room);

  const before = room.state.players[0].minerals;
  const result = handleRoomCommand(room, 'host', {
    type: 'upgrade',
    buildingId: 'upgrade-0-evolution',
    upgradeKey: 'attack',
  });

  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(room.state.players[0].upgrades.attack, 0);
  assert.equal(room.state.players[0].minerals, before);
  for (let tick = 0; tick < 3; tick += 1) tickRoom(room, 50);
  assert.equal(room.state.players[0].upgrades.attack, 1);
  assert.equal(room.state.players[0].minerals, before - 50);

  const enemyBuilding = handleRoomCommand(room, 'host', {
    type: 'upgrade',
    buildingId: 'upgrade-2-evolution',
    upgradeKey: 'attack',
  });
  assert.equal(enemyBuilding.ok, false);
  assert.equal(enemyBuilding.reason, 'not-owned');
});

test('snapshots withhold unseen enemy units until the player becomes a spectator', () => {
  const room = createTwoPlayerRoom();
  assert.equal(startRoom(room, 'host').ok, true);

  const hiddenEnemy = room.state.units.find(
    (unit) => unit.type === 'zealot' && unit.team === 1,
  );
  assert.ok(hiddenEnemy);

  const playing = snapshotForClient(room, 'host');
  assert.equal(playing.units.some((unit) => unit.id === hiddenEnemy.id), false);
  assert.equal(playing.beacons.length, 8);
  assert.equal(playing.beacons.every((pad) => pad.ownerSlot === playing.self.slot), true);
  assert.equal(playing.beacons.every((pad) => pad.team === playing.self.team), true);
  assert.equal(playing.self.homeX, 256);
  assert.equal(playing.self.homeY, 1408);
  assert.equal(playing.visionSources.length > 0, true);
  assert.equal(
    playing.visionSources.some((source) => {
      const dx = playing.self.homeX - source.x;
      const dy = playing.self.homeY - source.y;
      return dx * dx + dy * dy <= source.radius * source.radius;
    }),
    true,
  );
  assert.equal(playing.buildings.length, 2);
  assert.equal(playing.buildings.every((building) => building.ownerSlot === playing.self.slot), true);
  assert.equal(playing.lockstep.inputDelayTicks, 2);
  assert.equal(typeof playing.lockstep.checksum, 'number');
  assert.equal(playing.lockstep.poolCount, room.unitPool.count);
  assert.equal(playing.lockstep.checksumTick, room.stateChecksumTick);
  assert.equal(playing.teams.find((team) => team.team === 1).minerals, '?');
  assert.equal(playing.teams.find((team) => team.team === 1).hydras, '?');

  room.state.players[0].status = 'eliminated';
  const spectating = snapshotForClient(room, 'host');
  assert.equal(spectating.self.spectator, true);
  assert.equal(spectating.beacons.length, 64);
  assert.equal(spectating.buildings.length, 4);
  assert.equal(spectating.units.some((unit) => unit.id === hiddenEnemy.id), true);
  assert.equal(typeof spectating.teams.find((team) => team.team === 1).minerals, 'number');
  assert.equal(spectating.visionSources.length, 1);
  assert.equal(
    spectating.visionSources[0].radius >= Math.hypot(room.map.worldWidth, room.map.worldHeight),
    true,
  );
});

test('finished snapshots derive victory or defeat from each clients own team', () => {
  const room = createTwoPlayerRoom();
  assert.equal(startRoom(room, 'host').ok, true);
  room.state.match.phase = 'finished';
  room.state.match.winnerTeam = 1;
  room.state.match.result = 'victory';

  const hostSnapshot = snapshotForClient(room, 'host');
  const guestSnapshot = snapshotForClient(room, 'guest');

  assert.equal(hostSnapshot.match.result, 'defeat');
  assert.equal(guestSnapshot.match.result, 'victory');
});

test('disconnect eliminates only that player slot while its allied force can survive', () => {
  const room = createRoom({ id: 'leave', hostId: 'p0', hostName: 'P0' });
  for (let index = 1; index < 5; index += 1) {
    assert.equal(joinRoom(room, { clientId: `p${index}`, name: `P${index}` }).ok, true);
  }
  for (const player of room.players) setRoomReady(room, player.id, true);
  assert.equal(startRoom(room, 'p0').ok, true);

  const teammate = room.players.find((player) => player.id === 'p4');
  assert.equal(teammate.team, 0);
  const p0Zone = room.map.zones.find((zone) => zone.ownerSlot === 0);
  const teammateZone = room.map.zones.find((zone) => zone.ownerSlot === 1);
  assert.ok(p0Zone);
  assert.ok(teammateZone);

  leaveRoom(room, 'p0');
  assert.equal(room.state.players[0].status, 'eliminated');
  assert.equal(room.state.players[1].status, 'active');
  assert.equal(p0Zone.ownerTeam, null);
  assert.equal(teammateZone.ownerTeam, 0);
  assert.equal(room.status, 'running');

  leaveRoom(room, 'p4');
  assert.equal(room.state.players[1].status, 'eliminated');
  assert.equal(teammateZone.ownerTeam, null);
  assert.equal(
    room.state.units.some((unit) => unit.team === 0),
    false,
  );
});

test('server ownership validation does not let allied players co-control units', () => {
  const room = createRoom({ id: 'ally', hostId: 'p0', hostName: 'P0' });
  for (let index = 1; index < 5; index += 1) {
    assert.equal(joinRoom(room, { clientId: `p${index}`, name: `P${index}` }).ok, true);
  }
  for (const player of room.players) setRoomReady(room, player.id, true);
  assert.equal(startRoom(room, 'p0').ok, true);
  for (let tick = 0; tick < 70; tick += 1) tickRoom(room, 50);

  const own = room.state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  const ally = room.state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 1);
  assert.ok(own);
  assert.ok(ally);

  const result = handleRoomCommand(room, 'p0', {
    type: 'move',
    unitIds: [own.id, ally.id],
    x: room.map.zones[12].x,
    y: room.map.zones[12].y,
  });

  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(result.ordered, 1);
  assert.equal(own.path.length, 0);
  for (let tick = 0; tick < 3; tick += 1) tickRoom(room, 50);
  assert.equal(own.path.length > 0, true);
  assert.equal(ally.path.length, 0);
});
