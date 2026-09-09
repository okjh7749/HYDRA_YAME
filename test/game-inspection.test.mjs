import assert from 'node:assert/strict';
import test from 'node:test';

import { buildClassicMap } from '../src/game-core.mjs';
import {
  getPlayerState,
  initializeCombatState,
  stepCombat,
} from '../src/game-combat.mjs';
import {
  inspectSelectedUnits,
  inspectSunken,
  nearestSelectableSunken,
} from '../src/game-inspection.mjs';
import {
  HYDRA_SPAWN_INTERVAL_MS,
  createSimulation,
  stepProduction,
} from '../src/game-simulation.mjs';

function setup() {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  return { map, state };
}

test('selects a live sunken by its rendered building position', () => {
  const { map } = setup();
  const zone = map.zones[0];

  assert.equal(nearestSelectableSunken(map, { x: zone.x, y: zone.y + 27 })?.id, zone.id);
  assert.equal(nearestSelectableSunken(map, { x: map.zones[12].x, y: map.zones[12].y + 27 }), null);
});

test('summarizes selected hydra combat stats, upgrades and current order', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);
  const hydra = state.units.find((unit) => unit.type === 'hydra' && unit.team === 0);
  const player = getPlayerState(state, 0);
  player.upgrades.attack = 12;
  player.upgrades.defense = 7;
  player.upgrades.range = 1;
  hydra.path = [{ x: hydra.x, y: hydra.y }, { x: hydra.x + 32, y: hydra.y }];
  hydra.pathIndex = 1;

  const info = inspectSelectedUnits(state, 0, new Set([hydra.id]));

  assert.equal(info.type, 'hydra');
  assert.equal(info.attack, 17);
  assert.equal(info.defense, 7);
  assert.equal(info.range, 128);
  assert.equal(info.order, 'Move');
  assert.equal(info.hp, 40);
});

test('tracks a hydra attack target, attack flash, effect timing and personal kill count', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const attacker = state.units.find((unit) => unit.type === 'hydra' && unit.team === 0);
  const defender = state.units.find((unit) => unit.type === 'hydra' && unit.team === 1);
  attacker.x = map.zones[16].x;
  attacker.y = map.zones[16].y;
  defender.x = attacker.x + 40;
  defender.y = attacker.y;
  defender.hp = 5;

  stepCombat(state, map, 1);

  assert.deepEqual(attacker.currentTarget, { kind: 'unit', id: defender.id });
  assert.equal(attacker.attackFlashMs, 140);
  assert.equal(attacker.kills, 1);
  assert.equal(state.effects.length > 0, true);
  const effect = state.effects.at(-1);
  assert.equal(effect.targetId, defender.id);
  assert.equal(effect.elapsedMs, 0);
  assert.equal(effect.durationMs, 240);
});

test('exposes selected sunken health, attack, armor, range and production interval', () => {
  const { map } = setup();
  const info = inspectSunken(map.zones[0]);

  assert.equal(info.kind, 'sunken');
  assert.equal(info.zoneId, 1);
  assert.equal(info.hp, 9999);
  assert.equal(info.attack, 200);
  assert.equal(info.armor, 50);
  assert.equal(info.range, 176);
  assert.equal(info.productionIntervalMs, 500);
});
