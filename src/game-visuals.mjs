export const RTS_CAMERA_ZOOM = 1.55;
export const SNAPSHOT_INTERPOLATION_MS = 110;

export const UNIT_VISUAL_SIZES = Object.freeze({
  hydra: Object.freeze({ radiusX: 12, radiusY: 8, healthWidth: 25, spriteScale: 0.67 }),
  zealot: Object.freeze({ radiusX: 13, radiusY: 9, healthWidth: 27, spriteScale: 0.70 }),
  overlord: Object.freeze({ radiusX: 21, radiusY: 15, healthWidth: 38, spriteScale: 0.84 }),
  sunken: Object.freeze({ radiusX: 28, radiusY: 22, healthWidth: 52, spriteScale: 0.94 }),
  structure: Object.freeze({ radiusX: 26, radiusY: 22, healthWidth: 48, spriteScale: 1 }),
});

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function terrainVariant(tileX, tileY) {
  let hash = ((tileX + 17) * 374761393) ^ ((tileY + 31) * 668265263);
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  return Math.abs(hash ^ (hash >>> 16)) % 8;
}

export function lerpAngle(start = 0, end = 0, alpha = 1) {
  const t = clamp01(alpha);
  let delta = (end - start) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return start + delta * t;
}

export function interpolateUnitPose(previous, current, alpha, options = {}) {
  if (!previous || !current || previous.id !== current.id) return current;
  const teleportDistance = options.teleportDistance ?? 160;
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  if ((dx * dx) + (dy * dy) > teleportDistance * teleportDistance) return current;

  const t = clamp01(alpha);
  return {
    ...current,
    x: previous.x + dx * t,
    y: previous.y + dy * t,
    facing: lerpAngle(previous.facing ?? 0, current.facing ?? 0, t),
  };
}
