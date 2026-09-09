import { nearestWalkablePoint } from './game-core.mjs';

export const HYDRA_BASE_DAMAGE = 5;
export const HYDRA_ATTACK_RANGE = 96;
export const HYDRA_ATTACK_COOLDOWN_MS = 700;
export const HYDRA_KILL_REWARD = 5;

export const SUNKEN_HP = 9999;
export const SUNKEN_ARMOR = 50;
export const SUNKEN_DAMAGE = 200;
export const SUNKEN_ATTACK_RANGE = 176;
export const SUNKEN_ATTACK_COOLDOWN_MS = 900;
export const SUNKEN_KILL_REWARD = 200;

export const CAPTURE_COST = 250;
export const CAPTURE_RADIUS = 34;
export const OVERLORD_ARMOR = 250;

const TEAM_COUNT = 4;

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function playerForTeam(state, team) {
  return state.players?.find((player) => player.team === team) ?? null;
}

function homeZoneForTeam(map, team) {
  return map.zones.find((zone) => zone.ownerTeam === team) ?? map.zones[team];
}

function resetSunken(zone) {
  zone.sunkenHp = SUNKEN_HP;
  zone.sunkenMaxHp = SUNKEN_HP;
  zone.sunkenArmor = SUNKEN_ARMOR;
  zone.sunkenAttackCooldownMs = 0;
}

function createLocalOverlord(state, map) {
  const player = playerForTeam(state, state.localTeam);
  if (!player) return null;
  const point = nearestWalkablePoint(map, player.homeX + 54, player.homeY - 32, 8)
    ?? { x: player.homeX, y: player.homeY };
  const unit = {
    id: state.nextUnitId,
    type: 'overlord',
    team: state.localTeam,
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
  };
  state.nextUnitId += 1;
  state.units.push(unit);
  return unit;
}

export function initializeCombatState(state, map) {
  if (!state.players) {
    state.players = [];
    for (let team = 0; team < TEAM_COUNT; team += 1) {
      const home = homeZoneForTeam(map, team);
      state.players.push({
        team,
        minerals: 1000,
        kills: 0,
        sunkenKills: 0,
        captures: 0,
        homeZoneId: home.id,
        homeX: home.x,
        homeY: home.y,
        upgrades: { attack: 0, defense: 0, range: 0, speed: 0 },
      });
    }
  }

  if (!state.effects) state.effects = [];
  for (const zone of map.zones) {
    if (zone.ownerTeam !== null && zone.sunkenHp === undefined) resetSunken(zone);
  }
  for (const unit of state.units) {
    if (unit.attackCooldownMs === undefined) unit.attackCooldownMs = 0;
    if (unit.type === 'hydra' && unit.armor === undefined) unit.armor = 0;
    if (unit.type === 'overlord' && unit.armor === undefined) unit.armor = OVERLORD_ARMOR;
  }
  return state;
}

export function getPlayerState(state, team) {
  return playerForTeam(state, team);
}

export function controlledZoneCount(map, team) {
  return map.zones.filter((zone) => zone.ownerTeam === team && zone.sunkenHp > 0).length;
}

function hydraAttackRange(state, team) {
  return HYDRA_ATTACK_RANGE + (playerForTeam(state, team)?.upgrades.range ?? 0) * 32;
}

function hydraDamage(state, attackerTeam, targetArmor) {
  const attackUpgrade = playerForTeam(state, attackerTeam)?.upgrades.attack ?? 0;
  return Math.max(1, HYDRA_BASE_DAMAGE + attackUpgrade - targetArmor);
}

function hydraDefense(state, team) {
  return playerForTeam(state, team)?.upgrades.defense ?? 0;
}

export function calculateHydraDamage(state, attackerTeam, targetArmor) {
  return hydraDamage(state, attackerTeam, targetArmor);
}

export function calculateSunkenDamage(state, targetTeam) {
  return Math.max(1, SUNKEN_DAMAGE - hydraDefense(state, targetTeam));
}

export function calculateHydraAttackRange(state, team) {
  return hydraAttackRange(state, team);
}

function pushEffect(state, effect) {
  state.effects.push({ ...effect, ttlMs: effect.ttlMs ?? 240 });
}

