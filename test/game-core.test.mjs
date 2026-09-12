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
import { CONTROL_ISLANDS } from '../src/game-infrastructure.mjs';

test('builds the 64x64 classic battlefield with 21 capture zones', () => {
  const map = buildClassicMap();

  assert.equal(map.columns, MAP_TILES);
  assert.equal(map.rows, MAP_TILES);
  assert.equal(map.worldWidth, MAP_TILES * TILE_SIZE);
  assert.equal(map.worldHeight, MAP_TILES * TILE_SIZE);
  assert.equal(map.zones.length, 21);
  assert.equal(map.zones.filter((zone) => zone.ownerSlot !== null).length, 8);
});

test('builds the blunt classic cross instead of a diagonal X silhouette', () => {
  const map = buildClassicMap();

  assert.equal(isWalkableTile(map, 0, 0), false);
  assert.equal(isWalkableTile(map, 6, 6), false);
  assert.equal(isWalkableTile(map, 20, 8), true);
  assert.equal(isWalkableTile(map, 8, 20), true);
  assert.equal(isWalkableTile(map, 32, 32), true);
  assert.equal(isWalkableTile(map, 55, 55), false);
  assert.deepEqual(
    map.zones.slice(0, 3).map((zone) => [zone.x, zone.y]),
    [[640, 256], [1024, 256], [1408, 256]],
  );
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

test('control islands are walkable but disconnected from the battlefield', () => {
  const map = buildClassicMap();
  for (const island of CONTROL_ISLANDS) {
    assert.equal(isWalkableWorld(map, island.x, island.y), true);
  }

  const island = CONTROL_ISLANDS.find((candidate) => candidate.slot === 0);
  const home = map.zones.find((zone) => zone.ownerSlot === 0);
  assert.ok(island);
  assert.ok(home);
  assert.deepEqual(findPath(map, home, island), []);
});

test('pathfinding uses diagonal steps for diagonal targets', () => {
  const map = buildClassicMap();
  const path = findPath(map, { x: 640, y: 640 }, { x: 800, y: 800 });

  assert.ok(path.length > 1);
  assert.ok(path.length <= 7);
  const diagonalSteps = path.slice(1).filter((point, index) => {
    const previous = path[index];
    return Math.abs(point.x - previous.x) > 1 && Math.abs(point.y - previous.y) > 1;
  });
  assert.ok(diagonalSteps.length >= 4);
});

test('clamps camera movement to the 2048x2048 world bounds', () => {
  const map = buildClassicMap();
  const camera = { x: -500, y: 99999 };

  clampCamera(camera, map, 640, 480);

  assert.equal(camera.x, 0);
  assert.equal(camera.y, map.worldHeight - 480);
});
