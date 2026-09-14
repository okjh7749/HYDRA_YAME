import {
  CLASSIC_ZONE_SPAN,
  findPath,
  isWalkableWorld,
  nearestWalkablePoint,
} from './game-core.mjs';
import {
  playerBySlot,
  teamForSlot,
  unitOwnerSlot,
} from './game-ownership.mjs';
import {
  CONTROL_ISLAND_BUILDING_RADIUS,
  CONTROL_ISLAND_INSET,
  clampPointToControlIsland,
  controlIslandForSlot,
  pointInControlIsland,
} from './game-infrastructure.mjs';
import {
  HYDRA_MIN_SEPARATION,
  HYDRA_SPAWN_INTERVAL_MS as RULE_HYDRA_SPAWN_INTERVAL_MS,
  HYDRA_SPAWN_MIN_SPACING,
  MAX_LOCAL_HYDRAS_PER_ZONE as RULE_MAX_LOCAL_HYDRAS_PER_ZONE,
  UPGRADE_BUILDING_VISION_RADIUS,
} from './game-rules.mjs';
import {
  pointVisibleFromSources,
  pruneContainedVisionSources,
} from './game-visibility.mjs';

export const HYDRA_SPAWN_INTERVAL_MS = RULE_HYDRA_SPAWN_INTERVAL_MS;
export const HYDRA_HP = 40;
export const HYDRA_SPEED = 112;
export const HYDRA_SPEED_UPGRADE_MULTIPLIER = 1.25;
export const HYDRA_VISION_RADIUS = 176;
export const SUNKEN_VISION_RADIUS = 240;
export const OVERLORD_VISION_RADIUS = 280;
export const MAX_LOCAL_HYDRAS_PER_ZONE = RULE_MAX_LOCAL_HYDRAS_PER_ZONE;
export const VISION_CLUSTER_SIZE = 160;
export const LARGE_ORDER_UNIT_THRESHOLD = 32;
export const PATH_GROUP_WORLD_SIZE = 64;

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function createHydra(state, map, zone) {
  const sequence = state.spawnSequence.get(zone.id) ?? 0;
  state.spawnSequence.set(zone.id, sequence + 1);

  const sameOwnerHydras = state.units.filter(
    (unit) => unit.type === 'hydra' && unitOwnerSlot(unit) === zone.ownerSlot && unit.hp > 0,
  );
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  let spawnPoint = null;
  let fallback = null;
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const n = sequence + attempt;
    const radius = Math.min(152, 34 + Math.sqrt(n + 1) * 13.5);
    const angleCandidate = n * goldenAngle;
    const candidate = nearestWalkablePoint(
      map,
      zone.x + Math.cos(angleCandidate) * radius,
      zone.y + Math.sin(angleCandidate) * radius,
      8,
    );
    if (!candidate) continue;
    fallback ??= candidate;
    if (sameOwnerHydras.every(
      (unit) => Math.hypot(unit.x - candidate.x, unit.y - candidate.y) >= HYDRA_SPAWN_MIN_SPACING,
    )) {
      spawnPoint = candidate;
      break;
    }
  }
  spawnPoint ??= fallback ?? { x: zone.x, y: zone.y };
  const angle = sequence * goldenAngle;

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
    separationBoostMs: 400,
  };

  state.nextUnitId += 1;
  state.units.push(unit);
  return unit;
}

export function createSimulation(
  map,
  {
    localTeam = 0,
    localPlayerSlot = localTeam * 2,
    productionIntervalMs = HYDRA_SPAWN_INTERVAL_MS,
  } = {},
) {
  const localForce = teamForSlot(localPlayerSlot);
  const state = {
    localTeam: localForce,
    localPlayerSlot,
    nextUnitId: 1,
    units: [],
    spawnAccumulators: new Map(),
    spawnSequence: new Map(),
    productionIntervalMs,
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
    if (unit.type !== 'hydra' || unit.hp <= 0 || unitOwnerSlot(unit) !== zone.ownerSlot) continue;
    if (Math.abs(unit.x - zone.x) <= halfSpan && Math.abs(unit.y - zone.y) <= halfSpan) count += 1;
  }

  return count;
}

