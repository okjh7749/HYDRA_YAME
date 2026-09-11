import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DeterministicRng,
  computeDeterministicStateChecksum,
  quantizeSimulationState,
} from '../src/deterministic-state.mjs';
import { FIXED_POINT_SCALE } from '../src/fixed-point.mjs';
import {
  LockstepCommandQueue,
  lockstepCommandToWire,
} from '../src/lockstep-command-queue.mjs';
import { UnitPool } from '../src/unit-pool.mjs';

function unit(id, x, y) {
  return {
    id,
    type: 'hydra',
    ownerSlot: 0,
    team: 0,
    x,
    y,
    hp: 80,
    maxHp: 80,
    facing: 0,
    path: [],
  };
}

test('typed unit pool stores fixed-point state and reuses released slots', () => {
  const pool = new UnitPool(4);
  const first = unit(11, 100.125, 200.5);
  const second = unit(12, 300, 400);
  pool.syncFromUnits([first, second]);

  assert.ok(pool.x instanceof Int32Array);
  assert.ok(pool.hp instanceof Int32Array);
  assert.equal(pool.count, 2);
  const firstIndex = pool.indexForId(11);
  assert.ok(firstIndex >= 0);
  assert.equal(pool.x[firstIndex], Math.round(first.x * FIXED_POINT_SCALE));
  assert.deepEqual(pool.positionForId(11), { x: first.x, y: first.y });

  pool.syncFromUnits([second]);
  assert.equal(pool.indexForId(11), -1);
  assert.equal(pool.count, 1);

  const third = unit(13, 500, 600);
  pool.syncFromUnits([second, third]);
  assert.equal(pool.indexForId(13), firstIndex);
});

test('lockstep queue delays, canonicalizes and deterministically orders commands', () => {
  const queue = new LockstepCommandQueue({ inputDelayTicks: 2, ringSize: 16 });
  const laterSlot = queue.schedule(10, 2, {
    type: 'move', unitIds: [9, 3, 9], x: 12.25, y: 20.5,
  });
  const earlierSlot = queue.schedule(10, 0, {
    type: 'attack-move', unitIds: [7, 2], x: 30, y: 40,
  });

  assert.equal(laterSlot.tick, 12);
  assert.equal(earlierSlot.tick, 12);
  assert.deepEqual(Array.from(laterSlot.unitIds), [3, 9]);
  assert.deepEqual(queue.drain(11), []);

  const drained = queue.drain(12);
  assert.deepEqual(drained.map((command) => command.playerSlot), [0, 2]);
  assert.deepEqual(lockstepCommandToWire(drained[1]).unitIds, [3, 9]);
  assert.equal(lockstepCommandToWire(drained[1]).x, 12.25);
});

test('deterministic RNG repeats the same sequence for the same seed', () => {
  const first = new DeterministicRng(12345);
  const second = new DeterministicRng(12345);
  const a = Array.from({ length: 8 }, () => first.nextUint32());
  const b = Array.from({ length: 8 }, () => second.nextUint32());
  assert.deepEqual(a, b);
});

test('tick-boundary quantization and checksum are stable', () => {
  const state = {
    nextUnitId: 2,
    match: { elapsedMs: 500 },
    players: [{ slot: 0, team: 0, minerals: 1000, kills: 0, captures: 0, upgrades: {} }],
    units: [unit(1, 10.123456, 20.654321)],
  };
  const map = { zones: [{ id: 1, ownerSlot: 0, ownerTeam: 0, sunkenHp: 9999, x: 256, y: 256 }] };
  quantizeSimulationState(state);
  const once = { x: state.units[0].x, y: state.units[0].y, facing: state.units[0].facing };
  quantizeSimulationState(state);
  assert.deepEqual({ x: state.units[0].x, y: state.units[0].y, facing: state.units[0].facing }, once);

  const pool = new UnitPool(8);
  pool.syncFromUnits(state.units);
  const checksum = computeDeterministicStateChecksum(state, map, pool);
  assert.equal(checksum, computeDeterministicStateChecksum(state, map, pool));
});
