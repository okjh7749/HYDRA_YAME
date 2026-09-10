import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeBeaconSystem } from '../src/game-beacon.mjs';
import { initializeCombatState } from '../src/game-combat.mjs';
import { buildClassicMap } from '../src/game-core.mjs';
import { setZoneOwner } from '../src/game-ownership.mjs';
import {
  evaluateMatchState,
  formatMatchTime,
  initializeMatchState,
  matchTeamRows,
  stepMatchClock,
  teamIsAlive,
} from '../src/game-match.mjs';
import { createSimulation } from '../src/game-simulation.mjs';
import { initializeUpgradeBuildings } from '../src/game-upgrades.mjs';

function setup(countdownMs = 0) {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  initializeUpgradeBuildings(state);
  initializeBeaconSystem(state, map);
  initializeMatchState(state, map, { countdownMs });
  return { map, state };
}

function eliminateTeam(state, map, team) {
  for (const zone of map.zones) {
    if (zone.ownerTeam === team) {
      zone.sunkenHp = 0;
      setZoneOwner(zone, null);
    }
  }
  state.units = state.units.filter((unit) => unit.type !== 'hydra' || unit.team !== team);
}

test('runs a three second countdown before starting the match clock', () => {
  const { map, state } = setup(3000);

  assert.equal(state.match.phase, 'countdown');
  stepMatchClock(state, map, 2999);
  assert.equal(state.match.phase, 'countdown');
  assert.equal(state.match.elapsedMs, 0);

  const events = stepMatchClock(state, map, 1);
  assert.equal(state.match.phase, 'running');
  assert.deepEqual(events, [{ type: 'match-start' }]);

  stepMatchClock(state, map, 1500);
  assert.equal(state.match.elapsedMs, 1500);
  assert.equal(formatMatchTime(state.match.elapsedMs), '00:01');
});

test('classic elimination depends only on hydras and sunkens', () => {
  const { map, state } = setup();
  assert.equal(teamIsAlive(state, map, 0), true);

  eliminateTeam(state, map, 0);
  const events = evaluateMatchState(state, map);

  assert.deepEqual(events, [
    { type: 'player-eliminated', slot: 0, team: 0 },
    { type: 'player-eliminated', slot: 1, team: 0 },
  ]);
  assert.equal(state.players[0].status, 'eliminated');
  assert.equal(state.players[1].status, 'eliminated');
  assert.equal(state.match.localMode, 'spectating');
  assert.equal(state.units.some((unit) => unit.team === 0), false);
  assert.equal(
    state.upgradeBuildings.filter((building) => building.team === 0).every((building) => building.hp === 0),
    true,
  );
});

test('the last surviving team wins and the local result is recorded', () => {
  const { map, state } = setup();

  eliminateTeam(state, map, 1);
  eliminateTeam(state, map, 2);
  eliminateTeam(state, map, 3);
  const events = evaluateMatchState(state, map);

  assert.equal(state.match.phase, 'finished');
  assert.equal(state.match.winnerTeam, 0);
  assert.equal(state.match.result, 'victory');
  assert.equal(events.at(-1).type, 'match-finished');
});

test('team rows expose status, territory, army and economy for the scoreboard', () => {
  const { map, state } = setup();
  const rows = matchTeamRows(state, map);

  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], {
    team: 0,
    status: 'active',
    zones: 2,
    hydras: 0,
    minerals: 2000,
    kills: 0,
    captures: 0,
  });
});
