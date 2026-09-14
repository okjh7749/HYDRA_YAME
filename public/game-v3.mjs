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
  HYDRA_SPAWN_INTERVAL_MS,
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
import { createClassicMatchRuntime } from '/public/match-runtime.mjs';
import {
  CONTROL_ISLANDS,
  controlIslandForSlot,
  controlIslandWorldBounds,
} from '/src/game-infrastructure.mjs';
import { playerHudSnapshot } from '/src/game-ui-semantics.mjs';
import { CLASSIC_HYDRA_SPAWN_INTERVAL_MS } from '/src/game-rules.mjs';
import {
  FOG_EXPLORED,
  FOG_UNEXPLORED,
  FOG_VISIBLE,
  clientFogStateForTile,
  createClientFogMemory,
  minimapEventToWorld,
  setTextIfChanged,
  touchTapShouldIssueMove,
  updateClientFogMemory,
} from '/src/rts-client-shared.mjs';

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
const hudScopeNode = document.querySelector('#hudScopeLabel');
const matchTimerNode = document.querySelector('#matchTimer');
const teamBoardNode = document.querySelector('#teamBoard');
const matchOverlayNode = document.querySelector('#matchOverlay');
const selectionDetailsNode = document.querySelector('#selectionDetails');

const ctx = gameCanvas.getContext('2d');
const miniCtx = minimap.getContext('2d');
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d');
const map = buildClassicMap();
const simulation = createSimulation(map, {
  localTeam: LOCAL_TEAM,
  productionIntervalMs: CLASSIC_HYDRA_SPAWN_INTERVAL_MS,
});
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
let selectedSunkenZoneId = null;
const exploration = createClientFogMemory(map);
const matchRuntime = createClassicMatchRuntime({
  map,
  simulation,
  selectedIds,
  timerNode: matchTimerNode,
  teamBoard: teamBoardNode,
  matchOverlay: matchOverlayNode,
  teamColors,
});

setTextIfChanged(zoneCountNode, map.zones.length);

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
  touchMoveMode: false,
};

let viewportWidth = 1;
let viewportHeight = 1;
let lastFrame = performance.now();
let minimapAccumulator = 0;
let visionSources = getVisionSources(simulation, map, LOCAL_TEAM);
let transientStatus = '';
let transientStatusMs = 0;
let minimapPointerId = null;
let moveMarker = null;
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

