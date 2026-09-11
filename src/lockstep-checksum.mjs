import { mixUint32, quantizeFacingRadians, toFixed } from './fixed-point.mjs';

const UNIT_TYPE_CODES = Object.freeze({ hydra: 1, zealot: 2, overlord: 3 });
const ORDER_TYPE_CODES = Object.freeze({
  move: 1,
  'attack-move': 2,
  'beacon-return': 3,
});
const PLAYER_STATUS_CODES = Object.freeze({ active: 1, eliminated: 2 });
const MATCH_PHASE_CODES = Object.freeze({ countdown: 1, running: 2, finished: 3 });
const TARGET_KIND_CODES = Object.freeze({ unit: 1, sunken: 2 });

function mixString(hash, value) {
  const text = String(value ?? '');
  hash = mixUint32(hash, text.length);
  for (let index = 0; index < text.length; index += 1) {
    hash = mixUint32(hash, text.charCodeAt(index));
  }
  return hash;
}

function mixPoint(hash, point) {
  hash = mixUint32(hash, toFixed(point?.x ?? 0));
  return mixUint32(hash, toFixed(point?.y ?? 0));
}

function mixNumericMap(hash, map) {
  const entries = [...(map?.entries?.() ?? [])]
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  hash = mixUint32(hash, entries.length);
  for (const [key, value] of entries) {
    hash = mixUint32(hash, Number(key) || 0);
    hash = mixUint32(hash, Number(value) || 0);
  }
  return hash;
}

function mixUnit(hash, unit) {
  hash = mixUint32(hash, unit.id ?? 0);
  hash = mixUint32(hash, UNIT_TYPE_CODES[unit.type] ?? 0);
  hash = mixUint32(hash, Number.isInteger(unit.ownerSlot) ? unit.ownerSlot : 0xffff);
  hash = mixUint32(hash, Number.isInteger(unit.team) ? unit.team : 0xffff);
  hash = mixPoint(hash, unit);
  hash = mixUint32(hash, Math.max(0, Math.ceil(unit.hp ?? 0)));
  hash = mixUint32(hash, Math.max(0, Math.ceil(unit.maxHp ?? 0)));
  hash = mixUint32(hash, Math.max(0, Math.ceil(unit.armor ?? 0)));
  hash = mixUint32(hash, toFixed(unit.speed ?? 0));
  hash = mixUint32(hash, quantizeFacingRadians(unit.facing ?? 0));
  hash = mixUint32(hash, Math.max(0, Math.ceil(unit.attackCooldownMs ?? 0)));
  hash = mixUint32(hash, Math.max(0, Math.ceil(unit.attackFlashMs ?? 0)));
  hash = mixUint32(hash, Math.max(0, unit.kills ?? 0));
  hash = mixUint32(hash, Math.max(0, Math.ceil(unit.beaconCooldownMs ?? 0)));
  hash = mixUint32(hash, unit.beaconController ? 1 : 0);
  hash = mixUint32(hash, unit.combatTargetable === false ? 0 : 1);
  hash = mixUint32(hash, ORDER_TYPE_CODES[unit.orderType] ?? 0);
  hash = mixPoint(hash, unit.attackMoveTarget);

  const path = unit.path ?? [];
  hash = mixUint32(hash, unit.pathIndex ?? 0);
  hash = mixUint32(hash, path.length);
  for (const point of path) hash = mixPoint(hash, point);

  const target = unit.currentTarget;
  hash = mixUint32(hash, TARGET_KIND_CODES[target?.kind] ?? 0);
  hash = mixUint32(hash, target?.id ?? target?.zoneId ?? 0);
  return hash;
}

function mixPlayer(hash, player) {
  hash = mixUint32(hash, player.slot ?? 0);
  hash = mixUint32(hash, player.team ?? 0);
  hash = mixUint32(hash, PLAYER_STATUS_CODES[player.status] ?? 0);
  hash = mixUint32(hash, player.minerals ?? 0);
  hash = mixUint32(hash, player.kills ?? 0);
  hash = mixUint32(hash, player.sunkenKills ?? 0);
  hash = mixUint32(hash, player.captures ?? 0);
  hash = mixUint32(hash, Math.max(0, Math.ceil(player.recoveryCooldownMs ?? 0)));
  hash = mixUint32(hash, player.infrastructureRemoved ? 1 : 0);
  hash = mixUint32(hash, player.upgrades?.attack ?? 0);
  hash = mixUint32(hash, player.upgrades?.defense ?? 0);
  hash = mixUint32(hash, player.upgrades?.range ?? 0);
  return mixUint32(hash, player.upgrades?.speed ?? 0);
}

function mixZone(hash, zone) {
  hash = mixUint32(hash, zone.id ?? 0);
  hash = mixUint32(hash, zone.ownerSlot ?? 0xffff);
  hash = mixUint32(hash, zone.ownerTeam ?? 0xffff);
  hash = mixUint32(hash, Math.max(0, Math.ceil(zone.sunkenHp ?? 0)));
  hash = mixUint32(hash, Math.max(0, Math.ceil(zone.sunkenMaxHp ?? 0)));
  hash = mixUint32(hash, Math.max(0, Math.ceil(zone.sunkenArmor ?? 0)));
  hash = mixUint32(hash, Math.max(0, Math.ceil(zone.sunkenAttackCooldownMs ?? 0)));
  hash = mixUint32(hash, Math.max(0, Math.ceil(zone.sunkenAttackFlashMs ?? 0)));
  hash = mixUint32(hash, zone.currentTargetUnitId ?? 0);
  return hash;
}

function mixUpgradeBuilding(hash, building) {
  hash = mixString(hash, building.id);
  hash = mixString(hash, building.type);
  hash = mixUint32(hash, building.ownerSlot ?? 0xffff);
  hash = mixUint32(hash, building.team ?? 0xffff);
  hash = mixPoint(hash, building);
  hash = mixUint32(hash, Math.max(0, Math.ceil(building.hp ?? 0)));
  return mixUint32(hash, Math.max(0, Math.ceil(building.maxHp ?? 0)));
}

export function computeStableLockstepChecksum(state, map) {
  let hash = 2166136261;

  const units = [...(state.units ?? [])].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  hash = mixUint32(hash, units.length);
  for (const unit of units) hash = mixUnit(hash, unit);

  hash = mixUint32(hash, state.nextUnitId ?? 0);
  hash = mixUint32(hash, Math.max(0, Math.ceil(state.separationAccumulatorMs ?? 0)));
  hash = mixNumericMap(hash, state.spawnAccumulators);
  hash = mixNumericMap(hash, state.spawnSequence);

  const match = state.match ?? {};
  hash = mixUint32(hash, MATCH_PHASE_CODES[match.phase] ?? 0);
  hash = mixUint32(hash, Math.max(0, Math.ceil(match.countdownMs ?? 0)));
  hash = mixUint32(hash, Math.max(0, Math.ceil(match.elapsedMs ?? 0)));
  hash = mixUint32(hash, match.winnerTeam ?? 0xffff);

  const players = [...(state.players ?? [])].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  for (const player of players) hash = mixPlayer(hash, player);

  const zones = [...(map.zones ?? [])].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  for (const zone of zones) hash = mixZone(hash, zone);

  const buildings = [...(state.upgradeBuildings ?? [])]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const building of buildings) hash = mixUpgradeBuilding(hash, building);

  return hash >>> 0;
}
