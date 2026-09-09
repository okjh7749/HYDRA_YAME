export function drawBeaconPads(ctx, pads, camera, visibleWorldPoint) {
  for (const pad of pads) {
    if (!visibleWorldPoint(pad.x, pad.y, 32)) continue;
    const x = pad.x - camera.x;
    const y = pad.y - camera.y;

    ctx.save();
    ctx.strokeStyle = 'rgba(190, 232, 255, 0.6)';
    ctx.fillStyle = 'rgba(48, 91, 111, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, pad.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#d7f3ff';
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pad.direction, x, y);
    ctx.restore();
  }
}

export function drawZealot(ctx, unit, selected, camera, teamColors) {
  const x = unit.x - camera.x;
  const y = unit.y - camera.y;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(unit.facing || 0);

  if (selected) {
    ctx.strokeStyle = '#7cff91';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = teamColors[unit.team] ?? '#d7d7d7';
  ctx.strokeStyle = '#fff5b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(2, -8);
  ctx.lineTo(-8, -6);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 6);
  ctx.lineTo(2, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#bce9ff';
  ctx.beginPath();
  ctx.moveTo(5, -6);
  ctx.lineTo(14, -11);
  ctx.moveTo(5, 6);
  ctx.lineTo(14, 11);
  ctx.stroke();
  ctx.restore();

  if (selected) {
    ctx.fillStyle = '#101719';
    ctx.fillRect(x - 13, y - 17, 26, 3);
    ctx.fillStyle = '#74e68e';
    ctx.fillRect(x - 13, y - 17, 26 * Math.max(0, unit.hp / unit.maxHp), 3);
  }
}
