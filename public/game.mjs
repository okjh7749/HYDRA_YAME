import {
  buildClassicMap,
  cameraRect,
  clampCamera,
  findPath,
  isWalkableTile,
} from '/src/game-core.mjs';

const gameCanvas = document.querySelector('#game');
const minimap = document.querySelector('#minimap');
const statusNode = document.querySelector('#unitStatus');
const zoneCountNode = document.querySelector('#zoneCount');

const ctx = gameCanvas.getContext('2d');
const miniCtx = minimap.getContext('2d');
const map = buildClassicMap();
const teamColors = ['#53e3b2', '#f0bc4a', '#e55a55', '#6da9ff'];

zoneCountNode.textContent = String(map.zones.length);

const camera = {
  x: Math.max(0, map.zones[0].x - 340),
  y: Math.max(0, map.zones[0].y - 260),
};

const overlord = {
  x: map.zones[0].x,
  y: map.zones[0].y,
  speed: 150,
  path: [],
  pathIndex: 0,
  target: null,
};

const input = {
  keys: new Set(),
  pointerX: 0,
  pointerY: 0,
  inside: false,
};

let viewportWidth = 1;
let viewportHeight = 1;
let lastFrame = performance.now();

function resizeCanvas() {
  const rect = gameCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  viewportWidth = Math.max(1, rect.width);
  viewportHeight = Math.max(1, rect.height);
  gameCanvas.width = Math.round(rect.width * dpr);
  gameCanvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  clampCamera(camera, map, viewportWidth, viewportHeight);
}

function screenToWorld(x, y) {
  return { x: camera.x + x, y: camera.y + y };
}

function visibleWorldPoint(x, y, margin = 0) {
  return (
    x >= camera.x - margin &&
    y >= camera.y - margin &&
    x <= camera.x + viewportWidth + margin &&
    y <= camera.y + viewportHeight + margin
  );
}

function updateCamera(deltaSeconds) {
  const speed = 460;
  let dx = 0;
  let dy = 0;

  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) dx -= 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) dx += 1;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) dy -= 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) dy += 1;

  const edge = 24;
  if (input.inside) {
    if (input.pointerX < edge) dx -= 1;
    if (input.pointerX > viewportWidth - edge) dx += 1;
    if (input.pointerY < edge) dy -= 1;
    if (input.pointerY > viewportHeight - edge) dy += 1;
  }

  const length = Math.hypot(dx, dy);
  if (length > 0) {
    camera.x += (dx / length) * speed * deltaSeconds;
    camera.y += (dy / length) * speed * deltaSeconds;
    clampCamera(camera, map, viewportWidth, viewportHeight);
  }
}

function updateOverlord(deltaSeconds) {
  if (overlord.pathIndex >= overlord.path.length) return;

  const target = overlord.path[overlord.pathIndex];
  const dx = target.x - overlord.x;
  const dy = target.y - overlord.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= 1) {
    overlord.x = target.x;
    overlord.y = target.y;
    overlord.pathIndex += 1;
    if (overlord.pathIndex >= overlord.path.length) {
      statusNode.textContent = '목적지 도착 · 점령 판정은 다음 마일스톤에서 연결됩니다.';
    }
    return;
  }

  const step = Math.min(distance, overlord.speed * deltaSeconds);
  overlord.x += (dx / distance) * step;
  overlord.y += (dy / distance) * step;
}

function drawTerrain() {
  ctx.fillStyle = '#020305';
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const tileSize = map.tileSize;
  const startX = Math.max(0, Math.floor(camera.x / tileSize) - 1);
  const startY = Math.max(0, Math.floor(camera.y / tileSize) - 1);
  const endX = Math.min(map.columns - 1, Math.ceil((camera.x + viewportWidth) / tileSize) + 1);
  const endY = Math.min(map.rows - 1, Math.ceil((camera.y + viewportHeight) / tileSize) + 1);

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      if (!isWalkableTile(map, x, y)) continue;
      const sx = x * tileSize - camera.x;
      const sy = y * tileSize - camera.y;
      ctx.fillStyle = (x + y) % 2 === 0 ? '#23282d' : '#1d2327';
      ctx.fillRect(sx, sy, tileSize + 1, tileSize + 1);
      ctx.strokeStyle = 'rgba(116, 145, 151, 0.08)';
      ctx.strokeRect(sx + 0.5, sy + 0.5, tileSize - 1, tileSize - 1);
    }
  }
}

