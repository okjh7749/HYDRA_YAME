import { initializeBeaconSystem, stepBeaconSystem } from './game-beacon.mjs';
import { computeStableLockstepChecksum as computeDeterministicStateChecksum } from './lockstep-checksum.mjs';
import { quantizeSimulationState } from './deterministic-state.mjs';
import { fromFixed } from './fixed-point.mjs';
import {
  ensureLocalOverlord,
  getPlayerState,
  initializeCombatState,
  stepCapture,
  stepCombat,
  stepPlayerTriggerEconomy,
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
  LockstepCommandQueue,
  lockstepCommandToWire,
} from './lockstep-command-queue.mjs';
import {
  assignMoveOrders,
  createSimulation,
  getVisionSources,
  isPointVisibleFromSources,
  stepProduction,
} from './game-simulation.mjs';
import {
  initializeUpgradeBuildings,
  purchaseUpgrade,
  validateUpgradePurchase,
} from './game-upgrades.mjs';
import { setZoneOwner, unitOwnerSlot, zoneOwnerSlot } from './game-ownership.mjs';
import { UnitPool } from './unit-pool.mjs';

export const MAX_ROOM_PLAYERS = 8;
export const MIN_ROOM_PLAYERS = 2;
export const SERVER_TICK_MS = 50;
export const SNAPSHOT_INTERVAL_MS = 100;
export const BUSY_SNAPSHOT_INTERVAL_MS = 160;
export const HEAVY_SNAPSHOT_INTERVAL_MS = 250;
export const LOCKSTEP_CHECKSUM_INTERVAL_TICKS = 20;
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

