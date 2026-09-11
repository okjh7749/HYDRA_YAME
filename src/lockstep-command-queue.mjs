import { fromFixed, toFixed } from './fixed-point.mjs';

export const DEFAULT_LOCKSTEP_INPUT_DELAY_TICKS = 2;
export const DEFAULT_LOCKSTEP_RING_SIZE = 256;

function normalizeUnitIds(unitIds) {
  const ids = Array.isArray(unitIds)
    ? unitIds.filter((id) => Number.isInteger(id)).slice(0, 512)
    : [];
  ids.sort((a, b) => a - b);
  let write = 0;
  for (let read = 0; read < ids.length; read += 1) {
    if (read > 0 && ids[read] === ids[read - 1]) continue;
    ids[write] = ids[read];
    write += 1;
  }
  ids.length = write;
  return Int32Array.from(ids);
}

export function canonicalizeLockstepCommand(command, playerSlot, sequence, tick) {
  const type = command?.type;
  if (type !== 'move' && type !== 'attack-move' && type !== 'upgrade') return null;

  if (type === 'upgrade') {
    return {
      tick: tick >>> 0,
      sequence: sequence >>> 0,
      playerSlot: playerSlot | 0,
      type,
      buildingId: String(command.buildingId ?? ''),
      upgradeKey: String(command.upgradeKey ?? ''),
    };
  }

  const x = Number(command.x);
  const y = Number(command.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    tick: tick >>> 0,
    sequence: sequence >>> 0,
    playerSlot: playerSlot | 0,
    type,
    unitIds: normalizeUnitIds(command.unitIds),
    xFixed: toFixed(x),
    yFixed: toFixed(y),
  };
}

export function lockstepCommandToWire(command) {
  const wire = {
    tick: command.tick,
    sequence: command.sequence,
    playerSlot: command.playerSlot,
    type: command.type,
  };
  if (command.type === 'upgrade') {
    wire.buildingId = command.buildingId;
    wire.upgradeKey = command.upgradeKey;
  } else {
    wire.unitIds = Array.from(command.unitIds);
    wire.x = fromFixed(command.xFixed);
    wire.y = fromFixed(command.yFixed);
  }
  return wire;
}

export class LockstepCommandQueue {
  constructor({ inputDelayTicks = DEFAULT_LOCKSTEP_INPUT_DELAY_TICKS, ringSize = DEFAULT_LOCKSTEP_RING_SIZE } = {}) {
    this.inputDelayTicks = Math.max(1, inputDelayTicks | 0);
    this.ringSize = Math.max(8, ringSize | 0);
    this.buckets = Array.from({ length: this.ringSize }, () => ({ tick: -1, commands: [] }));
    this.nextSequence = 1;
  }

  schedule(currentTick, playerSlot, command) {
    const tick = (currentTick + this.inputDelayTicks) >>> 0;
    const canonical = canonicalizeLockstepCommand(command, playerSlot, this.nextSequence, tick);
    if (!canonical) return null;
    this.nextSequence = (this.nextSequence + 1) >>> 0 || 1;
    const bucket = this.buckets[tick % this.ringSize];
    if (bucket.tick !== tick) {
      bucket.tick = tick;
      bucket.commands.length = 0;
    }
    bucket.commands.push(canonical);
    return canonical;
  }

  drain(tick) {
    const bucket = this.buckets[(tick >>> 0) % this.ringSize];
    if (bucket.tick !== (tick >>> 0)) return [];
    bucket.commands.sort((a, b) => a.playerSlot - b.playerSlot || a.sequence - b.sequence);
    const commands = bucket.commands.slice();
    bucket.commands.length = 0;
    bucket.tick = -1;
    return commands;
  }
}
