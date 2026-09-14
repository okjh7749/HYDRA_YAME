import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeCombatState } from '../src/game-combat.mjs';
import { buildClassicMap } from '../src/game-core.mjs';
import { CLASSIC_SCOPE } from '../src/game-rules.mjs';
import { createSimulation, stepProduction } from '../src/game-simulation.mjs';
import { MINIMAP_SEMANTICS, playerHudSnapshot } from '../src/game-ui-semantics.mjs';

test('classic HUD is player-slot scoped while victory remains force scoped', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  state.players[0].minerals = 777;
  state.players[1].minerals = 333;
  stepProduction(state, map, state.productionIntervalMs);

  const p1 = playerHudSnapshot(state, map, 0);
  const p2 = playerHudSnapshot(state, map, 1);
  assert.equal(p1.scopeLabel, 'P1');
  assert.equal(p2.scopeLabel, 'P2');
  assert.equal(p1.minerals, 777);
  assert.equal(p2.minerals, 333);
  assert.equal(p1.zones, 1);
  assert.equal(p2.zones, 1);
  assert.equal(p1.hydras, 1);
  assert.equal(p2.hydras, 1);
  assert.deepEqual(CLASSIC_SCOPE, {
    ownership: 'player-slot',
    minerals: 'player-slot',
    beaconRally: 'player-slot',
    victoryAlliance: 'force',
  });
});

test('minimap semantics keep home and camera markers visually distinct', () => {
  assert.equal(MINIMAP_SEMANTICS.home.shape, 'diamond');
  assert.equal(MINIMAP_SEMANTICS.camera.shape, 'rectangle');
  assert.notEqual(MINIMAP_SEMANTICS.home.shape, MINIMAP_SEMANTICS.camera.shape);
  assert.equal(MINIMAP_SEMANTICS.controlIsland.shape, 'outline-rect');
});
