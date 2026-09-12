import {
  buildClassicMap,
  cameraRect,
  clampCamera,
  isWalkableTile,
} from '/src/game-core.mjs';
import {
  assignMoveOrders,
  createSimulation,
  getVisionSources,
  nearestSelectableUnit,
  selectUnitsInRect,
  stepProduction,
} from '/src/game-simulation.mjs';
import {
  SUNKEN_ARMOR,
  calculateHydraAttackRange,
  calculateHydraDamage,
  calculateSunkenDamage,
  controlledZoneCount,
  getPlayerState,
  initializeCombatState,
  stepCapture,
  stepCombat,
  stepPlayerTriggerEconomy,
} from '/src/game-combat.mjs';
import {
  UPGRADE_DEFINITIONS,
  getUpgradeBuilding,
  initializeUpgradeBuildings,
  nearestUpgradeBuilding,
  purchaseUpgrade,
  upgradeButtonState,
  upgradeOptionsForBuilding,
} from '/src/game-upgrades.mjs';
import {
  beaconPadsForPlayer,
  initializeBeaconSystem,
  stepBeaconSystem,
} from '/src/game-beacon.mjs';
import { stepFormationMovement } from '/src/game-formation.mjs';
import { playerHydraCount } from '/src/game-ownership.mjs';
import {
  drawIndustrialTerrain,
  drawRtsBeacon,
  drawRtsEffects,
  drawRtsSunken,
  drawRtsUnit,
} from '/public/rts-render-v3.mjs';
import { minimapUnitRadius } from '/src/rts-feel.mjs';
import { playCombatImpact, playUiCue, primeRtsAudio } from '/public/rts-audio.mjs';

const LOCAL_TEAM = 0;
const teamColors = ['#53e3b2', '#f0bc4a', '#e55a55', '#6da9ff'];

const gameCanvas = document.querySelector('#game');
const minimap = document.querySelector('#minimap');
const statusNode = document.querySelector('#unitStatus');
const zoneCountNode = document.querySelector('#zoneCount');
const ownedZoneNode = document.querySelector('#ownedZoneCount');
const mineralNode = document.querySelector('#mineralCount');
const killNode = document.querySelector('#killCount');
const sunkenKillNode = document.querySelector('#sunkenKillCount');
const hydraCountNode = document.querySelector('#hydraCount');
const selectionCountNode = document.querySelector('#selectionCount');
const portraitLabelNode = document.querySelector('#portraitLabel');
const selectionTitleNode = document.querySelector('#selectionTitle');
const upgradePanelNode = document.querySelector('#upgradePanel');
const upgradeStatsNode = document.querySelector('#upgradeStats');
const balanceNoteNode = document.querySelector('#balanceNote');

const ctx = gameCanvas.getContext('2d');
const miniCtx = minimap.getContext('2d');
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d');
const map = buildClassicMap();
const simulation = createSimulation(map, { localTeam: LOCAL_TEAM });
initializeCombatState(simulation, map);
initializeUpgradeBuildings(simulation);
initializeBeaconSystem(simulation, map);

const localHomeZone = map.zones.find(
  (zone) => zone.ownerSlot === simulation.localPlayerSlot,
) ?? map.zones[0];

const initialOverlord = simulation.units.find(
  (unit) => unit.type === 'overlord' && unit.ownerSlot === simulation.localPlayerSlot,
);
const selectedIds = new Set(initialOverlord ? [initialOverlord.id] : []);
let selectedBuildingId = null;

zoneCountNode.textContent = String(map.zones.length);

const camera = {
  x: 0,
  y: 0,
};

const input = {
  keys: new Set(),
  pointerX: 0,
  pointerY: 0,
  inside: false,
  drag: null,
};

let viewportWidth = 1;
let viewportHeight = 1;
let lastFrame = performance.now();
let minimapAccumulator = 0;
let visionSources = getVisionSources(simulation, map, LOCAL_TEAM);
let transientStatus = '';
let transientStatusMs = 0;
const soundedEffects = new WeakSet();

function resizeCanvas() {
  const rect = gameCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  viewportWidth = Math.max(1, rect.width);
  viewportHeight = Math.max(1, rect.height);
  gameCanvas.width = Math.round(rect.width * dpr);
  gameCanvas.height = Math.round(rect.height * dpr);
  fogCanvas.width = Math.max(1, Math.ceil(viewportWidth));
  fogCanvas.height = Math.max(1, Math.ceil(viewportHeight));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  clampCamera(camera, map, viewportWidth, viewportHeight);
}

