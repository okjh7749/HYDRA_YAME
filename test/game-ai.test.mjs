import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_MIN_ASSAULT_HYDRAS,
  chooseAiTarget,
  ensureAiOverlord,
  initializeAiState,
  stepAi,
  stepAiCaptures,
} from '../src/game-ai.mjs';
import { initializeCombatState } from '../src/game-combat.mjs';
import { buildClassicMap } from '../src/game-core.mjs';
import { initializeMatchState } from '../src/game-match.mjs';
import {
  HYDRA_SPAWN_INTERVAL_MS,
  createSimulation,
  stepProduction,
} from '../src/game-simulation.mjs';

function setup() {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  initializeMatchState(state, map, { countdownMs: 0 });
  return { map, state };
}

function spawnArmy(state, map, count = AI_MIN_ASSAULT_HYDRAS) {
  for (let index = 0; index < count; index += 1) {
    stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);
  }
}

test('creates one AI controller for every non-local player slot, including the local ally', () => {
  const { state } = setup();
  const controllers = initializeAiState(state);

  assert.deepEqual(
    controllers.map((controller) => controller.ownerSlot),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    controllers.map((controller) => controller.team),
    [0, 1, 1, 2, 2, 3, 3],
  );
});

test('AI chooses by player ownership and commands only that players hydras', () => {
  const { map, state } = setup();
  spawnArmy(state, map);

  const target = chooseAiTarget(state, map, 2);
  assert.ok(target);
  assert.notEqual(target.ownerTeam, 1);

  const controller = initializeAiState(state).find((item) => item.ownerSlot === 2);
  controller.decisionCooldownMs = 0;
  const events = stepAi(state, map, 1);
  const assault = events.find(
    (event) => event.type === 'ai-assault' && event.ownerSlot === 2,
  );

  assert.ok(assault);
  const ownHydras = state.units.filter(
    (unit) => unit.type === 'hydra' && unit.ownerSlot === 2,
  );
  const teammateHydras = state.units.filter(
    (unit) => unit.type === 'hydra' && unit.ownerSlot === 3,
  );
  assert.equal(assault.ordered, AI_MIN_ASSAULT_HYDRAS);
  assert.equal(ownHydras.every((unit) => unit.orderType === 'ai-assault'), true);
  assert.equal(ownHydras.every((unit) => unit.path.length > 0), true);
  assert.equal(teammateHydras.some((unit) => unit.orderType === 'ai-assault'), false);
});

test('AI capture delegates to the same Any Unit and 250 mineral trigger as players', () => {
  const { map, state } = setup();
  spawnArmy(state, map, 1);

  const target = chooseAiTarget(state, map, 2);
  const hydra = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 2);
  const overlord = ensureAiOverlord(state, map, 2);
  assert.ok(target);
  assert.ok(hydra);
  assert.ok(overlord);

  state.units = state.units.filter(
    (unit) => unit.id === hydra.id || unit.id === overlord.id || unit.ownerSlot !== 2,
  );
  hydra.x = target.x + 10;
  hydra.y = target.y;
  overlord.x = target.x;
  overlord.y = target.y;
  const before = state.players[2].minerals;

  const events = stepAiCaptures(state, map);

  assert.deepEqual(
    events.filter((event) => event.ownerSlot === 2),
    [{ type: 'ai-capture', ownerSlot: 2, team: 1, zoneId: target.id }],
  );
  assert.equal(target.ownerSlot, 2);
  assert.equal(target.ownerTeam, 1);
  assert.equal(target.sunkenHp, 9999);
  assert.equal(state.players[2].minerals, before - 250);
  assert.equal(state.units.some((unit) => unit.id === overlord.id), false);
});
