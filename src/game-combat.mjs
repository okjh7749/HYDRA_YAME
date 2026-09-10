import { CLASSIC_ZONE_SPAN, nearestWalkablePoint } from './game-core.mjs';
import {
  PLAYER_COUNT,
  playerBySlot,
  playerHydraCount,
  playerSunkenCount,
  setZoneOwner,
  teamForSlot,
  unitOwnerSlot,
  zoneOwnerSlot,
} from './game-ownership.mjs';

export const HYDRA_BASE_DAMAGE = 5;
export const HYDRA_ATTACK_RANGE = 96;
export const HYDRA_ATTACK_COOLDOWN_MS = 700;
export const HYDRA_KILL_REWARD = 5;

export const SUNKEN_HP = 9999;
export const SUNKEN_ARMOR = 50;
export const SUNKEN_DAMAGE = 200;
export const SUNKEN_ATTACK_RANGE = 176;
export const SUNKEN_ATTACK_COOLDOWN_MS = 900;
export const SUNKEN_KILL_REWARD = 150;

export const CAPTURE_COST = 250;
export const CAPTURE_RADIUS = 64;
export const OVERLORD_ARMOR = 250;

const OVERLORD_SPAWNS = Object.freeze([
  Object.freeze({ x: 400, y: 1648 }), Object.freeze({ x: 400, y: 1648 }),
  Object.freeze({ x: 400, y: 400 }), Object.freeze({ x: 400, y: 400 }),
  Object.freeze({ x: 1648, y: 400 }), Object.freeze({ x: 1648, y: 400 }),
  Object.freeze({ x: 1648, y: 1648 }), Object.freeze({ x: 1648, y: 1648 }),
]);

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function playerForSlot(state, slot) {
  return playerBySlot(state, slot);
}

function homeZoneForSlot(map, slot) {
  return map.zones.find((zone) => zone.ownerSlot === slot) ?? null;
}

function resetSunken(zone) {
  zone.sunkenHp = SUNKEN_HP;
  zone.sunkenMaxHp = SUNKEN_HP;
  zone.sunkenArmor = SUNKEN_ARMOR;
  zone.sunkenAttackCooldownMs = 0;
  zone.sunkenAttackFlashMs = 0;
  zone.currentTargetUnitId = null;
}

