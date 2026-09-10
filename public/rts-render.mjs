import { UNIT_VISUAL_SIZES, terrainVariant } from '/src/game-visuals.mjs';

const FLOOR = ['#20282a', '#242d2f', '#1c2427', '#293236', '#222b2d', '#1e2729', '#263033', '#1b2326'];

function point(camera, zoom, x, y) {
  return { x: (x - camera.x) * zoom, y: (y - camera.y) * zoom };
}

function ellipse(ctx, x, y, rx, ry, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function drawIndustrialTerrain(ctx, map, camera, viewportWidth, viewportHeight, zoom, isWalkableTile) {
  const voidGradient = ctx.createRadialGradient(
    viewportWidth * 0.45,
    viewportHeight * 0.4,
    0,
    viewportWidth * 0.45,
    viewportHeight * 0.4,
    Math.max(viewportWidth, viewportHeight) * 0.85,
  );
  voidGradient.addColorStop(0, '#071014');
  voidGradient.addColorStop(0.55, '#03070a');
  voidGradient.addColorStop(1, '#010203');
  ctx.fillStyle = voidGradient;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const tileSize = map.tileSize;
  const tilePx = tileSize * zoom;
  const worldWidth = viewportWidth / zoom;
  const worldHeight = viewportHeight / zoom;
  const startX = Math.max(0, Math.floor(camera.x / tileSize) - 1);
  const startY = Math.max(0, Math.floor(camera.y / tileSize) - 1);
  const endX = Math.min(map.columns - 1, Math.ceil((camera.x + worldWidth) / tileSize) + 1);
  const endY = Math.min(map.rows - 1, Math.ceil((camera.y + worldHeight) / tileSize) + 1);

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      if (!isWalkableTile(map, x, y)) continue;
      const variant = terrainVariant(x, y);
      const sx = (x * tileSize - camera.x) * zoom;
      const sy = (y * tileSize - camera.y) * zoom;
      const inset = Math.max(2, tilePx * 0.09);

      ctx.fillStyle = FLOOR[variant];
      ctx.fillRect(sx, sy, tilePx + 0.5, tilePx + 0.5);
      ctx.strokeStyle = 'rgba(112, 140, 143, 0.14)';
      ctx.lineWidth = Math.max(0.65, zoom * 0.55);
      ctx.strokeRect(sx + inset, sy + inset, tilePx - inset * 2, tilePx - inset * 2);

      if (variant === 1 || variant === 6) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.moveTo(sx + inset, sy + tilePx * 0.7);
        ctx.lineTo(sx + tilePx * 0.7, sy + inset);
        ctx.stroke();
      }
      if (variant === 2 || variant === 7) {
        ellipse(ctx, sx + tilePx * 0.58, sy + tilePx * 0.42, tilePx * 0.15, tilePx * 0.06, 'rgba(0, 0, 0, 0.2)');
      }
      if (variant === 3 || variant === 5) {
        ctx.fillStyle = 'rgba(160, 183, 181, 0.23)';
        const bolt = Math.max(1, zoom * 0.8);
        ctx.fillRect(sx + inset * 0.7, sy + inset * 0.7, bolt, bolt);
        ctx.fillRect(sx + tilePx - inset, sy + tilePx - inset, bolt, bolt);
      }

      const lip = Math.max(3, tilePx * 0.09);
      if (!isWalkableTile(map, x, y - 1)) {
        ctx.fillStyle = '#0a1012';
        ctx.fillRect(sx, sy, tilePx, lip);
        ctx.fillStyle = 'rgba(130, 160, 164, 0.42)';
        ctx.fillRect(sx, sy + lip, tilePx, Math.max(1, zoom));
      }
      if (!isWalkableTile(map, x, y + 1)) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(sx, sy + tilePx - lip, tilePx, lip);
      }
      if (!isWalkableTile(map, x - 1, y)) {
        ctx.fillStyle = '#0a1012';
        ctx.fillRect(sx, sy, lip, tilePx);
      }
      if (!isWalkableTile(map, x + 1, y)) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(sx + tilePx - lip, sy, lip, tilePx);
      }
    }
  }
}

