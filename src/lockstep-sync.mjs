import { buildClassicMap } from './game-core.mjs';
import { SERVER_TICK_MS, snapshotForClient, tickRoom } from './game-room.mjs';
import { computeStableLockstepChecksum } from './lockstep-checksum.mjs';
import { LockstepCommandQueue } from './lockstep-command-queue.mjs';
import { UnitPool } from './unit-pool.mjs';

const MAP_TAG = '__hydraMap';
const SET_TAG = '__hydraSet';

function encodeValue(value) {
  if (value instanceof Map) {
    return { [MAP_TAG]: [...value.entries()].map(([key, item]) => [encodeValue(key), encodeValue(item)]) };
  }
  if (value instanceof Set) {
    return { [SET_TAG]: [...value].map(encodeValue) };
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = encodeValue(item);
  return result;
}

function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value[MAP_TAG])) {
    return new Map(value[MAP_TAG].map(([key, item]) => [decodeValue(key), decodeValue(item)]));
  }
  if (Array.isArray(value[SET_TAG])) {
    return new Set(value[SET_TAG].map(decodeValue));
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = decodeValue(item);
  return result;
}

export function serializeLockstepBootstrap(room) {
  const checksum = computeStableLockstepChecksum(room.state, room.map);
  return {
    roomId: room.id,
    status: room.status,
    tick: room.tick,
    players: encodeValue(room.players),
    state: encodeValue(room.state),
    zones: encodeValue(room.map.zones),
    inputDelayTicks: room.lockstepQueue.inputDelayTicks,
    checksum,
    checksumTick: room.tick,
  };
}

export function restoreLockstepRoom(bootstrap) {
  const map = buildClassicMap();
  const zones = decodeValue(bootstrap.zones ?? []);
  const zonesById = new Map(zones.map((zone) => [zone.id, zone]));
  for (const zone of map.zones) {
    const restored = zonesById.get(zone.id);
    if (restored) Object.assign(zone, restored);
  }

  const state = decodeValue(bootstrap.state ?? {});
  const unitPool = new UnitPool();
  unitPool.syncFromUnits(state.units ?? []);
  const lockstepQueue = new LockstepCommandQueue({
    inputDelayTicks: bootstrap.inputDelayTicks,
  });
  const calculated = computeStableLockstepChecksum(state, map);

  return {
    id: bootstrap.roomId,
    status: bootstrap.status,
    players: decodeValue(bootstrap.players ?? []),
    map,
    state,
    tick: bootstrap.tick >>> 0,
    snapshotAccumulatorMs: 0,
    snapshotSequence: 0,
    unitPool,
    lockstepQueue,
    stateChecksum: calculated,
    stateChecksumTick: bootstrap.tick >>> 0,
    bootstrapChecksumMatches: calculated === (bootstrap.checksum >>> 0),
    bootstrapCalculatedChecksum: calculated,
  };
}

export function applyLockstepFrame(room, frame, { tickMs = SERVER_TICK_MS } = {}) {
  if (!room) return { ok: false, reason: 'not-bootstrapped' };
  if (!frame || !Number.isInteger(frame.tick)) {
    return { ok: false, reason: 'invalid-frame' };
  }

  const expectedTick = room.tick >>> 0;
  if (frame.tick < expectedTick) {
    return { ok: true, duplicate: true, tick: expectedTick };
  }
  if (frame.tick !== expectedTick) {
    return {
      ok: false,
      reason: 'frame-gap',
      expectedTick,
      receivedTick: frame.tick,
    };
  }

  for (const command of frame.commands ?? []) {
    if (command?.tick !== frame.tick || !room.lockstepQueue.enqueueWire(command)) {
      return { ok: false, reason: 'invalid-frame-command', tick: frame.tick };
    }
  }

  tickRoom(room, tickMs);
  if (Number.isInteger(frame.serverTick) && room.tick !== frame.serverTick) {
    return {
      ok: false,
      reason: 'server-tick-mismatch',
      expectedTick: room.tick,
      receivedTick: frame.serverTick,
    };
  }

  if (Number.isInteger(frame.checksum) && Number.isInteger(frame.checksumTick)) {
    const localChecksum = computeStableLockstepChecksum(room.state, room.map);
    const checksumMatches = frame.checksumTick === room.tick
      && localChecksum === (frame.checksum >>> 0);
    return {
      ok: checksumMatches,
      reason: checksumMatches ? null : 'checksum-mismatch',
      tick: room.tick,
      checksumCompared: true,
      checksumMatches,
      localChecksum,
      serverChecksum: frame.checksum >>> 0,
    };
  }

  return { ok: true, tick: room.tick, checksumCompared: false };
}

export function projectLockstepSnapshot(room, clientId, sequence = 0) {
  if (!room || !clientId) return null;
  const projected = snapshotForClient(room, clientId);
  if (!projected) return null;
  return {
    ...projected,
    sequence,
    serverTick: room.tick,
    snapshotIntervalMs: SERVER_TICK_MS,
    source: 'lockstep-local',
  };
}
