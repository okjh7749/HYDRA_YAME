import {
  CONTROL_ISLAND_BUILDING_RADIUS,
  CONTROL_ISLAND_INSET,
  clampPointToControlIsland,
  controlIslandForPlayer,
  infrastructureFrameForPlayer,
  pointInControlIsland,
} from './game-infrastructure.mjs';
import { unitOwnerSlot } from './game-ownership.mjs';
import { assignMoveOrders } from './game-simulation.mjs';

export const ZEALOT_HP = 9999;
export const ZEALOT_SPEED = 140;
export const ZEALOT_VISION_RADIUS = 96;
export const BEACON_PAD_RADIUS = 17;
export const BEACON_PAD_DISTANCE = 76;

// Hollow 3x3 perimeter: eight pads, deliberately no center pad.
export const BEACON_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'NW', ox: -1, oy: -1, targetZoneId: 1 }),
  Object.freeze({ key: 'N', ox: 0, oy: -1, targetZoneId: 2 }),
  Object.freeze({ key: 'NE', ox: 1, oy: -1, targetZoneId: 3 }),
  Object.freeze({ key: 'W', ox: -1, oy: 0, targetZoneId: 9 }),
  Object.freeze({ key: 'E', ox: 1, oy: 0, targetZoneId: 13 }),
  Object.freeze({ key: 'SW', ox: -1, oy: 1, targetZoneId: 19 }),
  Object.freeze({ key: 'S', ox: 0, oy: 1, targetZoneId: 20 }),
  Object.freeze({ key: 'SE', ox: 1, oy: 1, targetZoneId: 21 }),
]);

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function beaconCenterForPlayer(player) {
  return infrastructureFrameForPlayer(player).center;
}

function createBeaconZealot(state, player, center) {
  const spawn = {
    id: state.nextUnitId,
    type: 'zealot',
    ownerSlot: player.slot,
    team: player.team,
    x: center.x,
    y: center.y,
    hp: ZEALOT_HP,
    maxHp: ZEALOT_HP,
    speed: ZEALOT_SPEED,
    visionRadius: ZEALOT_VISION_RADIUS,
    path: [],
    pathIndex: 0,
    facing: 0,
    attackCooldownMs: 0,
    combatTargetable: false,
    beaconController: true,
    beaconCooldownMs: 0,
  };
  state.nextUnitId += 1;
  state.units.push(spawn);
  return spawn;
}

export function initializeBeaconSystem(state, map) {
  if (state.beaconPads && state.beaconCenters) return state.beaconPads;

  state.beaconPads = [];
  state.beaconCenters = new Map();

  for (const player of state.players ?? []) {
    const center = beaconCenterForPlayer(player);
    state.beaconCenters.set(player.slot, center);

    for (const direction of BEACON_DIRECTIONS) {
      state.beaconPads.push({
        id: `beacon-${player.slot}-${direction.key}`,
        ownerSlot: player.slot,
        team: player.team,
        direction: direction.key,
        targetZoneId: direction.targetZoneId,
        x: center.x + direction.ox * BEACON_PAD_DISTANCE,
        y: center.y + direction.oy * BEACON_PAD_DISTANCE,
        radius: BEACON_PAD_RADIUS,
      });
    }

    const exists = state.units.some(
      (unit) => unit.type === 'zealot'
        && unitOwnerSlot(unit) === player.slot
        && unit.beaconController,
    );
    if (!exists) createBeaconZealot(state, player, center);
  }

  return state.beaconPads;
}

export function beaconPadsForTeam(state, team) {
  return (state.beaconPads ?? []).filter((pad) => pad.team === team);
}

export function beaconPadsForPlayer(state, ownerSlot) {
  return (state.beaconPads ?? []).filter((pad) => pad.ownerSlot === ownerSlot);
}

function issueHydraRally(state, map, hydras, targetZoneId, orderType) {
  const targetZone = map.zones.find((zone) => zone.id === targetZoneId);
  if (!targetZone || hydras.length === 0) return 0;

  const ids = new Set(hydras.map((hydra) => hydra.id));
  const ordered = assignMoveOrders(map, state, ids, targetZone, { orderType });
  for (const hydra of hydras) {
    if (hydra.orderType !== orderType || hydra.path.length === 0) continue;
    hydra.rallyTargetZoneId = targetZoneId;
  }
  return ordered;
}

export function issueTeamHydraRally(state, map, team, targetZoneId) {
  const hydras = state.units.filter(
    (unit) => unit.type === 'hydra' && unit.team === team && unit.hp > 0,
  );
  return issueHydraRally(state, map, hydras, targetZoneId, 'beacon-rally');
}

export function issuePlayerHydraRally(state, map, ownerSlot, targetZoneId) {
  const hydras = state.units.filter(
    (unit) => unit.type === 'hydra'
      && unitOwnerSlot(unit) === ownerSlot
      && unit.hp > 0,
  );
  return issueHydraRally(state, map, hydras, targetZoneId, 'beacon-rally');
}

export function assignBeaconControllerMove(state, unit, target) {
  if (!unit?.beaconController) return false;
  const player = (state.players ?? []).find((candidate) => candidate.slot === unitOwnerSlot(unit));
  const island = player ? controlIslandForPlayer(player) : null;
  if (!island || !pointInControlIsland(island, target.x, target.y, CONTROL_ISLAND_INSET)) return false;
  const clamped = clampPointToControlIsland(island, target, CONTROL_ISLAND_INSET);
  const blocked = (state.upgradeBuildings ?? []).some(
    (building) => building.hp > 0
      && building.ownerSlot === player.slot
      && distanceSquared(building, clamped) < (CONTROL_ISLAND_BUILDING_RADIUS + 18) ** 2,
  );
  if (blocked) return false;
  unit.path = [clamped];
  unit.pathIndex = 0;
  unit.orderType = 'beacon-control';
  unit.attackMoveEngaged = false;
  return true;
}

function sendZealotHome(state, zealot) {
  const center = state.beaconCenters?.get(unitOwnerSlot(zealot));
  if (!center) return;
  zealot.path = [{ x: center.x, y: center.y }];
  zealot.pathIndex = 0;
  zealot.orderType = 'beacon-return';
}

export function stepBeaconSystem(state, map, deltaMs) {
  initializeBeaconSystem(state, map);
  if (state.match && state.match.phase !== 'running') return [];
  const events = [];

  for (const zealot of state.units) {
    if (!zealot.beaconController || zealot.hp <= 0) continue;
    zealot.beaconCooldownMs = Math.max(0, (zealot.beaconCooldownMs ?? 0) - deltaMs);
    if (zealot.beaconCooldownMs > 0) continue;

    const pad = beaconPadsForPlayer(state, unitOwnerSlot(zealot)).find(
      (candidate) => distanceSquared(zealot, candidate) <= candidate.radius * candidate.radius,
    );
    if (!pad) continue;

    const ownerSlot = unitOwnerSlot(zealot);
    const ordered = issuePlayerHydraRally(state, map, ownerSlot, pad.targetZoneId);
    zealot.beaconCooldownMs = 650;
    sendZealotHome(state, zealot);
    events.push({
      type: 'beacon-rally',
      ownerSlot,
      team: zealot.team,
      direction: pad.direction,
      targetZoneId: pad.targetZoneId,
      ordered,
    });
  }

  return events;
}
