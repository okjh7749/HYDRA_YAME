import {
  CLASSIC_ZONE_SPAN,
  findPath,
  nearestWalkablePoint,
} from './game-core.mjs';
import {
  playerBySlot,
  teamForSlot,
  unitOwnerSlot,
} from './game-ownership.mjs';

export const HYDRA_SPAWN_INTERVAL_MS = 500;
export const HYDRA_HP = 40;
export const HYDRA_SPEED = 112;
export const HYDRA_SPEED_UPGRADE_MULTIPLIER = 1.25;
export const HYDRA_VISION_RADIUS = 176;
export const SUNKEN_VISION_RADIUS = 240;
export const OVERLORD_VISION_RADIUS = 280;
export const MAX_LOCAL_HYDRAS_PER_ZONE = 80;

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function createHydra(state, map, zone) {
  const sequence = state.spawnSequence.get(zone.id) ?? 0;
  state.spawnSequence.set(zone.id, sequence + 1);

  const ring = Math.floor(sequence / 12);
  const angle = (sequence % 12) * (Math.PI * 2 / 12) + ring * 0.31;
  const radius = 34 + Math.min(2, ring) * 6;
  const desiredX = zone.x + Math.cos(angle) * radius;
  const desiredY = zone.y + Math.sin(angle) * radius;
  const spawnPoint = nearestWalkablePoint(map, desiredX, desiredY, 8) ?? { x: zone.x, y: zone.y };

  const unit = {
    id: state.nextUnitId,
    type: 'hydra',
    ownerSlot: zone.ownerSlot,
    team: teamForSlot(zone.ownerSlot),
    x: spawnPoint.x,
    y: spawnPoint.y,
    hp: HYDRA_HP,
    maxHp: HYDRA_HP,
    speed: HYDRA_SPEED * (
      (playerBySlot(state, zone.ownerSlot)?.upgrades?.speed ?? 0) > 0
        ? HYDRA_SPEED_UPGRADE_MULTIPLIER : 1),
    visionRadius: HYDRA_VISION_RADIUS,
    path: [],
    pathIndex: 0,
    facing: angle,
    sourceZoneId: zone.id,
  };

  state.nextUnitId += 1;
  state.units.push(unit);
  return unit;
}

export function createSimulation(map, { localTeam = 0, localPlayerSlot = localTeam * 2 } = {}) {
  const localForce = teamForSlot(localPlayerSlot);
  const state = {
    localTeam: localForce,
    localPlayerSlot,
    nextUnitId: 1,
    units: [],
    spawnAccumulators: new Map(),
    spawnSequence: new Map(),
  };

  const startZone = map.zones.find((zone) => zone.ownerSlot === localPlayerSlot) ?? map.zones[0];
  const overlordPoint = nearestWalkablePoint(map, startZone.x + 54, startZone.y - 32, 8)
    ?? { x: startZone.x, y: startZone.y };

  state.units.push({
    id: state.nextUnitId,
    type: 'overlord',
    ownerSlot: localPlayerSlot,
    team: localForce,
    x: overlordPoint.x,
    y: overlordPoint.y,
    hp: 9999,
    maxHp: 9999,
    speed: 150,
    visionRadius: OVERLORD_VISION_RADIUS,
    path: [],
    pathIndex: 0,
    facing: 0,
  });
  state.nextUnitId += 1;

  return state;
}

export function countHydrasNearZone(state, zone) {
  const halfSpan = CLASSIC_ZONE_SPAN / 2;
  let count = 0;

  for (const unit of state.units) {
    if (unit.type !== 'hydra' || unitOwnerSlot(unit) !== zone.ownerSlot) continue;
    if (Math.abs(unit.x - zone.x) <= halfSpan && Math.abs(unit.y - zone.y) <= halfSpan) count += 1;
  }

  return count;
}

function countMenNearZone(state, zone) {
  const halfSpan = CLASSIC_ZONE_SPAN / 2;
  let count = 0;
  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    if (unitOwnerSlot(unit) !== zone.ownerSlot) continue;
    if (Math.abs(unit.x - zone.x) <= halfSpan && Math.abs(unit.y - zone.y) <= halfSpan) {
      count += 1;
    }
  }
  return count;
}

export function stepProduction(state, map, deltaMs) {
  if (state.match && state.match.phase !== 'running') return [];
  const spawned = [];

  for (const zone of map.zones) {
    if (!Number.isInteger(zone.ownerSlot)) continue;

    let accumulator = (state.spawnAccumulators.get(zone.id) ?? 0) + deltaMs;
    while (accumulator >= HYDRA_SPAWN_INTERVAL_MS) {
      accumulator -= HYDRA_SPAWN_INTERVAL_MS;
      if (countMenNearZone(state, zone) <= MAX_LOCAL_HYDRAS_PER_ZONE) {
        spawned.push(createHydra(state, map, zone));
      }
    }
    state.spawnAccumulators.set(zone.id, accumulator);
  }

  return spawned;
}

