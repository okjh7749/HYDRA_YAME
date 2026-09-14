export const FOG_UNEXPLORED = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function pruneContainedVisionSources(sources) {
  const candidates = (sources ?? []).filter(
    (source) => source && Number.isFinite(source.x) && Number.isFinite(source.y) && source.radius > 0,
  ).map((source, index) => ({ source, index }));

  const groups = new Map();
  for (const entry of candidates) {
    const bucket = groups.get(entry.source.radius) ?? [];
    bucket.push(entry);
    groups.set(entry.source.radius, bucket);
  }

  const radii = [...groups.keys()].sort((a, b) => b - a);
  const largerSources = [];
  const kept = [];

  for (const radius of radii) {
    const seenExact = new Set();
    const keptInGroup = [];
    for (const entry of groups.get(radius)) {
      const { source } = entry;
      const exactKey = `${source.x}:${source.y}`;
      if (seenExact.has(exactKey)) continue;
      seenExact.add(exactKey);

      const contained = largerSources.some((other) => {
        const margin = other.radius - source.radius;
        return margin >= 0 && distanceSquared(source, other) <= margin * margin;
      });
      if (contained) continue;
      kept.push(entry);
      keptInGroup.push(source);
    }
    largerSources.push(...keptInGroup);
  }

  kept.sort((a, b) => a.index - b.index);
  return kept.map((entry) => entry.source);
}

export function pointVisibleFromSources(sources, x, y) {
  for (const source of sources ?? []) {
    if (distanceSquared(source, { x, y }) <= source.radius * source.radius) return true;
  }
  return false;
}

export function createExplorationGrid(map) {
  return new Uint8Array(map.columns * map.rows);
}

export function explorationIndex(map, tileX, tileY) {
  return tileY * map.columns + tileX;
}

export function updateExplorationGrid(exploration, map, sources) {
  if (!exploration || exploration.length !== map.columns * map.rows) {
    throw new Error('Exploration grid does not match map dimensions');
  }

  for (const source of sources ?? []) {
    if (!source || source.radius <= 0) continue;
    const minTileX = Math.max(0, Math.floor((source.x - source.radius) / map.tileSize));
    const maxTileX = Math.min(map.columns - 1, Math.floor((source.x + source.radius) / map.tileSize));
    const minTileY = Math.max(0, Math.floor((source.y - source.radius) / map.tileSize));
    const maxTileY = Math.min(map.rows - 1, Math.floor((source.y + source.radius) / map.tileSize));

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      const worldY = (tileY + 0.5) * map.tileSize;
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const worldX = (tileX + 0.5) * map.tileSize;
        if (distanceSquared(source, { x: worldX, y: worldY }) > source.radius * source.radius) continue;
        exploration[explorationIndex(map, tileX, tileY)] = 1;
      }
    }
  }
  return exploration;
}

export function fogStateForTile(exploration, map, sources, tileX, tileY) {
  const worldX = (tileX + 0.5) * map.tileSize;
  const worldY = (tileY + 0.5) * map.tileSize;
  if (pointVisibleFromSources(sources, worldX, worldY)) return FOG_VISIBLE;
  return exploration?.[explorationIndex(map, tileX, tileY)] ? FOG_EXPLORED : FOG_UNEXPLORED;
}
