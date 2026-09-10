export function renderDetailRows(container, rows) {
  const signature = rows.map(([label, value]) => `${label}:${value}`).join('|');
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  container.replaceChildren();

  for (const [label, value] of rows) {
    const item = document.createElement('div');
    item.className = 'selection-detail';
    const labelNode = document.createElement('span');
    labelNode.className = 'label';
    labelNode.textContent = label;
    const valueNode = document.createElement('span');
    valueNode.className = 'value';
    valueNode.textContent = String(value);
    item.append(labelNode, valueNode);
    container.append(item);
  }
}

export function drawRangeCircle(ctx, camera, x, y, range, color = '#76f0a0') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(x - camera.x, y - camera.y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawTargetReticle(ctx, camera, x, y, label = 'TARGET') {
  const sx = x - camera.x;
  const sy = y - camera.y;
  ctx.save();
  ctx.strokeStyle = '#ff746b';
  ctx.fillStyle = '#ffb1aa';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - 17, sy);
  ctx.lineTo(sx - 7, sy);
  ctx.moveTo(sx + 7, sy);
  ctx.lineTo(sx + 17, sy);
  ctx.moveTo(sx, sy - 17);
  ctx.lineTo(sx, sy - 7);
  ctx.moveTo(sx, sy + 7);
  ctx.lineTo(sx, sy + 17);
  ctx.stroke();
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, sx, sy - 20);
  ctx.restore();
}

export function drawAttackFlash(ctx, camera, unit) {
  if ((unit.attackFlashMs ?? 0) <= 0) return;
  const x = unit.x - camera.x;
  const y = unit.y - camera.y;
  const pulse = Math.min(1, unit.attackFlashMs / 140);
  const fx = x + Math.cos(unit.facing || 0) * 15;
  const fy = y + Math.sin(unit.facing || 0) * 15;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#eaff9b';
  ctx.beginPath();
  ctx.arc(fx, fy, 2 + pulse * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawEnhancedCombatEffects(ctx, camera, effects, pointVisible) {
  for (const effect of effects) {
    if (!pointVisible(effect.x2, effect.y2)) continue;
    if (effect.type !== 'hydra-shot' && effect.type !== 'sunken-shot') continue;

    const duration = Math.max(1, effect.durationMs ?? 240);
    const progress = Math.min(1, (effect.elapsedMs ?? 0) / duration);
    const alpha = 1 - progress;
    const x1 = effect.x1 - camera.x;
    const y1 = effect.y1 - camera.y;
    const x2 = effect.x2 - camera.x;
    const y2 = effect.y2 - camera.y;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = effect.type === 'sunken-shot' ? '#ffb178' : '#dfff8c';
    ctx.beginPath();
    ctx.arc(x1, y1, 3 + (1 - progress) * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = effect.type === 'sunken-shot' ? '#ff8d62' : '#d7ff85';
    ctx.lineWidth = effect.type === 'sunken-shot' ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(x2, y2, 4 + progress * 13, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#fff4cf';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`-${effect.damage}`, x2, y2 - 10 - progress * 18);
    ctx.restore();
  }
}
