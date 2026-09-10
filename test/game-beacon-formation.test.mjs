import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BEACON_DIRECTIONS,
  beaconPadsForTeam,
  initializeBeaconSystem,
  stepBeaconSystem,
} from '../src/game-beacon.mjs';
import { initializeCombatState } from '../src/game-combat.mjs';
import { buildClassicMap, isWalkableWorld } from '../src/game-core.mjs';
import {
  MAX_HYDRA_SEPARATION_PUSH,
  stepFormationMovement,
} from '../src/game-formation.mjs';
import {
  HYDRA_SPAWN_INTERVAL_MS,
  assignMoveOrders,
  createSimulation,
  stepProduction,
} from '../src/game-simulation.mjs';

function setup() {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  initializeBeaconSystem(state, map);
  return { map, state };
}

test('creates one selectable beacon zealot and eight directional pads for every team', () => {
  const { state } = setup();

  const zealots = state.units.filter((unit) => unit.type === 'zealot' && unit.beaconController);
  assert.equal(zealots.length, 8);
  assert.equal(state.beaconPads.length, 32);

  const localPads = beaconPadsForTeam(state, 0);
  assert.equal(localPads.length, 8);
  assert.deepEqual(
    localPads.map((pad) => pad.direction),
    BEACON_DIRECTIONS.map((direction) => direction.key),
  );
  assert.deepEqual(
    localPads.map((pad) => pad.targetZoneId),
    [2, 3, 13, 21, 20, 19, 9, 1],
  );
});

test('a zealot entering a beacon pad rallies all friendly hydras and returns home', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const zealot = state.units.find((unit) => unit.type === 'zealot' && unit.team === 0);
  const localHydra = state.units.find((unit) => unit.type === 'hydra' && unit.team === 0);
  const enemyHydra = state.units.find((unit) => unit.type === 'hydra' && unit.team === 1);
  const pad = beaconPadsForTeam(state, 0).find((candidate) => candidate.direction === 'SE');

  zealot.x = pad.x;
  zealot.y = pad.y;
  const events = stepBeaconSystem(state, map, 16);

  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'SE');
  assert.equal(events[0].targetZoneId, 21);
  assert.equal(events[0].ordered, 1);
  assert.equal(localHydra.orderType, 'beacon-rally');
  assert.equal(localHydra.rallyTargetZoneId, 21);
  assert.ok(localHydra.path.length > 1);
  assert.notEqual(enemyHydra.orderType, 'beacon-rally');
  assert.equal(zealot.orderType, 'beacon-return');
  assert.ok(zealot.path.length > 0);
});

test('a new manual command can override the zealot return order while it is moving', () => {
  const { map, state } = setup();
  const zealot = state.units.find((unit) => unit.type === 'zealot' && unit.team === 0);
  const pad = beaconPadsForTeam(state, 0).find((candidate) => candidate.direction === 'E');

  zealot.x = pad.x;
  zealot.y = pad.y;
  stepBeaconSystem(state, map, 16);
  assert.equal(zealot.orderType, 'beacon-return');

  const target = map.zones[12];
  const ordered = assignMoveOrders(map, state, new Set([zealot.id]), target);

  assert.equal(ordered, 1);
  assert.ok(zealot.path.length > 1);
});

test('overlapping friendly hydras separate gradually without teleporting', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS * 2);

  const hydras = state.units.filter((unit) => unit.type === 'hydra' && unit.team === 0);
  const center = map.zones[0];
  hydras[0].x = center.x;
  hydras[0].y = center.y;
  hydras[1].x = center.x;
  hydras[1].y = center.y;

  stepFormationMovement(state, map, 50);

  const distance = Math.hypot(hydras[0].x - hydras[1].x, hydras[0].y - hydras[1].y);
  assert.ok(distance > 0);
  assert.ok(distance <= MAX_HYDRA_SEPARATION_PUSH * 2 + 0.01);
  assert.equal(isWalkableWorld(map, hydras[0].x, hydras[0].y), true);
  assert.equal(isWalkableWorld(map, hydras[1].x, hydras[1].y), true);
});

test('separation and movement never push hydras into the black void', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS * 2);

  const hydras = state.units.filter((unit) => unit.type === 'hydra' && unit.team === 0);
  hydras[0].x = 464;
  hydras[0].y = 80;
  hydras[1].x = 466;
  hydras[1].y = 80;

  for (let i = 0; i < 100; i += 1) stepFormationMovement(state, map, 50);

  assert.equal(isWalkableWorld(map, hydras[0].x, hydras[0].y), true);
  assert.equal(isWalkableWorld(map, hydras[1].x, hydras[1].y), true);
});