function drawControlIslands() {
  for (const island of CONTROL_ISLANDS) {
    const own = island.slot === simulation.localPlayerSlot;
    const visible = own || simulation.match?.localMode === 'spectating' || pointVisible(island.x, island.y);
    if (!visible) continue;
    const bounds = controlIslandWorldBounds(island);
    const x = bounds.left - camera.x;
    const y = bounds.top - camera.y;
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    if (x > viewportWidth || y > viewportHeight || x + width < 0 || y + height < 0) continue;
    ctx.save();
    ctx.fillStyle = own ? 'rgba(22, 42, 47, 0.96)' : 'rgba(15, 28, 32, 0.9)';
    ctx.strokeStyle = own ? '#75d6d1' : '#49666b';
    ctx.lineWidth = own ? 2 : 1;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.restore();
  }
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
  if (simulation.match?.localMode === 'spectating') return;
  fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  const tileSize = map.tileSize;
  const left = Math.max(0, Math.floor(camera.x / tileSize));
  const top = Math.max(0, Math.floor(camera.y / tileSize));
  const right = Math.min(map.columns - 1, Math.ceil((camera.x + viewportWidth) / tileSize));
  const bottom = Math.min(map.rows - 1, Math.ceil((camera.y + viewportHeight) / tileSize));

  for (let tileY = top; tileY <= bottom; tileY += 1) {
    for (let tileX = left; tileX <= right; tileX += 1) {
      const fogState = clientFogStateForTile(exploration, map, visionSources, tileX, tileY);
      if (fogState === FOG_VISIBLE) continue;
      fogCtx.fillStyle = fogState === FOG_EXPLORED
        ? 'rgba(0, 0, 0, 0.66)'
        : 'rgba(0, 0, 0, 0.96)';
      fogCtx.fillRect(
        tileX * tileSize - camera.x,
        tileY * tileSize - camera.y,
        tileSize + 1,
        tileSize + 1,
      );
    }
  }

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

function drawMoveMarker() {
  if (!moveMarker || moveMarker.ttlMs <= 0) return;
  const x = moveMarker.x - camera.x;
  const y = moveMarker.y - camera.y;
  const progress = 1 - Math.max(0, moveMarker.ttlMs) / 620;
  const radius = 8 + progress * 12;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progress);
  ctx.strokeStyle = '#d9ff8d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.stroke();
  ctx.restore();
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
      const fogState = clientFogStateForTile(
        exploration,
        map,
        visionSources,
        x,
        y,
        simulation.match?.localMode === 'spectating',
      );
      miniCtx.fillStyle = fogState === FOG_VISIBLE
        ? '#465b62'
        : (fogState === FOG_EXPLORED ? '#182328' : '#030607');
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

  for (const island of CONTROL_ISLANDS) {
    const own = island.slot === simulation.localPlayerSlot;
    if (!(own || simulation.match?.localMode === 'spectating' || pointVisible(island.x, island.y))) continue;
    const bounds = controlIslandWorldBounds(island);
    miniCtx.fillStyle = '#0a1215';
    miniCtx.fillRect(
      bounds.left * scaleX,
      bounds.top * scaleY,
      (bounds.right - bounds.left) * scaleX,
      (bounds.bottom - bounds.top) * scaleY,
    );
    miniCtx.strokeStyle = own ? '#75d6d1' : '#49666b';
    miniCtx.lineWidth = own ? 1.4 : 0.8;
    miniCtx.strokeRect(
      bounds.left * scaleX,
      bounds.top * scaleY,
      (bounds.right - bounds.left) * scaleX,
      (bounds.bottom - bounds.top) * scaleY,
    );
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

  const homeX = localHomeZone.x * scaleX;
  const homeY = localHomeZone.y * scaleY;
  miniCtx.fillStyle = '#d9ff8d';
  miniCtx.strokeStyle = '#091113';
  miniCtx.lineWidth = 1;
  miniCtx.beginPath();
  miniCtx.moveTo(homeX, homeY - 6);
  miniCtx.lineTo(homeX + 6, homeY);
  miniCtx.lineTo(homeX, homeY + 6);
  miniCtx.lineTo(homeX - 6, homeY);
  miniCtx.closePath();
  miniCtx.fill();
  miniCtx.stroke();

  const view = cameraRect(camera, viewportWidth, viewportHeight);
  miniCtx.strokeStyle = '#f3fbff';
  miniCtx.lineWidth = 2.2;
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
    if (!upgradePanelNode.hidden) upgradePanelNode.hidden = true;
    delete upgradePanelNode.dataset.signature;
    return;
  }

  if (upgradePanelNode.hidden) upgradePanelNode.hidden = false;
  const player = getPlayerState(simulation, simulation.localPlayerSlot);
  const options = upgradeOptionsForBuilding(building);
  const signature = [
    building.id,
    Math.ceil(building.hp),
    player?.minerals ?? 0,
    player?.upgrades.attack ?? 0,
    player?.upgrades.defense ?? 0,
    player?.upgrades.range ?? 0,
    player?.upgrades.speed ?? 0,
  ].join(':');
  if (upgradePanelNode.dataset.signature === signature) return;
  upgradePanelNode.dataset.signature = signature;
  const attack = player.upgrades.attack;
  const defense = player.upgrades.defense;
  const range = player.upgrades.range;
  const speed = player.upgrades.speed;

  upgradeStatsNode.textContent = `공격 +${attack} · 방어 +${defense} · 사거리 ${range ? 'UP' : '기본'} · 이동속도 ${speed ? 'UP' : '기본'}`;

  const sunkenDamage = calculateSunkenDamage(simulation, simulation.localPlayerSlot);
  const hydraVsSunken = calculateHydraDamage(simulation, simulation.localPlayerSlot, SUNKEN_ARMOR);
  const attackRange = calculateHydraAttackRange(simulation, simulation.localPlayerSlot);
  balanceNoteNode.textContent = `현재 성큰→히드라 ${sunkenDamage} 피해 · 히드라→성큰 ${hydraVsSunken} 피해 · 사거리 ${attackRange}px · 공격/방어 업그레이드 효과가 전투에 즉시 반영됩니다.`;

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
  const hud = playerHudSnapshot(simulation, map, simulation.localPlayerSlot);
  setTextIfChanged(hudScopeNode, hud.scopeLabel);
  setTextIfChanged(mineralNode, hud.minerals);
  setTextIfChanged(killNode, hud.kills);
  setTextIfChanged(sunkenKillNode, hud.sunkenKills);
  setTextIfChanged(ownedZoneNode, hud.zones);
  setTextIfChanged(hydraCountNode, hud.hydras);
  setTextIfChanged(selectionCountNode, selectedIds.size);

  if (transientStatusMs > 0) {
    setTextIfChanged(statusNode, transientStatus);
    return;
  }
  if (selectedIds.size === 0) {
    setTextIfChanged(statusNode, '선택 없음 · 병력을 드래그해서 선택하세요.');
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
  setTextIfChanged(statusNode, `${parts.join(' · ')} · 우클릭/터치 이동 · 접전 시 자동 공격`);
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
        statusNode.textContent = '비콘 칸으로 이동하면 내 P 슬롯 히드라만 대응 Zone으로 공격 이동합니다.';
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
  updateClientFogMemory(
    exploration,
    map,
    visionSources,
    simulation.match?.localMode === 'spectating',
  );
  ctx.save();
  drawTerrain();
  drawControlIslands();
  drawFog();
  drawZones();
  drawClassicBeacons();
  drawUpgradeBuildings();
  drawUnits();
  drawCombatEffects();
  drawSelectionBox();
  drawReadabilityOverlay();
  drawMoveMarker();
  ctx.restore();

  if (forceMinimap || minimapAccumulator >= 140) {
    drawMinimap();
    minimapAccumulator = 0;
  }
}

function touchHitSelectable(world) {
  if (nearestUpgradeBuilding(simulation, simulation.localPlayerSlot, world, 34)) return true;
  if (nearestSelectableUnit(simulation, simulation.localPlayerSlot, world, 28)) return true;
  const sunken = nearestSelectableSunken(map, world, 24);
  return Boolean(sunken && (sunken.ownerTeam === LOCAL_TEAM || pointVisible(sunken.x, sunken.y)));
}

function selectFromDrag() {
  const drag = input.drag;
  if (!drag) return;
  const startWorld = screenToWorld(drag.startX, drag.startY);
  const endWorld = screenToWorld(drag.currentX, drag.currentY);
  const screenDistance = Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY);
  selectedIds.clear();
  selectedSunkenZoneId = null;

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
  if (matchRuntime.commandsLocked()) {
    transientStatus = simulation.match?.localMode === 'spectating'
      ? '관전 중에는 유닛 명령을 내릴 수 없습니다.'
      : '카운트다운이 끝나면 이동 명령을 내릴 수 있습니다.';
    transientStatusMs = 1200;
    return;
  }
  if (selectedIds.size === 0) {
    transientStatus = '이동할 유닛을 먼저 선택하세요.';
    transientStatusMs = 1400;
    return;
  }
  const target = screenToWorld(screenX, screenY);
  const ordered = assignMoveOrders(map, simulation, selectedIds, target, { orderType: 'attack-move' });
  if (ordered > 0) moveMarker = { x: target.x, y: target.y, ttlMs: 620 };
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
  if (moveMarker) {
    moveMarker.ttlMs -= deltaMs;
    if (moveMarker.ttlMs <= 0) moveMarker = null;
  }

  matchRuntime.step(deltaMs);
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
  updateReadabilitySelectionUi();
  render();
  requestAnimationFrame(frame);
}

