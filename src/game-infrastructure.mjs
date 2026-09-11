const TEAM_CORNERS = Object.freeze([
  Object.freeze({ x: 256, y: 1792 }),
  Object.freeze({ x: 256, y: 256 }),
  Object.freeze({ x: 1792, y: 256 }),
  Object.freeze({ x: 1792, y: 1792 }),
]);

export const INFRASTRUCTURE_CORNER_PULL = 128;

export function infrastructureFrameForPlayer(player) {
  const corner = TEAM_CORNERS[player.team] ?? { x: player.homeX, y: player.homeY };
  const dx = corner.x - player.homeX;
  const dy = corner.y - player.homeY;
  const length = Math.hypot(dx, dy) || 1;
  const towardCorner = { x: dx / length, y: dy / length };
  const tangent = { x: -towardCorner.y, y: towardCorner.x };

  return {
    corner,
    towardCorner,
    tangent,
    center: {
      x: player.homeX + towardCorner.x * INFRASTRUCTURE_CORNER_PULL,
      y: player.homeY + towardCorner.y * INFRASTRUCTURE_CORNER_PULL,
    },
  };
}

export function upgradeBuildingPositionsForPlayer(player) {
  const frame = infrastructureFrameForPlayer(player);
  const base = {
    x: frame.center.x - frame.towardCorner.x * 20,
    y: frame.center.y - frame.towardCorner.y * 20,
  };

  return [
    {
      x: base.x - frame.tangent.x * 48,
      y: base.y - frame.tangent.y * 48,
    },
    {
      x: base.x + frame.tangent.x * 48,
      y: base.y + frame.tangent.y * 48,
    },
  ];
}
