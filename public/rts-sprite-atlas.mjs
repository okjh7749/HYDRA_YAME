import {
  SPRITE_FRAMES_PER_DIRECTION,
  UNIT_ANIMATION_LAYOUT,
  UNIT_ANIMATION_STATES,
  spriteColumn,
} from '/src/rts-animation.mjs';
import { gaitPose } from '/src/rts-visual-layout.mjs';

export const SPRITE_CELL_SIZE = 72;
export const SPRITE_DIRECTIONS = 8;

const cache = new Map();

function createSurface(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
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

function motionPose(state, frame) {
  if (state === 'move') return gaitPose(frame);
  if (state === 'attack') {
    const attack = [0, 2.5, 5, 1][frame] ?? 0;
    return { stride: attack * 0.3, lift: -attack * 0.18, tail: attack * 0.25, lunge: attack };
  }
  if (state === 'hit') {
    const recoil = frame === 0 ? -3 : -1;
    return { stride: 0, lift: 0, tail: recoil * 0.3, lunge: recoil };
  }
  return { stride: 0, lift: 0, tail: 0, lunge: 0 };
}

function drawHydra(ctx, teamColor, pose) {
  const lunge = pose.lunge ?? 0;
  const shell = ctx.createLinearGradient(-18, 0, 15, 0);
  shell.addColorStop(0, '#20131e');
  shell.addColorStop(0.45, '#563044');
  shell.addColorStop(0.78, '#824d64');
  shell.addColorStop(1, '#b06f87');
  ctx.fillStyle = shell;
  ctx.strokeStyle = '#130c12';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-20, pose.tail * 1.4);
  ctx.quadraticCurveTo(-11, -8, 0 + lunge * 0.15, -5);
  ctx.quadraticCurveTo(9, -7, 15 + lunge, 0);
  ctx.quadraticCurveTo(9, 7, 0 + lunge * 0.15, 5);
  ctx.quadraticCurveTo(-11, 8, -20, pose.tail * 1.4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#352033';
  ctx.beginPath();
  ctx.moveTo(-7, -3);
  ctx.lineTo(-14 - pose.stride, -15);
  ctx.lineTo(2 + pose.stride, -7);
  ctx.closePath();
  ctx.moveTo(-7, 3);
  ctx.lineTo(-14 + pose.stride, 15);
  ctx.lineTo(2 - pose.stride, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-3, -5);
  ctx.lineTo(2 + pose.stride, -11 + pose.lift);
  ctx.moveTo(-3, 5);
  ctx.lineTo(2 - pose.stride, 11 - pose.lift);
  ctx.stroke();

  ellipse(ctx, 10 + lunge, 0, 6.5, 5.2, '#76455f', '#150d14', 1);
  ellipse(ctx, 13 + lunge, -2.1, 1.2, 1.2, '#efe480');
  ellipse(ctx, 13 + lunge, 2.1, 1.2, 1.2, '#efe480');
  ctx.strokeStyle = '#2a1724';
  ctx.beginPath();
  ctx.moveTo(-17, pose.tail);
  ctx.quadraticCurveTo(-25, -5 + pose.tail * 2, -29, 2 + pose.tail);
  ctx.stroke();
}

function drawZealot(ctx, teamColor, pose, state) {
  const lunge = pose.lunge ?? 0;
  ctx.fillStyle = '#8b6929';
  ctx.strokeStyle = '#2a2315';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(11 + lunge, 0);
  ctx.lineTo(3, -7);
  ctx.lineTo(-8 - pose.stride, -9);
  ctx.lineTo(-11, 0);
  ctx.lineTo(-8 + pose.stride, 9);
  ctx.lineTo(3, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ellipse(ctx, 3, 0, 5, 5.5, teamColor, '#332811', 1);
  ctx.strokeStyle = '#b7fbff';
  ctx.shadowColor = '#6ddcff';
  ctx.shadowBlur = state === 'attack' ? 8 : 4;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(5, -5);
  ctx.lineTo(17 + lunge + pose.stride, -12 + pose.lift);
  ctx.moveTo(5, 5);
  ctx.lineTo(17 + lunge - pose.stride, 12 - pose.lift);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawOverlord(ctx, teamColor, state, frame) {
  const pulse = state === 'move' ? (frame % 2 ? 1.04 : 0.98) : 1;
  ctx.scale(pulse, 1 / pulse);
  ellipse(ctx, 0, -4, 21, 14, '#633652', '#241424', 1.2);
  ellipse(ctx, -9, -8, 8, 6, '#8d5277');
  ellipse(ctx, 7, -9, 9, 6, '#92577d');
  ellipse(ctx, -2, 2, 10, 7, '#7d456b');
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, -2, 14, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  const sway = state === 'move' ? (frame % 2 ? 3 : -3) : 1;
  ctx.strokeStyle = '#523044';
  ctx.lineWidth = 1.5;
  for (const offset of [-10, -3, 4, 11]) {
    ctx.beginPath();
    ctx.moveTo(offset, 8);
    ctx.bezierCurveTo(offset - 4 + sway, 14, offset + 5 - sway, 20, offset + sway * 0.4, 27);
    ctx.stroke();
  }
}

function drawSunken(ctx, teamColor, state, frame) {
  const strike = state === 'attack' ? [0, 5, 10, 3][frame] ?? 0 : 0;
  const pulse = state === 'idle' ? (frame ? 1.5 : -1) : 0;
  ctx.fillStyle = '#3b1e27';
  ctx.strokeStyle = '#180e13';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let index = 0; index < 12; index += 1) {
    const angle = (Math.PI * 2 * index) / 12;
    const radius = index % 2 === 0 ? 25 + pulse + strike * 0.25 : 15;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius * 0.72;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ellipse(ctx, strike * 0.18, 0, 12, 8, '#743744', '#180e13', 1);
  ellipse(ctx, 2 + strike * 0.25, -1, 5, 3, '#241117');
  ctx.strokeStyle = teamColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFrame(ctx, type, state, frame, direction, teamColor) {
  ctx.save();
  ctx.translate(SPRITE_CELL_SIZE / 2, SPRITE_CELL_SIZE / 2);
  const deathProgress = state === 'death'
    ? frame / Math.max(1, UNIT_ANIMATION_LAYOUT.death.frames - 1)
    : 0;
  if (state === 'death') {
    ctx.globalAlpha = 1 - deathProgress * 0.82;
    ctx.rotate(deathProgress * 0.8);
    ctx.scale(1 + deathProgress * 0.08, 1 - deathProgress * 0.62);
  }
  if (type !== 'overlord' && type !== 'sunken') ctx.rotate(direction * (Math.PI / 4));
  const pose = motionPose(state, frame);
  if (type === 'hydra') drawHydra(ctx, teamColor, pose);
  else if (type === 'zealot') drawZealot(ctx, teamColor, pose, state);
  else if (type === 'overlord') drawOverlord(ctx, teamColor, state, frame);
  else drawSunken(ctx, teamColor, state, frame);

  if (state === 'hit') {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = frame === 0 ? 0.62 : 0.3;
    ctx.fillStyle = '#ffd1c5';
    ctx.fillRect(-32, -32, 64, 64);
  }
  ctx.restore();
}

function buildAtlas(type, teamColor) {
  const canvas = createSurface(SPRITE_FRAMES_PER_DIRECTION * SPRITE_CELL_SIZE, SPRITE_DIRECTIONS * SPRITE_CELL_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  for (let direction = 0; direction < SPRITE_DIRECTIONS; direction += 1) {
    for (const state of UNIT_ANIMATION_STATES) {
      const definition = UNIT_ANIMATION_LAYOUT[state];
      for (let frame = 0; frame < definition.frames; frame += 1) {
        const column = spriteColumn(state, frame);
        ctx.save();
        ctx.translate(column * SPRITE_CELL_SIZE, direction * SPRITE_CELL_SIZE);
        drawFrame(ctx, type, state, frame, direction, teamColor);
        ctx.restore();
      }
    }
  }
  return { canvas, type, teamColor, cellSize: SPRITE_CELL_SIZE };
}

export function getSpriteAtlas(type, teamColor = '#53e3b2') {
  const safeType = ['hydra', 'zealot', 'overlord', 'sunken'].includes(type) ? type : 'hydra';
  const key = `${safeType}:${teamColor}`;
  if (!cache.has(key)) cache.set(key, buildAtlas(safeType, teamColor));
  return cache.get(key);
}

export function drawAtlasSprite(ctx, atlas, state, frame, direction, x, y, scale = 1) {
  const column = spriteColumn(state, frame);
  const row = ((direction % SPRITE_DIRECTIONS) + SPRITE_DIRECTIONS) % SPRITE_DIRECTIONS;
  const size = atlas.cellSize;
  ctx.drawImage(
    atlas.canvas,
    column * size,
    row * size,
    size,
    x - (size * scale) / 2,
    y - (size * scale) / 2,
    size * scale,
    size * scale,
  );
}