function centerCameraOnLocalHome() {
  const focusX = initialOverlord
    ? (localHomeZone.x * 2 + initialOverlord.x) / 3 : localHomeZone.x;
  const focusY = initialOverlord
    ? (localHomeZone.y * 2 + initialOverlord.y) / 3 : localHomeZone.y;
  camera.x = focusX - viewportWidth / 2;
  camera.y = focusY - viewportHeight / 2;
  clampCamera(camera, map, viewportWidth, viewportHeight);
}

function screenToWorld(x, y) {
  return { x: camera.x + x, y: camera.y + y };
}

function visibleWorldPoint(x, y, margin = 0) {
  return (
    x >= camera.x - margin
    && y >= camera.y - margin
    && x <= camera.x + viewportWidth + margin
    && y <= camera.y + viewportHeight + margin
  );
}

function pointVisible(x, y) {
  for (const source of visionSources) {
    const dx = x - source.x;
    const dy = y - source.y;
    if (dx * dx + dy * dy <= source.radius * source.radius) return true;
  }
  return false;
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
  if (input.inside && !input.drag) {
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

function drawTerrain() {
  drawIndustrialTerrain(ctx, map, camera, viewportWidth, viewportHeight, 1, isWalkableTile);
}

function drawSunken(zone, x, y, color, visible) {
  if (!visible || zone.sunkenHp <= 0) return;
  drawRtsSunken(ctx, zone, {
    x,
    y,
    scale: 1,
    teamColor: color,
    timeMs: performance.now(),
    effects: simulation.effects,
  });
}

function drawZones() {
  for (const zone of map.zones) {
    if (!visibleWorldPoint(zone.x, zone.y, zone.radius + 60)) continue;
    const zoneVisible = zone.ownerTeam === LOCAL_TEAM || pointVisible(zone.x, zone.y);
    const x = zone.x - camera.x;
    const y = zone.y - camera.y;

    if (zoneVisible && zone.ownerTeam !== null) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = teamColors[zone.ownerTeam];
      ctx.beginPath();
      ctx.ellipse(x, y + 12, 46, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (zoneVisible) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#43e6b1';
      ctx.beginPath();
      ctx.ellipse(x, y, 58, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#6ff5c8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();
      ctx.restore();
    }

    if (zone.ownerTeam !== null) {
      drawSunken(zone, x, y + 27, teamColors[zone.ownerTeam], zoneVisible);
    }
  }
}

function drawUpgradeBuildings() {
  for (const building of simulation.upgradeBuildings ?? []) {
    if (!visibleWorldPoint(building.x, building.y, 48)) continue;
    if (!(building.team === LOCAL_TEAM || pointVisible(building.x, building.y))) continue;

    const x = building.x - camera.x;
    const y = building.y - camera.y;
    const selected = selectedBuildingId === building.id;

    ctx.save();
    ctx.translate(x, y);

    if (selected) {
      ctx.strokeStyle = '#7cff91';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 29, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = building.type === 'hydra-den' ? '#3b2343' : '#253d32';
    ctx.strokeStyle = teamColors[building.team];
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (building.type === 'hydra-den') {
      ctx.moveTo(0, -20);
      ctx.lineTo(20, -5);
      ctx.lineTo(13, 18);
      ctx.lineTo(-13, 18);
      ctx.lineTo(-20, -5);
    } else {
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8 - Math.PI / 8;
        const px = Math.cos(angle) * 20;
        const py = Math.sin(angle) * 20;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#eaf7e7';
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(building.shortLabel, 0, 1);

    ctx.fillStyle = '#101719';
    ctx.fillRect(-22, -29, 44, 4);
    ctx.fillStyle = '#74e68e';
    ctx.fillRect(-22, -29, 44 * Math.max(0, building.hp / building.maxHp), 4);
    ctx.restore();
  }
}

function drawHydra(unit, selected) {
  drawRtsUnit(ctx, unit, {
    x: unit.x - camera.x,
    y: unit.y - camera.y,
    scale: 1,
    selected,
    teamColor: teamColors[unit.team],
    timeMs: performance.now(),
    moving: unit.pathIndex < unit.path.length,
    effects: simulation.effects,
  });
}

function drawOverlord(unit, selected) {
  drawRtsUnit(ctx, unit, {
    x: unit.x - camera.x,
    y: unit.y - camera.y,
    scale: 1,
    selected,
    teamColor: teamColors[unit.team],
    timeMs: performance.now(),
    moving: unit.pathIndex < unit.path.length,
    effects: simulation.effects,
  });
}

function unitIsVisible(unit) {
  return unit.team === LOCAL_TEAM || pointVisible(unit.x, unit.y);
}

function drawClassicBeacons() {
  const timeMs = performance.now();
  for (const pad of beaconPadsForPlayer(simulation, simulation.localPlayerSlot)) {
    if (!visibleWorldPoint(pad.x, pad.y, 40)) continue;
    drawRtsBeacon(ctx, pad, {
      x: pad.x - camera.x,
      y: pad.y - camera.y,
      scale: 1,
      timeMs,
    });
  }
}

function drawUnits() {
  for (const unit of simulation.units) {
    if (!visibleWorldPoint(unit.x, unit.y, 40) || !unitIsVisible(unit)) continue;
    const selected = selectedIds.has(unit.id);
    if (unit.type === 'hydra') drawHydra(unit, selected);
    else if (unit.type === 'overlord') drawOverlord(unit, selected);
    else if (unit.type === 'zealot') {
      drawRtsUnit(ctx, unit, {
        x: unit.x - camera.x,
        y: unit.y - camera.y,
        scale: 1,
        selected,
        teamColor: teamColors[unit.team],
        timeMs: performance.now(),
        moving: unit.pathIndex < unit.path.length,
        effects: simulation.effects,
      });
    }
  }
}

function drawCombatEffects() {
  const visibleEffects = simulation.effects.filter((effect) => pointVisible(effect.x2, effect.y2));
  drawRtsEffects(ctx, visibleEffects, camera, 1, performance.now());
}

function drawFog() {
  fogCtx.save();
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  fogCtx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  fogCtx.fillRect(0, 0, viewportWidth, viewportHeight);
  fogCtx.globalCompositeOperation = 'destination-out';
  fogCtx.fillStyle = 'rgba(0,0,0,1)';

  for (const source of visionSources) {
    if (!visibleWorldPoint(source.x, source.y, source.radius)) continue;
    const x = source.x - camera.x;
    const y = source.y - camera.y;
    fogCtx.beginPath();
    fogCtx.arc(x, y, source.radius, 0, Math.PI * 2);
    fogCtx.fill();
  }
  fogCtx.restore();

  ctx.drawImage(fogCanvas, 0, 0, viewportWidth, viewportHeight);
}

function drawSelectionBox() {
  if (!input.drag) return;
  const left = Math.min(input.drag.startX, input.drag.currentX);
  const top = Math.min(input.drag.startY, input.drag.currentY);
  const width = Math.abs(input.drag.currentX - input.drag.startX);
  const height = Math.abs(input.drag.currentY - input.drag.startY);
  ctx.fillStyle = 'rgba(82, 225, 142, 0.08)';
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = '#6ce486';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, width, height);
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
      const worldX = (x + 0.5) * map.tileSize;
      const worldY = (y + 0.5) * map.tileSize;
      miniCtx.fillStyle = pointVisible(worldX, worldY) ? '#39494f' : '#11191c';
      miniCtx.fillRect(
        x * map.tileSize * scaleX,
        y * map.tileSize * scaleY,
        map.tileSize * scaleX + 1,
        map.tileSize * scaleY + 1,
      );
    }
  }

  for (const zone of map.zones) {
    if (!(zone.ownerTeam === LOCAL_TEAM || pointVisible(zone.x, zone.y))) continue;
    miniCtx.fillStyle = zone.ownerTeam === null ? '#86969a' : teamColors[zone.ownerTeam];
    miniCtx.beginPath();
    miniCtx.arc(zone.x * scaleX, zone.y * scaleY, zone.ownerTeam === null ? 2 : 4, 0, Math.PI * 2);
    miniCtx.fill();
  }

  for (const pad of beaconPadsForPlayer(simulation, simulation.localPlayerSlot)) {
    miniCtx.fillStyle = '#a5edf4';
    miniCtx.fillRect(pad.x * scaleX - 1, pad.y * scaleY - 1, 2, 2);
  }

  for (const building of simulation.upgradeBuildings ?? []) {
    if (building.hp <= 0) continue;
    if (!(building.team === LOCAL_TEAM || pointVisible(building.x, building.y))) continue;
    const own = building.ownerSlot === simulation.localPlayerSlot;
    const x = building.x * scaleX;
    const y = building.y * scaleY;
    const size = own ? 5 : 4;
    miniCtx.fillStyle = '#091113';
    miniCtx.fillRect(x - size / 2 - 1, y - size / 2 - 1, size + 2, size + 2);
    miniCtx.strokeStyle = teamColors[building.team] ?? '#dbe8e8';
    miniCtx.lineWidth = own ? 1.3 : 1;
    miniCtx.strokeRect(x - size / 2, y - size / 2, size, size);
  }

  for (const unit of simulation.units) {
    if (!unitIsVisible(unit)) continue;
    miniCtx.fillStyle = unit.type === 'overlord'
      ? '#e68ad0'
      : (unit.type === 'zealot' ? '#fff0a6' : teamColors[unit.team]);
    miniCtx.beginPath();
    miniCtx.arc(
      unit.x * scaleX,
      unit.y * scaleY,
      minimapUnitRadius(unit.type, unit.ownerSlot === simulation.localPlayerSlot),
      0,
      Math.PI * 2,
    );
    miniCtx.fill();
  }

  miniCtx.strokeStyle = '#eaffff';
  miniCtx.lineWidth = 1;
  miniCtx.beginPath();
  miniCtx.arc(localHomeZone.x * scaleX, localHomeZone.y * scaleY, 6, 0, Math.PI * 2);
  miniCtx.stroke();

  const view = cameraRect(camera, viewportWidth, viewportHeight);
  miniCtx.strokeStyle = '#e7fbff';
  miniCtx.lineWidth = 1.4;
  miniCtx.strokeRect(
    view.x * scaleX,
    view.y * scaleY,
    view.width * scaleX,
    view.height * scaleY,
  );
}

function pruneSelection() {
  const live = new Set(simulation.units.map((unit) => unit.id));
  for (const id of selectedIds) {
    if (!live.has(id)) selectedIds.delete(id);
  }
}

function renderUpgradePanel(building) {
  if (!building) {
    upgradePanelNode.hidden = true;
    return;
  }

  upgradePanelNode.hidden = false;
  const player = getPlayerState(simulation, simulation.localPlayerSlot);
  const options = upgradeOptionsForBuilding(building);
  const attack = player.upgrades.attack;
  const defense = player.upgrades.defense;
  const range = player.upgrades.range;
  const speed = player.upgrades.speed;

  upgradeStatsNode.textContent = `공격 +${attack} · 방어 +${defense} · 사거리 ${range ? 'UP' : '기본'} · 이동속도 ${speed ? 'UP' : '기본'}`;

  const sunkenDamage = calculateSunkenDamage(simulation, simulation.localPlayerSlot);
  const hydraVsSunken = calculateHydraDamage(simulation, simulation.localPlayerSlot, SUNKEN_ARMOR);
  const attackRange = calculateHydraAttackRange(simulation, simulation.localPlayerSlot);
  balanceNoteNode.textContent = `현재 성큰→히드라 ${sunkenDamage} 피해 · 히드라→성큰 ${hydraVsSunken} 피해 · 사거리 ${attackRange}px · 방어 +161부터 성큰 한 방을 생존합니다.`;

  for (const button of upgradePanelNode.querySelectorAll('button[data-upgrade]')) {
    const key = button.dataset.upgrade;
    const definition = UPGRADE_DEFINITIONS[key];
    const compatible = options.some((option) => option.key === key);
    button.hidden = !compatible;
    if (!compatible) continue;

    const state = upgradeButtonState(simulation, simulation.localPlayerSlot, building, key);
    const levelText = definition.max === 1
      ? (state.level >= 1 ? '완료' : '업그레이드')
      : `+${state.level}/${state.max}`;
    button.textContent = `${definition.label} ${levelText} · ${definition.cost} 미네랄`;
    button.disabled = !state.enabled;
  }
}

function updateHud() {
  pruneSelection();
  const player = getPlayerState(simulation, simulation.localPlayerSlot);
  const building = getUpgradeBuilding(simulation, selectedBuildingId);
  mineralNode.textContent = String(player.minerals);
  killNode.textContent = String(player.kills);
  sunkenKillNode.textContent = String(player.sunkenKills);
  ownedZoneNode.textContent = String(controlledZoneCount(map, simulation.localPlayerSlot));
  hydraCountNode.textContent = String(playerHydraCount(simulation, simulation.localPlayerSlot));
  selectionCountNode.textContent = String(selectedIds.size);

  if (transientStatusMs > 0) {
    statusNode.textContent = transientStatus;
    return;
  }
  if (selectedIds.size === 0) {
    statusNode.textContent = '선택 없음 · 병력을 드래그해서 선택하세요.';
    return;
  }

  let hydras = 0;
  let overlords = 0;
  let zealots = 0;
  for (const unit of simulation.units) {
    if (!selectedIds.has(unit.id)) continue;
    if (unit.type === 'hydra') hydras += 1;
    if (unit.type === 'overlord') overlords += 1;
    if (unit.type === 'zealot') zealots += 1;
  }
  const parts = [];
  if (hydras) parts.push(`Hydralisk × ${hydras}`);
  if (overlords) parts.push(`Overlord × ${overlords}`);
  if (zealots) parts.push(`Beacon Zealot × ${zealots}`);
  statusNode.textContent = `${parts.join(' · ')} · 우클릭 이동 / 접전 시 자동 공격`;
}

function updateBuildingHud() {
  const building = getUpgradeBuilding(simulation, selectedBuildingId);
  if (!building) {
    renderUpgradePanel(null);
    const selectedUnits = simulation.units.filter((unit) => selectedIds.has(unit.id));
    const zealotOnly = selectedUnits.length > 0
      && selectedUnits.every((unit) => unit.type === 'zealot');
    if (zealotOnly) {
      portraitLabelNode.textContent = 'ZL';
      selectionTitleNode.textContent = 'Beacon Zealot';
      if (transientStatusMs <= 0) {
        statusNode.textContent = '8방향 비콘 칸으로 이동하면 모든 히드라가 대응 Zone으로 공격 이동합니다.';
      }
      return;
    }
    portraitLabelNode.textContent = 'HY';
    selectionTitleNode.textContent = 'Combat Group';
    return;
  }

  selectedIds.clear();
  selectionCountNode.textContent = '1';
  portraitLabelNode.textContent = building.shortLabel;
  selectionTitleNode.textContent = building.label;
  renderUpgradePanel(building);

  if (transientStatusMs <= 0) {
    statusNode.textContent = `HP ${Math.ceil(building.hp)} / ${building.maxHp} · 이 건물에서 전용 업그레이드를 구매합니다.`;
  }
}

function render(forceMinimap = false) {
  visionSources = getVisionSources(simulation, map, LOCAL_TEAM);
  ctx.save();
  drawTerrain();
  drawFog();
  drawZones();
  drawClassicBeacons();
  drawUpgradeBuildings();
  drawUnits();
  drawCombatEffects();
  drawSelectionBox();
  ctx.restore();

  if (forceMinimap || minimapAccumulator >= 160) {
    drawMinimap();
    minimapAccumulator = 0;
  }
}

function selectFromDrag() {
  const drag = input.drag;
  if (!drag) return;
  const startWorld = screenToWorld(drag.startX, drag.startY);
  const endWorld = screenToWorld(drag.currentX, drag.currentY);
  const screenDistance = Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY);
  selectedIds.clear();

  if (screenDistance < 6) {
    const building = nearestUpgradeBuilding(simulation, simulation.localPlayerSlot, endWorld, 32);
    if (building) {
      selectedBuildingId = building.id;
      updateHud();
      updateBuildingHud();
      return;
    }
  }
  selectedBuildingId = null;

  if (screenDistance < 6) {
    const unit = nearestSelectableUnit(simulation, simulation.localPlayerSlot, endWorld, 24);
    if (unit) selectedIds.add(unit.id);
  } else {
    for (const id of selectUnitsInRect(simulation, simulation.localPlayerSlot, {
      x1: startWorld.x,
      y1: startWorld.y,
      x2: endWorld.x,
      y2: endWorld.y,
    })) selectedIds.add(id);
  }
  if (selectedIds.size > 0) playUiCue('select');
  updateHud();
}

function issueMoveCommand(screenX, screenY) {
  if (selectedIds.size === 0) {
    transientStatus = '이동할 유닛을 먼저 선택하세요.';
    transientStatusMs = 1400;
    return;
  }
  const target = screenToWorld(screenX, screenY);
  const ordered = assignMoveOrders(map, simulation, selectedIds, target);
  if (ordered > 0) playUiCue('move');
  transientStatus = ordered > 0
    ? `${ordered}개 유닛 이동 명령 · 적과 접촉하면 자동 공격합니다.`
    : '이동 실패 · 연결된 통로가 없는 위치입니다.';
  transientStatusMs = 1300;
}

function frame(now) {
  const deltaMs = Math.min(50, now - lastFrame);
  const deltaSeconds = deltaMs / 1000;
  lastFrame = now;
  minimapAccumulator += deltaMs;
  transientStatusMs = Math.max(0, transientStatusMs - deltaMs);

  updateCamera(deltaSeconds);
  stepProduction(simulation, map, deltaMs);
  stepFormationMovement(simulation, map, deltaMs);
  const beaconEvents = stepBeaconSystem(simulation, map, deltaMs);
  const localBeacon = beaconEvents.find((event) => event.ownerSlot === simulation.localPlayerSlot);
  if (localBeacon) {
    transientStatus = `비콘 ${localBeacon.direction} → Zone ${localBeacon.targetZoneId} · 히드라 ${localBeacon.ordered}마리 전체 공격 이동`;
    transientStatusMs = 1900;
  }
  stepCombat(simulation, map, deltaMs);
  for (const effect of simulation.effects) {
    if (!soundedEffects.has(effect) && (effect.elapsedMs ?? 0) <= deltaMs + 1) {
      soundedEffects.add(effect);
      playCombatImpact(effect);
    }
  }
  const captures = stepCapture(simulation, map);
  stepPlayerTriggerEconomy(simulation, map, simulation.localPlayerSlot, deltaMs);
  if (captures.length > 0) {
    transientStatus = `점령 성공 · Zone ${captures.map((item) => item.zoneId).join(', ')} · 250 미네랄 차감`;
    transientStatusMs = 2200;
  }

  updateHud();
  updateBuildingHud();
  render();
  requestAnimationFrame(frame);
}

for (const button of upgradePanelNode.querySelectorAll('button[data-upgrade]')) {
  button.addEventListener('click', () => {
    const building = getUpgradeBuilding(simulation, selectedBuildingId);
    if (!building) return;

    const key = button.dataset.upgrade;
    const result = purchaseUpgrade(simulation, simulation.localPlayerSlot, building.id, key);
    if (result.ok) {
      playUiCue('upgrade');
      const definition = UPGRADE_DEFINITIONS[key];
      transientStatus = `${definition.label} 업그레이드 완료 · 현재 ${result.level}/${definition.max} · -${result.cost} 미네랄`;
      transientStatusMs = 1500;
    } else {
      const reasons = {
        'insufficient-minerals': '미네랄이 부족합니다.',
        'max-level': '이미 최대 업그레이드입니다.',
        'wrong-building': '이 건물에서는 해당 업그레이드를 할 수 없습니다.',
        'not-owned': '내 건물에서만 업그레이드할 수 있습니다.',
      };
      transientStatus = reasons[result.reason] ?? '업그레이드할 수 없습니다.';
      transientStatusMs = 1400;
    }

    updateHud();
    updateBuildingHud();
  });
}

document.querySelector('#homeCameraButton')?.addEventListener('click', () => {
  centerCameraOnLocalHome();
  render(true);
});

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyH') {
    centerCameraOnLocalHome();
    render(true);
    event.preventDefault();
    return;
  }
  input.keys.add(event.code);
  if (event.code.startsWith('Arrow')) event.preventDefault();
});
window.addEventListener('keyup', (event) => input.keys.delete(event.code));

