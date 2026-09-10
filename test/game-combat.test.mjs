import assert from 'node:assert/strict';
import test from 'node:test';

import { buildClassicMap } from '../src/game-core.mjs';
import {
  CAPTURE_COST,
  HYDRA_KILL_REWARD,
  SUNKEN_HP,
  SUNKEN_KILL_REWARD,
  controlledZoneCount,
  getPlayerState,
  initializeCombatState,
  stepCapture,
  stepCombat,
} from '../src/game-combat.mjs';
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

test('initializes classic combat stats and 1000 minerals', () => {
  const { map, state } = setup();
  const player = getPlayerState(state, 0);

  assert.equal(player.minerals, 1000);
  assert.equal(player.kills, 0);
  assert.equal(controlledZoneCount(map, 0), 1);
  assert.equal(map.zones[0].sunkenHp, SUNKEN_HP);
});

test('hydras deal damage automatically and award 5 minerals for a hydra kill', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const attacker = state.units.find((unit) => unit.type === 'hydra' && unit.team === 0);
  const defender = state.units.find((unit) => unit.type === 'hydra' && unit.team === 1);
  attacker.x = map.zones[16].x;
  attacker.y = map.zones[16].y;
  defender.x = attacker.x + 40;
  defender.y = attacker.y;
  const before = getPlayerState(state, 0).minerals;

  for (let i = 0; i < 8; i += 1) stepCombat(state, map, 700);

  assert.equal(state.units.some((unit) => unit.id === defender.id), false);
  assert.equal(getPlayerState(state, 0).kills, 1);
  assert.equal(getPlayerState(state, 0).minerals, before + HYDRA_KILL_REWARD);
});

test('an early sunken one-shots an unupgraded hydra and earns the kill reward', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const invader = state.units.find((unit) => unit.type === 'hydra' && unit.team === 1);
  const localHydra = state.units.find((unit) => unit.type === 'hydra' && unit.team === 0);
  localHydra.x = map.zones[16].x;
  localHydra.y = map.zones[16].y;
  invader.x = map.zones[0].x + 50;
  invader.y = map.zones[0].y;
  const before = getPlayerState(state, 0).minerals;

  stepCombat(state, map, 1);

  assert.equal(state.units.some((unit) => unit.id === invader.id), false);
  assert.equal(getPlayerState(state, 0).minerals, before + HYDRA_KILL_REWARD);
});

test('destroying a sunken neutralizes its zone and awards 200 minerals', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const attacker = state.units.find((unit) => unit.type === 'hydra' && unit.team === 0);
  const enemyZone = map.zones[2];
  enemyZone.sunkenHp = 1;
  attacker.x = enemyZone.x + 40;
  attacker.y = enemyZone.y;
  state.units = [attacker];
  const before = getPlayerState(state, 0).minerals;

  stepCombat(state, map, 1);

  assert.equal(enemyZone.ownerTeam, null);
  assert.equal(enemyZone.sunkenHp, 0);
  assert.equal(getPlayerState(state, 0).sunkenKills, 1);
  assert.equal(getPlayerState(state, 0).minerals, before + SUNKEN_KILL_REWARD);
});

test('overlord captures a neutral zone only with a strict hydra lead and pays 250 minerals', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const zone = map.zones[12];
  const overlord = state.units.find((unit) => unit.type === 'overlord' && unit.team === 0);
  const hydra = state.units.find((unit) => unit.type === 'hydra' && unit.team === 0);
  state.units = [overlord, hydra];
  overlord.x = zone.x;
  overlord.y = zone.y;
  hydra.x = zone.x + 20;
  hydra.y = zone.y;
  const before = getPlayerState(state, 0).minerals;

  const captures = stepCapture(state, map);

  assert.deepEqual(captures, [{ zoneId: zone.id, team: 0 }]);
  assert.equal(zone.ownerTeam, 0);
  assert.equal(zone.sunkenHp, SUNKEN_HP);
  assert.equal(getPlayerState(state, 0).minerals, before - CAPTURE_COST);
  assert.equal(getPlayerState(state, 0).captures, 1);
  assert.equal(state.units.some((unit) => unit.id === overlord.id), false);
  assert.equal(state.units.some((unit) => unit.type === 'overlord' && unit.team === 0), true);
});

test('a tied hydra count prevents capture and does not spend minerals', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const zone = map.zones[12];
  const overlord = state.units.find((unit) => unit.type === 'overlord' && unit.team === 0);
  const localHydra = state.units.find((unit) => unit.type === 'hydra' && unit.team === 0);
  const enemyHydra = state.units.find((unit) => unit.type === 'hydra' && unit.team === 1);
  state.units = [overlord, localHydra, enemyHydra];
  overlord.x = zone.x;
  overlord.y = zone.y;
  localHydra.x = zone.x + 10;
  localHydra.y = zone.y;
  enemyHydra.x = zone.x - 10;
  enemyHydra.y = zone.y;
  const before = getPlayerState(state, 0).minerals;

  assert.deepEqual(stepCapture(state, map), []);
  assert.equal(zone.ownerTeam, null);
  assert.equal(getPlayerState(state, 0).minerals, before);
});
