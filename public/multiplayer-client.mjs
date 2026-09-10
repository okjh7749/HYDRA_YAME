import { buildClassicMap, clampCamera, isWalkableTile } from '/src/game-core.mjs';

const teamColors = ['#53e3b2', '#f0bc4a', '#e55a55', '#6da9ff'];
const map = buildClassicMap();
const CAMERA_ZOOM = 2.2;

const connectionStatus = document.querySelector('#connectionStatus');
const lobbyScreen = document.querySelector('#lobbyScreen');
const gameScreen = document.querySelector('#gameScreen');
const playerName = document.querySelector('#playerName');
const roomCodeInput = document.querySelector('#roomCodeInput');
const createRoomButton = document.querySelector('#createRoom');
const joinRoomButton = document.querySelector('#joinRoom');
const roomPanel = document.querySelector('#roomPanel');
const roomCode = document.querySelector('#roomCode');
const roomStatus = document.querySelector('#roomStatus');
const roomSlots = document.querySelector('#roomSlots');
const readyButton = document.querySelector('#readyButton');
const startButton = document.querySelector('#startButton');
const leaveButton = document.querySelector('#leaveButton');
const notice = document.querySelector('#notice');

const gameRoomCode = document.querySelector('#gameRoomCode');
const gameTeam = document.querySelector('#gameTeam');
const gameTimer = document.querySelector('#gameTimer');
const serverTickNode = document.querySelector('#serverTick');
const latencyNode = document.querySelector('#latency');
const battlefield = document.querySelector('#battlefield');
const ctx = battlefield.getContext('2d');
const minimap = document.querySelector('#minimap');
const miniCtx = minimap.getContext('2d');
const scoreboard = document.querySelector('#scoreboard');
const selectionInfo = document.querySelector('#selectionInfo');
const upgradeState = document.querySelector('#upgradeState');
const networkStatus = document.querySelector('#networkStatus');
const matchOverlay = document.querySelector('#matchOverlay');
const overlayTitle = document.querySelector('#overlayTitle');
const overlaySubtitle = document.querySelector('#overlaySubtitle');

let socket = null;
let clientId = null;
let lobby = null;
let snapshot = null;
let requestSequence = 1;
let latencyMs = null;
let drag = null;
const selectedIds = new Set();
const camera = { x: 0, y: 0, initialized: false };
const cameraInput = {
  keys: new Set(),
  pointerX: 0,
  pointerY: 0,
  inside: false,
};
let viewportWidth = 1;
let viewportHeight = 1;
let lastFrameAt = performance.now();
let minimapAccumulatorMs = 0;

function setNotice(message, error = false) {
  notice.textContent = message;
  notice.classList.toggle('error', error);
}

function send(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setNotice('서버 연결이 아직 준비되지 않았습니다.', true);
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
}