gameCanvas.addEventListener('pointerdown', (event) => {
  primeRtsAudio();
  if (event.button !== 0) return;
  const rect = gameCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  input.drag = { startX: x, startY: y, currentX: x, currentY: y };
  gameCanvas.setPointerCapture(event.pointerId);
});

gameCanvas.addEventListener('pointermove', (event) => {
  const rect = gameCanvas.getBoundingClientRect();
  input.pointerX = event.clientX - rect.left;
  input.pointerY = event.clientY - rect.top;
  input.inside = true;
  if (input.drag) {
    input.drag.currentX = input.pointerX;
    input.drag.currentY = input.pointerY;
  }
});

gameCanvas.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !input.drag) return;
  const rect = gameCanvas.getBoundingClientRect();
  input.drag.currentX = event.clientX - rect.left;
  input.drag.currentY = event.clientY - rect.top;
  selectFromDrag();
  input.drag = null;
  gameCanvas.releasePointerCapture(event.pointerId);
});

gameCanvas.addEventListener('pointercancel', () => {
  input.drag = null;
});
gameCanvas.addEventListener('mouseleave', () => {
  input.inside = false;
});
gameCanvas.addEventListener('contextmenu', (event) => {
  primeRtsAudio();
  event.preventDefault();
  const rect = gameCanvas.getBoundingClientRect();
  issueMoveCommand(event.clientX - rect.left, event.clientY - rect.top);
});

