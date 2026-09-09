import { isWalkableWorld } from './game-core.mjs';

export const HYDRA_SEPARATION_RADIUS = 18;
export const HYDRA_SEPARATION_SPEED = 48;
export const MAX_HYDRA_SEPARATION_PUSH = 3.5;

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
        if (other.id === unit.id || other.team !== unit.team) continue;

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

function advanceInsideWalkable(map, unit, dx, dy) {
  if (dx === 0 && dy === 0) return;

  const targetX = unit.x + dx;
  const targetY = unit.y + dy;
  if (isWalkableWorld(map, targetX, targetY)) {
    unit.x = targetX;
    unit.y = targetY;
    return;
  }

  if (dx !== 0 && isWalkableWorld(map, targetX, unit.y)) {
    unit.x = targetX;
    return;
  }
  if (dy !== 0 && isWalkableWorld(map, unit.x, targetY)) {
    unit.y = targetY;
  }
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

  unit.facing = Math.atan2(dy, dx);
  const step = Math.min(distance, unit.speed * deltaSeconds);
  return {
    x: (dx / distance) * step,
    y: (dy / distance) * step,
  };
}

export function stepFormationMovement(state, map, deltaMs) {
  const deltaSeconds = deltaMs / 1000;
  const spatialHash = buildHydraSpatialHash(state);

  for (const unit of state.units) {
    const pathMove = pathVelocity(unit, deltaSeconds);
    let moveX = pathMove.x;
    let moveY = pathMove.y;

    if (unit.type === 'hydra' && unit.hp > 0) {
      const maxPush = Math.min(
        MAX_HYDRA_SEPARATION_PUSH,
        HYDRA_SEPARATION_SPEED * deltaSeconds,
      );
      const separation = separationVector(unit, spatialHash, maxPush);
      moveX += separation.x;
      moveY += separation.y;
    }

    advanceInsideWalkable(map, unit, moveX, moveY);
  }
}