function command(commandPayload) {
  return send({
    type: 'command',
    requestId: requestSequence++,
    command: commandPayload,
  });
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor((milliseconds ?? 0) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function reasonText(reason) {
  const reasons = {
    'room-not-found': '방을 찾을 수 없습니다.',
    'room-full': '방이 가득 찼습니다.',
    'already-started': '이미 시작된 방입니다.',
    'host-only': '방장만 시작할 수 있습니다.',
    'need-more-players': '최소 2명이 필요합니다.',
    'not-ready': '모든 참가자가 READY 상태여야 합니다.',
    'need-two-teams': '서로 다른 두 팀 이상이 필요합니다.',
    'match-not-running': '경기가 아직 시작되지 않았습니다.',
    eliminated: '탈락 상태에서는 명령할 수 없습니다.',
    'no-commandable-units': '선택한 유닛을 서버에서 제어할 수 없습니다.',
    'invalid-target': '이동 목표가 올바르지 않습니다.',
    'insufficient-minerals': '미네랄이 부족합니다.',
    'max-level': '이미 최대 업그레이드입니다.',
  };
  return reasons[reason] ?? `요청 실패: ${reason}`;
}

function renderLobby() {
  if (!lobby) {
    roomPanel.hidden = true;
    return;
  }

  roomPanel.hidden = false;
  roomCode.textContent = lobby.roomId;
  roomStatus.textContent = lobby.status.toUpperCase();
  roomSlots.replaceChildren();

  const bySlot = new Map(lobby.players.map((player) => [player.slot, player]));
  for (let slot = 0; slot < 8; slot += 1) {
    const occupant = bySlot.get(slot);
    const row = document.createElement('div');
    row.className = `slot ${occupant ? '' : 'empty'}`;

    const playerLabel = document.createElement('span');
    playerLabel.textContent = `P${slot + 1}`;

    const teamLabel = document.createElement('span');
    teamLabel.className = 'slot-team';
    teamLabel.style.color = teamColors[Math.floor(slot / 2)];
    teamLabel.textContent = `TEAM ${Math.floor(slot / 2) + 1}`;

    const name = document.createElement('span');
    name.textContent = occupant
      ? `${occupant.name}${occupant.id === lobby.hostId ? ' · HOST' : ''}`
      : 'OPEN';

    const ready = document.createElement('span');
    ready.className = `slot-ready ${occupant?.ready ? '' : 'waiting'}`;
    ready.textContent = occupant ? (occupant.ready ? 'READY' : 'WAIT') : '';

    row.append(playerLabel, teamLabel, name, ready);
    roomSlots.append(row);
  }

  const self = lobby.players.find((player) => player.id === lobby.selfId);
  readyButton.textContent = self?.ready ? 'CANCEL READY' : 'READY';
  readyButton.disabled = lobby.status !== 'lobby';
  startButton.hidden = lobby.hostId !== lobby.selfId;
  const connected = lobby.players.filter((player) => player.connected);
  startButton.disabled = lobby.status !== 'lobby'
    || connected.length < 2
    || connected.some((player) => !player.ready);
}

function showGame() {
  const entering = gameScreen.hidden;
  lobbyScreen.hidden = true;
  gameScreen.hidden = false;
  document.body.classList.add('in-game');
  if (entering) resizeCanvas();
  centerCameraOnHome();
}

function selfTeamName(team) {
  const names = lobby?.players
    .filter((player) => player.team === team)
    .map((player) => player.name) ?? [];
  return names.length ? names.join(' / ') : `Team ${team + 1}`;
}

function renderScoreboard() {
  scoreboard.replaceChildren();
  for (const team of snapshot?.teams ?? []) {
    const row = document.createElement('div');
    row.className = `score-row ${team.status === 'eliminated' ? 'out' : ''}`;

    const label = document.createElement('span');
    label.className = 'score-team';
    label.style.color = teamColors[team.team];
    label.textContent = `T${team.team + 1}`;

    const name = document.createElement('span');
    name.textContent = selfTeamName(team.team);

    const zones = document.createElement('span');
    zones.textContent = `Z${team.zones}`;

    const hydras = document.createElement('span');
    hydras.textContent = `H${team.hydras}`;

    const minerals = document.createElement('span');
    minerals.textContent = team.status === 'eliminated' ? 'OUT' : `M${team.minerals}`;

    row.append(label, name, zones, hydras, minerals);
    scoreboard.append(row);
  }
}

function renderUpgradeState() {
  const upgrades = snapshot?.upgrades ?? {};
  upgradeState.textContent = `A+${upgrades.attack ?? 0} / D+${upgrades.defense ?? 0} / R${upgrades.range ?? 0} / S${upgrades.speed ?? 0}`;

  const locked = !snapshot
    || snapshot.match.phase !== 'running'
    || snapshot.self.spectator;
  for (const button of document.querySelectorAll('button[data-upgrade]')) {
    const key = button.dataset.upgrade;
    const level = upgrades[key] ?? 0;
    const max = key === 'attack' || key === 'defense' ? 255 : 1;
    button.disabled = locked || level >= max;
  }
}

function renderOverlay() {
  if (!snapshot) {
    matchOverlay.hidden = true;
    return;
  }
  const { match, self } = snapshot;

  if (match.phase === 'countdown') {
    matchOverlay.hidden = false;
    overlayTitle.textContent = String(Math.max(1, Math.ceil(match.countdownMs / 1000)));
    overlaySubtitle.textContent = 'SERVER COUNTDOWN';
    return;
  }

  if (match.phase === 'finished') {
    matchOverlay.hidden = false;
    overlayTitle.textContent = match.result === 'victory'
      ? 'VICTORY'
      : (match.result === 'draw' ? 'DRAW' : 'DEFEAT');
    overlaySubtitle.textContent = match.winnerTeam === null
      ? 'NO SURVIVORS'
      : `TEAM ${match.winnerTeam + 1} WINS`;
    return;
  }

  if (self.spectator) {
    matchOverlay.hidden = false;
    overlayTitle.textContent = 'ELIMINATED';
    overlaySubtitle.textContent = 'SPECTATOR · FULL SERVER VISION';
    return;
  }

  matchOverlay.hidden = true;
}

function cameraWorldWidth() {
  return viewportWidth / CAMERA_ZOOM;
}

function cameraWorldHeight() {
  return viewportHeight / CAMERA_ZOOM;
}

function resizeCanvas() {
  const rect = battlefield.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = window.devicePixelRatio || 1;
  viewportWidth = rect.width;
  viewportHeight = rect.height;
  battlefield.width = Math.round(viewportWidth * dpr);
  battlefield.height = Math.round(viewportHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  clampCamera(camera, map, cameraWorldWidth(), cameraWorldHeight());
}

function centerCameraOnHome() {
  if (!snapshot || camera.initialized || viewportWidth <= 1 || viewportHeight <= 1) return;
  const home = snapshot.zones.find(
    (zone) => zone.visible && zone.ownerSlot === snapshot.self.slot,
  ) ?? snapshot.units.find((unit) => unit.ownerSlot === snapshot.self.slot);
  if (!home) return;
  camera.x = home.x - cameraWorldWidth() / 2;
  camera.y = home.y - cameraWorldHeight() / 2;
  clampCamera(camera, map, cameraWorldWidth(), cameraWorldHeight());
  camera.initialized = true;
}

function worldToCanvas(x, y) {
  return { x: (x - camera.x) * CAMERA_ZOOM, y: (y - camera.y) * CAMERA_ZOOM };
}

function eventToWorld(event) {
  const rect = battlefield.getBoundingClientRect();
  return {
    x: camera.x + (event.clientX - rect.left) / CAMERA_ZOOM,
    y: camera.y + (event.clientY - rect.top) / CAMERA_ZOOM,
  };
}

function pointOnScreen(x, y, margin = 0) {
  return x >= camera.x - margin
    && y >= camera.y - margin
    && x <= camera.x + cameraWorldWidth() + margin
    && y <= camera.y + cameraWorldHeight() + margin;
}

function drawTerrain() {
  ctx.fillStyle = '#010204';
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);
  const tileSize = map.tileSize;
  const startX = Math.max(0, Math.floor(camera.x / tileSize) - 1);
  const startY = Math.max(0, Math.floor(camera.y / tileSize) - 1);
  const endX = Math.min(map.columns - 1, Math.ceil((camera.x + cameraWorldWidth()) / tileSize) + 1);
  const endY = Math.min(map.rows - 1, Math.ceil((camera.y + cameraWorldHeight()) / tileSize) + 1);

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      if (!isWalkableTile(map, x, y)) continue;
      ctx.fillStyle = (x + y) % 2 ? '#172025' : '#1d282d';
      ctx.fillRect(
        (x * tileSize - camera.x) * CAMERA_ZOOM,
        (y * tileSize - camera.y) * CAMERA_ZOOM,
        tileSize * CAMERA_ZOOM + 1,
        tileSize * CAMERA_ZOOM + 1,
      );
    }
  }
}

