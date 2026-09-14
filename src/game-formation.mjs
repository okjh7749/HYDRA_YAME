import { isWalkableWorld } from './game-core.mjs';
import { controlIslandForSlot, pointInControlIsland } from './game-infrastructure.mjs';
import { unitOwnerSlot } from './game-ownership.mjs';
import { HYDRA_MIN_SEPARATION } from './game-rules.mjs';

export const HYDRA_SEPARATION_RADIUS = HYDRA_MIN_SEPARATION;
export const HYDRA_SEPARATION_SPEED = 96;
export const HYDRA_SEPARATION_INTERVAL_MS = 0;
export const MAX_HYDRA_SEPARATION_PUSH = 7;
export const HYDRA_FACING_TURN_RATE = Math.PI * 5;

const SPATIAL_CELL_SIZE = 32;

function spatialCellKey(x, y) {
  return `${Math.floor(x / SPATIAL_CELL_SIZE)},${Math.floor(y / SPATIAL_CELL_SIZE)}`;
}

function buildHydraSpatialHash(state) {
  const cells = new Map();
  for (const unit of state.units) {
    if (unit.type !== 'hydra' || unit.hp <= 0) continue;
    const key = spatialCellKey(unit.x, unit.y);
    const bucket = cells.get(key) ?? [];
    bucket.push(unit);
    cells.set(key, bucket);
  }
  return cells;
}

function separationVector(unit, spatialHash, maxPush) {
  const cellX = Math.floor(unit.x / SPATIAL_CELL_SIZE);
  const cellY = Math.floor(unit.y / SPATIAL_CELL_SIZE);
  let pushX = 0;
  let pushY = 0;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const bucket = spatialHash.get(`${cellX + offsetX},${cellY + offsetY}`) ?? [];
      for (const other of bucket) {
        if (other.id === unit.id) continue;
        let dx = unit.x - other.x;
        let dy = unit.y - other.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= HYDRA_SEPARATION_RADIUS) continue;

        if (distance < 0.001) {
          const angle = ((unit.id * 37 + other.id * 17) % 360) * (Math.PI / 180);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const strength = (HYDRA_SEPARATION_RADIUS - distance) / HYDRA_SEPARATION_RADIUS;
        pushX += (dx / distance) * strength;
        pushY += (dy / distance) * strength;
      }
    }
  }

  const length = Math.hypot(pushX, pushY);
  if (length <= 0) return { x: 0, y: 0 };
  return {
    x: (pushX / length) * maxPush,
    y: (pushY / length) * maxPush,
  };
}

function advanceInsideAllowedArea(map, unit, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const targetX = unit.x + dx;
  const targetY = unit.y + dy;

  if (unit.beaconController) {
    const island = controlIslandForSlot(unitOwnerSlot(unit));
    if (pointInControlIsland(island, targetX, targetY)) {
      unit.x = targetX;
      unit.y = targetY;
    }
    return;
  }

  if (isWalkableWorld(map, targetX, targetY)) {
    unit.x = targetX;
    unit.y = targetY;
    return;
  }
  if (dx !== 0 && isWalkableWorld(map, targetX, unit.y)) {
    unit.x = targetX;
    return;
  }
  if (dy !== 0 && isWalkableWorld(map, unit.x, targetY)) unit.y = targetY;
}

function turnTowards(current, target, maxStep) {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

function pathVelocity(unit, deltaSeconds) {
  if (unit.pathIndex >= unit.path.length) return { x: 0, y: 0 };
  const target = unit.path[unit.pathIndex];
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= 1) {
    unit.x = target.x;
    unit.y = target.y;
    unit.pathIndex += 1;
    return { x: 0, y: 0 };
  }
  if (unit.type === 'hydra' && (unit.attackFlashMs ?? 0) > 0) return { x: 0, y: 0 };
  if (unit.type === 'hydra' && unit.attackMoveEngaged) {
    return { x: 0, y: 0 };
  }

  const desiredFacing = Math.atan2(dy, dx);
  unit.facing = turnTowards(
    unit.facing ?? desiredFacing,
    desiredFacing,
    HYDRA_FACING_TURN_RATE * deltaSeconds,
  );
  const step = Math.min(distance, unit.speed * deltaSeconds);
  return { x: (dx / distance) * step, y: (dy / distance) * step };
}

function relaxHydraOverlaps(state, map, passes = 2) {
  for (let pass = 0; pass < passes; pass += 1) {
    const spatialHash = buildHydraSpatialHash(state);
    const visitedPairs = new Set();

    for (const unit of state.units) {
      if (unit.type !== 'hydra' || unit.hp <= 0) continue;
      const cellX = Math.floor(unit.x / SPATIAL_CELL_SIZE);
      const cellY = Math.floor(unit.y / SPATIAL_CELL_SIZE);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const bucket = spatialHash.get(`${cellX + offsetX},${cellY + offsetY}`) ?? [];
          for (const other of bucket) {
            if (other.id === unit.id || other.type !== 'hydra' || other.hp <= 0) continue;
            const low = Math.min(unit.id, other.id);
            const high = Math.max(unit.id, other.id);
            const pairKey = `${low}:${high}`;
            if (visitedPairs.has(pairKey)) continue;
            visitedPairs.add(pairKey);

            let dx = unit.x - other.x;
            let dy = unit.y - other.y;
            let distance = Math.hypot(dx, dy);
            if (distance >= HYDRA_SEPARATION_RADIUS) continue;
            if (distance < 0.001) {
              const angle = ((unit.id * 41 + other.id * 19) % 360) * (Math.PI / 180);
              dx = Math.cos(angle);
              dy = Math.sin(angle);
              distance = 1;
            }

            const overlap = HYDRA_SEPARATION_RADIUS - distance;
            const push = Math.min(overlap / 2 + 0.25, MAX_HYDRA_SEPARATION_PUSH);
            const px = (dx / distance) * push;
            const py = (dy / distance) * push;
            advanceInsideAllowedArea(map, unit, px, py);
            advanceInsideAllowedArea(map, other, -px, -py);
          }
        }
      }
    }
  }
}

export function stepFormationMovement(state, map, deltaMs) {
  if (state.match && state.match.phase !== 'running') return;
  const deltaSeconds = deltaMs / 1000;
  const spatialHash = buildHydraSpatialHash(state);

  for (const unit of state.units) {
    const pathMove = pathVelocity(unit, deltaSeconds);
    let moveX = pathMove.x;
    let moveY = pathMove.y;

    if (
      unit.type === 'hydra'
      && unit.hp > 0
      && !unit.attackMoveEngaged
    ) {
      const maxPush = Math.min(MAX_HYDRA_SEPARATION_PUSH, HYDRA_SEPARATION_SPEED * deltaSeconds);
      const separation = separationVector(unit, spatialHash, maxPush);
      moveX += separation.x;
      moveY += separation.y;
    }

    advanceInsideAllowedArea(map, unit, moveX, moveY);
  }

  relaxHydraOverlaps(state, map, 2);
}