export function stepProduction(state, map, deltaMs) {
  if (state.match && state.match.phase !== 'running') return [];
  const spawned = [];
  const productionIntervalMs = state.productionIntervalMs ?? HYDRA_SPAWN_INTERVAL_MS;

  for (const zone of map.zones) {
    if (!Number.isInteger(zone.ownerSlot)) continue;

    let accumulator = (state.spawnAccumulators.get(zone.id) ?? 0) + deltaMs;
    while (accumulator >= productionIntervalMs) {
      accumulator -= productionIntervalMs;
      if (countHydrasNearZone(state, zone) < MAX_LOCAL_HYDRAS_PER_ZONE) {
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

export function formationOffset(index, count, spacing = HYDRA_MIN_SEPARATION) {
  if (count <= 1) return { x: 0, y: 0 };
  const width = count >= 64 ? 5 : count >= 24 ? 7 : Math.ceil(Math.sqrt(count));
  const row = Math.floor(index / width);
  const column = index % width;
  const rows = Math.ceil(count / width);
  return {
    x: (column - (width - 1) / 2) * spacing,
    y: (row - (rows - 1) / 2) * spacing,
  };
}

function rotateOffset(offset, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: offset.x * cosine - offset.y * sine,
    y: offset.x * sine + offset.y * cosine,
  };
}

function nudgeOverlappingHydras(map, hydras) {
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < hydras.length; i += 1) {
      for (let j = i + 1; j < hydras.length; j += 1) {
        const a = hydras[i];
        const b = hydras[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= HYDRA_MIN_SEPARATION * 0.72) continue;
        if (distance < 0.001) {
          const angle = ((a.id * 47 + b.id * 29) % 360) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const push = Math.min(5, (HYDRA_MIN_SEPARATION - distance) * 0.3);
        const px = (dx / distance) * push;
        const py = (dy / distance) * push;
        if (isWalkableWorld(map, a.x + px, a.y + py)) {
          a.x += px;
          a.y += py;
        }
        if (isWalkableWorld(map, b.x - px, b.y - py)) {
          b.x -= px;
          b.y -= py;
        }
      }
    }
  }
}

function applyLaneOffsetToPath(map, path, unit, offset, snappedTarget) {
  if (!path?.length || unit.type !== 'hydra') return path;
  const denominator = Math.max(1, path.length - 1);
  const projected = path.map((point, index) => {
    if (index === 0) return { x: unit.x, y: unit.y };
    const progress = Math.min(1, (index / denominator) * 1.6);
    const desired = {
      x: point.x + offset.x * progress,
      y: point.y + offset.y * progress,
    };
    return nearestWalkablePoint(map, desired.x, desired.y, 2) ?? point;
  });
  projected[projected.length - 1] = { x: snappedTarget.x, y: snappedTarget.y };
  return projected;
}

export function assignMoveOrders(map, state, unitIds, targetWorld, { orderType = 'move' } = {}) {
  const selected = state.units.filter((unit) => unitIds.has(unit.id) && unit.hp > 0);
  let ordered = 0;
  if (selected.length === 0) return ordered;

  const hydras = selected.filter((unit) => unit.type === 'hydra');
  nudgeOverlappingHydras(map, hydras);

  const center = selected.reduce(
    (sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }),
    { x: 0, y: 0 },
  );
  const centerX = center.x / selected.length;
  const centerY = center.y / selected.length;
  const heading = Math.atan2(targetWorld.y - centerY, targetWorld.x - centerX);
  let hydraIndex = 0;

  for (const unit of selected) {
    if (unit.beaconController) {
      const ownerSlot = unitOwnerSlot(unit);
      const island = controlIslandForSlot(ownerSlot);
      if (!island || !pointInControlIsland(
        island,
        targetWorld.x,
        targetWorld.y,
        CONTROL_ISLAND_INSET,
      )) continue;
      const target = clampPointToControlIsland(island, targetWorld, CONTROL_ISLAND_INSET);
      const blocked = (state.upgradeBuildings ?? []).some(
        (building) => building.hp > 0
          && building.ownerSlot === ownerSlot
          && distanceSquared(building, target) < (CONTROL_ISLAND_BUILDING_RADIUS + 18) ** 2,
      );
      if (blocked) continue;
      unit.path = [target];
      unit.pathIndex = 0;
      unit.orderType = 'beacon-control';
      unit.attackMoveEngaged = false;
      unit.attackMoveTarget = null;
      ordered += 1;
      continue;
    }

    const baseOffset = unit.type === 'hydra'
      ? formationOffset(hydraIndex++, hydras.length)
      : { x: 0, y: 0 };
    const offset = rotateOffset(baseOffset, heading + Math.PI / 2);
    const desiredTarget = {
      x: targetWorld.x + offset.x,
      y: targetWorld.y + offset.y,
    };
    const snappedTarget = nearestWalkablePoint(map, desiredTarget.x, desiredTarget.y, 64);
    if (!snappedTarget) continue;

    let path = findPath(map, { x: unit.x, y: unit.y }, snappedTarget);
    if (!path || path.length === 0) continue;
    path = applyLaneOffsetToPath(map, path, unit, offset, snappedTarget);

    unit.path = path;
    unit.pathIndex = Math.min(1, path.length);
    unit.orderType = orderType;
    unit.attackMoveEngaged = false;
    unit.attackMoveTarget = orderType === 'attack-move'
      ? { x: targetWorld.x, y: targetWorld.y } : null;
    if (unit.type === 'hydra') unit.separationBoostMs = 500;
    ordered += 1;
  }

  return ordered;
}

export function selectUnitsInRect(state, ownerSlot, rect) {
  const left = Math.min(rect.x1, rect.x2);
  const right = Math.max(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const bottom = Math.max(rect.y1, rect.y2);
  const result = [];

  for (const unit of state.units) {
    if (unit.hp <= 0 || unitOwnerSlot(unit) !== ownerSlot) continue;
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
    if (unit.hp <= 0 || unitOwnerSlot(unit) !== ownerSlot) continue;
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
      radius: Math.hypot(map.worldWidth, map.worldHeight),
    }];
  }
  const sources = [];

  for (const unit of state.units) {
    if (unit.team !== team || unit.hp <= 0) continue;
    sources.push({ x: unit.x, y: unit.y, radius: unit.visionRadius ?? HYDRA_VISION_RADIUS });
  }

  for (const zone of map.zones) {
    if (zone.ownerTeam !== team || (zone.sunkenHp ?? 0) <= 0) continue;
    sources.push({ x: zone.x, y: zone.y + 27, radius: SUNKEN_VISION_RADIUS });
  }

  for (const building of state.upgradeBuildings ?? []) {
    if (building.team !== team || (building.hp ?? 0) <= 0) continue;
    sources.push({
      x: building.x,
      y: building.y,
      radius: building.visionRadius ?? UPGRADE_BUILDING_VISION_RADIUS,
    });
  }

  return pruneContainedVisionSources(sources);
}

export function isPointVisibleFromSources(sources, x, y) {
  return pointVisibleFromSources(sources, x, y);
}

export function isPointVisible(state, map, team, x, y) {
  return isPointVisibleFromSources(getVisionSources(state, map, team), x, y);
}

export function teamHydraCount(state, team) {
  let count = 0;
  for (const unit of state.units) {
    if (unit.hp > 0 && unit.team === team && unit.type === 'hydra') count += 1;
  }
  return count;
}
