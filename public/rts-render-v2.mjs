import { UNIT_VISUAL_SIZES, terrainVariant } from '/src/game-visuals.mjs';
import {
  facingDirection8,
  gaitPose,
  spriteAnimationFrame,
  terrainMacroCell,
} from '/src/rts-visual-layout.mjs';

const FLOOR = ['#1c2528', '#222d30', '#182124', '#293337', '#202a2d', '#172023', '#263135', '#1b2427'];
const HUB_FLOOR = ['#28363a', '#2d3c40', '#253236', '#314247'];

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

function line(ctx, x1, y1, x2, y2, stroke, lineWidth = 1) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawPanelBolts(ctx, sx, sy, tilePx, zoom, variant) {
  if (variant !== 3 && variant !== 5) return;
  const size = Math.max(1, zoom * 0.8);
  ctx.fillStyle = 'rgba(177, 202, 202, 0.28)';
  ctx.fillRect(sx + tilePx * 0.16, sy + tilePx * 0.16, size, size);
  ctx.fillRect(sx + tilePx * 0.82, sy + tilePx * 0.82, size, size);
}

function drawGatewayMarking(ctx, sx, sy, tilePx, macro) {
  if (!macro?.gateway) return;
  ctx.save();
  ctx.globalAlpha = 0.46;
  ctx.strokeStyle = '#a98838';
  ctx.lineWidth = Math.max(1, tilePx * 0.045);
  for (let step = -1; step <= 2; step += 1) {
    const shift = step * tilePx * 0.3;
    ctx.beginPath();
    ctx.moveTo(sx + shift, sy + tilePx);
    ctx.lineTo(sx + tilePx + shift, sy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMacroSeams(ctx, sx, sy, tilePx, macro, zoom) {
  if (!macro) return;
  const seam = Math.max(1, zoom * 1.1);
  if (macro.localX === 0) {
    ctx.fillStyle = 'rgba(8, 12, 14, 0.72)';
    ctx.fillRect(sx, sy, seam * 2, tilePx);
    ctx.fillStyle = 'rgba(132, 159, 161, 0.22)';
    ctx.fillRect(sx + seam * 2, sy, seam, tilePx);
  }
  if (macro.localY === 0) {
    ctx.fillStyle = 'rgba(8, 12, 14, 0.72)';
    ctx.fillRect(sx, sy, tilePx, seam * 2);
    ctx.fillStyle = 'rgba(132, 159, 161, 0.22)';
    ctx.fillRect(sx, sy + seam * 2, tilePx, seam);
  }
  if (macro.centerHub && (macro.localX === 4 || macro.localX === 7)) {
    ctx.fillStyle = 'rgba(96, 151, 157, 0.16)';
    ctx.fillRect(sx, sy, Math.max(1, zoom), tilePx);
  }
  if (macro.centerHub && (macro.localY === 4 || macro.localY === 7)) {
    ctx.fillStyle = 'rgba(96, 151, 157, 0.16)';
    ctx.fillRect(sx, sy, tilePx, Math.max(1, zoom));
  }
}

function drawPlatformLip(ctx, map, isWalkableTile, x, y, sx, sy, tilePx, zoom) {
  const lip = Math.max(3, tilePx * 0.09);
  if (!isWalkableTile(map, x, y - 1)) {
    ctx.fillStyle = '#0b1113';
    ctx.fillRect(sx, sy, tilePx, lip);
    ctx.fillStyle = 'rgba(149, 178, 181, 0.42)';
    ctx.fillRect(sx, sy + lip, tilePx, Math.max(1, zoom));
  }
  if (!isWalkableTile(map, x, y + 1)) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillRect(sx, sy + tilePx - lip, tilePx, lip);
    ctx.fillStyle = 'rgba(72, 102, 106, 0.18)';
    ctx.fillRect(sx, sy + tilePx - lip - Math.max(1, zoom), tilePx, Math.max(1, zoom));
  }
  if (!isWalkableTile(map, x - 1, y)) {
    ctx.fillStyle = '#0a1012';
    ctx.fillRect(sx, sy, lip, tilePx);
  }
  if (!isWalkableTile(map, x + 1, y)) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(sx + tilePx - lip, sy, lip, tilePx);
  }
}

function drawControlDecks(ctx, camera, viewportWidth, viewportHeight, zoom) {
  const centers = [
    [256, 256], [1792, 256], [256, 1792], [1792, 1792],
  ];
  for (const [worldX, worldY] of centers) {
    const p = point(camera, zoom, worldX, worldY);
    const radiusX = 104 * zoom;
    const radiusY = 78 * zoom;
    if (p.x + radiusX < 0 || p.y + radiusY < 0 || p.x - radiusX > viewportWidth || p.y - radiusY > viewportHeight) {
      continue;
    }
    ctx.save();
    ctx.globalAlpha = 0.38;
    ellipse(ctx, p.x, p.y, radiusX, radiusY, '#111a1d', '#40575b', Math.max(1, zoom));
    ctx.globalAlpha = 0.22;
    for (let ring = 0; ring < 3; ring += 1) {
      ellipse(ctx, p.x, p.y, (82 - ring * 20) * zoom, (58 - ring * 13) * zoom, null, '#78a5a8', Math.max(1, zoom * 0.7));
    }
    ctx.globalAlpha = 0.42;
    line(ctx, p.x - 66 * zoom, p.y, p.x + 66 * zoom, p.y, '#607e82', Math.max(1, zoom));
    line(ctx, p.x, p.y - 46 * zoom, p.x, p.y + 46 * zoom, '#607e82', Math.max(1, zoom));
    ctx.restore();
  }
}

export function drawIndustrialTerrain(ctx, map, camera, viewportWidth, viewportHeight, zoom, isWalkableTile) {
  const voidGradient = ctx.createRadialGradient(
    viewportWidth * 0.45,
    viewportHeight * 0.4,
    0,
    viewportWidth * 0.45,
    viewportHeight * 0.4,
    Math.max(viewportWidth, viewportHeight) * 0.9,
  );
  voidGradient.addColorStop(0, '#071115');
  voidGradient.addColorStop(0.56, '#03070a');
  voidGradient.addColorStop(1, '#010203');
  ctx.fillStyle = voidGradient;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  drawControlDecks(ctx, camera, viewportWidth, viewportHeight, zoom);

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
      const macro = terrainMacroCell(x, y);
      const sx = (x * tileSize - camera.x) * zoom;
      const sy = (y * tileSize - camera.y) * zoom;
      const inset = Math.max(2, tilePx * 0.1);
      const palette = macro?.centerHub ? HUB_FLOOR : FLOOR;

      ctx.fillStyle = palette[variant % palette.length];
      ctx.fillRect(sx, sy, tilePx + 0.5, tilePx + 0.5);

      ctx.fillStyle = 'rgba(194, 218, 218, 0.045)';
      ctx.fillRect(sx, sy, tilePx, Math.max(1, tilePx * 0.08));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(sx, sy + tilePx * 0.88, tilePx, tilePx * 0.12);

      ctx.strokeStyle = 'rgba(116, 146, 149, 0.16)';
      ctx.lineWidth = Math.max(0.65, zoom * 0.52);
      ctx.strokeRect(sx + inset, sy + inset, tilePx - inset * 2, tilePx - inset * 2);

      if (variant === 1 || variant === 6) {
        line(
          ctx,
          sx + inset,
          sy + tilePx * 0.7,
          sx + tilePx * 0.7,
          sy + inset,
          'rgba(0, 0, 0, 0.32)',
          Math.max(1, zoom * 0.7),
        );
      }
      if (variant === 2 || variant === 7) {
        ellipse(
          ctx,
          sx + tilePx * 0.58,
          sy + tilePx * 0.42,
          tilePx * 0.15,
          tilePx * 0.055,
          'rgba(0, 0, 0, 0.2)',
        );
      }

      drawPanelBolts(ctx, sx, sy, tilePx, zoom, variant);
      drawMacroSeams(ctx, sx, sy, tilePx, macro, zoom);
      drawGatewayMarking(ctx, sx, sy, tilePx, macro);
      drawPlatformLip(ctx, map, isWalkableTile, x, y, sx, sy, tilePx, zoom);
    }
  }
}

