import { initializeBeaconSystem, stepBeaconSystem } from './game-beacon.mjs';
import {
  ensureLocalOverlord,
  getPlayerState,
  initializeCombatState,
  stepCapture,
  stepCombat,
} from './game-combat.mjs';
import { buildClassicMap } from './game-core.mjs';
import { stepFormationMovement } from './game-formation.mjs';
import {
  evaluateMatchState,
  initializeMatchState,
  matchTeamRows,
  stepMatchClock,
} from './game-match.mjs';
import {
  assignMoveOrders,
  createSimulation,
  isPointVisible,
  stepProduction,
} from './game-simulation.mjs';
import {
  initializeUpgradeBuildings,
  purchaseUpgrade,
} from './game-upgrades.mjs';

export const MAX_ROOM_PLAYERS = 8;
export const MIN_ROOM_PLAYERS = 2;
export const SERVER_TICK_MS = 50;
export const SNAPSHOT_INTERVAL_MS = 100;
export const SLOT_JOIN_ORDER = Object.freeze([0, 2, 4, 6, 1, 3, 5, 7]);

function sanitizeName(name) {
  const normalized = String(name ?? '').trim().replace(/\s+/g, ' ');
  return (normalized || 'Player').slice(0, 20);
}

function teamForSlot(slot) {
  return Math.floor(slot / 2);
}

function activeTeams(room) {
  return new Set(room.players.filter((player) => player.connected).map((player) => player.team));
}

function nextOpenSlot(room) {
  const occupied = new Set(room.players.map((player) => player.slot));
  return SLOT_JOIN_ORDER.find((slot) => !occupied.has(slot)) ?? null;
}

function initializeRoomSimulation() {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  initializeCombatState(state, map);
  initializeUpgradeBuildings(state);
  initializeBeaconSystem(state, map);
  return { map, state };
}

export function createRoom({ id, hostId, hostName }) {
  const { map, state } = initializeRoomSimulation();
  const hostSlot = SLOT_JOIN_ORDER[0];
  return {
    id: String(id).toUpperCase(),
    hostId,
    status: 'lobby',
    createdAt: Date.now(),
    players: [{
      id: hostId,
      name: sanitizeName(hostName),
      slot: hostSlot,
      team: teamForSlot(hostSlot),
      ready: false,
      connected: true,
    }],
    map,
    state,
    tick: 0,
    snapshotAccumulatorMs: 0,
    snapshotSequence: 0,
  };
}

export function joinRoom(room, { clientId, name }) {
  if (room.status !== 'lobby') return { ok: false, reason: 'already-started' };
  const existing = room.players.find((player) => player.id === clientId);
  if (existing) {
    existing.connected = true;
    return { ok: true, player: existing };
  }
  if (room.players.length >= MAX_ROOM_PLAYERS) return { ok: false, reason: 'room-full' };
  const slot = nextOpenSlot(room);
  if (slot === null) return { ok: false, reason: 'room-full' };
  const player = {
    id: clientId,
    name: sanitizeName(name),
    slot,
    team: teamForSlot(slot),
    ready: false,
    connected: true,
  };
  room.players.push(player);
  return { ok: true, player };
}

export function leaveRoom(room, clientId) {
  const player = room.players.find((candidate) => candidate.id === clientId);
  if (!player) return null;

  if (room.status === 'lobby') {
    room.players = room.players.filter((candidate) => candidate.id !== clientId);
    if (room.hostId === clientId) {
      room.hostId = room.players.slice().sort((a, b) => a.slot - b.slot)[0]?.id ?? null;
    }
  } else {
    player.connected = false;
    player.ready = false;
    const teammateConnected = room.players.some(
      (candidate) => candidate.id !== clientId
        && candidate.team === player.team
        && candidate.connected,
    );
    if (room.status === 'running' && !teammateConnected) {
      for (const zone of room.map.zones) {
        if (zone.ownerTeam === player.team) {
          zone.ownerTeam = null;
          zone.sunkenHp = 0;
        }
      }
      room.state.units = room.state.units.filter((unit) => unit.team !== player.team);
      for (const building of room.state.upgradeBuildings ?? []) {
        if (building.team === player.team) building.hp = 0;
      }
      evaluateMatchState(room.state, room.map);
      if (room.state.match?.phase === 'finished') room.status = 'finished';
    }
  }
  return player;
}

