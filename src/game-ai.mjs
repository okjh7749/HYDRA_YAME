import { issueTeamHydraRally } from './game-beacon.mjs';
import {
  CAPTURE_COST,
  CAPTURE_RADIUS,
  OVERLORD_ARMOR,
  SUNKEN_ARMOR,
  SUNKEN_HP,
  getPlayerState,
} from './game-combat.mjs';
import { nearestWalkablePoint } from './game-core.mjs';
import { assignMoveOrders, teamHydraCount } from './game-simulation.mjs';

export const AI_MIN_ASSAULT_HYDRAS = 6;
export const AI_DECISION_INTERVAL_MS = 3200;

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function aliveOwnedZones(map, team) {
  return map.zones.filter(
    (zone) => zone.ownerTeam === team && (zone.sunkenHp ?? 0) > 0,
  );
}

function frontierDistance(map, team, candidate) {
  const owned = aliveOwnedZones(map, team);
  if (owned.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...owned.map((zone) => distanceSquared(zone, candidate)));
}

function teamHasStrictHydraLead(state, zone, team) {
  const counts = new Map();
  for (const unit of state.units) {
    if (unit.type !== 'hydra' || unit.hp <= 0) continue;
    if (distanceSquared(unit, zone) > zone.radius * zone.radius) continue;
    counts.set(unit.team, (counts.get(unit.team) ?? 0) + 1);
  }
  const own = counts.get(team) ?? 0;
  if (own <= 0) return false;
  for (const [otherTeam, count] of counts) {
    if (otherTeam !== team && count >= own) return false;
  }
  return true;
}

function createAiOverlord(state, map, team) {
  const player = getPlayerState(state, team * 2);
  if (!player) return null;
  const point = nearestWalkablePoint(map, player.homeX + 54, player.homeY - 32, 8)
    ?? { x: player.homeX, y: player.homeY };
  const unit = {
    id: state.nextUnitId,
    type: 'overlord',
    ownerSlot: team * 2,
    team,
    x: point.x,
    y: point.y,
    hp: 9999,
    maxHp: 9999,
    armor: OVERLORD_ARMOR,
    speed: 150,
    visionRadius: 280,
    path: [],
    pathIndex: 0,
    facing: 0,
    attackCooldownMs: 0,
    attackFlashMs: 0,
    currentTarget: null,
    kills: 0,
  };
  state.nextUnitId += 1;
  state.units.push(unit);
  return unit;
}

export function ensureAiOverlord(state, map, team) {
  const player = getPlayerState(state, team * 2);
  if (!player || player.status === 'eliminated' || team === state.localTeam) return null;

  const existing = state.units.find(
    (unit) => unit.type === 'overlord' && unit.team === team && unit.hp > 0,
  );
  if (player.minerals < CAPTURE_COST) {
    if (existing) {
      existing.hp = 0;
      state.units = state.units.filter((unit) => unit.hp > 0);
    }
    return null;
  }
  if (existing || teamHydraCount(state, team) <= 0) return null;
  return createAiOverlord(state, map, team);
}

function resetCapturedSunken(zone) {
  zone.sunkenHp = SUNKEN_HP;
  zone.sunkenMaxHp = SUNKEN_HP;
  zone.sunkenArmor = SUNKEN_ARMOR;
  zone.sunkenAttackCooldownMs = 0;
  zone.sunkenAttackFlashMs = 0;
  zone.currentTargetUnitId = null;
}

function captureNeutralZone(state, zone, team, overlord) {
  const player = getPlayerState(state, team * 2);
  if (!player || player.minerals < CAPTURE_COST) return null;
  player.minerals -= CAPTURE_COST;
  player.captures += 1;
  overlord.hp = 0;
  zone.ownerSlot = team * 2;
  zone.ownerTeam = team;
  resetCapturedSunken(zone);
  state.effects.push({
    type: 'capture',
    x1: zone.x,
    y1: zone.y,
    x2: zone.x,
    y2: zone.y,
    damage: CAPTURE_COST,
    ttlMs: 700,
    durationMs: 700,
    elapsedMs: 0,
  });
  state.units = state.units.filter((unit) => unit.hp > 0);
  return { type: 'ai-capture', team, zoneId: zone.id };
}

