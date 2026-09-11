import assert from 'node:assert/strict';
import test from 'node:test';

import {
  packRenderUnitFrame,
  packRenderUnitPoolFrame,
  renderUnitFrameByteLength,
  unpackRenderUnitFrame,
} from '../src/render-unit-frame.mjs';
import { UnitPool } from '../src/unit-pool.mjs';

test('compact render unit frame preserves unit fields in one ArrayBuffer', () => {
  const source = [
    {
      id: 17,
      type: 'hydra',
      ownerSlot: 2,
      team: 1,
      x: 123.4,
      y: 987.6,
      hp: 73,
      maxHp: 80,
      facing: 1.25,
      attackFlashMs: 95,
    },
    {
      id: 18,
      type: 'overlord',
      ownerSlot: 0,
      team: 0,
      x: 256,
      y: 1408,
      hp: 200,
      maxHp: 200,
      facing: 0,
      attackFlashMs: 0,
    },
  ];

  const frame = packRenderUnitFrame(source);
  assert.equal(frame.count, 2);
  assert.ok(frame.buffer instanceof ArrayBuffer);
  assert.equal(frame.buffer.byteLength, renderUnitFrameByteLength(2));

  const decoded = unpackRenderUnitFrame(frame);
  assert.equal(decoded.length, 2);
  assert.equal(decoded[0].id, 17);
  assert.equal(decoded[0].type, 'hydra');
  assert.equal(decoded[0].ownerSlot, 2);
  assert.equal(decoded[0].team, 1);
  assert.ok(Math.abs(decoded[0].x - 123.4) < 0.001);
  assert.ok(Math.abs(decoded[0].y - 987.6) < 0.001);
  assert.equal(decoded[0].hp, 73);
  assert.equal(decoded[0].maxHp, 80);
  assert.ok(Math.abs(decoded[0].facing - 1.25) < 0.001);
  assert.equal(decoded[0].attackFlashMs, 95);
  assert.equal(decoded[1].type, 'overlord');
});

test('render unit decoding reuses cached objects and keeps large frames compact', () => {
  const cache = new Map();
  const first = unpackRenderUnitFrame(packRenderUnitFrame([
    { id: 42, type: 'zealot', ownerSlot: 1, team: 0, x: 10, y: 20, hp: 100, maxHp: 100 },
  ]), cache);
  const second = unpackRenderUnitFrame(packRenderUnitFrame([
    { id: 42, type: 'zealot', ownerSlot: 1, team: 0, x: 30, y: 40, hp: 90, maxHp: 100 },
  ]), cache);

  assert.strictEqual(second[0], first[0]);
  assert.equal(second[0].x, 30);
  assert.equal(second[0].hp, 90);
  assert.ok(renderUnitFrameByteLength(256) <= 8 * 1024);
});

test('unit pool render packing skips intermediate unit objects', () => {
  const units = [
    { id: 7, type: 'hydra', ownerSlot: 0, team: 0, x: 64.25, y: 128.5, hp: 71, maxHp: 80, facing: 1.1, attackFlashMs: 42 },
    { id: 8, type: 'overlord', ownerSlot: 2, team: 1, x: 512, y: 768, hp: 200, maxHp: 200, facing: 0.3, attackFlashMs: 0 },
  ];
  const pool = new UnitPool(8);
  pool.syncFromUnits(units);
  const indexes = units.map((unit) => pool.indexForId(unit.id));

  const decoded = unpackRenderUnitFrame(packRenderUnitPoolFrame(pool, indexes));
  assert.deepEqual(decoded.map((unit) => unit.id), [7, 8]);
  assert.equal(decoded[0].type, 'hydra');
  assert.equal(decoded[0].ownerSlot, 0);
  assert.equal(decoded[0].team, 0);
  assert.equal(decoded[0].hp, 71);
  assert.equal(decoded[0].attackFlashMs, 42);
  assert.ok(Math.abs(decoded[0].x - 64.25) < 0.01);
  assert.ok(Math.abs(decoded[0].y - 128.5) < 0.01);
  assert.ok(Math.abs(decoded[0].facing - 1.1) < 0.001);
});