minimap.addEventListener('pointerdown', (event) => {
  const rect = minimap.getBoundingClientRect();
  const localX = ((event.clientX - rect.left) / rect.width) * minimap.width;
  const localY = ((event.clientY - rect.top) / rect.height) * minimap.height;
  camera.x = ((localX / minimap.width) * map.worldWidth) - viewportWidth / 2;
  camera.y = ((localY / minimap.height) * map.worldHeight) - viewportHeight / 2;
  clampCamera(camera, map, viewportWidth, viewportHeight);
  render(true);
});

resizeCanvas();
centerCameraOnLocalHome();
updateHud();
render(true);
requestAnimationFrame(frame);
// selection combat readability milestone
import {
  inspectSelectedUnits,
  inspectSunken,
  nearestSelectableSunken,
} from '/src/game-inspection.mjs';
import {
  drawAttackFlash,
  drawEnhancedCombatEffects,
  drawRangeCircle,
  drawTargetReticle,
  renderDetailRows,
} from '/public/combat-readability.mjs';
const selectionDetailsNode = document.querySelector('#selectionDetails');
let selectedSunkenZoneId = null;

function teamLabel(team) {
  return team === LOCAL_TEAM ? 'Player 1' : `Team ${team + 1}`;
}

function selectedSunkenZone() {
  if (selectedSunkenZoneId === null) return null;
  const zone = map.zones.find((candidate) => candidate.id === selectedSunkenZoneId) ?? null;
  if (!zone || zone.ownerTeam === null || zone.sunkenHp <= 0) {
    selectedSunkenZoneId = null;
    return null;
  }
  return zone;
}

