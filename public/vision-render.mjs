export function resizeFogSurface(canvas, ctx, width, height, dpr = 1) {
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function drawVisionFog({
  ctx,
  fogCtx,
  fogCanvas,
  sources,
  camera,
  viewportWidth,
  viewportHeight,
  visibleWorldPoint,
}) {
  fogCtx.save();
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.clearRect(0, 0, viewportWidth, viewportHeight);
  fogCtx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  fogCtx.fillRect(0, 0, viewportWidth, viewportHeight);
  fogCtx.globalCompositeOperation = 'destination-out';

  for (const source of sources) {
    if (!visibleWorldPoint(source.x, source.y, source.radius)) continue;
    const x = source.x - camera.x;
    const y = source.y - camera.y;
    const gradient = fogCtx.createRadialGradient(
      x, y, source.radius * 0.68, x, y, source.radius,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.8, 'rgba(0,0,0,0.9)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    fogCtx.fillStyle = gradient;
    fogCtx.beginPath();
    fogCtx.arc(x, y, source.radius, 0, Math.PI * 2);
    fogCtx.fill();
  }

  fogCtx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(fogCanvas, 0, 0, viewportWidth, viewportHeight);
  ctx.restore();
}
