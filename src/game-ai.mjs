import { issuePlayerHydraRally } from './game-beacon.mjs';
import {
  ensureLocalOverlord,
  getPlayerState,
  stepCapture,
  stepPlayerTriggerEconomy,
} from './game-combat.mjs';
import { assignMoveOrders } from './game-simulation.mjs';
import { playerHydraCount, unitOwnerSlot, zoneOwnerSlot } from './game-ownership.mjs';

export const AI_MIN_ASSAULT_HYDRAS = 6;
export const AI_DECISION_INTERVAL_MS = 3200;

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function aliveOwnedZones(map, ownerSlot) {
  return map.zones.filter(
    (zone) => zoneOwnerSlot(zone) === ownerSlot && (zone.sunkenHp ?? 0) > 0,
  );
}

function frontierDistance(map, ownerSlot, candidate) {
  const owned = aliveOwnedZones(map, ownerSlot);
  if (owned.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...owned.map((zone) => distanceSquared(zone, candidate)));
}

export function ensureAiOverlord(state, map, ownerSlot) {
  if (ownerSlot === state.localPlayerSlot) return null;
  return ensureLocalOverlord(state, map, ownerSlot);
}

export function stepAiCaptures(state, map, deltaMs = 0) {
  const events = [];
  for (const player of state.players ?? []) {
    if (player.slot === state.localPlayerSlot || player.status === 'eliminated') continue;
    const captures = stepCapture(state, map, player.slot);
    for (const capture of captures) {
      events.push({
        type: 'ai-capture',
        ownerSlot: player.slot,
        team: player.team,
        zoneId: capture.zoneId,
      });
    }
    stepPlayerTriggerEconomy(state, map, player.slot, deltaMs);
  }
  return events;
}

export function chooseAiTarget(state, map, ownerSlot) {
  const player = getPlayerState(state, ownerSlot);
  if (!player || player.status === 'eliminated') return null;

  const candidates = map.zones.filter((zone) => zone.ownerTeam !== player.team);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aEnemyPenalty = a.ownerTeam === null ? 0 : 100000;
    const bEnemyPenalty = b.ownerTeam === null ? 0 : 100000;
    const aScore = frontierDistance(map, ownerSlot, a) + aEnemyPenalty;
    const bScore = frontierDistance(map, ownerSlot, b) + bEnemyPenalty;
    return aScore - bScore || a.id - b.id;
  });
  return candidates[0] ?? null;
}

export function initializeAiState(state) {
  if (state.aiControllers) return state.aiControllers;
  state.aiControllers = (state.players ?? [])
    .filter((player) => player.slot !== state.localPlayerSlot)
    .map((player) => ({
      ownerSlot: player.slot,
      team: player.team,
      decisionCooldownMs: 900 + player.slot * 225,
      targetZoneId: null,
      decisions: 0,
    }));
  return state.aiControllers;
}

function moveCaptureOverlord(state, map, ownerSlot, target) {
  if (target.ownerTeam !== null) return 0;
  const overlord = state.units.find(
    (unit) => unit.type === 'overlord'
      && unitOwnerSlot(unit) === ownerSlot
      && unit.hp > 0,
  );
  if (!overlord) return 0;
  return assignMoveOrders(map, state, new Set([overlord.id]), target);
}

export function stepAi(state, map, deltaMs) {
  const controllers = initializeAiState(state);
  const events = [...stepAiCaptures(state, map, deltaMs)];

  for (const controller of controllers) {
    const player = getPlayerState(state, controller.ownerSlot);
    if (!player || player.status === 'eliminated') continue;

    controller.decisionCooldownMs -= deltaMs;
    if (controller.decisionCooldownMs > 0) continue;

    const hydras = playerHydraCount(state, controller.ownerSlot);
    if (hydras < AI_MIN_ASSAULT_HYDRAS) {
      controller.decisionCooldownMs = 900;
      continue;
    }

    let target = map.zones.find(
      (zone) => zone.id === controller.targetZoneId && zone.ownerTeam !== controller.team,
    );
    if (!target) target = chooseAiTarget(state, map, controller.ownerSlot);
    if (!target) {
      controller.decisionCooldownMs = AI_DECISION_INTERVAL_MS;
      continue;
    }

    controller.targetZoneId = target.id;
    controller.decisions += 1;
    const ordered = issuePlayerHydraRally(state, map, controller.ownerSlot, target.id);
    for (const unit of state.units) {
      if (
        unit.type === 'hydra'
        && unitOwnerSlot(unit) === controller.ownerSlot
        && unit.rallyTargetZoneId === target.id
      ) {
        unit.orderType = 'ai-assault';
      }
    }
    const overlordOrdered = moveCaptureOverlord(state, map, controller.ownerSlot, target);
    controller.decisionCooldownMs = AI_DECISION_INTERVAL_MS + controller.ownerSlot * 90;
    events.push({
      type: 'ai-assault',
      ownerSlot: controller.ownerSlot,
      team: controller.team,
      targetZoneId: target.id,
      ordered,
      overlordOrdered,
    });
  }

  return events;
}