function damageUnit(state, target, amount, attackerTeam, source) {
  if (target.hp <= 0) return false;
  target.hp -= amount;
  pushEffect(state, {
    type: source.kind === 'sunken' ? 'sunken-shot' : 'hydra-shot',
    x1: source.x,
    y1: source.y,
    x2: target.x,
    y2: target.y,
    damage: amount,
  });
  if (target.hp > 0) return false;

  target.hp = 0;
  if (target.type === 'hydra') {
    const player = playerForTeam(state, attackerTeam);
    if (player) {
      player.minerals += HYDRA_KILL_REWARD;
      player.kills += 1;
    }
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

function destroySunken(state, zone, attackerTeam) {
  if (zone.ownerTeam === null) return false;
  zone.sunkenHp = 0;
  zone.ownerTeam = null;
  const player = playerForTeam(state, attackerTeam);
  if (player) {
    player.minerals += SUNKEN_KILL_REWARD;
    player.sunkenKills += 1;
  }
  pushEffect(state, {
    type: 'sunken-destroyed',
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
  for (const effect of state.effects) effect.ttlMs -= deltaMs;
  state.effects = state.effects.filter((effect) => effect.ttlMs > 0);
}

export function stepCombat(state, map, deltaMs) {
  initializeCombatState(state, map);
  stepEffects(state, deltaMs);

  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    unit.attackCooldownMs = Math.max(0, (unit.attackCooldownMs ?? 0) - deltaMs);
    if (unit.type !== 'hydra' || unit.attackCooldownMs > 0) continue;

    const range = hydraAttackRange(state, unit.team);
    const enemyUnit = nearestEnemyUnit(state, unit, range);
    if (enemyUnit) {
      const armor = enemyUnit.type === 'hydra'
        ? hydraDefense(state, enemyUnit.team)
        : (enemyUnit.armor ?? 0);
      const amount = hydraDamage(state, unit.team, armor);
      unit.facing = Math.atan2(enemyUnit.y - unit.y, enemyUnit.x - unit.x);
      damageUnit(state, enemyUnit, amount, unit.team, unit);
      unit.attackCooldownMs = HYDRA_ATTACK_COOLDOWN_MS;
      continue;
    }

    const enemySunken = nearestEnemySunken(map, unit, range);
    if (!enemySunken) continue;
    const amount = hydraDamage(state, unit.team, enemySunken.sunkenArmor ?? SUNKEN_ARMOR);
    enemySunken.sunkenHp -= amount;
    unit.facing = Math.atan2(enemySunken.y - unit.y, enemySunken.x - unit.x);
    pushEffect(state, {
      type: 'hydra-shot',
      x1: unit.x,
      y1: unit.y,
      x2: enemySunken.x,
      y2: enemySunken.y,
      damage: amount,
    });
    unit.attackCooldownMs = HYDRA_ATTACK_COOLDOWN_MS;
    if (enemySunken.sunkenHp <= 0) destroySunken(state, enemySunken, unit.team);
  }

  for (const zone of map.zones) {
    if (zone.ownerTeam === null || zone.sunkenHp <= 0) continue;
    zone.sunkenAttackCooldownMs = Math.max(0, (zone.sunkenAttackCooldownMs ?? 0) - deltaMs);
    if (zone.sunkenAttackCooldownMs > 0) continue;
    const attacker = { x: zone.x, y: zone.y, team: zone.ownerTeam };
    const target = nearestEnemyUnit(state, attacker, SUNKEN_ATTACK_RANGE);
    if (!target) continue;
    const armor = target.type === 'hydra' ? hydraDefense(state, target.team) : (target.armor ?? 0);
    const amount = Math.max(1, SUNKEN_DAMAGE - armor);
    damageUnit(state, target, amount, zone.ownerTeam, { x: zone.x, y: zone.y, kind: 'sunken' });
    zone.sunkenAttackCooldownMs = SUNKEN_ATTACK_COOLDOWN_MS;
  }

  cleanupDeadUnits(state);
}

function zoneHydraCounts(state, zone) {
  const counts = new Array(TEAM_COUNT).fill(0);
  for (const unit of state.units) {
    if (unit.type !== 'hydra' || unit.hp <= 0) continue;
    if (distanceSquared(unit, zone) <= zone.radius * zone.radius) counts[unit.team] += 1;
  }
  return counts;
}

function hasStrictHydraLead(state, zone, team) {
  const counts = zoneHydraCounts(state, zone);
  const own = counts[team] ?? 0;
  if (own <= 0) return false;
  return counts.every((count, index) => index === team || own > count);
}

export function ensureLocalOverlord(state, map) {
  initializeCombatState(state, map);
  const player = playerForTeam(state, state.localTeam);
  if (!player || player.minerals < CAPTURE_COST) return null;
  const exists = state.units.some(
    (unit) => unit.type === 'overlord' && unit.team === state.localTeam && unit.hp > 0,
  );
  return exists ? null : createLocalOverlord(state, map);
}

export function stepCapture(state, map) {
  initializeCombatState(state, map);
  const captures = [];
  const player = playerForTeam(state, state.localTeam);
  if (!player || player.minerals < CAPTURE_COST) return captures;

  const overlords = state.units.filter(
    (unit) => unit.type === 'overlord' && unit.team === state.localTeam && unit.hp > 0,
  );
  for (const zone of map.zones) {
    if (zone.ownerTeam !== null || zone.sunkenHp > 0) continue;
    const overlord = overlords.find(
      (unit) => distanceSquared(unit, zone) <= CAPTURE_RADIUS * CAPTURE_RADIUS,
    );
    if (!overlord || !hasStrictHydraLead(state, zone, state.localTeam)) continue;

    player.minerals -= CAPTURE_COST;
    player.captures += 1;
    overlord.hp = 0;
    zone.ownerTeam = state.localTeam;
    resetSunken(zone);
    captures.push({ zoneId: zone.id, team: state.localTeam });
    pushEffect(state, {
      type: 'capture',
      x1: zone.x,
      y1: zone.y,
      x2: zone.x,
      y2: zone.y,
      damage: CAPTURE_COST,
      ttlMs: 700,
    });
  }

  cleanupDeadUnits(state);
  ensureLocalOverlord(state, map);
  return captures;
}
