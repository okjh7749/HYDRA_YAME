import {
  HYDRA_BASE_DAMAGE,
  OVERLORD_ARMOR,
  SUNKEN_ARMOR,
  SUNKEN_ATTACK_RANGE,
  SUNKEN_DAMAGE,
  calculateHydraAttackRange,
  getPlayerState,
} from './game-combat.mjs';

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function nearestSelectableSunken(map, point, radius = 28) {
  const radiusSquared = radius * radius;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const zone of map.zones) {
    if (zone.ownerTeam === null || zone.sunkenHp <= 0) continue;
    const distance = distanceSquared({ x: zone.x, y: zone.y + 27 }, point);
    if (distance <= radiusSquared && distance < bestDistance) {
      best = zone;
      bestDistance = distance;
    }
  }
  return best;
}

function orderLabel(unit) {
  if (unit.currentTarget?.kind === 'unit') return `Attack Unit #${unit.currentTarget.id}`;
  if (unit.currentTarget?.kind === 'sunken') return `Attack Zone ${unit.currentTarget.zoneId}`;
  if (unit.orderType === 'beacon-rally') return `Beacon Rally → Zone ${unit.rallyTargetZoneId}`;
  if (unit.orderType === 'beacon-return') return 'Return to Beacon Center';
  if (unit.pathIndex < unit.path.length) return 'Move';
  return 'Hold';
}

export function inspectSelectedUnits(state, team, unitIds) {
  const units = state.units.filter((unit) => unitIds.has(unit.id) && unit.team === team && unit.hp > 0);
  if (units.length === 0) return null;

  const player = getPlayerState(state, team);
  const counts = { hydra: 0, overlord: 0, zealot: 0 };
  let hp = 0;
  let maxHp = 0;
  let kills = 0;
  const orders = new Set();

  for (const unit of units) {
    counts[unit.type] = (counts[unit.type] ?? 0) + 1;
    hp += unit.hp;
    maxHp += unit.maxHp;
    kills += unit.kills ?? 0;
    orders.add(orderLabel(unit));
  }

  const onlyType = Object.entries(counts).find(([, count]) => count === units.length)?.[0] ?? 'mixed';
  const primary = units.length === 1 ? units[0] : null;
  return {
    kind: 'units',
    count: units.length,
    type: onlyType,
    counts,
    hp,
    maxHp,
    kills,
    attack: counts.hydra > 0 ? HYDRA_BASE_DAMAGE + (player?.upgrades.attack ?? 0) : null,
    defense: counts.hydra > 0 ? (player?.upgrades.defense ?? 0) : null,
    range: counts.hydra > 0 ? calculateHydraAttackRange(state, team) : null,
    armor: counts.overlord > 0 ? OVERLORD_ARMOR : null,
    order: orders.size === 1 ? [...orders][0] : 'Mixed Orders',
    target: primary?.currentTarget ?? null,
    unit: primary,
  };
}

export function inspectSunken(zone) {
  if (!zone || zone.ownerTeam === null || zone.sunkenHp <= 0) return null;
  return {
    kind: 'sunken',
    zoneId: zone.id,
    team: zone.ownerTeam,
    hp: zone.sunkenHp,
    maxHp: zone.sunkenMaxHp,
    attack: SUNKEN_DAMAGE,
    armor: zone.sunkenArmor ?? SUNKEN_ARMOR,
    range: SUNKEN_ATTACK_RANGE,
    productionIntervalMs: 500,
    attackCooldownMs: zone.sunkenAttackCooldownMs ?? 0,
    targetUnitId: zone.currentTargetUnitId ?? null,
  };
}
