export const HYDRA_SPAWN_INTERVAL_MS = 500;
export const CLASSIC_HYDRA_SPAWN_INTERVAL_MS = 800;
export const MAX_LOCAL_HYDRAS_PER_ZONE = 80;
export const HYDRA_BODY_RADIUS = 15;
export const HYDRA_MIN_SEPARATION = HYDRA_BODY_RADIUS * 2 + 2;
export const HYDRA_SPAWN_MIN_SPACING = HYDRA_BODY_RADIUS * 2;
export const AI_GRACE_PERIOD_MS = 15000;
export const UPGRADE_BUILDING_VISION_RADIUS = 144;

export const CLASSIC_SCOPE = Object.freeze({
  ownership: 'player-slot',
  minerals: 'player-slot',
  beaconRally: 'player-slot',
  victoryAlliance: 'force',
});
