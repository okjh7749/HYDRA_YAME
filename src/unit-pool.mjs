import {
  fromFixed,
  mixUint32,
  quantizeFacingRadians,
  toFixed,
} from './fixed-point.mjs';

export const DEFAULT_UNIT_POOL_CAPACITY = 2048;

const UNIT_TYPE_CODES = Object.freeze({ hydra: 1, zealot: 2, overlord: 3 });

function typeCode(type) {
  return UNIT_TYPE_CODES[type] ?? 0;
}

export class UnitPool {
  constructor(capacity = DEFAULT_UNIT_POOL_CAPACITY) {
    this.capacity = Math.max(1, capacity | 0);
    this.alive = new Uint8Array(this.capacity);
    this.id = new Int32Array(this.capacity);
    this.type = new Uint8Array(this.capacity);
    this.ownerSlot = new Int8Array(this.capacity);
    this.team = new Uint8Array(this.capacity);
    this.x = new Int32Array(this.capacity);
    this.y = new Int32Array(this.capacity);
    this.hp = new Int32Array(this.capacity);
    this.maxHp = new Int32Array(this.capacity);
    this.facing = new Uint16Array(this.capacity);
    this.flags = new Uint16Array(this.capacity);
    this.seenGeneration = new Uint32Array(this.capacity);
    this.nextFree = new Int32Array(this.capacity);
    this.idToIndex = new Map();
    this.generation = 0;
    this.count = 0;
    this.freeHead = 0;

    for (let index = 0; index < this.capacity - 1; index += 1) {
      this.nextFree[index] = index + 1;
    }
    this.nextFree[this.capacity - 1] = -1;
  }

  allocate(unit) {
    if (this.freeHead < 0) return -1;
    const index = this.freeHead;
    this.freeHead = this.nextFree[index];
    this.nextFree[index] = -1;
    this.alive[index] = 1;
    this.id[index] = unit.id | 0;
    this.idToIndex.set(unit.id | 0, index);
    this.count += 1;
    this.write(index, unit);
    return index;
  }

  releaseIndex(index) {
    if (index < 0 || index >= this.capacity || this.alive[index] === 0) return false;
    this.idToIndex.delete(this.id[index]);
    this.alive[index] = 0;
    this.id[index] = 0;
    this.nextFree[index] = this.freeHead;
    this.freeHead = index;
    this.count -= 1;
    return true;
  }

  releaseById(id) {
    const index = this.idToIndex.get(id | 0);
    return index === undefined ? false : this.releaseIndex(index);
  }

  write(index, unit) {
    this.type[index] = typeCode(unit.type);
    this.ownerSlot[index] = Number.isInteger(unit.ownerSlot) ? unit.ownerSlot : -1;
    this.team[index] = Number.isInteger(unit.team) ? unit.team : 0;
    this.x[index] = toFixed(unit.x);
    this.y[index] = toFixed(unit.y);
    this.hp[index] = Math.max(0, Math.ceil(unit.hp ?? 0)) | 0;
    this.maxHp[index] = Math.max(0, Math.ceil(unit.maxHp ?? 0)) | 0;
    this.facing[index] = quantizeFacingRadians(unit.facing ?? 0);
    let flags = 0;
    if ((unit.hp ?? 0) > 0) flags |= 1;
    if (unit.combatTargetable !== false) flags |= 2;
    if ((unit.path?.length ?? 0) > 0) flags |= 4;
    this.flags[index] = flags;
    return index;
  }

  upsert(unit) {
    const id = unit.id | 0;
    const existing = this.idToIndex.get(id);
    const index = existing === undefined ? this.allocate(unit) : existing;
    if (index < 0) return -1;
    this.write(index, unit);
    this.seenGeneration[index] = this.generation;
    return index;
  }

  syncFromUnits(units) {
    this.generation = (this.generation + 1) >>> 0;
    if (this.generation === 0) {
      this.seenGeneration.fill(0);
      this.generation = 1;
    }
    for (const unit of units ?? []) this.upsert(unit);
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.alive[index] && this.seenGeneration[index] !== this.generation) {
        this.releaseIndex(index);
      }
    }
    return this.count;
  }

  indexForId(id) {
    return this.idToIndex.get(id | 0) ?? -1;
  }

  positionForId(id) {
    const index = this.indexForId(id);
    if (index < 0) return null;
    return { x: fromFixed(this.x[index]), y: fromFixed(this.y[index]) };
  }

  checksum(seed = 2166136261) {
    let hash = seed >>> 0;
    for (let index = 0; index < this.capacity; index += 1) {
      if (!this.alive[index]) continue;
      hash = mixUint32(hash, this.id[index]);
      hash = mixUint32(hash, this.type[index]);
      hash = mixUint32(hash, this.ownerSlot[index]);
      hash = mixUint32(hash, this.team[index]);
      hash = mixUint32(hash, this.x[index]);
      hash = mixUint32(hash, this.y[index]);
      hash = mixUint32(hash, this.hp[index]);
      hash = mixUint32(hash, this.facing[index]);
      hash = mixUint32(hash, this.flags[index]);
    }
    return hash >>> 0;
  }
}
