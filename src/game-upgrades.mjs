import {
  HYDRA_SPEED,
  HYDRA_SPEED_UPGRADE_MULTIPLIER,
} from './game-simulation.mjs';

export const UPGRADE_BUILDING_HP = 9999;

export const UPGRADE_DEFINITIONS = Object.freeze({
  attack: Object.freeze({
    key: 'attack',
    label: '공격력',
    cost: 50,
    max: 255,
    buildingType: 'evolution',
  }),
  defense: Object.freeze({
    key: 'defense',
    label: '방어력',
    cost: 50,
    max: 255,
    buildingType: 'evolution',
  }),
  range: Object.freeze({
    key: 'range',
    label: '사거리',
    cost: 100,
    max: 1,
    buildingType: 'hydra-den',
  }),
  speed: Object.freeze({
    key: 'speed',
    label: '이동속도',
    cost: 100,
    max: 1,
    buildingType: 'hydra-den',
  }),
});

const BUILDING_LAYOUT = Object.freeze([
  Object.freeze({ type: 'hydra-den', label: 'Hydralisk Den', shortLabel: 'HD', dx: -52, dy: 52 }),
  Object.freeze({ type: 'evolution', label: 'Evolution Chamber', shortLabel: 'EV', dx: 52, dy: 52 }),
]);

function playerForTeam(state, team) {
  return state.players?.find((player) => player.team === team) ?? null;
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function initializeUpgradeBuildings(state) {
  if (state.upgradeBuildings) return state.upgradeBuildings;
  state.upgradeBuildings = [];

  for (const player of state.players ?? []) {
    for (const layout of BUILDING_LAYOUT) {
      state.upgradeBuildings.push({
        id: `upgrade-${player.team}-${layout.type}`,
        type: layout.type,
        label: layout.label,
        shortLabel: layout.shortLabel,
        team: player.team,
        x: player.homeX + layout.dx,
        y: player.homeY + layout.dy,
        hp: UPGRADE_BUILDING_HP,
        maxHp: UPGRADE_BUILDING_HP,
      });
    }
  }

  return state.upgradeBuildings;
}

export function getUpgradeBuilding(state, buildingId) {
  return state.upgradeBuildings?.find((building) => building.id === buildingId) ?? null;
}

export function nearestUpgradeBuilding(state, team, point, radius = 34) {
  const radiusSquared = radius * radius;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const building of state.upgradeBuildings ?? []) {
    if (building.hp <= 0 || (team !== null && building.team !== team)) continue;
    const distance = distanceSquared(building, point);
    if (distance <= radiusSquared && distance < bestDistance) {
      best = building;
      bestDistance = distance;
    }
  }

  return best;
}

export function upgradeOptionsForBuilding(building) {
  if (!building) return [];
  return Object.values(UPGRADE_DEFINITIONS).filter(
    (definition) => definition.buildingType === building.type,
  );
}

export function upgradeLevel(state, team, upgradeKey) {
  return playerForTeam(state, team)?.upgrades?.[upgradeKey] ?? 0;
}

function applySpeedUpgradeToExistingHydras(state, team) {
  const multiplier = upgradeLevel(state, team, 'speed') > 0
    ? HYDRA_SPEED_UPGRADE_MULTIPLIER
    : 1;
  for (const unit of state.units) {
    if (unit.type === 'hydra' && unit.team === team) {
      unit.speed = HYDRA_SPEED * multiplier;
    }
  }
}

export function purchaseUpgrade(state, team, buildingId, upgradeKey) {
  const player = playerForTeam(state, team);
  const building = getUpgradeBuilding(state, buildingId);
  const definition = UPGRADE_DEFINITIONS[upgradeKey];

  if (!player || !building || !definition) {
    return { ok: false, reason: 'invalid-upgrade' };
  }
  if (building.team !== team || building.hp <= 0) {
    return { ok: false, reason: 'not-owned' };
  }
  if (definition.buildingType !== building.type) {
    return { ok: false, reason: 'wrong-building' };
  }

  const currentLevel = player.upgrades[upgradeKey] ?? 0;
  if (currentLevel >= definition.max) {
    return { ok: false, reason: 'max-level' };
  }
  if (player.minerals < definition.cost) {
    return { ok: false, reason: 'insufficient-minerals' };
  }

  player.minerals -= definition.cost;
  player.upgrades[upgradeKey] = currentLevel + 1;
  if (upgradeKey === 'speed') applySpeedUpgradeToExistingHydras(state, team);

  return {
    ok: true,
    upgradeKey,
    level: player.upgrades[upgradeKey],
    cost: definition.cost,
    minerals: player.minerals,
  };
}

export function upgradeButtonState(state, team, building, upgradeKey) {
  const definition = UPGRADE_DEFINITIONS[upgradeKey];
  const player = playerForTeam(state, team);
  const level = upgradeLevel(state, team, upgradeKey);
  const owned = Boolean(building && building.team === team && building.hp > 0);
  const compatible = Boolean(definition && building && definition.buildingType === building.type);
  const maxed = Boolean(definition && level >= definition.max);
  const affordable = Boolean(player && definition && player.minerals >= definition.cost);

  return {
    enabled: owned && compatible && !maxed && affordable,
    level,
    max: definition?.max ?? 0,
    cost: definition?.cost ?? 0,
    maxed,
  };
}