function describeTarget(target) {
  if (!target) return '없음';
  if (target.kind === 'sunken') return `Sunken · Zone ${target.zoneId}`;
  if (target.kind === 'unit') {
    const unit = simulation.units.find((candidate) => candidate.id === target.id);
    return unit ? `${unit.type} #${unit.id}` : `Unit #${target.id}`;
  }
  return '없음';
}

function unitDetailRows(info) {
  if (!info) return [];
  const typeSummary = [
    info.counts.hydra ? `Hydra ${info.counts.hydra}` : '',
    info.counts.overlord ? `Overlord ${info.counts.overlord}` : '',
    info.counts.zealot ? `Zealot ${info.counts.zealot}` : '',
  ].filter(Boolean).join(' / ');

  return [
    ['Units', typeSummary || info.type],
    ['HP', `${Math.ceil(info.hp)} / ${Math.ceil(info.maxHp)}`],
    ['Attack', info.attack === null ? '-' : info.attack],
    ['Defense', info.defense === null ? (info.armor ?? '-') : info.defense],
    ['Range', info.range === null ? '-' : `${info.range}px`],
    ['Kills', info.kills],
    ['Order', info.order],
    ['Target', describeTarget(info.target)],
  ];
}

function sunkenDetailRows(zone) {
  const info = inspectSunken(zone);
  const accumulator = simulation.spawnAccumulators.get(zone.id) ?? 0;
  const production = Math.min(100, Math.round((accumulator / info.productionIntervalMs) * 100));
  const latestShot = [...simulation.effects].reverse().find(
    (effect) => effect.type === 'sunken-shot'
      && Math.hypot(effect.x1 - zone.x, effect.y1 - (zone.y + 27)) < 4,
  );
  return [
    ['Owner', teamLabel(info.team)],
    ['HP', `${Math.ceil(info.hp)} / ${info.maxHp}`],
    ['Attack', info.attack],
    ['Armor', info.armor],
    ['Range', `${info.range}px`],
    ['Production', `${production}% · 0.5s`],
    ['Zone', `Zone ${info.zoneId}`],
    ['Target', latestShot?.targetId ? `Unit #${latestShot.targetId}` : '없음'],
  ];
}