export function stepAiCaptures(state, map) {
  const events = [];
  for (const player of state.players ?? []) {
    const team = player.team;
    if (team === state.localTeam || player.status === 'eliminated') continue;
    ensureAiOverlord(state, map, team);
    const overlord = state.units.find(
      (unit) => unit.type === 'overlord' && unit.team === team && unit.hp > 0,
    );
    if (!overlord || player.minerals < CAPTURE_COST) continue;

    for (const zone of map.zones) {
      if (zone.ownerTeam !== null || zone.sunkenHp > 0) continue;
      if (distanceSquared(overlord, zone) > CAPTURE_RADIUS * CAPTURE_RADIUS) continue;
      if (!teamHasStrictHydraLead(state, zone, team)) continue;
      const event = captureNeutralZone(state, zone, team, overlord);
      if (event) events.push(event);
      break;
    }
  }
  return events;
}

export function chooseAiTarget(state, map, team) {
  const player = getPlayerState(state, team * 2);
  if (!player || player.status === 'eliminated') return null;

  const candidates = map.zones.filter((zone) => zone.ownerTeam !== team);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aEnemyPenalty = a.ownerTeam === null ? 0 : 100000;
    const bEnemyPenalty = b.ownerTeam === null ? 0 : 100000;
    const aScore = frontierDistance(map, team, a) + aEnemyPenalty;
    const bScore = frontierDistance(map, team, b) + bEnemyPenalty;
    return aScore - bScore || a.id - b.id;
  });
  return candidates[0] ?? null;
}

export function initializeAiState(state) {
  if (state.aiControllers) return state.aiControllers;
  const teams = [...new Set((state.players ?? [])
    .filter((player) => player.team !== state.localTeam)
    .map((player) => player.team))];
  state.aiControllers = teams.map((team) => ({
      team,
      decisionCooldownMs: 900 + team * 450,
      targetZoneId: null,
      decisions: 0,
    }));
  return state.aiControllers;
}

function moveCaptureOverlord(state, map, team, target) {
  if (target.ownerTeam !== null) return 0;
  ensureAiOverlord(state, map, team);
  const overlord = state.units.find(
    (unit) => unit.type === 'overlord' && unit.team === team && unit.hp > 0,
  );
  if (!overlord) return 0;
  return assignMoveOrders(map, state, new Set([overlord.id]), target);
}

export function stepAi(state, map, deltaMs) {
  const controllers = initializeAiState(state);
  const events = [...stepAiCaptures(state, map)];

  for (const controller of controllers) {
    const player = getPlayerState(state, controller.team * 2);
    if (!player || player.status === 'eliminated') continue;

    controller.decisionCooldownMs -= deltaMs;
    if (controller.decisionCooldownMs > 0) continue;

    const hydras = teamHydraCount(state, controller.team);
    if (hydras < AI_MIN_ASSAULT_HYDRAS) {
      controller.decisionCooldownMs = 900;
      continue;
    }

    let target = map.zones.find(
      (zone) => zone.id === controller.targetZoneId && zone.ownerTeam !== controller.team,
    );
    if (!target) target = chooseAiTarget(state, map, controller.team);
    if (!target) {
      controller.decisionCooldownMs = AI_DECISION_INTERVAL_MS;
      continue;
    }

    controller.targetZoneId = target.id;
    controller.decisions += 1;
    const ordered = issueTeamHydraRally(state, map, controller.team, target.id);
    for (const unit of state.units) {
      if (
        unit.type === 'hydra'
        && unit.team === controller.team
        && unit.rallyTargetZoneId === target.id
      ) {
        unit.orderType = 'ai-assault';
      }
    }
    const overlordOrdered = moveCaptureOverlord(state, map, controller.team, target);
    controller.decisionCooldownMs = AI_DECISION_INTERVAL_MS + controller.team * 180;
    events.push({
      type: 'ai-assault',
      team: controller.team,
      targetZoneId: target.id,
      ordered,
      overlordOrdered,
    });
  }

  return events;
}
