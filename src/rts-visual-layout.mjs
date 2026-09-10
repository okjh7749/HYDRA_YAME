export const TERRAIN_MACRO_TILE_OFFSET = 2;
export const TERRAIN_MACRO_CELL_TILES = 12;

export function facingDirection8(angle = 0) {
  const fullTurn = Math.PI * 2;
  const normalized = ((angle % fullTurn) + fullTurn) % fullTurn;
  return Math.round(normalized / (Math.PI / 4)) % 8;
}

export function spriteAnimationFrame(
  timeMs,
  unitId = 0,
  moving = false,
  frameCount = 4,
  frameDurationMs = 95,
) {
  if (!moving || frameCount <= 1) return 0;
  const offset = (Math.abs(Number(unitId) || 0) % 11) * 17;
  return Math.floor((Math.max(0, timeMs) + offset) / frameDurationMs) % frameCount;
}

export function terrainMacroCell(tileX, tileY) {
  const relativeX = tileX - TERRAIN_MACRO_TILE_OFFSET;
  const relativeY = tileY - TERRAIN_MACRO_TILE_OFFSET;
  const col = Math.floor(relativeX / TERRAIN_MACRO_CELL_TILES);
  const row = Math.floor(relativeY / TERRAIN_MACRO_CELL_TILES);
  if (row < 0 || col < 0 || row > 4 || col > 4) return null;

  const localX = ((relativeX % TERRAIN_MACRO_CELL_TILES) + TERRAIN_MACRO_CELL_TILES)
    % TERRAIN_MACRO_CELL_TILES;
  const localY = ((relativeY % TERRAIN_MACRO_CELL_TILES) + TERRAIN_MACRO_CELL_TILES)
    % TERRAIN_MACRO_CELL_TILES;
  const edge = localX === 0
    || localX === TERRAIN_MACRO_CELL_TILES - 1
    || localY === 0
    || localY === TERRAIN_MACRO_CELL_TILES - 1;
  const gateway = (
    (localX <= 1 || localX >= TERRAIN_MACRO_CELL_TILES - 2)
      && (localY === 5 || localY === 6)
  ) || (
    (localY <= 1 || localY >= TERRAIN_MACRO_CELL_TILES - 2)
      && (localX === 5 || localX === 6)
  );

  return {
    row,
    col,
    localX,
    localY,
    edge,
    gateway,
    centerHub: row === 2 && col === 2,
    controlCorner: (row === 0 || row === 4) && (col === 0 || col === 4),
  };
}

export function gaitPose(frame) {
  const poses = Object.freeze([
    Object.freeze({ stride: -1, lift: 0, tail: -1 }),
    Object.freeze({ stride: 0, lift: -1, tail: 0 }),
    Object.freeze({ stride: 1, lift: 0, tail: 1 }),
    Object.freeze({ stride: 0, lift: 1, tail: 0 }),
  ]);
  return poses[Math.abs(frame) % poses.length];
}

export function isUnitMoving(previous, current, epsilon = 0.25) {
  if (!previous || !current || previous.id !== current.id) return false;
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  return dx * dx + dy * dy > epsilon * epsilon;
}
