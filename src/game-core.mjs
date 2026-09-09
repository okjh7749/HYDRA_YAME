export const MAP_TILES = 64;
export const TILE_SIZE = 32;

const ZONE_CENTERS = [
  [5, 5], [20, 5], [44, 5], [58, 5],
  [5, 20], [58, 20], [5, 44], [58, 44],
  [5, 58], [20, 58], [44, 58], [58, 58],
  [20, 20], [32, 20], [44, 20],
  [20, 32], [32, 32], [44, 32],
  [20, 44], [32, 44], [44, 44],
];

const CORRIDORS = [
  [0, 1], [0, 4], [1, 12], [2, 14], [2, 3], [3, 5],
  [4, 12], [5, 14], [6, 18], [7, 20], [8, 9], [8, 6],
  [9, 18], [10, 20], [10, 11], [11, 7],
  [12, 13], [13, 14], [12, 15], [14, 17],
  [15, 16], [16, 17], [15, 18], [17, 20],
  [18, 19], [19, 20], [13, 16], [16, 19],
];

const STARTING_OWNERS = new Map([
  [0, 0],
  [3, 1],
  [8, 2],
  [11, 3],
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

function carveCorridor(map, from, to, halfWidth = 1) {
  const [x1, y1] = from;
  const [x2, y2] = to;

  if (x1 === x2) {
    fillRect(map, x1 - halfWidth, Math.min(y1, y2), x1 + halfWidth, Math.max(y1, y2));
    return;
  }

  if (y1 === y2) {
    fillRect(map, Math.min(x1, x2), y1 - halfWidth, Math.max(x1, x2), y1 + halfWidth);
    return;
  }

  throw new Error('Classic corridor endpoints must be axis-aligned');
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
    fillRect(map, x - 3, y - 3, x + 3, y + 3);
    map.zones.push({
      id: zoneIndex + 1,
      tileX: x,
      tileY: y,
      x: (x + 0.5) * TILE_SIZE,
      y: (y + 0.5) * TILE_SIZE,
      radius: 2.4 * TILE_SIZE,
      ownerTeam: STARTING_OWNERS.get(zoneIndex) ?? null,
    });
  }

  for (const [fromIndex, toIndex] of CORRIDORS) {
    carveCorridor(map, ZONE_CENTERS[fromIndex], ZONE_CENTERS[toIndex]);
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
      return reverse.reverse().map((tile) => tileCenter(map, tile.x, tile.y));
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
