import { playerBySlot, playerHydraCount, zoneOwnerSlot } from './game-ownership.mjs';

export const MINIMAP_SEMANTICS = Object.freeze({
  home: Object.freeze({ shape: 'diamond', size: 7, label: 'home' }),
  camera: Object.freeze({ shape: 'rectangle', lineWidth: 2.2, label: 'camera' }),
  controlIsland: Object.freeze({ shape: 'outline-rect', lineWidth: 1, label: 'control-island' }),
  beacon: Object.freeze({ shape: 'square', size: 3, label: 'beacon' }),
  upgradeBuilding: Object.freeze({ shape: 'outlined-square', size: 5, label: 'upgrade-building' }),
});

export function playerOwnedZoneCount(map, ownerSlot) {
  return map.zones.filter(
    (zone) => zoneOwnerSlot(zone) === ownerSlot && (zone.sunkenHp ?? 0) > 0,
  ).length;
}

export function playerHudSnapshot(state, map, ownerSlot) {
  const player = playerBySlot(state, ownerSlot);
  return {
    ownerSlot,
    scopeLabel: `P${ownerSlot + 1}`,
    zones: playerOwnedZoneCount(map, ownerSlot),
    totalZones: map.zones.length,
    minerals: player?.minerals ?? 0,
    kills: player?.kills ?? 0,
    sunkenKills: player?.sunkenKills ?? 0,
    hydras: playerHydraCount(state, ownerSlot),
  };
}