function buildingDetailRows(building) {
  const player = getPlayerState(simulation, building.ownerSlot);
  return [
    ['Owner', teamLabel(building.team)],
    ['HP', `${Math.ceil(building.hp)} / ${building.maxHp}`],
    ['Type', building.label],
    ['Attack Up', `+${player?.upgrades.attack ?? 0}`],
    ['Defense Up', `+${player?.upgrades.defense ?? 0}`],
    ['Range Up', player?.upgrades.range ? '완료' : '기본'],
    ['Speed Up', player?.upgrades.speed ? '완료' : '기본'],
    ['Status', building.hp > 0 ? 'Operational' : 'Destroyed'],
  ];
}

function updateReadabilitySelectionUi() {
  const sunken = selectedSunkenZone();
  const building = getUpgradeBuilding(simulation, selectedBuildingId);

  if (sunken) {
    selectedIds.clear();
    selectedBuildingId = null;
    selectionCountNode.textContent = '1';
    portraitLabelNode.textContent = 'SK';
    selectionTitleNode.textContent = `Sunken Colony · Zone ${sunken.id}`;
    upgradePanelNode.hidden = true;
    renderDetailRows(selectionDetailsNode, sunkenDetailRows(sunken));
    if (transientStatusMs <= 0) {
      const cycle = simulation.spawnAccumulators.get(sunken.id) ?? 0;
      const cyclePercent = Math.min(100, Math.round((cycle / 500) * 100));
      statusNode.textContent = `성큰 HP ${Math.ceil(sunken.sunkenHp)} · 생산 주기 ${cyclePercent}% · 공격 범위 176px`;
    }
    return;
  }

  if (building) {
    renderDetailRows(selectionDetailsNode, buildingDetailRows(building));
    return;
  }

  const info = inspectSelectedUnits(simulation, simulation.localPlayerSlot, selectedIds);
  if (!info) {
    renderDetailRows(selectionDetailsNode, []);
    return;
  }

  renderDetailRows(selectionDetailsNode, unitDetailRows(info));
  if (info.type === 'hydra') {
    portraitLabelNode.textContent = 'HY';
    selectionTitleNode.textContent = info.count === 1 ? 'Hydralisk' : `Hydralisk Group × ${info.count}`;
  } else if (info.type === 'overlord') {
    portraitLabelNode.textContent = 'OV';
    selectionTitleNode.textContent = 'Overlord';
  } else if (info.type === 'zealot') {
    portraitLabelNode.textContent = 'ZL';
    selectionTitleNode.textContent = 'Beacon Zealot';
  } else {
    portraitLabelNode.textContent = 'GR';
    selectionTitleNode.textContent = `Mixed Group × ${info.count}`;
  }
}

