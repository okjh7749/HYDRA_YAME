import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAP_TILES,
  TILE_SIZE,
  buildClassicMap,
  clampCamera,
  findPath,
  isWalkableTile,
  isWalkableWorld,
  nearestWalkablePoint,
  worldToTile,
} from '../src/game-core.mjs';

test('builds the 64x64 classic battlefield with 21 capture zones', () => {
  const map = buildClassicMap();

  assert.equal(map.columns, MAP_TILES);
  assert.equal(map.rows, MAP_TILES);
  assert.equal(map.worldWidth, MAP_TILES * TILE_SIZE);
  assert.equal(map.worldHeight, MAP_TILES * TILE_SIZE);
  assert.equal(map.zones.length, 21);
  assert.equal(map.zones.filter((zone) => zone.ownerTeam !== null).length, 4);
});

test('keeps void tiles unwalkable while opening zones and corridors', () => {
  const map = buildClassicMap();

  assert.equal(isWalkableTile(map, 0, 0), false);
  assert.equal(isWalkableTile(map, 5, 5), true);
  assert.equal(isWalkableTile(map, 12, 5), true);
  assert.equal(isWalkableTile(map, 32, 32), true);
});

test('snaps invalid world targets to the nearest valid movement tile', () => {
  const map = buildClassicMap();
  const snapped = nearestWalkablePoint(map, 0, 0, 16);

  assert.ok(snapped);
  assert.equal(isWalkableWorld(map, snapped.x, snapped.y), true);
});

test('finds a connected path without crossing the black void', () => {
  const map = buildClassicMap();
  const start = { x: map.zones[0].x, y: map.zones[0].y };
  const goal = { x: map.zones[20].x, y: map.zones[20].y };
  const path = findPath(map, start, goal);

  assert.ok(path.length > 1);
  for (const point of path) {
    const tile = worldToTile(map, point.x, point.y);
    assert.equal(isWalkableTile(map, tile.x, tile.y), true);
  }

  const last = path.at(-1);
  assert.equal(last.x, goal.x);
  assert.equal(last.y, goal.y);
});

test('clamps camera movement to the 2048x2048 world bounds', () => {
  const map = buildClassicMap();
  const camera = { x: -500, y: 99999 };

  clampCamera(camera, map, 640, 480);

  assert.equal(camera.x, 0);
  assert.equal(camera.y, map.worldHeight - 480);
});
