export const FIXED_POINT_SHIFT = 8;
export const FIXED_POINT_SCALE = 1 << FIXED_POINT_SHIFT;

export function toFixed(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * FIXED_POINT_SCALE) | 0;
}

export function fromFixed(value) {
  return (value | 0) / FIXED_POINT_SCALE;
}

export function fixedMultiply(a, b) {
  return Math.trunc((a * b) / FIXED_POINT_SCALE) | 0;
}

export function fixedDivide(a, b) {
  if ((b | 0) === 0) return 0;
  return Math.trunc((a * FIXED_POINT_SCALE) / b) | 0;
}

export function quantizeFacingRadians(radians) {
  if (!Number.isFinite(radians)) return 0;
  const turn = radians / (Math.PI * 2);
  const normalized = turn - Math.floor(turn);
  return Math.round(normalized * 65535) & 0xffff;
}

export function facingRadiansFromQuantized(value) {
  return ((value & 0xffff) / 65535) * Math.PI * 2;
}

export function mixUint32(hash, value) {
  hash ^= value >>> 0;
  return Math.imul(hash, 16777619) >>> 0;
}