function activeSlots(room) {
  return new Set(room.players.filter((player) => player.connected).map((player) => player.slot));
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
  const unitPool = new UnitPool();
  unitPool.syncFromUnits(state.units);
  const lockstepQueue = new LockstepCommandQueue();
  const stateChecksum = computeDeterministicStateChecksum(state, map, unitPool);
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
    unitPool,
    lockstepQueue,
    stateChecksum,
    stateChecksumTick: 0,
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
    if (room.status === 'running') {
      for (const zone of room.map.zones) {
        if (zoneOwnerSlot(zone) === player.slot) {
          setZoneOwner(zone, null);
          zone.sunkenHp = 0;
        }
      }
      room.state.units = room.state.units.filter((unit) => unitOwnerSlot(unit) !== player.slot);
      for (const building of room.state.upgradeBuildings ?? []) {
        if (building.ownerSlot === player.slot) building.hp = 0;
      }
      const gamePlayer = getPlayerState(room.state, player.slot);
      if (gamePlayer) {
        gamePlayer.status = 'eliminated';
        gamePlayer.eliminatedAtMs = room.state.match?.elapsedMs ?? 0;
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

function disableUnusedPlayers(room) {
  const slots = activeSlots(room);
  const { state, map } = room;
  for (const player of state.players) {
    player.status = slots.has(player.slot) ? 'active' : 'eliminated';
    player.eliminatedAtMs = slots.has(player.slot) ? null : 0;
  }
  for (const zone of map.zones) {
    const ownerSlot = zoneOwnerSlot(zone);
    if (ownerSlot !== null && !slots.has(ownerSlot)) {
      setZoneOwner(zone, null);
      zone.sunkenHp = 0;
    }
  }
  for (const building of state.upgradeBuildings ?? []) {
    if (!slots.has(building.ownerSlot)) building.hp = 0;
  }
  state.units = state.units.filter(
    (unit) => slots.has(unitOwnerSlot(unit)) && unit.type !== 'overlord',
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

  disableUnusedPlayers(room);
  initializeMatchState(room.state, room.map, { countdownMs: 3000 });
  room.status = 'running';
  room.unitPool.syncFromUnits(room.state.units);
  room.stateChecksum = computeDeterministicStateChecksum(room.state, room.map, room.unitPool);
  room.stateChecksumTick = room.tick;
  return { ok: true, teams: [...teams].sort() };
}

function playerForClient(room, clientId) {
  return room.players.find((player) => player.id === clientId) ?? null;
}

function commandableUnitIds(room, ownerSlot, unitIds) {
  const requested = new Set(
    Array.isArray(unitIds)
      ? unitIds.filter((id) => Number.isInteger(id)).slice(0, 512)
      : [],
  );
  const allowed = new Set();
  for (const id of requested) {
    const index = room.unitPool.indexForId(id);
    if (index < 0) continue;
    if (room.unitPool.ownerSlot[index] !== ownerSlot) continue;
    if (room.unitPool.hp[index] <= 0) continue;
    allowed.add(id);
  }
  return allowed;
}

function executeLockstepCommand(room, command) {
  if (command.type === 'move' || command.type === 'attack-move') {
    const ids = new Set(command.unitIds ?? []);
    const ordered = assignMoveOrders(
      room.map,
      room.state,
      ids,
      { x: fromFixed(command.xFixed), y: fromFixed(command.yFixed) },
      { orderType: command.type },
    );
    return { ok: ordered > 0, type: command.type, ordered };
  }

  if (command.type === 'upgrade') {
    const result = purchaseUpgrade(
      room.state,
      command.playerSlot,
      command.buildingId,
      command.upgradeKey,
    );
    return { ...result, type: 'upgrade' };
  }

  return { ok: false, reason: 'unknown-command' };
}

function executeScheduledLockstepCommands(room) {
  const commands = room.lockstepQueue?.drain(room.tick) ?? [];
  room.lastLockstepExecutions = commands.map((command) => ({
    command: lockstepCommandToWire(command),
    result: executeLockstepCommand(room, command),
  }));
  return room.lastLockstepExecutions;
}

export function handleRoomCommand(room, clientId, command) {
  const player = playerForClient(room, clientId);
  if (!player || !player.connected) return { ok: false, reason: 'not-in-room' };
  if (room.status !== 'running' || room.state.match?.phase !== 'running') {
    return { ok: false, reason: 'match-not-running' };
  }
  if (getPlayerState(room.state, player.slot)?.status === 'eliminated') {
    return { ok: false, reason: 'eliminated' };
  }
  if (!command || typeof command !== 'object') return { ok: false, reason: 'invalid-command' };

  if (command.type === 'move' || command.type === 'attack-move') {
    const x = Number(command.x);
    const y = Number(command.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, reason: 'invalid-target' };
    }
    const ids = commandableUnitIds(room, player.slot, command.unitIds);
    if (ids.size === 0) return { ok: false, reason: 'no-commandable-units' };
    const orderType = command.type === 'attack-move' ? 'attack-move' : 'move';
    const scheduled = room.lockstepQueue.schedule(room.tick, player.slot, {
      type: orderType,
      unitIds: [...ids],
      x,
      y,
    });
    if (!scheduled) return { ok: false, reason: 'invalid-command' };
    return {
      ok: true,
      type: orderType,
      queued: true,
      ordered: ids.size,
      tick: scheduled.tick,
      lockstepCommand: lockstepCommandToWire(scheduled),
    };
  }

  if (command.type === 'upgrade') {
    const buildingId = String(command.buildingId ?? '');
    const upgradeKey = String(command.upgradeKey ?? '');
    const validation = validateUpgradePurchase(room.state, player.slot, buildingId, upgradeKey);
    if (!validation.ok) return { ...validation, type: 'upgrade' };
    const scheduled = room.lockstepQueue.schedule(room.tick, player.slot, {
      type: 'upgrade',
      buildingId,
      upgradeKey,
    });
    if (!scheduled) return { ok: false, reason: 'invalid-command', type: 'upgrade' };
    return {
      ok: true,
      type: 'upgrade',
      queued: true,
      tick: scheduled.tick,
      lockstepCommand: lockstepCommandToWire(scheduled),
      cost: validation.cost,
    };
  }

  return { ok: false, reason: 'unknown-command' };
}

function tickRunningSimulation(room, deltaMs) {
  const { state, map } = room;
  stepProduction(state, map, deltaMs);
  stepFormationMovement(state, map, deltaMs);
  stepBeaconSystem(state, map, deltaMs);
  stepCombat(state, map, deltaMs);

  for (const roomPlayer of room.players) {
    if (!roomPlayer.connected) continue;
    const gamePlayer = getPlayerState(state, roomPlayer.slot);
    if (!gamePlayer || gamePlayer.status === 'eliminated') continue;
    stepCapture(state, map, roomPlayer.slot);
    stepPlayerTriggerEconomy(state, map, roomPlayer.slot, deltaMs);
  }
  evaluateMatchState(state, map);
}

export function tickRoom(room, deltaMs = SERVER_TICK_MS) {
  if (room.status !== 'running') return [];
  executeScheduledLockstepCommands(room);
  const events = stepMatchClock(room.state, room.map, deltaMs);
  if (room.state.match.phase === 'running') tickRunningSimulation(room, deltaMs);
  if (room.state.match.phase === 'finished') room.status = 'finished';
  quantizeSimulationState(room.state);
  room.unitPool.syncFromUnits(room.state.units);
  room.tick += 1;
  if (room.tick % LOCKSTEP_CHECKSUM_INTERVAL_TICKS === 0) {
    room.stateChecksum = computeDeterministicStateChecksum(room.state, room.map, room.unitPool);
    room.stateChecksumTick = room.tick;
  }
  room.snapshotAccumulatorMs += deltaMs;
  return events;
}

export function snapshotIntervalForRoom(room) {
  const unitCount = room.state.units.length;
  if (unitCount >= 240) return HEAVY_SNAPSHOT_INTERVAL_MS;
  if (unitCount >= 120) return BUSY_SNAPSHOT_INTERVAL_MS;
  return SNAPSHOT_INTERVAL_MS;
}

export function roomNeedsSnapshot(room) {
  const intervalMs = snapshotIntervalForRoom(room);
  if (room.snapshotAccumulatorMs < intervalMs) return false;
  room.snapshotAccumulatorMs %= intervalMs;
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
    ownerSlot: unitOwnerSlot(unit),
    team: unit.team,
    x: Math.round(unit.x * 10) / 10,
    y: Math.round(unit.y * 10) / 10,
    hp: Math.max(0, Math.ceil(unit.hp)),
    maxHp: unit.maxHp,
    facing: unit.facing ?? 0,
    attackFlashMs: Math.max(0, Math.ceil(unit.attackFlashMs ?? 0)),
  };
}

function spectatorFor(room, roomPlayer) {
  if (!roomPlayer || room.status === 'lobby') return false;
  const playerState = getPlayerState(room.state, roomPlayer.slot);
  return playerState?.status === 'eliminated' || room.state.match?.phase === 'finished';
}

function visibleToTeam(visionSources, x, y, fullVision) {
  return fullVision || isPointVisibleFromSources(visionSources, x, y);
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

function visionSourcesForClient(room, team, fullVision) {
  if (fullVision) {
    return [{
      x: room.map.worldWidth / 2,
      y: room.map.worldHeight / 2,
      radius: Math.hypot(room.map.worldWidth, room.map.worldHeight),
    }];
  }

  return getVisionSources(room.state, room.map, team).map((source) => ({
    x: source.x,
    y: source.y,
    radius: source.radius,
  }));
}

export function snapshotForClient(room, clientId) {
  const roomPlayer = playerForClient(room, clientId);
  if (!roomPlayer || !room.state.match) return null;
  const team = roomPlayer.team;
  const fullVision = spectatorFor(room, roomPlayer);
  const playerState = getPlayerState(room.state, roomPlayer.slot);
  const visionSources = visionSourcesForClient(room, team, fullVision);

  const units = room.state.units
    .filter(
      (unit) => unit.team === team || visibleToTeam(visionSources, unit.x, unit.y, fullVision),
    )
    .map(serializeUnit);

  const zones = room.map.zones.map((zone) => {
    const visible = zone.ownerTeam === team || visibleToTeam(visionSources, zone.x, zone.y, fullVision);
    return {
      id: zone.id,
      x: zone.x,
      y: zone.y,
      radius: zone.radius,
      visible,
      ownerSlot: visible ? zoneOwnerSlot(zone) : null,
      ownerTeam: visible ? zone.ownerTeam : null,
      sunkenHp: visible ? Math.max(0, Math.ceil(zone.sunkenHp ?? 0)) : null,
      sunkenMaxHp: visible ? (zone.sunkenMaxHp ?? 0) : null,
      sunkenAttackFlashMs: visible ? Math.max(0, Math.ceil(zone.sunkenAttackFlashMs ?? 0)) : null,
    };
  });

  const effects = (room.state.effects ?? []).filter(
    (effect) => visibleToTeam(visionSources, effect.x2, effect.y2, fullVision),
  );

  const beacons = (room.state.beaconPads ?? [])
    .filter((pad) => fullVision || pad.ownerSlot === roomPlayer.slot)
    .map((pad) => ({
      id: pad.id,
      ownerSlot: pad.ownerSlot,
      team: pad.team,
      direction: pad.direction,
      targetZoneId: pad.targetZoneId,
      x: pad.x,
      y: pad.y,
      radius: pad.radius,
    }));

  const buildings = (room.state.upgradeBuildings ?? [])
    .filter(
      (building) => (building.hp ?? 0) > 0
        && (
          fullVision
          || building.team === team
          || visibleToTeam(visionSources, building.x, building.y, false)
        ),
    )
    .map(serializeUpgradeBuilding);

  return {
    type: 'snapshot',
    roomId: room.id,
    sequence: room.snapshotSequence,
    serverTick: room.tick,
    snapshotIntervalMs: snapshotIntervalForRoom(room),
    lockstep: {
      inputDelayTicks: room.lockstepQueue.inputDelayTicks,
      checksum: room.stateChecksum >>> 0,
      checksumTick: room.stateChecksumTick,
      poolCount: room.unitPool.count,
    },
    self: {
      id: roomPlayer.id,
      slot: roomPlayer.slot,
      team,
      spectator: fullVision,
      minerals: playerState?.minerals ?? 0,
      homeX: playerState?.homeX ?? null,
      homeY: playerState?.homeY ?? null,
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
    upgrades: { ...(getPlayerState(room.state, roomPlayer.slot)?.upgrades ?? {}) },
    units,
    zones,
    beacons,
    buildings,
    effects,
    visionSources: visionSourcesForClient(room, team, fullVision),
  };
}

function serializeUpgradeBuilding(building) {
  return {
    id: building.id,
    type: building.type,
    label: building.label,
    shortLabel: building.shortLabel,
    ownerSlot: building.ownerSlot,
    team: building.team,
    x: building.x,
    y: building.y,
    hp: Math.max(0, Math.ceil(building.hp ?? 0)),
    maxHp: building.maxHp ?? 0,
  };
}