function targetWorldPoint(target) {
  if (!target) return null;
  if (target.kind === 'unit') {
    const unit = simulation.units.find((candidate) => candidate.id === target.id && candidate.hp > 0);
    if (!unit || !unitIsVisible(unit)) return null;
    return { x: unit.x, y: unit.y, label: `${unit.type.toUpperCase()} #${unit.id}` };
  }
  if (target.kind === 'sunken') {
    const zone = map.zones.find((candidate) => candidate.id === target.zoneId);
    if (!zone || zone.sunkenHp <= 0 || !pointVisible(zone.x, zone.y)) return null;
    return { x: zone.x, y: zone.y + 27, label: `SUNKEN Z${zone.id}` };
  }
  return null;
}

function drawReadabilityOverlay() {
  const info = inspectSelectedUnits(simulation, simulation.localPlayerSlot, selectedIds);
  if (info?.unit?.type === 'hydra') {
    drawRangeCircle(ctx, camera, info.unit.x, info.unit.y, info.range);
    const target = targetWorldPoint(info.target);
    if (target) drawTargetReticle(ctx, camera, target.x, target.y, target.label);
  }

  const sunken = selectedSunkenZone();
  if (sunken && (sunken.ownerTeam === LOCAL_TEAM || pointVisible(sunken.x, sunken.y))) {
    const x = sunken.x - camera.x;
    const y = sunken.y + 27 - camera.y;
    ctx.save();
    ctx.strokeStyle = '#7cff91';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawRangeCircle(ctx, camera, sunken.x, sunken.y + 27, 176, '#ffb36d');

    const latestShot = [...simulation.effects].reverse().find(
      (effect) => effect.type === 'sunken-shot'
        && Math.hypot(effect.x1 - sunken.x, effect.y1 - (sunken.y + 27)) < 4,
    );
    if (latestShot?.targetId) {
      const target = simulation.units.find((unit) => unit.id === latestShot.targetId && unit.hp > 0);
      if (target && unitIsVisible(target)) {
        drawTargetReticle(ctx, camera, target.x, target.y, `UNIT #${target.id}`);
      }
    }
  }

  for (const unit of simulation.units) {
    if (unit.type !== 'hydra' || !unitIsVisible(unit) || !visibleWorldPoint(unit.x, unit.y, 30)) continue;
    drawAttackFlash(ctx, camera, unit);
  }
  drawEnhancedCombatEffects(ctx, camera, simulation.effects, pointVisible);
}