export function setRoomReady(room, clientId, ready) {
  if (room.status !== 'lobby') return { ok: false, reason: 'already-started' };
  const player = room.players.find((candidate) => candidate.id === clientId);
  if (!player) return { ok: false, reason: 'not-in-room' };
  player.ready = Boolean(ready);
  return { ok: true, ready: player.ready };
}

function disableUnusedTeams(room) {
  const teams = activeTeams(room);
  const { state, map } = room;
  for (const player of state.players) {
    player.status = teams.has(player.team) ? 'active' : 'eliminated';
    player.eliminatedAtMs = teams.has(player.team) ? null : 0;
  }
  for (const zone of map.zones) {
    if (zone.ownerTeam !== null && !teams.has(zone.ownerTeam)) {
      zone.ownerTeam = null;
      zone.sunkenHp = 0;
    }
  }
  for (const building of state.upgradeBuildings ?? []) {
    if (!teams.has(building.team)) building.hp = 0;
  }
  state.units = state.units.filter(
    (unit) => teams.has(unit.team) && unit.type !== 'overlord',
  );
}

export function startRoom(room, clientId) {
  if (room.status !== 'lobby') return { ok: false, reason: 'already-started' };
  if (room.hostId !== clientId) return { ok: false, reason: 'host-only' };
  const connected = room.players.filter((player) => player.connected);
  if (connected.length < MIN_ROOM_PLAYERS) return { ok: false, reason: 'need-more-players' };
  if (connected.some((player) => !player.ready)) return { ok: false, reason: 'not-ready' };
  const teams = new Set(connected.map((player) => player.team));
  if (teams.size < 2) return { ok: false, reason: 'need-two-teams' };

  disableUnusedTeams(room);
  initializeMatchState(room.state, room.map, { countdownMs: 3000 });
  room.status = 'running';
  return { ok: true, teams: [...teams].sort() };
}

function playerForClient(room, clientId) {
  return room.players.find((player) => player.id === clientId) ?? null;
}

function commandableUnitIds(room, team, unitIds) {
  const requested = new Set(
    Array.isArray(unitIds)
      ? unitIds.filter((id) => Number.isInteger(id)).slice(0, 512)
      : [],
  );
  return new Set(
    room.state.units
      .filter((unit) => requested.has(unit.id) && unit.team === team && unit.hp > 0)
      .map((unit) => unit.id),
  );
}

export function handleRoomCommand(room, clientId, command) {
  const player = playerForClient(room, clientId);
  if (!player || !player.connected) return { ok: false, reason: 'not-in-room' };
  if (room.status !== 'running' || room.state.match?.phase !== 'running') {
    return { ok: false, reason: 'match-not-running' };
  }
  if (getPlayerState(room.state, player.team)?.status === 'eliminated') {
    return { ok: false, reason: 'eliminated' };
  }
  if (!command || typeof command !== 'object') return { ok: false, reason: 'invalid-command' };

  if (command.type === 'move') {
    const x = Number(command.x);
    const y = Number(command.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, reason: 'invalid-target' };
    }
    const ids = commandableUnitIds(room, player.team, command.unitIds);
    if (ids.size === 0) return { ok: false, reason: 'no-commandable-units' };
    const ordered = assignMoveOrders(room.map, room.state, ids, { x, y });
    return { ok: ordered > 0, type: 'move', ordered };
  }

  if (command.type === 'upgrade') {
    const result = purchaseUpgrade(
      room.state,
      player.team,
      String(command.buildingId ?? ''),
      String(command.upgradeKey ?? ''),
    );
    return { ...result, type: 'upgrade' };
  }

  return { ok: false, reason: 'unknown-command' };
}

function tickRunningSimulation(room, deltaMs) {
  const { state, map } = room;
  stepProduction(state, map, deltaMs);
  stepFormationMovement(state, map, deltaMs);
  stepBeaconSystem(state, map, deltaMs);
  stepCombat(state, map, deltaMs);

  const teams = activeTeams(room);
  for (const team of teams) {
    const gamePlayer = getPlayerState(state, team);
    if (!gamePlayer || gamePlayer.status === 'eliminated') continue;
    stepCapture(state, map, team);
    ensureLocalOverlord(state, map, team);
  }
  evaluateMatchState(state, map);
}

