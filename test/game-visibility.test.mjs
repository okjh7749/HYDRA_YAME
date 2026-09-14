import assert from 'node:assert/strict';
import test from 'node:test';

import { buildClassicMap } from '../src/game-core.mjs';
import {
  FOG_EXPLORED,
  FOG_UNEXPLORED,
  FOG_VISIBLE,
  createExplorationGrid,
  fogStateForTile,
  pointVisibleFromSources,
  pruneContainedVisionSources,
  updateExplorationGrid,
} from '../src/game-visibility.mjs';

test('fog memory persists explored tiles after live vision moves away', () => {
  const map = buildClassicMap();
  const exploration = createExplorationGrid(map);
  const tileX = 20;
  const tileY = 20;
  const source = {
    x: (tileX + 0.5) * map.tileSize,
    y: (tileY + 0.5) * map.tileSize,
    radius: 48,
  };

  assert.equal(fogStateForTile(exploration, map, [], tileX, tileY), FOG_UNEXPLORED);
  updateExplorationGrid(exploration, map, [source]);
  assert.equal(fogStateForTile(exploration, map, [source], tileX, tileY), FOG_VISIBLE);
  assert.equal(fogStateForTile(exploration, map, [], tileX, tileY), FOG_EXPLORED);
  assert.equal(fogStateForTile(exploration, map, [], 40, 40), FOG_UNEXPLORED);
});

test('vision pruning removes only contained sources and never invents cluster visibility', () => {
  const large = { x: 100, y: 100, radius: 100 };
  const contained = { x: 120, y: 100, radius: 20 };
  const overlap = { x: 250, y: 100, radius: 100 };
  const pruned = pruneContainedVisionSources([large, contained, overlap]);

  assert.deepEqual(pruned, [large, overlap]);
  assert.equal(pointVisibleFromSources(pruned, 175, 100), true);
  assert.equal(pointVisibleFromSources(pruned, 175, 205), false);
});
