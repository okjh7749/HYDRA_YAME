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

function eliminateTeamArtifacts(state, team) {
  state.units = (state.units ?? []).filter((unit) => unit.team !== team);
  for (const building of state.upgradeBuildings ?? []) {
    if (building.team === team) building.hp = 0;
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
  return teamHydraCount(state, team) > 0 || teamSunkenCount(map, team) > 0;
}

export function evaluateMatchState(state, map) {
  const match = state.match ?? initializeMatchState(state, map, { countdownMs: 0 });
  if (match.phase === 'finished') return [];

  const events = [];
  for (const player of state.players ?? []) {
    if (player.status === 'eliminated' || teamIsAlive(state, map, player.team)) continue;

    player.status = 'eliminated';
    player.eliminatedAtMs = match.elapsedMs;
    eliminateTeamArtifacts(state, player.team);
    const event = { type: 'team-eliminated', team: player.team };
    pushMatchEvent(state, event);
    events.push(event);
    if (player.team === state.localTeam) match.localMode = 'spectating';
  }

  const active = (state.players ?? []).filter((player) => player.status !== 'eliminated');
  if (active.length === 1 && (state.players?.length ?? 0) > 1) {
    match.phase = 'finished';
    match.winnerTeam = active[0].team;
    match.result = active[0].team === state.localTeam ? 'victory' : 'defeat';
    if (match.result === 'defeat') match.localMode = 'spectating';
    const event = { type: 'match-finished', winnerTeam: active[0].team };
    pushMatchEvent(state, event);
    events.push(event);
  } else if (active.length === 0 && (state.players?.length ?? 0) > 0) {
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
  return (state.players ?? []).map((player) => ({
    team: player.team,
    status: player.status ?? 'active',
    zones: teamSunkenCount(map, player.team),
    hydras: teamHydraCount(state, player.team),
    minerals: player.minerals,
    kills: player.kills,
    captures: player.captures,
  }));
}

export function formatMatchTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