for (const button of upgradePanelNode.querySelectorAll('button[data-upgrade]')) {
  button.addEventListener('click', (event) => {
    if (matchRuntime.commandsLocked()) return;
    const building = getUpgradeBuilding(simulation, selectedBuildingId);
    if (!building) return;

    const key = button.dataset.upgrade;
    const definition = UPGRADE_DEFINITIONS[key];
    const attempts = event.shiftKey && definition.max > 1 ? 5 : 1;
    let result = null;
    let lastSuccess = null;
    let bought = 0;
    let spent = 0;
    for (let index = 0; index < attempts; index += 1) {
      const next = purchaseUpgrade(simulation, simulation.localPlayerSlot, building.id, key);
      result = next;
      if (!next.ok) break;
      lastSuccess = next;
      bought += 1;
      spent += next.cost;
    }
    if (bought > 0) {
      playUiCue('upgrade');
      transientStatus = `${definition.label} +${bought}단계 · 현재 ${lastSuccess.level}/${definition.max} · -${spent} 미네랄`;
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

document.querySelector('#touchMoveButton')?.addEventListener('click', (event) => {
  input.touchMoveMode = !input.touchMoveMode;
  event.currentTarget.setAttribute('aria-pressed', String(input.touchMoveMode));
  transientStatus = input.touchMoveMode
    ? '이동 모드 · 전장에서 목적지를 탭하세요.'
    : '이동 모드 해제';
  transientStatusMs = 1000;
});

document.querySelector('#helpToggleButton')?.addEventListener('click', (event) => {
  const panel = document.querySelector('#helpPanel');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
});

document.querySelector('#restartMatchButton')?.addEventListener('click', () => window.location.reload());
document.querySelector('#backLobbyButton')?.addEventListener('click', () => { window.location.href = '/'; });

function selectOwnedUnitType(type) {
  selectedBuildingId = null;
  selectedSunkenZoneId = null;
  selectedIds.clear();
  for (const unit of simulation.units) {
    if (unit.hp > 0 && unit.ownerSlot === simulation.localPlayerSlot && unit.type === type) {
      selectedIds.add(unit.id);
    }
  }
  if (selectedIds.size > 0) playUiCue('select');
  transientStatus = selectedIds.size > 0
    ? `${type === 'hydra' ? '히드라' : type === 'overlord' ? '오버로드' : '비콘 질럿'} ${selectedIds.size}기 빠른 선택`
    : '선택할 유닛이 없습니다.';
  transientStatusMs = 900;
  updateHud();
  updateBuildingHud();
  updateReadabilitySelectionUi();
}

function selectOwnedBuildingType(type) {
  const building = (simulation.upgradeBuildings ?? []).find(
    (candidate) => candidate.ownerSlot === simulation.localPlayerSlot
      && candidate.type === type
      && candidate.hp > 0,
  );
  if (!building) {
    transientStatus = '선택할 업그레이드 건물이 없습니다.';
    transientStatusMs = 900;
    return;
  }
  selectedIds.clear();
  selectedSunkenZoneId = null;
  selectedBuildingId = building.id;
  transientStatus = `${building.label} 빠른 선택`;
  transientStatusMs = 900;
  updateHud();
  updateBuildingHud();
  updateReadabilitySelectionUi();
}

function centerCameraOnSelection() {
  const units = simulation.units.filter((unit) => selectedIds.has(unit.id) && unit.hp > 0);
  let focus = null;
  if (units.length > 0) {
    const center = units.reduce((sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }), { x: 0, y: 0 });
    focus = { x: center.x / units.length, y: center.y / units.length };
  } else {
    const building = getUpgradeBuilding(simulation, selectedBuildingId);
    if (building?.hp > 0) focus = building;
  }
  if (!focus) return false;
  camera.x = focus.x - viewportWidth / 2;
  camera.y = focus.y - viewportHeight / 2;
  clampCamera(camera, map, viewportWidth, viewportHeight);
  render(true);
  return true;
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', (event) => {
  if (!event.repeat && event.code === 'Digit1') {
    selectOwnedUnitType('hydra');
    event.preventDefault();
    return;
  }
  if (!event.repeat && event.code === 'Digit2') {
    selectOwnedUnitType('overlord');
    event.preventDefault();
    return;
  }
  if (!event.repeat && event.code === 'Digit3') {
    selectOwnedUnitType('zealot');
    event.preventDefault();
    return;
  }
  if (!event.repeat && event.code === 'Digit4') {
    selectOwnedBuildingType('hydra-den');
    event.preventDefault();
    return;
  }
  if (!event.repeat && event.code === 'Digit5') {
    selectOwnedBuildingType('evolution');
    event.preventDefault();
    return;
  }
  if (event.code === 'Space') {
    centerCameraOnSelection();
    event.preventDefault();
    return;
  }
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
  if (event.pointerType === 'touch' && input.touchMoveMode && selectedIds.size > 0) {
    issueMoveCommand(x, y);
    input.touchMoveMode = false;
    const moveButton = document.querySelector('#touchMoveButton');
    if (moveButton) moveButton.setAttribute('aria-pressed', 'false');
    event.preventDefault();
    return;
  }
  input.drag = {
    startX: x,
    startY: y,
    currentX: x,
    currentY: y,
    lastX: x,
    lastY: y,
    pointerType: event.pointerType,
    panning: false,
  };
  gameCanvas.setPointerCapture(event.pointerId);
  if (event.pointerType === 'touch') event.preventDefault();
});

gameCanvas.addEventListener('pointermove', (event) => {
  const rect = gameCanvas.getBoundingClientRect();
  input.pointerX = event.clientX - rect.left;
  input.pointerY = event.clientY - rect.top;
  input.inside = event.pointerType !== 'touch';
  if (!input.drag) return;

  input.drag.currentX = input.pointerX;
  input.drag.currentY = input.pointerY;
  if (input.drag.pointerType === 'touch') {
    const distance = Math.hypot(
      input.drag.currentX - input.drag.startX,
      input.drag.currentY - input.drag.startY,
    );
    if (distance > 12) input.drag.panning = true;
    if (input.drag.panning) {
      camera.x += input.drag.lastX - input.drag.currentX;
      camera.y += input.drag.lastY - input.drag.currentY;
      clampCamera(camera, map, viewportWidth, viewportHeight);
      input.drag.startX = input.drag.currentX;
      input.drag.startY = input.drag.currentY;
    }
    input.drag.lastX = input.drag.currentX;
    input.drag.lastY = input.drag.currentY;
    event.preventDefault();
  }
});

gameCanvas.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !input.drag) return;
  const rect = gameCanvas.getBoundingClientRect();
  input.drag.currentX = event.clientX - rect.left;
  input.drag.currentY = event.clientY - rect.top;
  const wasPanning = Boolean(input.drag.panning);
  const dragDistance = Math.hypot(
    input.drag.currentX - input.drag.startX,
    input.drag.currentY - input.drag.startY,
  );
  const world = screenToWorld(input.drag.currentX, input.drag.currentY);
  if (!wasPanning && touchTapShouldIssueMove({
    pointerType: event.pointerType,
    selectedCount: selectedIds.size,
    hitSelectable: touchHitSelectable(world),
    dragDistance,
  })) {
    issueMoveCommand(input.drag.currentX, input.drag.currentY);
  } else if (!wasPanning) {
    selectFromDrag();
  }
  input.drag = null;
  if (gameCanvas.hasPointerCapture(event.pointerId)) gameCanvas.releasePointerCapture(event.pointerId);
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
  if (event.button !== 0) return;
  minimapPointerId = event.pointerId;
  minimap.setPointerCapture(event.pointerId);
  const world = minimapEventToWorld(event, minimap, map);
  camera.x = world.x - viewportWidth / 2;
  camera.y = world.y - viewportHeight / 2;
  clampCamera(camera, map, viewportWidth, viewportHeight);
  render(true);
});

