import { mixUint32, toFixed } from './fixed-point.mjs';
import {
  facingRadiansFromQuantized,
  fromFixed,
  quantizeFacingRadians,
} from './fixed-point.mjs';

export const DEFAULT_SIMULATION_SEED = 0x48_59_44_52;

export class DeterministicRng {
  constructor(seed = DEFAULT_SIMULATION_SEED) {
    this.state = (seed >>> 0) || DEFAULT_SIMULATION_SEED;
  }

  nextUint32() {
    let value = this.state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextInt(maxExclusive) {
    const max = Math.max(1, maxExclusive | 0);
    return this.nextUint32() % max;
  }
}

export function quantizeSimulationState(state) {
  for (const unit of state.units ?? []) {
    unit.x = fromFixed(toFixed(unit.x));
    unit.y = fromFixed(toFixed(unit.y));
    unit.facing = facingRadiansFromQuantized(quantizeFacingRadians(unit.facing ?? 0));
  }
  return state;
}

export function computeDeterministicStateChecksum(state, map, unitPool) {
  let hash = unitPool.checksum();
  hash = mixUint32(hash, state.nextUnitId ?? 0);
  hash = mixUint32(hash, state.match?.elapsedMs ?? 0);

  for (const player of state.players ?? []) {
    hash = mixUint32(hash, player.slot ?? 0);
    hash = mixUint32(hash, player.team ?? 0);
    hash = mixUint32(hash, player.minerals ?? 0);
    hash = mixUint32(hash, player.kills ?? 0);
    hash = mixUint32(hash, player.captures ?? 0);
    hash = mixUint32(hash, player.upgrades?.attack ?? 0);
    hash = mixUint32(hash, player.upgrades?.defense ?? 0);
    hash = mixUint32(hash, player.upgrades?.range ?? 0);
    hash = mixUint32(hash, player.upgrades?.speed ?? 0);
  }

  for (const zone of map.zones ?? []) {
    hash = mixUint32(hash, zone.id ?? 0);
    hash = mixUint32(hash, zone.ownerSlot ?? 0xffff);
    hash = mixUint32(hash, zone.ownerTeam ?? 0xffff);
    hash = mixUint32(hash, zone.sunkenHp ?? 0);
    hash = mixUint32(hash, toFixed(zone.x));
    hash = mixUint32(hash, toFixed(zone.y));
  }

  return hash >>> 0;
}
