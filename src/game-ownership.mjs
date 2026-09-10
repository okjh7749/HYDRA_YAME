export const PLAYER_COUNT = 8;
export const FORCE_COUNT = 4;

export function teamForSlot(slot) {
  return Math.floor(Number(slot) / 2);
}

export function playerBySlot(state, slot) {
  return state.players?.find((player) => player.slot === slot) ?? null;
}

export function unitOwnerSlot(unit) {
  if (Number.isInteger(unit?.ownerSlot)) return unit.ownerSlot;
  if (Number.isInteger(unit?.team)) return unit.team * 2;
  return null;
}

export function zoneOwnerSlot(zone) {
  if (Number.isInteger(zone?.ownerSlot)) return zone.ownerSlot;
  if (Number.isInteger(zone?.ownerTeam)) return zone.ownerTeam * 2;
  return null;
}

export function setZoneOwner(zone, ownerSlot) {
  zone.ownerSlot = Number.isInteger(ownerSlot) ? ownerSlot : null;
  zone.ownerTeam = zone.ownerSlot === null ? null : teamForSlot(zone.ownerSlot);
  return zone;
}

export function sameForceSlots(a, b) {
  return Number.isInteger(a) && Number.isInteger(b) && teamForSlot(a) === teamForSlot(b);
}

export function activePlayerSlots(state) {
  return (state.players ?? [])
    .filter((player) => player.status !== 'eliminated')
    .map((player) => player.slot);
}

export function playerHydraCount(state, slot) {
  let count = 0;
  for (const unit of state.units ?? []) {
    if (
      unit.type === 'hydra'
      && unitOwnerSlot(unit) === slot
      && unit.hp > 0
    ) count += 1;
  }
  return count;
}

export function playerSunkenCount(map, slot) {
  return map.zones.filter(
    (zone) => zoneOwnerSlot(zone) === slot && (zone.sunkenHp ?? 0) > 0,
  ).length;
}

export function forcePlayerSlots(state, team) {
  return (state.players ?? [])
    .filter((player) => player.team === team)
    .map((player) => player.slot);
}

export function forceIsAlive(state, map, team) {
  return (state.players ?? []).some(
    (player) => player.team === team
      && player.status !== 'eliminated'
      && (playerHydraCount(state, player.slot) > 0 || playerSunkenCount(map, player.slot) > 0),
  );
}