function selectionRing(ctx, size, scale) {
  ctx.strokeStyle = '#71ff87';
  ctx.lineWidth = Math.max(1, scale * 0.9);
  ctx.beginPath();
  ctx.ellipse(0, 6 * scale, size.radiusX * scale, size.radiusY * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function healthBar(ctx, x, y, width, ratio, scale) {
  const height = Math.max(3, 3 * scale);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.86)';
  ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, height + 2);
  ctx.fillStyle = ratio > 0.55 ? '#62dc6f' : (ratio > 0.25 ? '#d6c455' : '#d95f55');
  ctx.fillRect(x - width / 2, y, width * Math.max(0, Math.min(1, ratio)), height);
}

function drawHydraBody(ctx, scale, teamColor, gait) {
  const shell = ctx.createLinearGradient(-18 * scale, 0, 14 * scale, 0);
  shell.addColorStop(0, '#21141f');
  shell.addColorStop(0.45, '#593347');
  shell.addColorStop(0.76, '#7c485e');
  shell.addColorStop(1, '#aa6b82');

  ctx.fillStyle = shell;
  ctx.strokeStyle = '#160e15';
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(-18 * scale, gait.tail * 1.4 * scale);
  ctx.quadraticCurveTo(-10 * scale, -8 * scale, 0, -5 * scale);
  ctx.quadraticCurveTo(9 * scale, -7 * scale, 15 * scale, 0);
  ctx.quadraticCurveTo(9 * scale, 7 * scale, 0, 5 * scale);
  ctx.quadraticCurveTo(-10 * scale, 8 * scale, -18 * scale, gait.tail * 1.4 * scale);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#352033';
  ctx.beginPath();
  ctx.moveTo(-7 * scale, -3 * scale);
  ctx.lineTo((-13 - gait.stride) * scale, -14 * scale);
  ctx.lineTo((2 + gait.stride) * scale, -7 * scale);
  ctx.closePath();
  ctx.moveTo(-7 * scale, 3 * scale);
  ctx.lineTo((-13 + gait.stride) * scale, 14 * scale);
  ctx.lineTo((2 - gait.stride) * scale, 7 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = teamColor;
  ctx.globalAlpha = 0.88;
  ctx.lineWidth = Math.max(1, scale * 1.2);
  ctx.beginPath();
  ctx.moveTo(-3 * scale, -5 * scale);
  ctx.lineTo((2 + gait.stride) * scale, (-10 + gait.lift) * scale);
  ctx.moveTo(-3 * scale, 5 * scale);
  ctx.lineTo((2 - gait.stride) * scale, (10 - gait.lift) * scale);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ellipse(ctx, 10 * scale, 0, 6 * scale, 5 * scale, '#75445f', '#160e15', Math.max(1, scale));
  ellipse(ctx, 12 * scale, -2.2 * scale, 1.2 * scale, 1.2 * scale, '#e4dc78');
  ellipse(ctx, 12 * scale, 2.2 * scale, 1.2 * scale, 1.2 * scale, '#e4dc78');

  ctx.strokeStyle = '#281723';
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(-16 * scale, gait.tail * scale);
  ctx.quadraticCurveTo(-23 * scale, (-5 + gait.tail * 2) * scale, -27 * scale, (2 + gait.tail) * scale);
  ctx.stroke();
}

function drawZealotBody(ctx, scale, teamColor, gait, timeMs) {
  ctx.fillStyle = '#8a6829';
  ctx.strokeStyle = '#2b2416';
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(11 * scale, 0);
  ctx.lineTo(3 * scale, -7 * scale);
  ctx.lineTo((-8 - gait.stride) * scale, -8 * scale);
  ctx.lineTo(-11 * scale, 0);
  ctx.lineTo((-8 + gait.stride) * scale, 8 * scale);
  ctx.lineTo(3 * scale, 7 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ellipse(ctx, 3 * scale, 0, 5 * scale, 5.5 * scale, teamColor);
  ctx.strokeStyle = '#a7f7ff';
  ctx.shadowColor = '#6ddcff';
  ctx.shadowBlur = (4 + Math.sin(timeMs / 85) * 1.5) * scale;
  ctx.lineWidth = Math.max(1.4, 1.7 * scale);
  ctx.beginPath();
  ctx.moveTo(5 * scale, -5 * scale);
  ctx.lineTo((16 + gait.stride) * scale, (-11 + gait.lift) * scale);
  ctx.moveTo(5 * scale, 5 * scale);
  ctx.lineTo((16 - gait.stride) * scale, (11 - gait.lift) * scale);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawOverlordBody(ctx, scale, teamColor, timeMs, unitId) {
  const pulse = 1 + Math.sin(timeMs / 210 + unitId * 0.37) * 0.035;
  ctx.scale(pulse, 1 / pulse);
  ellipse(ctx, 0, -3 * scale, 21 * scale, 14 * scale, '#633652', '#241424', Math.max(1, scale));
  ellipse(ctx, -9 * scale, -7 * scale, 8 * scale, 6 * scale, '#8d5277');
  ellipse(ctx, 7 * scale, -8 * scale, 9 * scale, 6 * scale, '#92577d');
  ellipse(ctx, -2 * scale, 2 * scale, 10 * scale, 7 * scale, '#7d456b');

  ctx.strokeStyle = teamColor;
  ctx.globalAlpha = 0.78;
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.arc(0, -2 * scale, 14 * scale, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#523044';
  ctx.lineWidth = Math.max(1.4, 1.5 * scale);
  const sway = Math.sin(timeMs / 180 + unitId) * 3;
  for (const offset of [-10, -3, 4, 11]) {
    ctx.beginPath();
    ctx.moveTo(offset * scale, 8 * scale);
    ctx.bezierCurveTo(
      (offset - 4 + sway) * scale,
      14 * scale,
      (offset + 5 - sway) * scale,
      20 * scale,
      (offset + 1 + sway * 0.4) * scale,
      25 * scale,
    );
    ctx.stroke();
  }
}

export function drawRtsUnit(ctx, unit, options = {}) {
  const scale = options.scale ?? 1;
  const selected = options.selected ?? false;
  const timeMs = options.timeMs ?? 0;
  const teamColor = options.teamColor ?? '#53e3b2';
  const moving = options.moving ?? unit.moving ?? false;
  const size = UNIT_VISUAL_SIZES[unit.type] ?? UNIT_VISUAL_SIZES.hydra;
  const frame = spriteAnimationFrame(timeMs, unit.id, moving, 4, unit.type === 'zealot' ? 105 : 90);
  const gait = gaitPose(frame);
  const direction = facingDirection8(unit.facing ?? 0);
  const snappedFacing = direction * (Math.PI / 4);
  const bob = unit.type === 'overlord'
    ? Math.sin(timeMs / 260 + unit.id) * 1.4 * scale
    : (moving ? gait.lift * 0.65 : Math.sin(timeMs / 350 + unit.id) * 0.22) * scale;

  ctx.save();
  ctx.translate(options.x, options.y + bob);
  ellipse(
    ctx,
    0,
    unit.type === 'overlord' ? 14 * scale : 7 * scale,
    size.radiusX * scale * 0.9,
    size.radiusY * scale * 0.62,
    'rgba(0, 0, 0, 0.42)',
  );
  if (selected) selectionRing(ctx, size, scale);

  if (unit.type === 'overlord') {
    drawOverlordBody(ctx, scale, teamColor, timeMs, unit.id);
  } else {
    ctx.rotate(snappedFacing);
    if (unit.type === 'zealot') drawZealotBody(ctx, scale, teamColor, gait, timeMs);
    else drawHydraBody(ctx, scale, teamColor, gait);
  }
  ctx.restore();

  const ratio = unit.maxHp ? unit.hp / unit.maxHp : 1;
  if (selected || ratio < 0.999) {
    healthBar(
      ctx,
      options.x,
      options.y - (unit.type === 'overlord' ? 25 : 20) * scale,
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
  const timeMs = options.timeMs ?? 0;
  const x = options.x;
  const y = options.y;
  const pulse = Math.sin(timeMs / 170 + zone.id) * 1.8;

  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, 0, 10 * scale, 26 * scale, 13 * scale, 'rgba(0, 0, 0, 0.45)');
  if (selected) selectionRing(ctx, size, scale);

  ctx.fillStyle = '#3b1e27';
  ctx.strokeStyle = '#180e13';
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  for (let index = 0; index < 12; index += 1) {
    const angle = (Math.PI * 2 * index) / 12;
    const active = index % 2 === 0;
    const radius = (active ? 25 + pulse : 15) * scale;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius * 0.74;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ellipse(ctx, 0, 0, 12 * scale, 8 * scale, '#743744', '#180e13', Math.max(1, scale));
  ellipse(ctx, 2 * scale, -1 * scale, 5 * scale, 3 * scale, '#241117');

  ctx.strokeStyle = teamColor;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.ellipse(0, 0, (18 + pulse * 0.25) * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const ratio = zone.sunkenMaxHp ? zone.sunkenHp / zone.sunkenMaxHp : 1;
  if (selected || ratio < 0.999) {
    healthBar(ctx, x, y - 30 * scale, size.healthWidth * scale, ratio, scale);
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