let readabilityPointerDown = null;

gameCanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const rect = gameCanvas.getBoundingClientRect();
  readabilityPointerDown = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
});

gameCanvas.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !readabilityPointerDown) return;
  const rect = gameCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const distance = Math.hypot(x - readabilityPointerDown.x, y - readabilityPointerDown.y);
  readabilityPointerDown = null;

  if (distance >= 6) {
    selectedSunkenZoneId = null;
    return;
  }

  const world = screenToWorld(x, y);
  const zone = nearestSelectableSunken(map, world, 24);
  const visible = zone && (zone.ownerTeam === LOCAL_TEAM || pointVisible(zone.x, zone.y));
  if (!visible) {
    selectedSunkenZoneId = null;
    return;
  }

  selectedSunkenZoneId = zone.id;
  selectedIds.clear();
  selectedBuildingId = null;
  transientStatus = `Sunken Colony · Zone ${zone.id} 선택`;
  transientStatusMs = 900;
  updateReadabilitySelectionUi();
});

function readabilityFrame() {
  updateReadabilitySelectionUi();
  drawReadabilityOverlay();
  requestAnimationFrame(readabilityFrame);
}

requestAnimationFrame(readabilityFrame);
window.__hydraGame = { map, simulation, selectedIds, selectedBuildingId: () => selectedBuildingId };
