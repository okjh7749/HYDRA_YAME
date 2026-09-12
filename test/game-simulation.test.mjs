import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeBeaconSystem } from '../src/game-beacon.mjs';
import { initializeCombatState } from '../src/game-combat.mjs';
import { initializeUpgradeBuildings } from '../src/game-upgrades.mjs';

import { buildClassicMap, isWalkableWorld } from '../src/game-core.mjs';
import {
  HYDRA_SPAWN_INTERVAL_MS,
  LARGE_ORDER_UNIT_THRESHOLD,
  MAX_LOCAL_HYDRAS_PER_ZONE,
  assignMoveOrders,
  countHydrasNearZone,
  createSimulation,
  getVisionSources,
  isPointVisible,
  isPointVisibleFromSources,
  selectUnitsInRect,
  stepMovement,
  stepProduction,
  teamHydraCount,
} from '../src/game-simulation.mjs';

test('creates the local overlord and gives the starting base live vision', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  const overlord = state.units.find((unit) => unit.type === 'overlord');
  const localHome = map.zones.find((zone) => zone.ownerSlot === 0);
  const allyHome = map.zones.find((zone) => zone.ownerSlot === 1);
  const enemyHome = map.zones.find((zone) => zone.ownerSlot === 2);

  assert.ok(overlord);
  assert.ok(localHome);
  assert.ok(allyHome);
  assert.ok(enemyHome);
  assert.equal(overlord.ownerSlot, 0);
  assert.equal(overlord.team, 0);
  assert.equal(isWalkableWorld(map, overlord.x, overlord.y), true);
  assert.equal(isPointVisible(state, map, 0, localHome.x, localHome.y), true);
  assert.equal(isPointVisible(state, map, 0, allyHome.x, allyHome.y), true);
  assert.equal(isPointVisible(state, map, 0, enemyHome.x, enemyHome.y), false);
});

test('solo local start exposes the home base, beacon controller, buildings, and first hydra', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  initializeUpgradeBuildings(state);
  initializeBeaconSystem(state, map);

  const home = map.zones.find((zone) => zone.ownerSlot === state.localPlayerSlot);
  const ownBuildings = state.upgradeBuildings.filter(
    (building) => building.ownerSlot === state.localPlayerSlot && building.hp > 0,
  );
  const ownBeacon = state.units.find(
    (unit) => unit.type === 'zealot' && unit.ownerSlot === state.localPlayerSlot,
  );

  assert.ok(home);
  assert.equal(ownBuildings.length, 2);
  assert.ok(ownBeacon);
  assert.equal(isPointVisible(state, map, state.localTeam, home.x, home.y), true);

  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);
  const hydra = state.units.find(
    (unit) => unit.type === 'hydra' && unit.ownerSlot === state.localPlayerSlot,
  );
  assert.ok(hydra);
  assert.equal(isPointVisible(state, map, state.localTeam, hydra.x, hydra.y), true);
});

test('every owned sunken produces one hydra every 500ms', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });

  assert.equal(stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS - 1).length, 0);
  const spawned = stepProduction(state, map, 1);

  assert.equal(spawned.length, 8);
  assert.equal(teamHydraCount(state, 0), 2);
  assert.equal(teamHydraCount(state, 1), 2);
  assert.equal(teamHydraCount(state, 2), 2);
  assert.equal(teamHydraCount(state, 3), 2);
  assert.deepEqual(
    spawned.map((unit) => unit.ownerSlot).sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
});

test('local zone production pauses at the classic 80-hydra presence cap', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  const startZone = map.zones.find((zone) => zone.ownerSlot === 0);
  assert.ok(startZone);

  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS * MAX_LOCAL_HYDRAS_PER_ZONE);

  assert.equal(countHydrasNearZone(state, startZone), MAX_LOCAL_HYDRAS_PER_ZONE);

  const spawned = stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);
  assert.equal(spawned.some((unit) => unit.ownerSlot === 0 && unit.sourceZoneId === startZone.id), false);
});

test('the classic 80 Men cap excludes the isolated beacon zealot', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  initializeBeaconSystem(state, map);
  const startZone = map.zones.find((zone) => zone.ownerSlot === 0);
  assert.ok(startZone);

  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS * (MAX_LOCAL_HYDRAS_PER_ZONE + 1));

  assert.equal(countHydrasNearZone(state, startZone), MAX_LOCAL_HYDRAS_PER_ZONE);
});

test('box selection only returns units owned by the requested team', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const zone = map.zones.find((candidate) => candidate.ownerSlot === 0);
  assert.ok(zone);
  const selected = selectUnitsInRect(state, 0, {
    x1: zone.x - 120,
    y1: zone.y - 120,
    x2: zone.x + 120,
    y2: zone.y + 120,
  });

  assert.ok(selected.length >= 2);
  for (const id of selected) {
    assert.equal(state.units.find((unit) => unit.id === id)?.ownerSlot, 0);
  }
});

test('selected hydras receive a valid formation move order and advance along it', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const hydra = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  const start = { x: hydra.x, y: hydra.y };
  const target = map.zones[12];
  const selected = new Set([hydra.id]);

  assert.equal(assignMoveOrders(map, state, selected, { x: target.x, y: target.y }), 1);
  assert.ok(hydra.path.length > 1);

  for (let i = 0; i < 20; i += 1) stepMovement(state, 50);

  assert.notDeepEqual({ x: hydra.x, y: hydra.y }, start);
  assert.equal(isWalkableWorld(map, hydra.x, hydra.y), true);
});

test('moving the local overlord reveals remote territory in real time', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  const overlord = state.units.find((unit) => unit.type === 'overlord');
  const remote = map.zones[3];

  assert.equal(isPointVisible(state, map, 0, remote.x, remote.y), false);

  overlord.x = remote.x;
  overlord.y = remote.y;

  assert.equal(isPointVisible(state, map, 0, remote.x, remote.y), true);
});

test('dense armies collapse into a small conservative set of vision sources', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS * 20);

  const friendly = state.units.filter((unit) => unit.team === 0);
  const sources = getVisionSources(state, map, 0);

  assert.ok(friendly.length > 20);
  assert.ok(sources.length < friendly.length);
  for (const unit of friendly) {
    assert.equal(isPointVisibleFromSources(sources, unit.x, unit.y), true);
  }
});

test('large move orders share grouped paths instead of pathfinding once per unit', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS * LARGE_ORDER_UNIT_THRESHOLD);
  const hydras = state.units
    .filter((unit) => unit.type === 'hydra' && unit.ownerSlot === 0)
    .slice(0, LARGE_ORDER_UNIT_THRESHOLD);
  const target = map.zones[12];
  const ids = new Set(hydras.map((unit) => unit.id));

  assert.equal(hydras.length, LARGE_ORDER_UNIT_THRESHOLD);
  assert.equal(assignMoveOrders(map, state, ids, target), hydras.length);
  const distinctPaths = new Set(hydras.map((unit) => unit.path));
  assert.ok(distinctPaths.size < hydras.length);
});
