import { UNIT_VISUAL_SIZES } from '/src/game-visuals.mjs';
import { facingDirection8 } from '/src/rts-visual-layout.mjs';
import {
  animationFrame,
  deathAnimationFrame,
  projectileProgress,
  resolveSunkenAnimation,
  resolveUnitAnimation,
} from '/src/rts-animation.mjs';
import { drawAtlasSprite, getSpriteAtlas } from '/public/rts-sprite-atlas.mjs';
import {
  drawIndustrialTerrain,
  drawMoveMarker,
  drawRtsBeacon,
} from '/public/rts-render-v2.mjs';

export { drawIndustrialTerrain, drawMoveMarker, drawRtsBeacon };

const TEAM_COLORS = ['#53e3b2', '#f0bc4a', '#e55a55', '#6da9ff'];

function point(camera, zoom, x, y) {
  return { x: (x - camera.x) * zoom, y: (y - camera.y) * zoom };
}

function selectionRing(ctx, size, x, y, scale) {
  ctx.save();
  ctx.strokeStyle = '#71ff87';
  ctx.lineWidth = Math.max(1, scale * 0.9);
  ctx.beginPath();
  ctx.ellipse(x, y + 6 * scale, size.radiusX * scale, size.radiusY * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function shadow(ctx, size, x, y, scale, flying = false) {
  ctx.save();
  ctx.fillStyle = flying ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(
    x,
    y + (flying ? 16 : 8) * scale,
    size.radiusX * scale * (flying ? 0.76 : 0.9),
    size.radiusY * scale * 0.58,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

function healthBar(ctx, x, y, width, ratio, scale) {
  const height = Math.max(3, 3 * scale);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.86)';
  ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, height + 2);
  ctx.fillStyle = ratio > 0.55 ? '#62dc6f' : (ratio > 0.25 ? '#d6c455' : '#d95f55');
  ctx.fillRect(x - width / 2, y, width * Math.max(0, Math.min(1, ratio)), height);
}

export function drawRtsUnit(ctx, unit, options = {}) {
  const scale = options.scale ?? 1;
  const x = options.x;
  const y = options.y;
  const timeMs = options.timeMs ?? 0;
  const moving = options.moving ?? unit.moving ?? false;
  const teamColor = options.teamColor ?? TEAM_COLORS[unit.team] ?? TEAM_COLORS[0];
  const size = UNIT_VISUAL_SIZES[unit.type] ?? UNIT_VISUAL_SIZES.hydra;
  const descriptor = resolveUnitAnimation(unit, options.effects, moving);
  const frame = animationFrame(descriptor.state, timeMs, unit.id, descriptor.ageMs);
  const direction = facingDirection8(unit.facing ?? 0);
  const bob = unit.type === 'overlord' ? Math.sin(timeMs / 310 + unit.id) * 0.9 * scale : 0;
  const spriteScale = scale * (size.spriteScale ?? 1);

  shadow(ctx, size, x, y, scale, unit.type === 'overlord');
  if (options.selected) selectionRing(ctx, size, x, y, scale);
  const atlas = getSpriteAtlas(unit.type, teamColor);
  drawAtlasSprite(ctx, atlas, descriptor.state, frame, direction, x, y + bob, spriteScale);

  const ratio = unit.maxHp ? unit.hp / unit.maxHp : 1;
  if (options.selected || ratio < 0.999) {
    healthBar(
      ctx,
      x,
      y - (unit.type === 'overlord' ? 26 : 21) * scale,
      size.healthWidth * scale,
      ratio,
      scale,
    );
  }
}

export function drawRtsSunken(ctx, zone, options = {}) {
  if ((zone.sunkenHp ?? 0) <= 0) return;
  const scale = options.scale ?? 1;
  const x = options.x;
  const y = options.y;
  const timeMs = options.timeMs ?? 0;
  const teamColor = options.teamColor ?? TEAM_COLORS[zone.ownerTeam] ?? TEAM_COLORS[0];
  const descriptor = resolveSunkenAnimation(zone, options.effects);
  const frame = animationFrame(descriptor.state, timeMs, zone.id, descriptor.ageMs);
  const size = UNIT_VISUAL_SIZES.sunken;

  shadow(ctx, size, x, y, scale, false);
  if (options.selected) selectionRing(ctx, size, x, y, scale);
  const spriteScale = scale * (size.spriteScale ?? 1);
  drawAtlasSprite(ctx, getSpriteAtlas('sunken', teamColor), descriptor.state, frame, 0, x, y, spriteScale);

  const ratio = zone.sunkenMaxHp ? zone.sunkenHp / zone.sunkenMaxHp : 1;
  if (options.selected || ratio < 0.999) {
    healthBar(ctx, x, y - 30 * scale, size.healthWidth * scale, ratio, scale);
  }
}

function drawHydraProjectile(ctx, effect, camera, zoom) {
  const start = point(camera, zoom, effect.x1, effect.y1);
  const end = point(camera, zoom, effect.x2, effect.y2);
  const progress = projectileProgress(effect);
  const x = start.x + (end.x - start.x) * progress;
  const y = start.y + (end.y - start.y) * progress;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = '#b7ef70';
  ctx.shadowBlur = 3.5 * zoom;
  ctx.strokeStyle = '#cceb8f';
  ctx.lineWidth = Math.max(1, 0.85 * zoom);
  ctx.beginPath();
  ctx.moveTo(-4.5 * zoom, 0);
  ctx.lineTo(3 * zoom, 0);
  ctx.stroke();
  ctx.fillStyle = '#efffc0';
  ctx.beginPath();
  ctx.moveTo(4.5 * zoom, 0);
  ctx.lineTo(1 * zoom, -1.7 * zoom);
  ctx.lineTo(1 * zoom, 1.7 * zoom);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (progress > 0.78) {
    ctx.save();
    ctx.globalAlpha = (progress - 0.78) / 0.22;
    ctx.strokeStyle = '#e7ffad';
    ctx.beginPath();
    ctx.arc(end.x, end.y, 2.5 * zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSunkenStrike(ctx, effect, camera, zoom) {
  const start = point(camera, zoom, effect.x1, effect.y1);
  const end = point(camera, zoom, effect.x2, effect.y2);
  const progress = projectileProgress(effect);
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = '#d77b52';
  ctx.shadowColor = '#a84028';
  ctx.shadowBlur = 3 * zoom;
  ctx.lineWidth = Math.max(1.5, 1.8 * zoom);
  ctx.beginPath();
  const segments = 6;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const jitter = Math.sin((index + progress * 4) * Math.PI) * 1.8 * zoom;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t + jitter;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawDeathSprite(ctx, effect, camera, zoom) {
  const type = effect.unitType ?? (effect.type === 'sunken-destroyed' ? 'sunken' : 'hydra');
  const teamColor = TEAM_COLORS[effect.team] ?? TEAM_COLORS[0];
  const p = point(camera, zoom, effect.x2, effect.y2);
  const frame = deathAnimationFrame(effect);
  const direction = facingDirection8(effect.facing ?? 0);
  drawAtlasSprite(ctx, getSpriteAtlas(type, teamColor), 'death', frame, direction, p.x, p.y, zoom);
}

export function drawRtsEffects(ctx, effects, camera, zoom, now) {
  for (const effect of effects ?? []) {
    if (effect.type === 'unit-death' || effect.type === 'sunken-destroyed') {
      drawDeathSprite(ctx, effect, camera, zoom);
      continue;
    }

    if (effect.type === 'hydra-shot') {
      drawHydraProjectile(ctx, effect, camera, zoom);
      continue;
    }

    if (effect.type === 'sunken-shot') {
      drawSunkenStrike(ctx, effect, camera, zoom);
      continue;
    }

    if (effect.type !== 'capture') continue;
    const end = point(camera, zoom, effect.x2, effect.y2);
    const durationMs = Math.max(1, effect.durationMs ?? 700);
    const progress = Math.max(0, Math.min(1, (effect.elapsedMs ?? 0) / durationMs));
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = '#72ff8c';
    ctx.lineWidth = Math.max(1, 2 * zoom);
    ctx.beginPath();
    ctx.arc(end.x, end.y, (12 + progress * 26) * zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#d8ffe0';
    ctx.font = `bold ${Math.max(9, 10 * zoom)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('CAPTURE', end.x, end.y - (18 + progress * 18) * zoom);
    ctx.restore();
  }
}
