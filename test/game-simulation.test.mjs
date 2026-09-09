import assert from 'node:assert/strict';
import test from 'node:test';

import { buildClassicMap, isWalkableWorld } from '../src/game-core.mjs';
import {
  HYDRA_SPAWN_INTERVAL_MS,
  MAX_LOCAL_HYDRAS_PER_ZONE,
  assignMoveOrders,
  countHydrasNearZone,
  createSimulation,
  isPointVisible,
  selectUnitsInRect,
  stepMovement,
  stepProduction,
  teamHydraCount,
} from '../src/game-simulation.mjs';

test('creates the local overlord and gives the starting base live vision', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  const overlord = state.units.find((unit) => unit.type === 'overlord');

  assert.ok(overlord);
  assert.equal(overlord.team, 0);
  assert.equal(isWalkableWorld(map, overlord.x, overlord.y), true);
  assert.equal(isPointVisible(state, map, 0, map.zones[0].x, map.zones[0].y), true);
  assert.equal(isPointVisible(state, map, 0, map.zones[3].x, map.zones[3].y), false);
});

test('every owned sunken produces one hydra every 500ms', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });

  assert.equal(stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS - 1).length, 0);
  const spawned = stepProduction(state, map, 1);

  assert.equal(spawned.length, 4);
  assert.equal(teamHydraCount(state, 0), 1);
  assert.equal(teamHydraCount(state, 1), 1);
  assert.equal(teamHydraCount(state, 2), 1);
  assert.equal(teamHydraCount(state, 3), 1);
});

test('local zone production pauses at the classic 80-hydra presence cap', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  const startZone = map.zones[0];

  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS * MAX_LOCAL_HYDRAS_PER_ZONE);

  assert.equal(countHydrasNearZone(state, startZone), MAX_LOCAL_HYDRAS_PER_ZONE);

  const spawned = stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);
  assert.equal(spawned.some((unit) => unit.team === 0 && unit.sourceZoneId === startZone.id), false);
});

test('box selection only returns units owned by the requested team', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const zone = map.zones[0];
  const selected = selectUnitsInRect(state, 0, {
    x1: zone.x - 120,
    y1: zone.y - 120,
    x2: zone.x + 120,
    y2: zone.y + 120,
  });

  assert.ok(selected.length >= 2);
  for (const id of selected) {
    assert.equal(state.units.find((unit) => unit.id === id)?.team, 0);
  }
});

test('selected hydras receive a valid formation move order and advance along it', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);

  const hydra = state.units.find((unit) => unit.type === 'hydra' && unit.team === 0);
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
