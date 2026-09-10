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

test('creates AI controllers for the three non-local teams only', () => {
  const { state } = setup();
  const controllers = initializeAiState(state);

  assert.deepEqual(controllers.map((controller) => controller.team), [1, 2, 3]);
});

test('AI chooses a frontier zone and issues an assault to all of its hydras', () => {
  const { map, state } = setup();
  spawnArmy(state, map);

  const target = chooseAiTarget(state, map, 1);
  assert.ok(target);
  assert.notEqual(target.ownerTeam, 1);

  const controller = initializeAiState(state).find((item) => item.team === 1);
  controller.decisionCooldownMs = 0;
  const events = stepAi(state, map, 1);
  const assault = events.find((event) => event.type === 'ai-assault' && event.team === 1);

  assert.ok(assault);
  const hydras = state.units.filter((unit) => unit.type === 'hydra' && unit.team === 1);
  assert.equal(assault.ordered, hydras.length);
  assert.equal(hydras.length, AI_MIN_ASSAULT_HYDRAS * 2);
  assert.equal(hydras.every((unit) => unit.orderType === 'ai-assault'), true);
  assert.equal(hydras.every((unit) => unit.path.length > 0), true);
});

test('AI overlord captures a neutral zone when its hydras have a strict lead', () => {
  const { map, state } = setup();
  spawnArmy(state, map, 1);

  const target = chooseAiTarget(state, map, 1);
  const hydra = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 2);
  const overlord = ensureAiOverlord(state, map, 1);
  assert.ok(overlord);

  hydra.x = target.x + 10;
  hydra.y = target.y;
  overlord.x = target.x;
  overlord.y = target.y;
  const before = state.players[2].minerals;

  const events = stepAiCaptures(state, map);

  assert.deepEqual(events, [{ type: 'ai-capture', team: 1, zoneId: target.id }]);
  assert.equal(target.ownerTeam, 1);
  assert.equal(target.sunkenHp, 9999);
  assert.equal(state.players[2].minerals, before - 250);
});