export function tickRoom(room, deltaMs = SERVER_TICK_MS) {
  if (room.status !== 'running') return [];
  const events = stepMatchClock(room.state, room.map, deltaMs);
  if (room.state.match.phase === 'running') tickRunningSimulation(room, deltaMs);
  if (room.state.match.phase === 'finished') room.status = 'finished';
  room.tick += 1;
  room.snapshotAccumulatorMs += deltaMs;
  return events;
}

export function roomNeedsSnapshot(room) {
  if (room.snapshotAccumulatorMs < SNAPSHOT_INTERVAL_MS) return false;
  room.snapshotAccumulatorMs %= SNAPSHOT_INTERVAL_MS;
  room.snapshotSequence += 1;
  return true;
}

export function lobbyView(room, clientId) {
  return {
    roomId: room.id,
    status: room.status,
    hostId: room.hostId,
    selfId: clientId,
    players: room.players
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((player) => ({ ...player })),
    maxPlayers: MAX_ROOM_PLAYERS,
  };
}

function serializeUnit(unit) {
  return {
    id: unit.id,
    type: unit.type,
    team: unit.team,
    x: Math.round(unit.x * 10) / 10,
    y: Math.round(unit.y * 10) / 10,
    hp: Math.max(0, Math.ceil(unit.hp)),
    maxHp: unit.maxHp,
    facing: unit.facing ?? 0,
  };
}

function spectatorFor(room, roomPlayer) {
  if (!roomPlayer || room.status === 'lobby') return false;
  const teamState = getPlayerState(room.state, roomPlayer.team);
  return teamState?.status === 'eliminated' || room.state.match?.phase === 'finished';
}

function visibleToTeam(room, team, x, y, fullVision) {
  return fullVision || isPointVisible(room.state, room.map, team, x, y);
}

function teamRowsForClient(room, team, fullVision) {
  return matchTeamRows(room.state, room.map).map((row) => {
    if (fullVision || row.team === team) return row;
    return {
      ...row,
      zones: '?',
      hydras: '?',
      minerals: '?',
      kills: '?',
      captures: '?',
    };
  });
}

export function snapshotForClient(room, clientId) {
  const roomPlayer = playerForClient(room, clientId);
  if (!roomPlayer || !room.state.match) return null;
  const team = roomPlayer.team;
  const fullVision = spectatorFor(room, roomPlayer);

  const units = room.state.units
    .filter(
      (unit) => unit.team === team || visibleToTeam(room, team, unit.x, unit.y, fullVision),
    )
    .map(serializeUnit);

  const zones = room.map.zones.map((zone) => {
    const visible = zone.ownerTeam === team || visibleToTeam(room, team, zone.x, zone.y, fullVision);
    return {
      id: zone.id,
      x: zone.x,
      y: zone.y,
      radius: zone.radius,
      visible,
      ownerTeam: visible ? zone.ownerTeam : null,
      sunkenHp: visible ? Math.max(0, Math.ceil(zone.sunkenHp ?? 0)) : null,
      sunkenMaxHp: visible ? (zone.sunkenMaxHp ?? 0) : null,
    };
  });

  const effects = (room.state.effects ?? []).filter(
    (effect) => visibleToTeam(room, team, effect.x2, effect.y2, fullVision),
  );

  const beacons = (room.state.beaconPads ?? [])
    .filter((pad) => fullVision || pad.team === team)
    .map((pad) => ({
      id: pad.id,
      team: pad.team,
      direction: pad.direction,
      targetZoneId: pad.targetZoneId,
      x: pad.x,
      y: pad.y,
      radius: pad.radius,
    }));

  return {
    type: 'snapshot',
    roomId: room.id,
    sequence: room.snapshotSequence,
    serverTick: room.tick,
    self: {
      id: roomPlayer.id,
      slot: roomPlayer.slot,
      team,
      spectator: fullVision,
    },
    match: {
      ...room.state.match,
      result: room.state.match.phase !== 'finished'
        ? null
        : (room.state.match.winnerTeam === null
          ? 'draw'
          : (room.state.match.winnerTeam === team ? 'victory' : 'defeat')),
      events: room.state.match.events.slice(-8),
    },
    teams: teamRowsForClient(room, team, fullVision),
    upgrades: { ...(getPlayerState(room.state, team)?.upgrades ?? {}) },
    units,
    zones,
    beacons,
    effects,
  };
}
