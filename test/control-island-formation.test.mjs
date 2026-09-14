import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BEACON_PAD_DISTANCE,
  BEACON_PAD_RADIUS,
  beaconPadsForPlayer,
  initializeBeaconSystem,
} from '../src/game-beacon.mjs';
import { initializeCombatState } from '../src/game-combat.mjs';
import { buildClassicMap } from '../src/game-core.mjs';
import {
  CONTROL_ISLANDS,
  CONTROL_ISLAND_BUILDING_RADIUS,
  CONTROL_ISLAND_INSET,
  controlIslandForPlayer,
  controlIslandsOverlap,
  pointInControlIsland,
  upgradeBuildingPositionsForPlayer,
} from '../src/game-infrastructure.mjs';
import {
  LARGE_ORDER_UNIT_THRESHOLD,
  assignMoveOrders,
  createSimulation,
  stepProduction,
  HYDRA_SPAWN_INTERVAL_MS,
} from '../src/game-simulation.mjs';

function setup() {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  initializeBeaconSystem(state, map);
  return { map, state };
}

test('players use the nearest isolated control island with square beacon spacing', () => {
  const { state } = setup();

  for (const player of state.players) {
    const island = controlIslandForPlayer(player);
    const chosenDistance = Math.hypot(island.x - player.homeX, island.y - player.homeY);
    const nearestDistance = Math.min(...CONTROL_ISLANDS.map(
      (candidate) => Math.hypot(candidate.x - player.homeX, candidate.y - player.homeY),
    ));
    assert.equal(chosenDistance, nearestDistance);

    const center = state.beaconCenters.get(player.slot);
    const offsets = beaconPadsForPlayer(state, player.slot)
      .map((pad) => [pad.x - center.x, pad.y - center.y])
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);

    const d = BEACON_PAD_DISTANCE;
    assert.deepEqual(offsets, [
      [-d, -d], [0, -d], [d, -d],
      [-d, 0], [d, 0],
      [-d, d], [0, d], [d, d],
    ]);
  }
});

test('control islands never overlap and their pads/buildings fit without collisions', () => {
  const { state } = setup();

  for (let i = 0; i < CONTROL_ISLANDS.length; i += 1) {
    for (let j = i + 1; j < CONTROL_ISLANDS.length; j += 1) {
      assert.equal(controlIslandsOverlap(CONTROL_ISLANDS[i], CONTROL_ISLANDS[j]), false);
    }
  }

  for (const player of state.players) {
    const island = controlIslandForPlayer(player);
    const pads = beaconPadsForPlayer(state, player.slot);
    const buildings = upgradeBuildingPositionsForPlayer(player);

    for (const pad of pads) {
      assert.equal(
        pointInControlIsland(island, pad.x, pad.y, CONTROL_ISLAND_INSET + BEACON_PAD_RADIUS),
        true,
      );
    }
    for (const building of buildings) {
      assert.equal(
        pointInControlIsland(
          island,
          building.x,
          building.y,
          CONTROL_ISLAND_INSET + CONTROL_ISLAND_BUILDING_RADIUS,
        ),
        true,
      );
    }

    assert.ok(
      Math.hypot(buildings[0].x - buildings[1].x, buildings[0].y - buildings[1].y)
        >= CONTROL_ISLAND_BUILDING_RADIUS * 2,
    );
    for (const building of buildings) {
      for (const pad of pads) {
        assert.ok(
          Math.hypot(building.x - pad.x, building.y - pad.y)
            >= CONTROL_ISLAND_BUILDING_RADIUS + BEACON_PAD_RADIUS,
        );
      }
    }
  }
});

test('large first move spreads hydras across several formation lanes', () => {
  const { map, state } = setup();
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS * LARGE_ORDER_UNIT_THRESHOLD);
  const hydras = state.units
    .filter((unit) => unit.type === 'hydra' && unit.ownerSlot === 0)
    .slice(0, LARGE_ORDER_UNIT_THRESHOLD);
  const target = map.zones[12];

  assert.equal(hydras.length, LARGE_ORDER_UNIT_THRESHOLD);
  assert.equal(
    assignMoveOrders(map, state, new Set(hydras.map((unit) => unit.id)), target),
    hydras.length,
  );

  const distinctPaths = new Set(hydras.map((unit) => unit.path));
  const endpoints = new Set(hydras.map((unit) => {
    const endpoint = unit.path.at(-1);
    return `${Math.round(endpoint.x)},${Math.round(endpoint.y)}`;
  }));
  assert.equal(distinctPaths.size, hydras.length);
  assert.ok(endpoints.size >= 6);
});
