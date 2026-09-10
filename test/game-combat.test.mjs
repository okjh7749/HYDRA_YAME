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
  stepPlayerTriggerEconomy,
  ensureLocalOverlord,
} from '../src/game-combat.mjs';
import {
  HYDRA_SPAWN_INTERVAL_MS,
  createSimulation,
  stepProduction,
} from '../src/game-simulation.mjs';
import { initializeUpgradeBuildings } from '../src/game-upgrades.mjs';

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
  const localHome = map.zones.find((zone) => zone.ownerSlot === 0);
  assert.ok(localHome);
  assert.equal(localHome.sunkenHp, SUNKEN_HP);
});

test('hydras deal damage automatically and award 5 minerals for a hydra kill', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const attacker = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  const defender = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 2);
  const arena = map.zones.find((zone) => zone.ownerSlot === null);
  state.units = [attacker, defender];
  attacker.x = arena.x;
  attacker.y = arena.y;
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

  const invader = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 2);
  const localHydra = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  localHydra.x = map.zones[16].x;
  localHydra.y = map.zones[16].y;
  const localHome = map.zones.find((zone) => zone.ownerSlot === 0);
  invader.x = localHome.x + 50;
  invader.y = localHome.y;
  const before = getPlayerState(state, 0).minerals;

  stepCombat(state, map, 1);

  assert.equal(state.units.some((unit) => unit.id === invader.id), false);
  assert.equal(getPlayerState(state, 0).minerals, before + HYDRA_KILL_REWARD);
});

test('destroying a sunken neutralizes its zone and awards 200 minerals', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const attacker = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  const enemyZone = map.zones.find((zone) => zone.ownerSlot === 2);
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

  const zone = map.zones.find((candidate) => candidate.ownerSlot === null);
  const overlord = state.units.find((unit) => unit.type === 'overlord' && unit.ownerSlot === 0);
  const hydra = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  state.units = [overlord, hydra];
  overlord.x = zone.x;
  overlord.y = zone.y;
  hydra.x = zone.x + 20;
  hydra.y = zone.y;
  const before = getPlayerState(state, 0).minerals;

  const captures = stepCapture(state, map);

  assert.equal(captures.length, 1);
  assert.equal(captures[0].zoneId, zone.id);
  assert.equal(captures[0].ownerSlot, 0);
  assert.equal(captures[0].team, 0);
  assert.deepEqual(new Set(captures[0].removedIds), new Set([overlord.id, hydra.id]));
  assert.equal(zone.ownerSlot, 0);
  assert.equal(zone.ownerTeam, 0);
  assert.equal(zone.sunkenHp, SUNKEN_HP);
  assert.equal(getPlayerState(state, 0).minerals, before - CAPTURE_COST);
  assert.equal(getPlayerState(state, 0).captures, 1);
  assert.equal(state.units.some((unit) => unit.id === overlord.id), false);
  assert.equal(state.units.some((unit) => unit.type === 'overlord' && unit.ownerSlot === 0), false);
});

test('a tied Any Unit count prevents capture and does not spend minerals', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const zone = map.zones.find((candidate) => candidate.ownerSlot === null);
  const overlord = state.units.find((unit) => unit.type === 'overlord' && unit.ownerSlot === 0);
  const localHydra = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  const enemyHydras = state.units
    .filter((unit) => unit.type === 'hydra' && unit.ownerSlot === 2)
    .slice(0, 2);
  assert.equal(enemyHydras.length, 2);
  state.units = [overlord, localHydra, ...enemyHydras];
  overlord.x = zone.x;
  overlord.y = zone.y;
  localHydra.x = zone.x + 10;
  localHydra.y = zone.y;
  enemyHydras[0].x = zone.x - 10;
  enemyHydras[0].y = zone.y;
  enemyHydras[1].x = zone.x - 20;
  enemyHydras[1].y = zone.y;
  const before = getPlayerState(state, 0).minerals;

  assert.deepEqual(stepCapture(state, map), []);
  assert.equal(zone.ownerTeam, null);
  assert.equal(getPlayerState(state, 0).minerals, before);
});

test('overlord threshold and recovery triggers are isolated per player slot', () => {
  const { map, state } = setup();
  initializeUpgradeBuildings(state);
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const player = getPlayerState(state, 0);
  const teammate = getPlayerState(state, 1);
  const teammateOverlord = ensureLocalOverlord(state, map, 1);
  assert.ok(teammateOverlord);

  player.minerals = 249;
  const lowMineral = stepPlayerTriggerEconomy(state, map, 0, 0);
  assert.equal(lowMineral.overlordsKilled, 1);
  assert.equal(state.units.some((unit) => unit.type === 'overlord' && unit.ownerSlot === 0), false);
  assert.equal(state.units.some((unit) => unit.id === teammateOverlord.id), true);
  assert.equal(teammate.minerals, 1000);

  const localHome = map.zones.find((zone) => zone.ownerSlot === 0);
  localHome.ownerSlot = null;
  localHome.ownerTeam = null;
  localHome.sunkenHp = 0;
  state.match = { phase: 'running', elapsedMs: 1000 };
  const recovery = stepPlayerTriggerEconomy(state, map, 0, 0);

  assert.equal(recovery.recoveredMinerals, 250);
  assert.equal(player.minerals, 499);
  assert.equal(recovery.overlordCreated, false);
  assert.equal(recovery.buildingsRemoved, 2);
  const afterRecovery = stepPlayerTriggerEconomy(state, map, 0, 0);
  assert.equal(afterRecovery.recoveredMinerals, 0);
  assert.equal(afterRecovery.overlordCreated, true);
  assert.equal(player.minerals, 499);
  assert.equal(state.units.some((unit) => unit.type === 'overlord' && unit.ownerSlot === 0), true);
  assert.equal(
    state.upgradeBuildings.filter((building) => building.ownerSlot === 0).every((building) => building.hp === 0),
    true,
  );
  assert.equal(
    state.upgradeBuildings.filter((building) => building.ownerSlot === 1).every((building) => building.hp > 0),
    true,
  );
});
