export const UNIT_ANIMATION_STATES = Object.freeze(['idle', 'move', 'attack', 'hit', 'death']);

export const UNIT_ANIMATION_LAYOUT = Object.freeze({
  idle: Object.freeze({ frames: 2, frameMs: 380 }),
  move: Object.freeze({ frames: 4, frameMs: 105 }),
  attack: Object.freeze({ frames: 4, frameMs: 45 }),
  hit: Object.freeze({ frames: 2, frameMs: 60 }),
  death: Object.freeze({ frames: 6, frameMs: 105 }),
});

export const ATTACK_VISUAL_WINDOW_MS = 180;
export const HIT_VISUAL_WINDOW_MS = 120;
export const DEATH_VISUAL_WINDOW_MS = 650;
export const PROJECTILE_VISUAL_DURATION_MS = 210;
export const PROJECTILE_LAUNCH_DELAY_MS = 45;

export const SPRITE_STATE_OFFSETS = Object.freeze({
  idle: 0,
  move: 2,
  attack: 6,
  hit: 10,
  death: 12,
});

export const SPRITE_FRAMES_PER_DIRECTION = 18;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function latestHitEffect(unit, effects) {
  let latest = null;
  for (const effect of effects ?? []) {
    if (effect.type !== 'hydra-shot' && effect.type !== 'sunken-shot') continue;
    if (effect.targetId !== unit.id) continue;
    const elapsedMs = Math.max(0, effect.elapsedMs ?? 0);
    if (elapsedMs > HIT_VISUAL_WINDOW_MS) continue;
    if (!latest || elapsedMs < latest.elapsedMs) latest = { effect, elapsedMs };
  }
  return latest;
}

export function latestSunkenHitEffect(zone, effects) {
  let latest = null;
  for (const effect of effects ?? []) {
    if (effect.type !== 'hydra-shot' || effect.targetZoneId !== zone.id) continue;
    const elapsedMs = Math.max(0, effect.elapsedMs ?? 0);
    if (elapsedMs > HIT_VISUAL_WINDOW_MS) continue;
    if (!latest || elapsedMs < latest.elapsedMs) latest = { effect, elapsedMs };
  }
  return latest;
}

export function resolveUnitAnimation(unit, effects, moving = false) {
  if (!unit || unit.hp <= 0) return { state: 'death', ageMs: 0 };

  const attackFlashMs = Math.max(0, unit.attackFlashMs ?? 0);
  if (attackFlashMs > 0) {
    return {
      state: 'attack',
      ageMs: clamp(ATTACK_VISUAL_WINDOW_MS - attackFlashMs, 0, ATTACK_VISUAL_WINDOW_MS),
    };
  }

  const hit = latestHitEffect(unit, effects);
  if (hit) return { state: 'hit', ageMs: hit.elapsedMs };
  if (moving) return { state: 'move', ageMs: null };
  return { state: 'idle', ageMs: null };
}

export function resolveSunkenAnimation(zone, effects) {
  if (!zone || zone.sunkenHp <= 0) return { state: 'death', ageMs: 0 };

  const attackFlashMs = Math.max(0, zone.sunkenAttackFlashMs ?? 0);
  if (attackFlashMs > 0) {
    return {
      state: 'attack',
      ageMs: clamp(ATTACK_VISUAL_WINDOW_MS - attackFlashMs, 0, ATTACK_VISUAL_WINDOW_MS),
    };
  }

  const hit = latestSunkenHitEffect(zone, effects);
  if (hit) return { state: 'hit', ageMs: hit.elapsedMs };
  return { state: 'idle', ageMs: null };
}

export function animationFrame(state, timeMs, unitId = 0, ageMs = null) {
  const definition = UNIT_ANIMATION_LAYOUT[state] ?? UNIT_ANIMATION_LAYOUT.idle;
  const clock = ageMs === null
    ? Math.max(0, timeMs) + (Math.abs(Number(unitId) || 0) % 13) * 31
    : Math.max(0, ageMs);
  const frame = Math.floor(clock / definition.frameMs);
  if (state === 'death' || state === 'attack' || state === 'hit') {
    return clamp(frame, 0, definition.frames - 1);
  }
  return frame % definition.frames;
}

export function spriteColumn(state, frame) {
  const definition = UNIT_ANIMATION_LAYOUT[state] ?? UNIT_ANIMATION_LAYOUT.idle;
  const safeFrame = clamp(Math.floor(frame), 0, definition.frames - 1);
  return SPRITE_STATE_OFFSETS[state] + safeFrame;
}

export function projectileProgress(effect) {
  const durationMs = Math.max(PROJECTILE_LAUNCH_DELAY_MS + 1, effect?.durationMs ?? PROJECTILE_VISUAL_DURATION_MS);
  const travelMs = durationMs - PROJECTILE_LAUNCH_DELAY_MS;
  const elapsedMs = Math.max(0, (effect?.elapsedMs ?? 0) - PROJECTILE_LAUNCH_DELAY_MS);
  return clamp(elapsedMs / travelMs, 0, 1);
}

export function deathAnimationFrame(effect) {
  const definition = UNIT_ANIMATION_LAYOUT.death;
  const durationMs = Math.max(definition.frameMs, effect?.durationMs ?? definition.frames * definition.frameMs);
  const progress = clamp((effect?.elapsedMs ?? 0) / durationMs, 0, 0.999999);
  return Math.min(definition.frames - 1, Math.floor(progress * definition.frames));
}