function selectionRing(ctx, size, scale) {
  ctx.strokeStyle = '#71ff87';
  ctx.lineWidth = Math.max(1, scale * 0.85);
  ctx.beginPath();
  ctx.ellipse(0, 5 * scale, size.radiusX * scale, size.radiusY * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function healthBar(ctx, x, y, width, ratio, scale) {
  const height = Math.max(3, 3 * scale);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, height + 2);
  ctx.fillStyle = ratio > 0.55 ? '#62dc6f' : (ratio > 0.25 ? '#d6c455' : '#d95f55');
  ctx.fillRect(x - width / 2, y, width * Math.max(0, Math.min(1, ratio)), height);
}

export function drawRtsUnit(ctx, unit, options = {}) {
  const scale = options.scale ?? 1;
  const selected = options.selected ?? false;
  const timeMs = options.timeMs ?? 0;
  const teamColor = options.teamColor ?? '#53e3b2';
  const size = UNIT_VISUAL_SIZES[unit.type] ?? UNIT_VISUAL_SIZES.hydra;
  const bob = unit.type === 'overlord'
    ? Math.sin(timeMs / 260 + unit.id) * 1.4 * scale
    : Math.sin(timeMs / 110 + unit.id * 0.51) * 0.45 * scale;

  ctx.save();
  ctx.translate(options.x, options.y + bob);
  ellipse(
    ctx,
    0,
    unit.type === 'overlord' ? 14 * scale : 7 * scale,
    size.radiusX * scale * 0.9,
    size.radiusY * scale * 0.62,
    'rgba(0, 0, 0, 0.38)',
  );
  if (selected) selectionRing(ctx, size, scale);

  if (unit.type === 'overlord') {
    ellipse(ctx, 0, -3 * scale, 21 * scale, 14 * scale, '#633652', '#241424', Math.max(1, scale));
    ellipse(ctx, -9 * scale, -7 * scale, 8 * scale, 6 * scale, '#8d5277');
    ellipse(ctx, 7 * scale, -8 * scale, 9 * scale, 6 * scale, '#92577d');
    ellipse(ctx, -2 * scale, 2 * scale, 10 * scale, 7 * scale, '#7d456b');
    ctx.strokeStyle = teamColor;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = Math.max(1, scale);
    ctx.beginPath();
    ctx.arc(0, -2 * scale, 14 * scale, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#523044';
    ctx.lineWidth = Math.max(1.4, 1.5 * scale);
    for (const offset of [-10, -3, 4, 11]) {
      ctx.beginPath();
      ctx.moveTo(offset * scale, 8 * scale);
      ctx.bezierCurveTo(
        (offset - 4) * scale,
        14 * scale,
        (offset + 5) * scale,
        20 * scale,
        (offset + 1) * scale,
        25 * scale,
      );
      ctx.stroke();
    }
  } else {
    ctx.rotate(unit.facing ?? 0);
    if (unit.type === 'zealot') {
      ctx.fillStyle = '#8b6b29';
      ctx.strokeStyle = '#2b2416';
      ctx.lineWidth = Math.max(1, scale);
      ctx.beginPath();
      ctx.moveTo(11 * scale, 0);
      ctx.lineTo(3 * scale, -7 * scale);
      ctx.lineTo(-8 * scale, -8 * scale);
      ctx.lineTo(-11 * scale, 0);
      ctx.lineTo(-8 * scale, 8 * scale);
      ctx.lineTo(3 * scale, 7 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ellipse(ctx, 3 * scale, 0, 5 * scale, 5.5 * scale, teamColor);
      ctx.strokeStyle = '#9df3ff';
      ctx.shadowColor = '#6ddcff';
      ctx.shadowBlur = 4 * scale;
      ctx.lineWidth = Math.max(1.4, 1.6 * scale);
      ctx.beginPath();
      ctx.moveTo(5 * scale, -5 * scale);
      ctx.lineTo(16 * scale, -11 * scale);
      ctx.moveTo(5 * scale, 5 * scale);
      ctx.lineTo(16 * scale, 11 * scale);
      ctx.stroke();
    } else {
      const shell = ctx.createLinearGradient(-17 * scale, 0, 13 * scale, 0);
      shell.addColorStop(0, '#291a27');
      shell.addColorStop(0.55, '#593447');
      shell.addColorStop(1, '#9b6278');
      ctx.fillStyle = shell;
      ctx.strokeStyle = '#1a1119';
      ctx.lineWidth = Math.max(1, scale);
      ctx.beginPath();
      ctx.moveTo(-19 * scale, 0);
      ctx.quadraticCurveTo(-10 * scale, -7 * scale, -1 * scale, -5 * scale);
      ctx.quadraticCurveTo(8 * scale, -7 * scale, 14 * scale, 0);
      ctx.quadraticCurveTo(8 * scale, 7 * scale, -1 * scale, 5 * scale);
      ctx.quadraticCurveTo(-10 * scale, 7 * scale, -19 * scale, 0);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#382237';
      ctx.beginPath();
      ctx.moveTo(-6 * scale, -3 * scale);
      ctx.lineTo(-12 * scale, -14 * scale);
      ctx.lineTo(3 * scale, -7 * scale);
      ctx.closePath();
      ctx.moveTo(-6 * scale, 3 * scale);
      ctx.lineTo(-12 * scale, 14 * scale);
      ctx.lineTo(3 * scale, 7 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = teamColor;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = Math.max(1, scale * 1.2);
      ctx.beginPath();
      ctx.moveTo(-3 * scale, -5 * scale);
      ctx.lineTo(2 * scale, -10 * scale);
      ctx.moveTo(-3 * scale, 5 * scale);
      ctx.lineTo(2 * scale, 10 * scale);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ellipse(ctx, 10 * scale, 0, 6 * scale, 5 * scale, '#75445f', '#1a1119', Math.max(1, scale));
      ellipse(ctx, 12 * scale, -2.2 * scale, 1.2 * scale, 1.2 * scale, '#d7cc75');
      ellipse(ctx, 12 * scale, 2.2 * scale, 1.2 * scale, 1.2 * scale, '#d7cc75');
      ctx.strokeStyle = '#281723';
      ctx.beginPath();
      ctx.moveTo(-16 * scale, 0);
      ctx.quadraticCurveTo(-23 * scale, -4 * scale, -26 * scale, 2 * scale);
      ctx.stroke();
    }
  }
  ctx.restore();

  const ratio = unit.maxHp ? unit.hp / unit.maxHp : 1;
  if (selected || ratio < 0.999) {
    healthBar(
      ctx,
      options.x,
      options.y - (unit.type === 'overlord' ? 24 : 19) * scale,
      size.healthWidth * scale,
      ratio,
      scale,
    );
  }
}

export function drawRtsSunken(ctx, zone, options = {}) {
  if ((zone.sunkenHp ?? 0) <= 0) return;
  const scale = options.scale ?? 1;
  const size = UNIT_VISUAL_SIZES.sunken;
  const teamColor = options.teamColor ?? '#53e3b2';
  const selected = options.selected ?? false;
  const x = options.x;
  const y = options.y;

  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, 0, 9 * scale, 25 * scale, 12 * scale, 'rgba(0, 0, 0, 0.42)');
  if (selected) selectionRing(ctx, size, scale);
  ctx.fillStyle = '#3c1f28';
  ctx.strokeStyle = '#1b1115';
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  for (let index = 0; index < 12; index += 1) {
    const angle = (Math.PI * 2 * index) / 12;
    const radius = (index % 2 ? 15 : 25) * scale;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius * 0.74;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ellipse(ctx, 0, 0, 12 * scale, 8 * scale, '#733743', '#1b1115', Math.max(1, scale));
  ctx.strokeStyle = teamColor;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ellipse(ctx, 2 * scale, -1 * scale, 5 * scale, 3 * scale, '#241117');
  ctx.restore();

  const ratio = zone.sunkenMaxHp ? zone.sunkenHp / zone.sunkenMaxHp : 1;
  if (selected || ratio < 0.999) {
    healthBar(ctx, x, y - 29 * scale, size.healthWidth * scale, ratio, scale);
  }
}

export function drawRtsBeacon(ctx, pad, options = {}) {
  const scale = options.scale ?? 1;
  const radius = (pad.radius ?? 18) * scale;
  const pulse = 0.54 + Math.sin((options.timeMs ?? 0) / 280 + pad.x * 0.01) * 0.12;
  ctx.save();
  ctx.translate(options.x, options.y);
  ctx.fillStyle = `rgba(23, 87, 101, ${pulse * 0.45})`;
  ctx.strokeStyle = `rgba(151, 229, 240, ${pulse})`;
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8 - Math.PI / 8;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(210, 248, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e2fbff';
  ctx.font = `${Math.max(8, 8 * scale)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pad.direction, 0, 0);
  ctx.restore();
}

export function drawRtsEffects(ctx, effects, camera, zoom, now) {
  for (const effect of effects ?? []) {
    const start = point(camera, zoom, effect.x1, effect.y1);
    const end = point(camera, zoom, effect.x2, effect.y2);
    ctx.save();
    if (effect.type === 'sunken-shot') {
      ctx.strokeStyle = '#ff9b65';
      ctx.shadowColor = '#ff5d35';
      ctx.shadowBlur = 7 * zoom;
      ctx.lineWidth = Math.max(2, 2.5 * zoom);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ellipse(ctx, end.x, end.y, 5 * zoom, 3 * zoom, 'rgba(255, 126, 74, 0.42)');
    } else if (effect.type === 'capture' || effect.type === 'sunken-destroyed') {
      const ttl = effect.ttlMs ?? 300;
      const progress = Math.max(0, Math.min(1, 1 - ttl / 700));
      ctx.strokeStyle = effect.type === 'capture' ? '#72ff8c' : '#ffb35f';
      ctx.globalAlpha = 0.75 * (1 - progress);
      ctx.lineWidth = Math.max(1, 2 * zoom);
      ctx.beginPath();
      ctx.arc(end.x, end.y, (12 + progress * 22) * zoom, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#b4e978';
      ctx.shadowColor = '#8dd94f';
      ctx.shadowBlur = 4 * zoom;
      ctx.lineWidth = Math.max(1, 1.3 * zoom);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const spark = 2.2 + Math.sin(now / 55) * 0.6;
      ellipse(ctx, end.x, end.y, spark * zoom, spark * zoom, '#d9ffa0');
    }
    ctx.restore();
  }
}

export function drawMoveMarker(ctx, marker, camera, zoom, now) {
  if (!marker) return false;
  const elapsed = now - marker.startedAt;
  if (elapsed > 520) return false;
  const progress = Math.max(0, Math.min(1, elapsed / 520));
  const p = point(camera, zoom, marker.x, marker.y);
  const radius = (12 + progress * 16) * zoom;
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = '#71ff87';
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - 8 * zoom, p.y);
  ctx.lineTo(p.x + 8 * zoom, p.y);
  ctx.moveTo(p.x, p.y - 8 * zoom);
  ctx.lineTo(p.x, p.y + 8 * zoom);
  ctx.stroke();
  ctx.restore();
  return true;
}
