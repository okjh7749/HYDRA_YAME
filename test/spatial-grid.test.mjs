import assert from 'node:assert/strict';
import test from 'node:test';

import { SpatialGrid } from '../src/spatial-grid.mjs';

test('spatial grid limits combat candidates to nearby cells', () => {
  const items = [];
  for (let index = 0; index < 500; index += 1) {
    items.push({ id: index, x: index * 32, y: 64 });
  }
  const grid = new SpatialGrid(128).build(items);
  const nearby = grid.query(64, 64, 176);

  assert.ok(nearby.length < items.length / 10);
  assert.equal(nearby.some((item) => item.id === 0), true);
  assert.equal(nearby.some((item) => item.id === 499), false);
});