export function stepMovement(state, deltaMs) {
  const deltaSeconds = deltaMs / 1000;

  for (const unit of state.units) {
    if (unit.pathIndex >= unit.path.length) continue;

    const target = unit.path[unit.pathIndex];
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= 1) {
      unit.x = target.x;
      unit.y = target.y;
      unit.pathIndex += 1;
      continue;
    }

    unit.facing = Math.atan2(dy, dx);
    const step = Math.min(distance, unit.speed * deltaSeconds);
    unit.x += (dx / distance) * step;
    unit.y += (dy / distance) * step;
  }
}

function formationOffset(index, count, spacing = 24) {
  if (count <= 1) return { x: 0, y: 0 };
  const width = Math.ceil(Math.sqrt(count));
  const row = Math.floor(index / width);
  const column = index % width;
  const rows = Math.ceil(count / width);
  return {
    x: (column - (width - 1) / 2) * spacing,
    y: (row - (rows - 1) / 2) * spacing,
  };
}

export function assignMoveOrders(map, state, unitIds, targetWorld) {
  const selected = state.units.filter((unit) => unitIds.has(unit.id));
  let ordered = 0;

  selected.forEach((unit, index) => {
    const offset = unit.type === 'hydra' ? formationOffset(index, selected.length) : { x: 0, y: 0 };
    const desiredTarget = {
      x: targetWorld.x + offset.x,
      y: targetWorld.y + offset.y,
    };
    const snappedTarget = nearestWalkablePoint(map, desiredTarget.x, desiredTarget.y, 64);
    if (!snappedTarget) return;

    const path = findPath(map, { x: unit.x, y: unit.y }, snappedTarget);
    if (path.length === 0) return;

    unit.path = path;
    unit.pathIndex = Math.min(1, path.length);
    ordered += 1;
  });

  return ordered;
}

export function selectUnitsInRect(state, ownerSlot, rect) {
  const left = Math.min(rect.x1, rect.x2);
  const right = Math.max(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const bottom = Math.max(rect.y1, rect.y2);
  const result = [];

  for (const unit of state.units) {
    if (unitOwnerSlot(unit) !== ownerSlot) continue;
    if (unit.x >= left && unit.x <= right && unit.y >= top && unit.y <= bottom) {
      result.push(unit.id);
    }
  }

  return result;
}

export function nearestSelectableUnit(state, ownerSlot, point, radius = 22) {
  const radiusSquared = radius * radius;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const unit of state.units) {
    if (unitOwnerSlot(unit) !== ownerSlot) continue;
    const distance = distanceSquared(unit, point);
    if (distance <= radiusSquared && distance < bestDistance) {
      best = unit;
      bestDistance = distance;
    }
  }

  return best;
}

export function getVisionSources(state, map, team) {
  if (team === state.localTeam && state.match?.localMode === 'spectating') {
    return [{
      x: map.worldWidth / 2,
      y: map.worldHeight / 2,
      radius: Math.max(map.worldWidth, map.worldHeight) * 2,
    }];
  }
  const sources = [];

  for (const unit of state.units) {
    if (unit.team !== team) continue;
    sources.push({ x: unit.x, y: unit.y, radius: unit.visionRadius ?? HYDRA_VISION_RADIUS });
  }

  for (const zone of map.zones) {
    if (zone.ownerTeam !== team) continue;
    sources.push({ x: zone.x, y: zone.y + 27, radius: SUNKEN_VISION_RADIUS });
  }

  return sources;
}

export function isPointVisible(state, map, team, x, y) {
  for (const unit of state.units) {
    if (unit.team !== team) continue;
    const radius = unit.visionRadius ?? HYDRA_VISION_RADIUS;
    const dx = x - unit.x;
    const dy = y - unit.y;
    if (dx * dx + dy * dy <= radius * radius) return true;
  }

  for (const zone of map.zones) {
    if (zone.ownerTeam !== team) continue;
    const dx = x - zone.x;
    const dy = y - (zone.y + 27);
    if (dx * dx + dy * dy <= SUNKEN_VISION_RADIUS * SUNKEN_VISION_RADIUS) {
      return true;
    }
  }

  return false;
}

export function teamHydraCount(state, team) {
  let count = 0;
  for (const unit of state.units) {
    if (unit.team === team && unit.type === 'hydra') count += 1;
  }
  return count;
}
