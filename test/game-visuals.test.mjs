import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RTS_CAMERA_ZOOM,
  SNAPSHOT_INTERPOLATION_MS,
  UNIT_VISUAL_SIZES,
  interpolateUnitPose,
  terrainVariant,
} from '../src/game-visuals.mjs';

test('RTS scale keeps combat units readable relative to 32px terrain tiles', () => {
  assert.ok(RTS_CAMERA_ZOOM >= 1.4 && RTS_CAMERA_ZOOM <= 1.8);
  assert.ok(UNIT_VISUAL_SIZES.hydra.radiusX < 16);
  assert.ok(UNIT_VISUAL_SIZES.overlord.radiusX > UNIT_VISUAL_SIZES.hydra.radiusX);
  assert.ok(UNIT_VISUAL_SIZES.sunken.radiusX > UNIT_VISUAL_SIZES.overlord.radiusX);
  assert.ok(UNIT_VISUAL_SIZES.structure.radiusX >= UNIT_VISUAL_SIZES.overlord.radiusX);
});

test('snapshot interpolation smooths ordinary movement but snaps teleports', () => {
  assert.ok(SNAPSHOT_INTERPOLATION_MS >= 90);
  const previous = { id: 7, x: 100, y: 100, facing: 0 };
  const current = { id: 7, x: 120, y: 110, facing: Math.PI / 2, hp: 40 };
  const halfway = interpolateUnitPose(previous, current, 0.5);
  assert.equal(halfway.x, 110);
  assert.equal(halfway.y, 105);
  assert.equal(halfway.hp, 40);
  assert.ok(halfway.facing > 0 && halfway.facing < Math.PI / 2);

  const teleport = interpolateUnitPose(previous, { ...current, x: 500, y: 500 }, 0.2);
  assert.equal(teleport.x, 500);
  assert.equal(teleport.y, 500);
});

test('terrain variation is deterministic and spatially varied', () => {
  assert.equal(terrainVariant(10, 20), terrainVariant(10, 20));
  const variants = new Set();
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) variants.add(terrainVariant(x, y));
  }
  assert.ok(variants.size >= 5);
});