function drawZones() {
  for (const zone of snapshot?.zones ?? []) {
    if (!zone.visible) continue;
    if (!pointOnScreen(zone.x, zone.y, zone.radius + 36)) continue;
    const point = worldToCanvas(zone.x, zone.y);
    const radius = zone.radius * CAMERA_ZOOM;
    ctx.strokeStyle = zone.ownerTeam === null ? '#64767a' : teamColors[zone.ownerTeam];
    ctx.lineWidth = zone.ownerTeam === null ? 1 : 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (zone.ownerTeam !== null && zone.sunkenHp > 0) {
      const sunken = worldToCanvas(zone.x, zone.y + 27);
      ctx.fillStyle = teamColors[zone.ownerTeam];
      ctx.beginPath();
      ctx.moveTo(sunken.x, sunken.y - 7);
      ctx.lineTo(sunken.x + 7, sunken.y);
      ctx.lineTo(sunken.x, sunken.y + 7);
      ctx.lineTo(sunken.x - 7, sunken.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawBeacons() {
  const pads = snapshot?.beacons ?? [];
  for (const pad of pads) {
    if (!pointOnScreen(pad.x, pad.y, 32)) continue;
    const point = worldToCanvas(pad.x, pad.y);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = 'rgba(38, 126, 151, 0.52)';
    ctx.strokeStyle = '#9fe9ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-15, -15, 30, 30);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(215, 249, 255, 0.72)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#effcff';
    ctx.font = '800 9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pad.direction, 0, 0);
    ctx.restore();
  }

  const ownPads = pads.filter((pad) => pad.team === snapshot?.self.team);
  if (ownPads.length > 0) {
    const centerX = ownPads.reduce((sum, pad) => sum + pad.x, 0) / ownPads.length;
    const centerY = ownPads.reduce((sum, pad) => sum + pad.y, 0) / ownPads.length;
    if (pointOnScreen(centerX, centerY, 80)) {
      const point = worldToCanvas(centerX, centerY);
      ctx.fillStyle = '#d8f7ff';
      ctx.font = '800 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MASS ASSAULT', point.x, point.y - 48);
    }
  }
}

function drawUnit(unit) {
  if (!pointOnScreen(unit.x, unit.y, 24)) return;
  const point = worldToCanvas(unit.x, unit.y);
  const selected = selectedIds.has(unit.id);
  if (selected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = unit.type === 'overlord'
    ? '#cf78bd'
    : (unit.type === 'zealot' ? '#fff1a5' : teamColors[unit.team]);
  ctx.beginPath();
  if (unit.type === 'hydra') {
    const angle = unit.facing ?? 0;
    ctx.moveTo(point.x + Math.cos(angle) * 6, point.y + Math.sin(angle) * 6);
    ctx.lineTo(point.x + Math.cos(angle + 2.5) * 5, point.y + Math.sin(angle + 2.5) * 5);
    ctx.lineTo(point.x + Math.cos(angle - 2.5) * 5, point.y + Math.sin(angle - 2.5) * 5);
    ctx.closePath();
  } else {
    ctx.arc(point.x, point.y, unit.type === 'overlord' ? 6 : 5, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawEffects() {
  for (const effect of snapshot?.effects ?? []) {
    const start = worldToCanvas(effect.x1, effect.y1);
    const end = worldToCanvas(effect.x2, effect.y2);
    ctx.strokeStyle = effect.type === 'sunken-shot' ? '#ff9a65' : '#b8f17c';
    ctx.lineWidth = effect.type === 'sunken-shot' ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
}

function drawDrag() {
  if (!drag) return;
  const start = worldToCanvas(drag.start.x, drag.start.y);
  const current = worldToCanvas(drag.current.x, drag.current.y);
  ctx.strokeStyle = '#7cff91';
  ctx.lineWidth = 1;
  ctx.strokeRect(start.x, start.y, current.x - start.x, current.y - start.y);
}

function renderBattlefield() {
  drawTerrain();
  drawZones();
  drawBeacons();
  for (const unit of snapshot?.units ?? []) drawUnit(unit);
  drawEffects();
  drawDrag();
}

function pruneSelection() {
  if (!snapshot) {
    selectedIds.clear();
    return;
  }
  const available = new Set(
    snapshot.units
      .filter((unit) => unit.ownerSlot === snapshot.self.slot)
      .map((unit) => unit.id),
  );
  for (const id of selectedIds) {
    if (!available.has(id)) selectedIds.delete(id);
  }
}

function renderSelectionInfo() {
  if (!snapshot || selectedIds.size === 0) {
    selectionInfo.textContent = '선택 없음';
    return;
  }
  const selected = snapshot.units.filter((unit) => selectedIds.has(unit.id));
  const counts = new Map();
  let hp = 0;
  for (const unit of selected) {
    counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1);
    hp += unit.hp;
  }
  const types = [...counts.entries()].map(([type, count]) => `${type} ${count}`).join(' · ');
  selectionInfo.textContent = `${types} · HP ${hp}`;
}

function renderSnapshot() {
  if (!snapshot) return;
  showGame();
  gameRoomCode.textContent = snapshot.roomId;
  gameTeam.textContent = `${snapshot.self.team + 1}${snapshot.self.spectator ? ' · SPEC' : ''}`;
  gameTimer.textContent = formatTime(snapshot.match.elapsedMs);
  serverTickNode.textContent = String(snapshot.serverTick);
  latencyNode.textContent = latencyMs === null ? '-' : String(latencyMs);
  networkStatus.textContent = `Snapshot #${snapshot.sequence} · authoritative tick ${snapshot.serverTick} · visible units ${snapshot.units.length}`;
  pruneSelection();
  renderScoreboard();
  renderUpgradeState();
  renderOverlay();
  renderSelectionInfo();
  renderBattlefield();
}

function selectUnits(start, end) {
  if (!snapshot || snapshot.self.spectator || snapshot.match.phase !== 'running') return;
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const click = Math.hypot(end.x - start.x, end.y - start.y) < 18;
  selectedIds.clear();

  const own = snapshot.units.filter((unit) => unit.ownerSlot === snapshot.self.slot);
  if (click) {
    let nearest = null;
    let best = 28 * 28;
    for (const unit of own) {
      const dx = unit.x - end.x;
      const dy = unit.y - end.y;
      const distance = dx * dx + dy * dy;
      if (distance <= best) {
        nearest = unit;
        best = distance;
      }
    }
    if (nearest) selectedIds.add(nearest.id);
  } else {
    for (const unit of own) {
      if (unit.x >= left && unit.x <= right && unit.y >= top && unit.y <= bottom) {
        selectedIds.add(unit.id);
      }
    }
  }
  renderSelectionInfo();
}

function handleMessage(message) {
  if (message.type === 'hello') {
    clientId = message.clientId;
    connectionStatus.textContent = `ONLINE · ${message.tickRateHz}Hz`;
    connectionStatus.className = 'connection online';
    return;
  }

  if (message.type === 'lobby') {
    lobby = message;
    renderLobby();
    if (message.status === 'lobby') {
      lobbyScreen.hidden = false;
      gameScreen.hidden = true;
    }
    return;
  }

  if (message.type === 'snapshot') {
    if (snapshot && message.sequence < snapshot.sequence) return;
    snapshot = message;
    renderSnapshot();
    return;
  }

  if (message.type === 'pong') {
    if (Number.isFinite(message.sentAt)) latencyMs = Math.max(0, Date.now() - message.sentAt);
    latencyNode.textContent = latencyMs === null ? '-' : String(latencyMs);
    return;
  }

  if (message.type === 'command-result') {
    if (!message.result?.ok && message.result?.reason) {
      networkStatus.textContent = reasonText(message.result.reason);
    }
    return;
  }

  if (message.type === 'left-room') {
    lobby = null;
    snapshot = null;
    selectedIds.clear();
    camera.initialized = false;
    roomPanel.hidden = true;
    lobbyScreen.hidden = false;
    gameScreen.hidden = true;
    document.body.classList.remove('in-game');
    setNotice('방에서 나왔습니다.');
    return;
  }

  if (message.type === 'error') {
    setNotice(reasonText(message.reason), true);
  }
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws`);
  connectionStatus.textContent = '연결 중…';
  connectionStatus.className = 'connection';

  socket.addEventListener('open', () => {
    connectionStatus.textContent = 'CONNECTED';
    connectionStatus.className = 'connection online';
  });
  socket.addEventListener('message', (event) => {
    try {
      handleMessage(JSON.parse(event.data));
    } catch {
      setNotice('서버 메시지를 해석하지 못했습니다.', true);
    }
  });
  socket.addEventListener('close', () => {
    connectionStatus.textContent = 'DISCONNECTED';
    connectionStatus.className = 'connection offline';
    setNotice('WebSocket 연결이 종료되었습니다. 페이지를 새로고침해 다시 연결하세요.', true);
  });
  socket.addEventListener('error', () => {
    connectionStatus.textContent = 'CONNECTION ERROR';
    connectionStatus.className = 'connection offline';
  });
}

createRoomButton.addEventListener('click', () => {
  send({ type: 'create-room', name: playerName.value });
});

joinRoomButton.addEventListener('click', () => {
  send({
    type: 'join-room',
    roomId: roomCodeInput.value,
    name: playerName.value,
  });
});

roomCodeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoomButton.click();
});

readyButton.addEventListener('click', () => {
  const self = lobby?.players.find((player) => player.id === lobby.selfId);
  send({ type: 'ready', ready: !self?.ready });
});

startButton.addEventListener('click', () => {
  send({ type: 'start-room', requestId: requestSequence++ });
});

leaveButton.addEventListener('click', () => {
  send({ type: 'leave-room', requestId: requestSequence++ });
});

battlefield.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const world = eventToWorld(event);
  drag = { start: world, current: world };
  battlefield.setPointerCapture(event.pointerId);
  renderBattlefield();
});

battlefield.addEventListener('pointermove', (event) => {
  if (!drag) return;
  drag.current = eventToWorld(event);
  renderBattlefield();
});

battlefield.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !drag) return;
  drag.current = eventToWorld(event);
  selectUnits(drag.start, drag.current);
  drag = null;
  battlefield.releasePointerCapture(event.pointerId);
  renderBattlefield();
});

battlefield.addEventListener('pointercancel', () => {
  drag = null;
  renderBattlefield();
});

battlefield.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (!snapshot || selectedIds.size === 0 || snapshot.self.spectator) return;
  const target = eventToWorld(event);
  command({
    type: 'move',
    unitIds: [...selectedIds],
    x: target.x,
    y: target.y,
  });
});

for (const button of document.querySelectorAll('button[data-upgrade]')) {
  button.addEventListener('click', () => {
    if (!snapshot) return;
    const key = button.dataset.upgrade;
    const buildingType = key === 'attack' || key === 'defense' ? 'evolution' : 'hydra-den';
    command({
      type: 'upgrade',
      buildingId: `upgrade-${snapshot.self.slot}-${buildingType}`,
      upgradeKey: key,
    });
  });
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
      miniCtx.fillStyle = '#314047';
      miniCtx.fillRect(
        x * map.tileSize * scaleX,
        y * map.tileSize * scaleY,
        map.tileSize * scaleX + 0.5,
        map.tileSize * scaleY + 0.5,
      );
    }
  }

  for (const zone of snapshot?.zones ?? []) {
    if (!zone.visible) continue;
    miniCtx.fillStyle = zone.ownerTeam === null ? '#829397' : teamColors[zone.ownerTeam];
    miniCtx.beginPath();
    miniCtx.arc(
      zone.x * scaleX,
      zone.y * scaleY,
      zone.ownerTeam === null ? 1.7 : 3.2,
      0,
      Math.PI * 2,
    );
    miniCtx.fill();
  }

  for (const unit of snapshot?.units ?? []) {
    miniCtx.fillStyle = unit.type === 'overlord'
      ? '#cf78bd'
      : (unit.type === 'zealot' ? '#fff1a5' : teamColors[unit.team]);
    miniCtx.fillRect(unit.x * scaleX - 1, unit.y * scaleY - 1, 2.5, 2.5);
  }

  miniCtx.strokeStyle = '#ffffff';
  miniCtx.lineWidth = 1;
  miniCtx.strokeRect(
    camera.x * scaleX,
    camera.y * scaleY,
    cameraWorldWidth() * scaleX,
    cameraWorldHeight() * scaleY,
  );
}

function updateCamera(deltaMs) {
  if (!camera.initialized || gameScreen.hidden) return;
  let dx = 0;
  let dy = 0;
  if (cameraInput.keys.has('KeyA') || cameraInput.keys.has('ArrowLeft')) dx -= 1;
  if (cameraInput.keys.has('KeyD') || cameraInput.keys.has('ArrowRight')) dx += 1;
  if (cameraInput.keys.has('KeyW') || cameraInput.keys.has('ArrowUp')) dy -= 1;
  if (cameraInput.keys.has('KeyS') || cameraInput.keys.has('ArrowDown')) dy += 1;

  const edge = 22;
  if (cameraInput.inside && !drag) {
    if (cameraInput.pointerX < edge) dx -= 1;
    if (cameraInput.pointerX > viewportWidth - edge) dx += 1;
    if (cameraInput.pointerY < edge) dy -= 1;
    if (cameraInput.pointerY > viewportHeight - edge) dy += 1;
  }

  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const speed = 520;
  const seconds = deltaMs / 1000;
  camera.x += (dx / length) * speed * seconds;
  camera.y += (dy / length) * speed * seconds;
  clampCamera(camera, map, cameraWorldWidth(), cameraWorldHeight());
}

function animationFrame(now) {
  const deltaMs = Math.min(50, Math.max(0, now - lastFrameAt));
  lastFrameAt = now;
  if (!gameScreen.hidden) {
    updateCamera(deltaMs);
    minimapAccumulatorMs += deltaMs;
    renderBattlefield();
    if (minimapAccumulatorMs >= 100) {
      drawMinimap();
      minimapAccumulatorMs = 0;
    }
  }
  requestAnimationFrame(animationFrame);
}

setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) {
    send({ type: 'ping', sentAt: Date.now() });
  }
}, 2000);

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', (event) => {
  cameraInput.keys.add(event.code);
  if (!gameScreen.hidden && (
    event.code.startsWith('Arrow')
    || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)
  )) {
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => cameraInput.keys.delete(event.code));

battlefield.addEventListener('pointermove', (event) => {
  const rect = battlefield.getBoundingClientRect();
  cameraInput.pointerX = event.clientX - rect.left;
  cameraInput.pointerY = event.clientY - rect.top;
  cameraInput.inside = true;
});
battlefield.addEventListener('pointerenter', () => {
  cameraInput.inside = true;
});
battlefield.addEventListener('pointerleave', () => {
  cameraInput.inside = false;
});

minimap.addEventListener('pointerdown', (event) => {
  if (!camera.initialized) return;
  const rect = minimap.getBoundingClientRect();
  const worldX = ((event.clientX - rect.left) / rect.width) * map.worldWidth;
  const worldY = ((event.clientY - rect.top) / rect.height) * map.worldHeight;
  camera.x = worldX - cameraWorldWidth() / 2;
  camera.y = worldY - cameraWorldHeight() / 2;
  clampCamera(camera, map, cameraWorldWidth(), cameraWorldHeight());
  renderBattlefield();
  drawMinimap();
});

requestAnimationFrame(animationFrame);
connect();
