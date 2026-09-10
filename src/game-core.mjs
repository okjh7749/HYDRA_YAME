export const MAP_TILES = 64;
export const TILE_SIZE = 32;
export const CLASSIC_ZONE_SPAN = 384;

const ZONE_CENTERS = [
  [640, 256], [1024, 256], [1408, 256],
  [256, 640], [640, 640], [1024, 640], [1408, 640], [1792, 640],
  [256, 1024], [640, 1024], [1024, 1024], [1408, 1024], [1792, 1024],
  [256, 1408], [640, 1408], [1024, 1408], [1408, 1408], [1792, 1408],
  [640, 1792], [1024, 1792], [1408, 1792],
];

const STARTING_OWNERS = new Map([
  [0, 0],
  [2, 1],
  [18, 2],
  [20, 3],
]);

function indexOf(map, x, y) {
  return y * map.columns + x;
}

function inside(map, x, y) {
  return x >= 0 && y >= 0 && x < map.columns && y < map.rows;
}

function fillRect(map, left, top, right, bottom) {
  for (let y = Math.max(0, top); y <= Math.min(map.rows - 1, bottom); y += 1) {
    for (let x = Math.max(0, left); x <= Math.min(map.columns - 1, right); x += 1) {
      map.walkable[indexOf(map, x, y)] = 1;
    }
  }
}

function fillWorldBlock(map, centerX, centerY, span = CLASSIC_ZONE_SPAN) {
  const half = span / 2;
  const left = Math.floor((centerX - half) / map.tileSize);
  const top = Math.floor((centerY - half) / map.tileSize);
  const right = Math.ceil((centerX + half) / map.tileSize) - 1;
  const bottom = Math.ceil((centerY + half) / map.tileSize) - 1;
  fillRect(map, left, top, right, bottom);
}

export function buildClassicMap() {
  const map = {
    columns: MAP_TILES,
    rows: MAP_TILES,
    tileSize: TILE_SIZE,
    worldWidth: MAP_TILES * TILE_SIZE,
    worldHeight: MAP_TILES * TILE_SIZE,
    walkable: new Uint8Array(MAP_TILES * MAP_TILES),
    zones: [],
  };

  for (const [zoneIndex, [x, y]] of ZONE_CENTERS.entries()) {
    fillWorldBlock(map, x, y);
    map.zones.push({
      id: zoneIndex + 1,
      tileX: Math.floor(x / TILE_SIZE),
      tileY: Math.floor(y / TILE_SIZE),
      x,
      y,
      radius: 64,
      ownerTeam: STARTING_OWNERS.get(zoneIndex) ?? null,
    });
  }

  return map;
}

export function isWalkableTile(map, x, y) {
  return inside(map, x, y) && map.walkable[indexOf(map, x, y)] === 1;
}

export function worldToTile(map, x, y) {
  return {
    x: Math.floor(x / map.tileSize),
    y: Math.floor(y / map.tileSize),
  };
}

export function tileCenter(map, x, y) {
  return {
    x: (x + 0.5) * map.tileSize,
    y: (y + 0.5) * map.tileSize,
  };
}

export function isWalkableWorld(map, x, y) {
  const tile = worldToTile(map, x, y);
  return isWalkableTile(map, tile.x, tile.y);
}

export function nearestWalkablePoint(map, x, y, maxRadius = 16) {
  const origin = worldToTile(map, x, y);
  const clampedX = Math.max(0, Math.min(map.columns - 1, origin.x));
  const clampedY = Math.max(0, Math.min(map.rows - 1, origin.y));

  if (isWalkableTile(map, clampedX, clampedY)) {
    return tileCenter(map, clampedX, clampedY);
  }

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const tx = clampedX + dx;
        const ty = clampedY + dy;
        if (!isWalkableTile(map, tx, ty)) continue;

        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          best = tileCenter(map, tx, ty);
          bestDistance = distance;
        }
      }
    }

    if (best) return best;
  }

  return null;
}

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function findPath(map, startWorld, targetWorld) {
  const start = worldToTile(map, startWorld.x, startWorld.y);
  const snappedTarget = nearestWalkablePoint(map, targetWorld.x, targetWorld.y, 64);
  if (!snappedTarget || !isWalkableTile(map, start.x, start.y)) return [];

  const goal = worldToTile(map, snappedTarget.x, snappedTarget.y);
  const open = [{ x: start.x, y: start.y, g: 0, f: heuristic(start, goal) }];
  const cameFrom = new Map();
  const gScore = new Map([[`${start.x},${start.y}`, 0]]);
  const closed = new Set();

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f || a.g - b.g);
    const current = open.shift();
    const currentKey = `${current.x},${current.y}`;
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (current.x === goal.x && current.y === goal.y) {
      const reverse = [{ x: current.x, y: current.y }];
      let key = currentKey;
      while (cameFrom.has(key)) {
        const previous = cameFrom.get(key);
        reverse.push(previous);
        key = `${previous.x},${previous.y}`;
      }
      const path = reverse.reverse().map((tile) => tileCenter(map, tile.x, tile.y));
      if (isWalkableWorld(map, targetWorld.x, targetWorld.y) && path.length > 0) {
        path[path.length - 1] = { x: targetWorld.x, y: targetWorld.y };
      }
      return path;
    }

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!isWalkableTile(map, nx, ny)) continue;
      const neighborKey = `${nx},${ny}`;
      const tentativeG = current.g + 1;
      if (tentativeG >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;

      cameFrom.set(neighborKey, { x: current.x, y: current.y });
      gScore.set(neighborKey, tentativeG);
      open.push({ x: nx, y: ny, g: tentativeG, f: tentativeG + heuristic({ x: nx, y: ny }, goal) });
    }
  }

  return [];
}

export function clampCamera(camera, map, viewportWidth, viewportHeight) {
  const maxX = Math.max(0, map.worldWidth - viewportWidth);
  const maxY = Math.max(0, map.worldHeight - viewportHeight);
  camera.x = Math.max(0, Math.min(maxX, camera.x));
  camera.y = Math.max(0, Math.min(maxY, camera.y));
  return camera;
}

export function cameraRect(camera, viewportWidth, viewportHeight) {
  return {
    x: camera.x,
    y: camera.y,
    width: viewportWidth,
    height: viewportHeight,
  };
}
