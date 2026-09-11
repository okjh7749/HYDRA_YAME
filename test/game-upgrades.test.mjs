import assert from 'node:assert/strict';
import test from 'node:test';

import { buildClassicMap } from '../src/game-core.mjs';
import { infrastructureFrameForPlayer } from '../src/game-infrastructure.mjs';
import {
  SUNKEN_ARMOR,
  calculateHydraAttackRange,
  calculateHydraDamage,
  calculateSunkenDamage,
  getPlayerState,
  initializeCombatState,
} from '../src/game-combat.mjs';
import {
  HYDRA_SPEED,
  HYDRA_SPEED_UPGRADE_MULTIPLIER,
  HYDRA_SPAWN_INTERVAL_MS,
  createSimulation,
  stepProduction,
} from '../src/game-simulation.mjs';
import {
  UPGRADE_BUILDING_HP,
  UPGRADE_DEFINITIONS,
  initializeUpgradeBuildings,
  nearestUpgradeBuilding,
  purchaseUpgrade,
  upgradeButtonState,
  upgradeOptionsForBuilding,
} from '../src/game-upgrades.mjs';

function setup() {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  initializeUpgradeBuildings(state);
  return { map, state };
}

test('creates two selectable upgrade buildings for each of the eight players', () => {
  const { state } = setup();
  assert.equal(state.upgradeBuildings.length, 16);

  const local = state.upgradeBuildings.filter((building) => building.ownerSlot === 0);
  const localPlayer = state.players[0];
  const localFrame = infrastructureFrameForPlayer(localPlayer);
  const teammateFrame = infrastructureFrameForPlayer(state.players[1]);
  const homeCornerDistance = Math.hypot(localPlayer.homeX - localFrame.corner.x, localPlayer.homeY - localFrame.corner.y);
  assert.deepEqual(localFrame.corner, teammateFrame.corner);
  assert.equal(local.every((building) => Math.hypot(building.x - localFrame.corner.x, building.y - localFrame.corner.y) < homeCornerDistance), true);
  assert.deepEqual(local.map((building) => building.type).sort(), ['evolution', 'hydra-den']);
  assert.equal(local.every((building) => building.hp === UPGRADE_BUILDING_HP), true);

  const picked = nearestUpgradeBuilding(state, 0, { x: local[0].x, y: local[0].y });
  assert.equal(picked?.id, local[0].id);
});

test('evolution chamber owns attack and defense upgrades while hydra den owns range and speed', () => {
  const { state } = setup();
  const evolution = state.upgradeBuildings.find((building) => building.ownerSlot === 0 && building.type === 'evolution');
  const hydraDen = state.upgradeBuildings.find((building) => building.ownerSlot === 0 && building.type === 'hydra-den');

  assert.deepEqual(upgradeOptionsForBuilding(evolution).map((option) => option.key).sort(), ['attack', 'defense']);
  assert.deepEqual(upgradeOptionsForBuilding(hydraDen).map((option) => option.key).sort(), ['range', 'speed']);
});

test('attack and defense cost 50 minerals per level and stop at 255', () => {
  const { state } = setup();
  const player = getPlayerState(state, 0);
  const evolution = state.upgradeBuildings.find((building) => building.ownerSlot === 0 && building.type === 'evolution');
  player.minerals = 30000;

  for (let i = 0; i < 255; i += 1) {
    const result = purchaseUpgrade(state, 0, evolution.id, 'attack');
    assert.equal(result.ok, true);
  }

  assert.equal(player.upgrades.attack, 255);
  assert.equal(purchaseUpgrade(state, 0, evolution.id, 'attack').reason, 'max-level');
  assert.equal(UPGRADE_DEFINITIONS.attack.cost, 50);
  assert.equal(UPGRADE_DEFINITIONS.defense.max, 255);
});

test('range and speed are one-time 100 mineral upgrades and speed affects existing and future hydras', () => {
  const { map, state } = setup();
  const player = getPlayerState(state, 0);
  const hydraDen = state.upgradeBuildings.find((building) => building.ownerSlot === 0 && building.type === 'hydra-den');
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);
  const existing = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  const before = player.minerals;

  assert.equal(purchaseUpgrade(state, 0, hydraDen.id, 'speed').ok, true);
  assert.equal(existing.speed, HYDRA_SPEED * HYDRA_SPEED_UPGRADE_MULTIPLIER);
  assert.equal(player.minerals, before - 100);
  assert.equal(purchaseUpgrade(state, 0, hydraDen.id, 'speed').reason, 'max-level');

  assert.equal(purchaseUpgrade(state, 0, hydraDen.id, 'range').ok, true);
  assert.equal(calculateHydraAttackRange(state, 0), 128);

  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);
  const localHydras = state.units.filter((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  assert.equal(localHydras.at(-1).speed, HYDRA_SPEED * HYDRA_SPEED_UPGRADE_MULTIPLIER);
});

test('upgrade purchase rejects insufficient minerals, wrong buildings and enemy buildings', () => {
  const { state } = setup();
  const player = getPlayerState(state, 0);
  const evolution = state.upgradeBuildings.find((building) => building.ownerSlot === 0 && building.type === 'evolution');
  const hydraDen = state.upgradeBuildings.find((building) => building.ownerSlot === 0 && building.type === 'hydra-den');
  const teammateEvolution = state.upgradeBuildings.find(
    (building) => building.ownerSlot === 1 && building.type === 'evolution',
  );
  const enemyEvolution = state.upgradeBuildings.find(
    (building) => building.ownerSlot === 2 && building.type === 'evolution',
  );

  player.minerals = 49;
  assert.equal(purchaseUpgrade(state, 0, evolution.id, 'attack').reason, 'insufficient-minerals');
  player.minerals = 1000;
  assert.equal(purchaseUpgrade(state, 0, hydraDen.id, 'attack').reason, 'wrong-building');
  assert.equal(purchaseUpgrade(state, 0, teammateEvolution.id, 'attack').reason, 'not-owned');
  assert.equal(purchaseUpgrade(state, 0, enemyEvolution.id, 'attack').reason, 'not-owned');
});

test('button state disables upgrades that are unaffordable or already maxed', () => {
  const { state } = setup();
  const player = getPlayerState(state, 0);
  const evolution = state.upgradeBuildings.find((building) => building.ownerSlot === 0 && building.type === 'evolution');

  player.minerals = 49;
  assert.equal(upgradeButtonState(state, 0, evolution, 'attack').enabled, false);
  player.minerals = 100;
  assert.equal(upgradeButtonState(state, 0, evolution, 'attack').enabled, true);
  player.upgrades.attack = 255;
  const maxed = upgradeButtonState(state, 0, evolution, 'attack');
  assert.equal(maxed.enabled, false);
  assert.equal(maxed.maxed, true);
});

test('classic damage formulas create the intended sunken-to-hydra crossover threshold', () => {
  const { state } = setup();
  const player = getPlayerState(state, 0);

  player.upgrades.defense = 160;
  assert.equal(calculateSunkenDamage(state, 0), 40);
  player.upgrades.defense = 161;
  assert.equal(calculateSunkenDamage(state, 0), 39);

  player.upgrades.attack = 45;
  assert.equal(calculateHydraDamage(state, 0, SUNKEN_ARMOR), 1);
  player.upgrades.attack = 50;
  assert.equal(calculateHydraDamage(state, 0, SUNKEN_ARMOR), 5);
  player.upgrades.attack = 100;
  assert.equal(calculateHydraDamage(state, 0, SUNKEN_ARMOR), 55);
});
