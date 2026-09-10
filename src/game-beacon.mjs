import {
  findPath,
  nearestWalkablePoint,
  worldToTile,
} from './game-core.mjs';
import { unitOwnerSlot } from './game-ownership.mjs';

export const ZEALOT_HP = 9999;
export const ZEALOT_SPEED = 140;
export const ZEALOT_VISION_RADIUS = 96;
export const BEACON_PAD_RADIUS = 17;

const PAD_DISTANCE = 28;
const BEACON_CENTER_Y_OFFSET = -56;

export const BEACON_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'N', dx: 0, dy: -1, targetZoneId: 2 }),
  Object.freeze({ key: 'NE', dx: 1, dy: -1, targetZoneId: 3 }),
  Object.freeze({ key: 'E', dx: 1, dy: 0, targetZoneId: 13 }),
  Object.freeze({ key: 'SE', dx: 1, dy: 1, targetZoneId: 21 }),
  Object.freeze({ key: 'S', dx: 0, dy: 1, targetZoneId: 20 }),
  Object.freeze({ key: 'SW', dx: -1, dy: 1, targetZoneId: 19 }),
  Object.freeze({ key: 'W', dx: -1, dy: 0, targetZoneId: 9 }),
  Object.freeze({ key: 'NW', dx: -1, dy: -1, targetZoneId: 1 }),
]);

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function beaconCenterForPlayer(player) {
  return {
    x: player.homeX,
    y: player.homeY + BEACON_CENTER_Y_OFFSET,
  };
}

function normalizedDirection(direction) {
  const length = Math.hypot(direction.dx, direction.dy) || 1;
  return { x: direction.dx / length, y: direction.dy / length };
}

function createBeaconZealot(state, player, center) {
  const spawn = {
    id: state.nextUnitId,
    type: 'zealot',
    ownerSlot: player.slot,
    team: player.team,
    x: center.x,
    y: center.y,
    hp: ZEALOT_HP,
    maxHp: ZEALOT_HP,
    speed: ZEALOT_SPEED,
    visionRadius: ZEALOT_VISION_RADIUS,
    path: [],
    pathIndex: 0,
    facing: 0,
    attackCooldownMs: 0,
    combatTargetable: false,
    beaconController: true,
    beaconCooldownMs: 0,
  };
  state.nextUnitId += 1;
  state.units.push(spawn);
  return spawn;
}

export function initializeBeaconSystem(state, map) {
  if (state.beaconPads && state.beaconCenters) return state.beaconPads;

  state.beaconPads = [];
  state.beaconCenters = new Map();

  for (const player of state.players ?? []) {
    let center = state.beaconCenters.get(player.team);
    if (!center) {
      const rawCenter = beaconCenterForPlayer(player);
      center = nearestWalkablePoint(map, rawCenter.x, rawCenter.y, 8) ?? rawCenter;
      state.beaconCenters.set(player.team, center);

      for (const direction of BEACON_DIRECTIONS) {
        const normalized = normalizedDirection(direction);
        const desired = {
          x: center.x + normalized.x * PAD_DISTANCE,
          y: center.y + normalized.y * PAD_DISTANCE,
        };
        const point = nearestWalkablePoint(map, desired.x, desired.y, 4) ?? desired;
        state.beaconPads.push({
          id: `beacon-${player.team}-${direction.key}`,
          team: player.team,
          direction: direction.key,
          targetZoneId: direction.targetZoneId,
          x: point.x,
          y: point.y,
          radius: BEACON_PAD_RADIUS,
        });
      }
    }

    const exists = state.units.some(
      (unit) => unit.type === 'zealot'
        && unitOwnerSlot(unit) === player.slot
        && unit.beaconController,
    );
    if (!exists) createBeaconZealot(state, player, center);
  }

  return state.beaconPads;
}

export function beaconPadsForTeam(state, team) {
  return (state.beaconPads ?? []).filter((pad) => pad.team === team);
}

export function issueTeamHydraRally(state, map, team, targetZoneId) {
  const targetZone = map.zones.find((zone) => zone.id === targetZoneId);
  if (!targetZone) return 0;

  const hydras = state.units.filter(
    (unit) => unit.type === 'hydra' && unit.team === team && unit.hp > 0,
  );
  const pathCache = new Map();
  let ordered = 0;

  for (const hydra of hydras) {
    const startTile = worldToTile(map, hydra.x, hydra.y);
    const key = `${startTile.x},${startTile.y}`;
    let path = pathCache.get(key);
    if (!path) {
      path = findPath(map, hydra, targetZone);
      pathCache.set(key, path);
    }
    if (path.length === 0) continue;

    hydra.path = path;
    hydra.pathIndex = Math.min(1, path.length);
    hydra.orderType = 'beacon-rally';
    hydra.rallyTargetZoneId = targetZoneId;
    ordered += 1;
  }

  return ordered;
}

export function issuePlayerHydraRally(state, map, ownerSlot, targetZoneId) {
  const targetZone = map.zones.find((zone) => zone.id === targetZoneId);
  if (!targetZone) return 0;

  const hydras = state.units.filter(
    (unit) => unit.type === 'hydra'
      && unitOwnerSlot(unit) === ownerSlot
      && unit.hp > 0,
  );
  const pathCache = new Map();
  let ordered = 0;

  for (const hydra of hydras) {
    const startTile = worldToTile(map, hydra.x, hydra.y);
    const key = `${startTile.x},${startTile.y}`;
    let path = pathCache.get(key);
    if (!path) {
      path = findPath(map, hydra, targetZone);
      pathCache.set(key, path);
    }
    if (path.length === 0) continue;

    hydra.path = path;
    hydra.pathIndex = Math.min(1, path.length);
    hydra.orderType = 'beacon-rally';
    hydra.rallyTargetZoneId = targetZoneId;
    ordered += 1;
  }

  return ordered;
}

function sendZealotHome(state, map, zealot) {
  const center = state.beaconCenters?.get(zealot.team);
  if (!center) return;
  const path = findPath(map, zealot, center);
  zealot.path = path;
  zealot.pathIndex = Math.min(1, path.length);
  zealot.orderType = 'beacon-return';
}

export function stepBeaconSystem(state, map, deltaMs) {
  initializeBeaconSystem(state, map);
  if (state.match && state.match.phase !== 'running') return [];
  const events = [];

  for (const zealot of state.units) {
    if (!zealot.beaconController || zealot.hp <= 0) continue;
    zealot.beaconCooldownMs = Math.max(0, (zealot.beaconCooldownMs ?? 0) - deltaMs);
    if (zealot.beaconCooldownMs > 0) continue;

    const pad = beaconPadsForTeam(state, zealot.team).find(
      (candidate) => distanceSquared(zealot, candidate) <= candidate.radius * candidate.radius,
    );
    if (!pad) continue;

    const ownerSlot = unitOwnerSlot(zealot);
    const ordered = issuePlayerHydraRally(state, map, ownerSlot, pad.targetZoneId);
    zealot.beaconCooldownMs = 650;
    sendZealotHome(state, map, zealot);
    events.push({
      type: 'beacon-rally',
      ownerSlot,
      team: zealot.team,
      direction: pad.direction,
      targetZoneId: pad.targetZoneId,
      ordered,
    });
  }

  return events;
}