function createOverlord(state, map, ownerSlot) {
  const player = playerForSlot(state, ownerSlot);
  if (!player) return null;
  const desired = OVERLORD_SPAWNS[ownerSlot] ?? { x: player.homeX, y: player.homeY };
  const point = nearestWalkablePoint(map, desired.x, desired.y, 16) ?? desired;
  const unit = {
    id: state.nextUnitId,
    type: 'overlord',
    ownerSlot,
    team: player.team,
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

export function initializeCombatState(state, map) {
  if (!state.players) {
    state.players = [];
    for (let slot = 0; slot < PLAYER_COUNT; slot += 1) {
      const home = homeZoneForSlot(map, slot);
      if (!home) throw new Error(`Missing classic home zone for P${slot + 1}`);
      state.players.push({
        slot,
        team: teamForSlot(slot),
        minerals: 1000,
        kills: 0,
        sunkenKills: 0,
        captures: 0,
        homeZoneId: home.id,
        homeX: home.x,
        homeY: home.y,
        upgrades: { attack: 0, defense: 0, range: 0, speed: 0 },
        recoveryCooldownMs: 0,
        infrastructureRemoved: false,
      });
    }
  }

  if (!state.effects) state.effects = [];
  for (const zone of map.zones) {
    const ownerSlot = zoneOwnerSlot(zone);
    setZoneOwner(zone, ownerSlot);
    if (ownerSlot !== null && zone.sunkenHp === undefined) resetSunken(zone);
    if (zone.sunkenAttackFlashMs === undefined) zone.sunkenAttackFlashMs = 0;
    if (zone.currentTargetUnitId === undefined) zone.currentTargetUnitId = null;
  }
  for (const unit of state.units) {
    if (!Number.isInteger(unit.ownerSlot)) {
      unit.ownerSlot = unitOwnerSlot(unit);
    }
    if (unit.attackCooldownMs === undefined) unit.attackCooldownMs = 0;
    if (unit.attackFlashMs === undefined) unit.attackFlashMs = 0;
    if (unit.currentTarget === undefined) unit.currentTarget = null;
    if (unit.kills === undefined) unit.kills = 0;
    if (unit.type === 'hydra' && unit.armor === undefined) unit.armor = 0;
    if (unit.type === 'overlord' && unit.armor === undefined) unit.armor = OVERLORD_ARMOR;
  }
  return state;
}

export function getPlayerState(state, ownerSlot) {
  return playerForSlot(state, ownerSlot);
}

export function controlledZoneCount(map, ownerSlot) {
  return map.zones.filter((zone) => zoneOwnerSlot(zone) === ownerSlot && zone.sunkenHp > 0).length;
}

function hydraAttackRange(state, ownerSlot) {
  return HYDRA_ATTACK_RANGE + (playerForSlot(state, ownerSlot)?.upgrades.range ?? 0) * 32;
}

function hydraDamage(state, attackerOwnerSlot, targetArmor) {
  const attackUpgrade = playerForSlot(state, attackerOwnerSlot)?.upgrades.attack ?? 0;
  return Math.max(1, HYDRA_BASE_DAMAGE + attackUpgrade - targetArmor);
}

function hydraDefense(state, ownerSlot) {
  return playerForSlot(state, ownerSlot)?.upgrades.defense ?? 0;
}

export function calculateHydraDamage(state, attackerOwnerSlot, targetArmor) {
  return hydraDamage(state, attackerOwnerSlot, targetArmor);
}

export function calculateSunkenDamage(state, targetOwnerSlot) {
  return Math.max(1, SUNKEN_DAMAGE - hydraDefense(state, targetOwnerSlot));
}

export function calculateHydraAttackRange(state, ownerSlot) {
  return hydraAttackRange(state, ownerSlot);
}

function pushEffect(state, effect) {
  const durationMs = effect.ttlMs ?? 240;
  state.effects.push({
    ...effect,
    ttlMs: durationMs,
    durationMs,
    elapsedMs: 0,
  });
}

function pushUnitDeathEffect(state, unit, cause = 'combat') {
  pushEffect(state, {
    type: 'unit-death',
    unitId: unit.id,
    unitType: unit.type,
    ownerSlot: unitOwnerSlot(unit),
    team: unit.team,
    facing: unit.facing ?? 0,
    cause,
    x1: unit.x,
    y1: unit.y,
    x2: unit.x,
    y2: unit.y,
    ttlMs: 560,
  });
}

function damageUnit(state, target, amount, attackerOwnerSlot, source) {
  if (target.hp <= 0) return false;
  target.hp -= amount;
  pushEffect(state, {
    type: source.kind === 'sunken' ? 'sunken-shot' : 'hydra-shot',
    x1: source.x,
    y1: source.y,
    x2: target.x,
    y2: target.y,
    damage: amount,
    targetId: target.id,
  });
  if (target.hp > 0) return false;

  target.hp = 0;
  pushUnitDeathEffect(state, target);
  if (target.type === 'hydra') {
    const player = playerForSlot(state, attackerOwnerSlot);
    if (player) {
      player.minerals += HYDRA_KILL_REWARD;
      player.kills += 1;
    }
    if (source.type === 'hydra') source.kills = (source.kills ?? 0) + 1;
  }
  return true;
}

function nearestEnemyUnit(state, attacker, range) {
  const rangeSquared = range * range;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of state.units) {
    if (target.hp <= 0 || target.team === attacker.team || target.id === attacker.id) continue;
    if (target.combatTargetable === false) continue;
    const distance = distanceSquared(attacker, target);
    if (distance <= rangeSquared && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

function nearestEnemySunken(map, attacker, range) {
  const rangeSquared = range * range;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const zone of map.zones) {
    if (zone.ownerTeam === null || zone.ownerTeam === attacker.team || zone.sunkenHp <= 0) continue;
    const distance = distanceSquared(attacker, zone);
    if (distance <= rangeSquared && distance < bestDistance) {
      best = zone;
      bestDistance = distance;
    }
  }
  return best;
}

function destroySunken(state, zone, attackerOwnerSlot) {
  const defeatedOwnerSlot = zoneOwnerSlot(zone);
  if (defeatedOwnerSlot === null) return false;
  const defeatedTeam = zone.ownerTeam;
  zone.sunkenHp = 0;
  setZoneOwner(zone, null);
  const player = playerForSlot(state, attackerOwnerSlot);
  if (player) {
    player.minerals += SUNKEN_KILL_REWARD;
    player.sunkenKills += 1;
  }
  pushEffect(state, {
    type: 'sunken-destroyed',
    unitType: 'sunken',
    ownerSlot: defeatedOwnerSlot,
    team: defeatedTeam,
    facing: 0,
    x1: zone.x,
    y1: zone.y,
    x2: zone.x,
    y2: zone.y,
    damage: SUNKEN_KILL_REWARD,
    ttlMs: 520,
  });
  return true;
}

function cleanupDeadUnits(state) {
  state.units = state.units.filter((unit) => unit.hp > 0);
}

function stepEffects(state, deltaMs) {
  for (const effect of state.effects) {
    effect.ttlMs -= deltaMs;
    effect.elapsedMs = (effect.elapsedMs ?? 0) + deltaMs;
  }
  state.effects = state.effects.filter((effect) => effect.ttlMs > 0);
}

export function stepCombat(state, map, deltaMs) {
  initializeCombatState(state, map);
  if (state.match && state.match.phase !== 'running') return;
  stepEffects(state, deltaMs);

  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    unit.attackCooldownMs = Math.max(0, (unit.attackCooldownMs ?? 0) - deltaMs);
    unit.attackFlashMs = Math.max(0, (unit.attackFlashMs ?? 0) - deltaMs);
    if (unit.type !== 'hydra' || unit.attackCooldownMs > 0) continue;

    const attackerOwnerSlot = unitOwnerSlot(unit);
    const range = hydraAttackRange(state, attackerOwnerSlot);
    const enemyUnit = nearestEnemyUnit(state, unit, range);
    if (enemyUnit) {
      const targetOwnerSlot = unitOwnerSlot(enemyUnit);
      const armor = enemyUnit.type === 'hydra'
        ? hydraDefense(state, targetOwnerSlot)
        : (enemyUnit.armor ?? 0);
      const amount = hydraDamage(state, attackerOwnerSlot, armor);
      unit.facing = Math.atan2(enemyUnit.y - unit.y, enemyUnit.x - unit.x);
      unit.currentTarget = { kind: 'unit', id: enemyUnit.id };
      damageUnit(state, enemyUnit, amount, attackerOwnerSlot, unit);
      unit.attackCooldownMs = HYDRA_ATTACK_COOLDOWN_MS;
      unit.attackFlashMs = 140;
      continue;
    }

    const enemySunken = nearestEnemySunken(map, unit, range);
    if (!enemySunken) {
      unit.currentTarget = null;
      continue;
    }
    const amount = hydraDamage(state, attackerOwnerSlot, enemySunken.sunkenArmor ?? SUNKEN_ARMOR);
    enemySunken.sunkenHp -= amount;
    unit.facing = Math.atan2(enemySunken.y - unit.y, enemySunken.x - unit.x);
    unit.currentTarget = { kind: 'sunken', zoneId: enemySunken.id };
    pushEffect(state, {
      type: 'hydra-shot',
      x1: unit.x,
      y1: unit.y,
      x2: enemySunken.x,
      y2: enemySunken.y,
      targetZoneId: enemySunken.id,
      damage: amount,
    });
    unit.attackCooldownMs = HYDRA_ATTACK_COOLDOWN_MS;
    unit.attackFlashMs = 140;
    if (enemySunken.sunkenHp <= 0) destroySunken(state, enemySunken, attackerOwnerSlot);
  }

  for (const zone of map.zones) {
    const ownerSlot = zoneOwnerSlot(zone);
    if (ownerSlot === null || zone.sunkenHp <= 0) continue;
    zone.sunkenAttackCooldownMs = Math.max(0, (zone.sunkenAttackCooldownMs ?? 0) - deltaMs);
    zone.sunkenAttackFlashMs = Math.max(0, (zone.sunkenAttackFlashMs ?? 0) - deltaMs);
    if (zone.sunkenAttackCooldownMs > 0) continue;
    const attacker = { x: zone.x, y: zone.y, ownerSlot, team: teamForSlot(ownerSlot) };
    const target = nearestEnemyUnit(state, attacker, SUNKEN_ATTACK_RANGE);
    if (!target) continue;
    const targetOwnerSlot = unitOwnerSlot(target);
    const armor = target.type === 'hydra' ? hydraDefense(state, targetOwnerSlot) : (target.armor ?? 0);
    const amount = Math.max(1, SUNKEN_DAMAGE - armor);
    damageUnit(state, target, amount, ownerSlot, { x: zone.x, y: zone.y, kind: 'sunken' });
    zone.sunkenAttackCooldownMs = SUNKEN_ATTACK_COOLDOWN_MS;
    zone.sunkenAttackFlashMs = 140;
  }

  cleanupDeadUnits(state);
}

function insideLargeZone(unit, zone) {
  const half = CLASSIC_ZONE_SPAN / 2;
  return Math.abs(unit.x - zone.x) <= half && Math.abs(unit.y - zone.y) <= half;
}

function insideCaptureCenter(unit, zone) {
  return Math.abs(unit.x - zone.x) <= CAPTURE_RADIUS
    && Math.abs(unit.y - zone.y) <= CAPTURE_RADIUS;
}

function commandsMostAnyUnit(state, zone, ownerSlot) {
  const counts = new Array(PLAYER_COUNT).fill(0);
  for (const unit of state.units) {
    if (unit.hp <= 0 || !insideLargeZone(unit, zone)) continue;
    const slot = unitOwnerSlot(unit);
    if (slot !== null) counts[slot] += 1;
  }
  const own = counts[ownerSlot] ?? 0;
  if (own <= 0) return false;
  return counts.every((count, slot) => slot === ownerSlot || own > count);
}

function hasAnyBuildingInZone(state, map, zone) {
  for (const candidate of map.zones) {
    if (
      zoneOwnerSlot(candidate) !== null
      && (candidate.sunkenHp ?? 0) > 0
      && insideLargeZone(candidate, zone)
    ) return true;
  }
  for (const building of state.upgradeBuildings ?? []) {
    if (building.hp > 0 && insideLargeZone(building, zone)) return true;
  }
  return false;
}

function removeMenInCaptureCenter(state, zone) {
  const removedIds = [];
  for (const unit of state.units) {
    if (unit.hp <= 0 || !insideCaptureCenter(unit, zone)) continue;
    unit.hp = 0;
    removedIds.push(unit.id);
  }
  cleanupDeadUnits(state);
  return removedIds;
}

function livingOverlord(state, ownerSlot) {
  return state.units.find(
    (unit) => unit.type === 'overlord'
      && unitOwnerSlot(unit) === ownerSlot
      && unit.hp > 0,
  ) ?? null;
}

function killPlayerOverlords(state, ownerSlot) {
  let killed = 0;
  for (const unit of state.units) {
    if (unit.type !== 'overlord' || unitOwnerSlot(unit) !== ownerSlot || unit.hp <= 0) continue;
    pushUnitDeathEffect(state, unit, 'trigger');
    unit.hp = 0;
    killed += 1;
  }
  if (killed > 0) cleanupDeadUnits(state);
  return killed;
}

function removePlayerInfrastructure(state, ownerSlot) {
  const player = playerForSlot(state, ownerSlot);
  if (!player) return 0;
  let removed = 0;
  for (const building of state.upgradeBuildings ?? []) {
    if (building.ownerSlot !== ownerSlot || building.hp <= 0) continue;
    building.hp = 0;
    removed += 1;
  }
  if (removed > 0) player.infrastructureRemoved = true;
  return removed;
}

export function ensureLocalOverlord(
  state,
  map,
  ownerSlot = state.localPlayerSlot ?? (state.localTeam ?? 0) * 2,
) {
  initializeCombatState(state, map);
  if (state.match && state.match.phase !== 'running') return null;
  const player = playerForSlot(state, ownerSlot);
  if (!player || player.status === 'eliminated' || player.minerals < CAPTURE_COST) return null;
  if (livingOverlord(state, ownerSlot)) return null;
  if (playerHydraCount(state, ownerSlot) <= 0) return null;
  return createOverlord(state, map, ownerSlot);
}

export function stepPlayerTriggerEconomy(state, map, ownerSlot, deltaMs = 0) {
  initializeCombatState(state, map);
  const player = playerForSlot(state, ownerSlot);
  if (!player || player.status === 'eliminated') {
    return { recoveredMinerals: 0, overlordsKilled: 0, overlordCreated: false, buildingsRemoved: 0 };
  }

  player.recoveryCooldownMs = Math.max(0, (player.recoveryCooldownMs ?? 0) - deltaMs);
  const overlordsKilled = player.minerals <= 249 ? killPlayerOverlords(state, ownerSlot) : 0;
  const overlordCreated = Boolean(ensureLocalOverlord(state, map, ownerSlot));
  const buildingsRemoved = playerSunkenCount(map, ownerSlot) === 0
    ? removePlayerInfrastructure(state, ownerSlot)
    : 0;

  let recoveredMinerals = 0;
  const elapsedMs = state.match?.elapsedMs ?? 0;
  if (
    playerSunkenCount(map, ownerSlot) === 0
    && playerHydraCount(state, ownerSlot) > 0
    && !livingOverlord(state, ownerSlot)
    && elapsedMs >= 1000
    && player.recoveryCooldownMs === 0
  ) {
    player.minerals += CAPTURE_COST;
    player.recoveryCooldownMs = 4000;
    recoveredMinerals = CAPTURE_COST;
  }

  return { recoveredMinerals, overlordsKilled, overlordCreated, buildingsRemoved };
}

export function stepCapture(
  state,
  map,
  ownerSlot = state.localPlayerSlot ?? (state.localTeam ?? 0) * 2,
) {
  initializeCombatState(state, map);
  const captures = [];
  if (state.match && state.match.phase !== 'running') return captures;
  const player = playerForSlot(state, ownerSlot);
  if (!player || player.status === 'eliminated' || player.minerals < CAPTURE_COST) return captures;

  for (const zone of map.zones) {
    if (hasAnyBuildingInZone(state, map, zone)) continue;
    const overlord = livingOverlord(state, ownerSlot);
    if (!overlord || !insideCaptureCenter(overlord, zone)) continue;
    if (!commandsMostAnyUnit(state, zone, ownerSlot)) continue;

    const removedIds = removeMenInCaptureCenter(state, zone);
    setZoneOwner(zone, ownerSlot);
    resetSunken(zone);
    player.minerals -= CAPTURE_COST;
    player.captures += 1;
    captures.push({ zoneId: zone.id, ownerSlot, team: player.team, removedIds });
    pushEffect(state, {
      type: 'capture',
      x1: zone.x,
      y1: zone.y,
      x2: zone.x,
      y2: zone.y,
      damage: CAPTURE_COST,
      ttlMs: 700,
    });
    break;
  }

  return captures;
}
