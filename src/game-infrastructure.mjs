const TEAM_CORNERS = Object.freeze([
  Object.freeze({ x: 256, y: 256 }),
  Object.freeze({ x: 1792, y: 256 }),
  Object.freeze({ x: 1792, y: 1792 }),
  Object.freeze({ x: 256, y: 1792 }),
]);

export const CONTROL_ISLANDS = Object.freeze([
  Object.freeze({ slot: 0, left: 1, top: 1, right: 5, bottom: 5, x: 112, y: 112 }),
  Object.freeze({ slot: 1, left: 8, top: 8, right: 12, bottom: 12, x: 336, y: 336 }),
  Object.freeze({ slot: 2, left: 51, top: 1, right: 55, bottom: 5, x: 1712, y: 112 }),
  Object.freeze({ slot: 3, left: 58, top: 8, right: 62, bottom: 12, x: 1936, y: 336 }),
  Object.freeze({ slot: 4, left: 58, top: 51, right: 62, bottom: 55, x: 1936, y: 1712 }),
  Object.freeze({ slot: 5, left: 51, top: 58, right: 55, bottom: 62, x: 1712, y: 1936 }),
  Object.freeze({ slot: 6, left: 1, top: 51, right: 5, bottom: 55, x: 112, y: 1712 }),
  Object.freeze({ slot: 7, left: 8, top: 58, right: 12, bottom: 62, x: 336, y: 1936 }),
]);

export function controlIslandForPlayer(player) {
  return CONTROL_ISLANDS.find((island) => island.slot === player.slot) ?? null;
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

  return {
    corner,
    island,
    towardCorner,
    tangent,
    center,
  };
}

export function upgradeBuildingPositionsForPlayer(player) {
  const frame = infrastructureFrameForPlayer(player);
  const lateral = 34;
  const depth = 24;

  return [
    {
      x: frame.center.x - frame.tangent.x * lateral - frame.towardCorner.x * depth,
      y: frame.center.y - frame.tangent.y * lateral - frame.towardCorner.y * depth,
    },
    {
      x: frame.center.x + frame.tangent.x * lateral - frame.towardCorner.x * depth,
      y: frame.center.y + frame.tangent.y * lateral - frame.towardCorner.y * depth,
    },
  ];
}
