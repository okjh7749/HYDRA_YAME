import assert from 'node:assert/strict';
import test from 'node:test';

import {
  facingDirection8,
  gaitPose,
  isUnitMoving,
  spriteAnimationFrame,
  terrainMacroCell,
} from '../src/rts-visual-layout.mjs';

test('64x64 terrain resolves into the original logical 5x5 macro layout', () => {
  const corner = terrainMacroCell(2, 2);
  assert.deepEqual([corner.row, corner.col], [0, 0]);
  assert.equal(corner.controlCorner, true);

  const topStartingZone = terrainMacroCell(20, 8);
  assert.deepEqual([topStartingZone.row, topStartingZone.col], [0, 1]);
  assert.equal(topStartingZone.controlCorner, false);

  const center = terrainMacroCell(32, 32);
  assert.deepEqual([center.row, center.col], [2, 2]);
  assert.equal(center.centerHub, true);

  const gateway = terrainMacroCell(14, 7);
  assert.equal(gateway.gateway, true);
  assert.equal(terrainMacroCell(1, 1), null);
  assert.equal(terrainMacroCell(62, 62), null);
});

test('sprite direction is quantized to eight RTS facing frames', () => {
  assert.equal(facingDirection8(0), 0);
  assert.equal(facingDirection8(Math.PI / 4), 1);
  assert.equal(facingDirection8(Math.PI), 4);
  assert.equal(facingDirection8(-Math.PI / 2), 6);
  assert.equal(facingDirection8(Math.PI * 2), 0);
});

test('movement animation advances frames while idle units stay on their rest pose', () => {
  assert.equal(spriteAnimationFrame(1000, 3, false), 0);
  const frames = new Set();
  for (let time = 0; time < 500; time += 50) {
    frames.add(spriteAnimationFrame(time, 3, true));
  }
  assert.ok(frames.size >= 3);
  assert.notDeepEqual(gaitPose(0), gaitPose(2));
});

test('snapshot motion detection ignores jitter but detects actual movement', () => {
  const previous = { id: 9, x: 100, y: 200 };
  assert.equal(isUnitMoving(previous, { id: 9, x: 100.1, y: 200.1 }), false);
  assert.equal(isUnitMoving(previous, { id: 9, x: 104, y: 200 }), true);
  assert.equal(isUnitMoving(previous, { id: 10, x: 104, y: 200 }), false);
});
