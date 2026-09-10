import {
  FORCE_COUNT,
  forceIsAlive,
  playerHydraCount,
  playerSunkenCount,
  unitOwnerSlot,
  zoneOwnerSlot,
} from './game-ownership.mjs';

export const DEFAULT_MATCH_COUNTDOWN_MS = 3000;

function teamHydraCount(state, team) {
  let count = 0;
  for (const unit of state.units ?? []) {
    if (unit.type === 'hydra' && unit.team === team && unit.hp > 0) count += 1;
  }
  return count;
}

function teamSunkenCount(map, team) {
  return map.zones.filter(
    (zone) => zone.ownerTeam === team && (zone.sunkenHp ?? 0) > 0,
  ).length;
}

function eliminatePlayerArtifacts(state, ownerSlot) {
  state.units = (state.units ?? []).filter((unit) => unitOwnerSlot(unit) !== ownerSlot);
  for (const building of state.upgradeBuildings ?? []) {
    if (building.ownerSlot === ownerSlot) building.hp = 0;
  }
}

function pushMatchEvent(state, event) {
  state.match.events.push({ ...event, atMs: state.match.elapsedMs });
  if (state.match.events.length > 32) state.match.events.shift();
}

export function initializeMatchState(
  state,
  map,
  { countdownMs = DEFAULT_MATCH_COUNTDOWN_MS } = {},
) {
  if (state.match) return state.match;

  for (const player of state.players ?? []) {
    if (!player.status) player.status = 'active';
    if (player.eliminatedAtMs === undefined) player.eliminatedAtMs = null;
  }

  state.match = {
    phase: countdownMs > 0 ? 'countdown' : 'running',
    countdownMs: Math.max(0, countdownMs),
    elapsedMs: 0,
    winnerTeam: null,
    result: null,
    localMode: 'playing',
    events: [],
  };

  evaluateMatchState(state, map);
  return state.match;
}

export function stepMatchClock(state, map, deltaMs) {
  const match = initializeMatchState(state, map);
  const events = [];
  if (match.phase === 'finished') return events;

  if (match.phase === 'countdown') {
    match.countdownMs = Math.max(0, match.countdownMs - deltaMs);
    if (match.countdownMs === 0) {
      match.phase = 'running';
      const event = { type: 'match-start' };
      pushMatchEvent(state, event);
      events.push(event);
    }
    return events;
  }

  match.elapsedMs += deltaMs;
  return events;
}

export function teamIsAlive(state, map, team) {
  return forceIsAlive(state, map, team);
}

export function evaluateMatchState(state, map) {
  const match = state.match ?? initializeMatchState(state, map, { countdownMs: 0 });
  if (match.phase === 'finished') return [];

  const events = [];
  for (const player of state.players ?? []) {
    const alive = playerHydraCount(state, player.slot) > 0 || playerSunkenCount(map, player.slot) > 0;
    if (player.status === 'eliminated' || alive) continue;

    player.status = 'eliminated';
    player.eliminatedAtMs = match.elapsedMs;
    eliminatePlayerArtifacts(state, player.slot);
    const event = { type: 'player-eliminated', slot: player.slot, team: player.team };
    pushMatchEvent(state, event);
    events.push(event);
    if (player.slot === state.localPlayerSlot) match.localMode = 'spectating';
  }

  const activeTeams = [];
  for (let team = 0; team < FORCE_COUNT; team += 1) {
    if (forceIsAlive(state, map, team)) activeTeams.push(team);
  }

  if (activeTeams.length === 1 && (state.players?.length ?? 0) > 1) {
    match.phase = 'finished';
    match.winnerTeam = activeTeams[0];
    match.result = activeTeams[0] === state.localTeam ? 'victory' : 'defeat';
    if (match.result === 'defeat') match.localMode = 'spectating';
    const event = { type: 'match-finished', winnerTeam: activeTeams[0] };
    pushMatchEvent(state, event);
    events.push(event);
  } else if (activeTeams.length === 0 && (state.players?.length ?? 0) > 0) {
    match.phase = 'finished';
    match.winnerTeam = null;
    match.result = 'draw';
    match.localMode = 'spectating';
    const event = { type: 'match-finished', winnerTeam: null };
    pushMatchEvent(state, event);
    events.push(event);
  }

  return events;
}

export function matchTeamRows(state, map) {
  return Array.from({ length: FORCE_COUNT }, (_, team) => {
    const players = (state.players ?? []).filter((player) => player.team === team);
    return {
      team,
      status: forceIsAlive(state, map, team) ? 'active' : 'eliminated',
      zones: teamSunkenCount(map, team),
      hydras: teamHydraCount(state, team),
      minerals: players.reduce((sum, player) => sum + (player.minerals ?? 0), 0),
      kills: players.reduce((sum, player) => sum + (player.kills ?? 0), 0),
      captures: players.reduce((sum, player) => sum + (player.captures ?? 0), 0),
    };
  });
}

export function formatMatchTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
