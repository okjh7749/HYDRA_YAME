const CONTROL_TILE_SIZE = 32;

const TEAM_CORNERS = Object.freeze([
  Object.freeze({ x: 256, y: 1792 }),
  Object.freeze({ x: 256, y: 256 }),
  Object.freeze({ x: 1792, y: 256 }),
  Object.freeze({ x: 1792, y: 1792 }),
]);

export const CONTROL_ISLAND_HALF_SIZE = 112;
export const CONTROL_ISLAND_INSET = 12;
export const CONTROL_ISLAND_BUILDING_RADIUS = 20;

// Dedicated 7x7 control-layer rectangles. They live entirely in the corner
// void and are never copied into map.walkable. Same-corner player islands are
// separated, so neither normal pathfinding nor another player's controller can
// accidentally enter them.
export const CONTROL_ISLANDS = Object.freeze([
  Object.freeze({ slot: 0, left: 0, top: 50, right: 6, bottom: 56, x: 112, y: 1712 }),
  Object.freeze({ slot: 1, left: 7, top: 57, right: 13, bottom: 63, x: 336, y: 1936 }),
  Object.freeze({ slot: 2, left: 0, top: 7, right: 6, bottom: 13, x: 112, y: 336 }),
  Object.freeze({ slot: 3, left: 7, top: 0, right: 13, bottom: 6, x: 336, y: 112 }),
  Object.freeze({ slot: 4, left: 50, top: 0, right: 56, bottom: 6, x: 1712, y: 112 }),
  Object.freeze({ slot: 5, left: 57, top: 7, right: 63, bottom: 13, x: 1936, y: 336 }),
  Object.freeze({ slot: 6, left: 57, top: 50, right: 63, bottom: 56, x: 1936, y: 1712 }),
  Object.freeze({ slot: 7, left: 50, top: 57, right: 56, bottom: 63, x: 1712, y: 1936 }),
]);

const CONTROL_ISLAND_BY_SLOT = new Map(CONTROL_ISLANDS.map((island) => [island.slot, island]));

export function controlIslandForSlot(slot) {
  return CONTROL_ISLAND_BY_SLOT.get(Number(slot)) ?? null;
}

export function controlIslandForPlayer(player) {
  if (Number.isInteger(player?.slot)) {
    const mapped = controlIslandForSlot(player.slot);
    if (mapped) return mapped;
  }

  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const island of CONTROL_ISLANDS) {
    const dx = island.x - player.homeX;
    const dy = island.y - player.homeY;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = island;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function controlIslandWorldBounds(island) {
  if (!island) return null;
  return {
    left: island.left * CONTROL_TILE_SIZE,
    top: island.top * CONTROL_TILE_SIZE,
    right: (island.right + 1) * CONTROL_TILE_SIZE,
    bottom: (island.bottom + 1) * CONTROL_TILE_SIZE,
  };
}

export function pointInControlIsland(island, x, y, inset = 0) {
  const bounds = controlIslandWorldBounds(island);
  if (!bounds) return false;
  return x >= bounds.left + inset
    && x <= bounds.right - inset
    && y >= bounds.top + inset
    && y <= bounds.bottom - inset;
}

export function pointInPlayerControlIsland(player, x, y, inset = 0) {
  return pointInControlIsland(controlIslandForPlayer(player), x, y, inset);
}

export function clampPointToControlIsland(island, point, inset = CONTROL_ISLAND_INSET) {
  const bounds = controlIslandWorldBounds(island);
  if (!bounds || !point) return null;
  return {
    x: Math.max(bounds.left + inset, Math.min(bounds.right - inset, Number(point.x))),
    y: Math.max(bounds.top + inset, Math.min(bounds.bottom - inset, Number(point.y))),
  };
}

export function controlIslandPathForPlayer(player, start, target) {
  const island = controlIslandForPlayer(player);
  if (!island || !pointInControlIsland(island, start.x, start.y)) return [];
  const clamped = clampPointToControlIsland(island, target);
  return clamped ? [clamped] : [];
}

export function controlIslandsOverlap(a, b) {
  const aa = controlIslandWorldBounds(a);
  const bb = controlIslandWorldBounds(b);
  if (!aa || !bb) return false;
  return aa.left < bb.right && aa.right > bb.left && aa.top < bb.bottom && aa.bottom > bb.top;
}

export const INFRASTRUCTURE_CORNER_PULL = 128;

export function infrastructureFrameForPlayer(player) {
  const corner = TEAM_CORNERS[player.team] ?? { x: player.homeX, y: player.homeY };
  const island = controlIslandForPlayer(player);
  const center = island
    ? { x: island.x, y: island.y }
    : { x: player.homeX, y: player.homeY };
  const dx = corner.x - center.x;
  const dy = corner.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  const towardCorner = { x: dx / length, y: dy / length };
  const tangent = { x: -towardCorner.y, y: towardCorner.x };

  return { corner, island, towardCorner, tangent, center };
}

function outwardAxisForPlayer(player, center) {
  const homeDx = player.homeX - center.x;
  const homeDy = player.homeY - center.y;
  if (Math.abs(homeDx) >= Math.abs(homeDy)) {
    return { x: homeDx >= 0 ? -1 : 1, y: 0 };
  }
  return { x: 0, y: homeDy >= 0 ? -1 : 1 };
}

export function upgradeBuildingPositionsForPlayer(player) {
  const frame = infrastructureFrameForPlayer(player);
  const outward = outwardAxisForPlayer(player, frame.center);
  const tangent = { x: -outward.y, y: outward.x };
  // Keep the controller center open while fitting both buildings between the
  // hollow beacon perimeter. At ±36 lateral / 32 depth, buildings clear both
  // each other and every 76px beacon pad with the declared collision radii.
  const edgeOffset = 32;
  const lateral = 36;

  return [-1, 1].map((side) => ({
    x: frame.center.x + outward.x * edgeOffset + tangent.x * lateral * side,
    y: frame.center.y + outward.y * edgeOffset + tangent.y * lateral * side,
  }));
}