function drawZones() {
  for (const zone of map.zones) {
    if (!visibleWorldPoint(zone.x, zone.y, zone.radius + 60)) continue;
    const x = zone.x - camera.x;
    const y = zone.y - camera.y;

    if (zone.ownerTeam !== null) {
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = teamColors[zone.ownerTeam];
      ctx.beginPath();
      ctx.arc(x, y, zone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = zone.ownerTeam === null ? '#65777d' : teamColors[zone.ownerTeam];
    ctx.lineWidth = zone.ownerTeam === null ? 1 : 2;
    ctx.beginPath();
    ctx.arc(x, y, zone.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#dce7e7';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Z${zone.id}`, x, y - 13);

    ctx.fillStyle = zone.ownerTeam === null ? '#8fa1a4' : teamColors[zone.ownerTeam];
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();

    if (zone.ownerTeam !== null) drawSunken(x, y + 27, teamColors[zone.ownerTeam]);
  }
}

function drawSunken(x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = '#341b1f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    const radius = i % 2 === 0 ? 15 : 8;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawOverlord() {
  if (!visibleWorldPoint(overlord.x, overlord.y, 40)) return;
  const x = overlord.x - camera.x;
  const y = overlord.y - camera.y;

  if (overlord.path.length > overlord.pathIndex) {
    ctx.strokeStyle = 'rgba(130, 238, 163, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = overlord.pathIndex; i < overlord.path.length; i += 1) {
      ctx.lineTo(overlord.path[i].x - camera.x, overlord.path[i].y - camera.y);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = '#7cff91';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#7d3f69';
  ctx.beginPath();
  ctx.ellipse(x, y, 17, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#bb759f';
  ctx.beginPath();
  ctx.arc(x - 7, y - 3, 4, 0, Math.PI * 2);
  ctx.arc(x + 7, y - 3, 4, 0, Math.PI * 2);
  ctx.fill();

  if (overlord.target) {
    const tx = overlord.target.x - camera.x;
    const ty = overlord.target.y - camera.y;
    ctx.strokeStyle = '#d9ff8d';
    ctx.beginPath();
    ctx.moveTo(tx - 8, ty);
    ctx.lineTo(tx + 8, ty);
    ctx.moveTo(tx, ty - 8);
    ctx.lineTo(tx, ty + 8);
    ctx.stroke();
  }
}

function drawMinimap() {
  const width = minimap.width;
  const height = minimap.height;
  const scaleX = width / map.worldWidth;
  const scaleY = height / map.worldHeight;

  miniCtx.fillStyle = '#010203';
  miniCtx.fillRect(0, 0, width, height);

  for (let y = 0; y < map.rows; y += 1) {
    for (let x = 0; x < map.columns; x += 1) {
      if (!isWalkableTile(map, x, y)) continue;
      miniCtx.fillStyle = '#303a3f';
      miniCtx.fillRect(
        x * map.tileSize * scaleX,
        y * map.tileSize * scaleY,
        map.tileSize * scaleX + 1,
        map.tileSize * scaleY + 1,
      );
    }
  }

  for (const zone of map.zones) {
    miniCtx.fillStyle = zone.ownerTeam === null ? '#86969a' : teamColors[zone.ownerTeam];
    miniCtx.beginPath();
    miniCtx.arc(zone.x * scaleX, zone.y * scaleY, zone.ownerTeam === null ? 2 : 4, 0, Math.PI * 2);
    miniCtx.fill();
  }

  miniCtx.fillStyle = '#e68ad0';
  miniCtx.beginPath();
  miniCtx.arc(overlord.x * scaleX, overlord.y * scaleY, 3.5, 0, Math.PI * 2);
  miniCtx.fill();

  const view = cameraRect(camera, viewportWidth, viewportHeight);
  miniCtx.strokeStyle = '#ffffff';
  miniCtx.lineWidth = 1;
  miniCtx.strokeRect(
    view.x * scaleX,
    view.y * scaleY,
    view.width * scaleX,
    view.height * scaleY,
  );
}

function render() {
  ctx.save();
  drawTerrain();
  drawZones();
  drawOverlord();
  ctx.restore();
  drawMinimap();
}

function issueMoveCommand(screenX, screenY) {
  const target = screenToWorld(screenX, screenY);
  const path = findPath(map, { x: overlord.x, y: overlord.y }, target);
  if (path.length === 0) {
    statusNode.textContent = '이동 실패 · 연결된 통로가 없는 위치입니다.';
    return;
  }

  overlord.path = path;
  overlord.pathIndex = Math.min(1, path.length);
  overlord.target = path[path.length - 1];
  statusNode.textContent = `이동 중 · ${path.length}개 경로 노드 · 검은 영역 명령은 자동 보정됩니다.`;
}

function frame(now) {
  const deltaSeconds = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  updateCamera(deltaSeconds);
  updateOverlord(deltaSeconds);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', (event) => {
  input.keys.add(event.code);
  if (event.code.startsWith('Arrow')) event.preventDefault();
});
window.addEventListener('keyup', (event) => input.keys.delete(event.code));

gameCanvas.addEventListener('mousemove', (event) => {
  const rect = gameCanvas.getBoundingClientRect();
  input.pointerX = event.clientX - rect.left;
  input.pointerY = event.clientY - rect.top;
  input.inside = true;
});

gameCanvas.addEventListener('mouseleave', () => {
  input.inside = false;
});

gameCanvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  const rect = gameCanvas.getBoundingClientRect();
  issueMoveCommand(event.clientX - rect.left, event.clientY - rect.top);
});

minimap.addEventListener('pointerdown', (event) => {
  const rect = minimap.getBoundingClientRect();
  const localX = ((event.clientX - rect.left) / rect.width) * minimap.width;
  const localY = ((event.clientY - rect.top) / rect.height) * minimap.height;
  const worldX = (localX / minimap.width) * map.worldWidth;
  const worldY = (localY / minimap.height) * map.worldHeight;
  camera.x = worldX - viewportWidth / 2;
  camera.y = worldY - viewportHeight / 2;
  clampCamera(camera, map, viewportWidth, viewportHeight);
});

resizeCanvas();
requestAnimationFrame(frame);