minimap.addEventListener('pointermove', (event) => {
  if (minimapPointerId !== event.pointerId || (event.buttons & 1) === 0) return;
  const world = minimapEventToWorld(event, minimap, map);
  camera.x = world.x - viewportWidth / 2;
  camera.y = world.y - viewportHeight / 2;
  clampCamera(camera, map, viewportWidth, viewportHeight);
  render(true);
});
function releaseMinimapPointer(event) {
  if (minimapPointerId !== event.pointerId) return;
  if (minimap.hasPointerCapture(event.pointerId)) minimap.releasePointerCapture(event.pointerId);
  minimapPointerId = null;
}
minimap.addEventListener('pointerup', releaseMinimapPointer);
minimap.addEventListener('pointercancel', releaseMinimapPointer);

resizeCanvas();
centerCameraOnLocalHome();
updateHud();
updateBuildingHud();
updateReadabilitySelectionUi();
render(true);
document.body.classList.remove('booting');
document.body.setAttribute('aria-busy', 'false');
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
    ['Production', `${production}% · ${((simulation.productionIntervalMs ?? HYDRA_SPAWN_INTERVAL_MS) / 1000).toFixed(2)}s`],
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
      const cyclePercent = Math.min(100, Math.round(
        (cycle / (simulation.productionIntervalMs ?? HYDRA_SPAWN_INTERVAL_MS)) * 100,
      ));
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

window.__hydraGame = { map, simulation, selectedIds, selectedBuildingId: () => selectedBuildingId };
window.__hydraGameDebug = Object.freeze({
  version: 1,
  map,
  simulation,
  camera,
  snapshot: () => ({
    phase: simulation.match?.phase,
    elapsedMs: simulation.match?.elapsedMs ?? 0,
    localMode: simulation.match?.localMode,
    selectedIds: [...selectedIds],
    selectedBuildingId,
    selectedSunkenZoneId,
    hydras: playerHydraCount(simulation, simulation.localPlayerSlot),
  }),
  selectOwnHydras: () => {
    selectedBuildingId = null;
    selectedSunkenZoneId = null;
    selectedIds.clear();
    for (const unit of simulation.units) {
      if (unit.ownerSlot === simulation.localPlayerSlot && unit.type === 'hydra' && unit.hp > 0) {
        selectedIds.add(unit.id);
      }
    }
    updateHud();
    updateReadabilitySelectionUi();
    return [...selectedIds];
  },
  moveSelectedTo: (x, y) => assignMoveOrders(
    map,
    simulation,
    selectedIds,
    { x: Number(x), y: Number(y) },
  ),
  centerHome: () => {
    centerCameraOnLocalHome();
    render(true);
  },
});
