const UNIT_TYPE_TO_CODE = Object.freeze({
  hydra: 1,
  zealot: 2,
  overlord: 3,
});

const UNIT_CODE_TO_TYPE = Object.freeze([
  'unknown',
  'hydra',
  'zealot',
  'overlord',
]);

function align(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function layoutForCount(count) {
  let offset = 0;
  const ids = offset;
  offset += count * Int32Array.BYTES_PER_ELEMENT;
  const types = offset;
  offset += count * Uint8Array.BYTES_PER_ELEMENT;
  const ownerSlots = offset;
  offset += count * Uint8Array.BYTES_PER_ELEMENT;
  const teams = offset;
  offset += count * Uint8Array.BYTES_PER_ELEMENT;
  offset = align(offset, Float32Array.BYTES_PER_ELEMENT);
  const x = offset;
  offset += count * Float32Array.BYTES_PER_ELEMENT;
  const y = offset;
  offset += count * Float32Array.BYTES_PER_ELEMENT;
  const hp = offset;
  offset += count * Uint32Array.BYTES_PER_ELEMENT;
  const maxHp = offset;
  offset += count * Uint32Array.BYTES_PER_ELEMENT;
  const facing = offset;
  offset += count * Float32Array.BYTES_PER_ELEMENT;
  const attackFlashMs = offset;
  offset += count * Uint16Array.BYTES_PER_ELEMENT;
  return {
    ids,
    types,
    ownerSlots,
    teams,
    x,
    y,
    hp,
    maxHp,
    facing,
    attackFlashMs,
    byteLength: align(offset, 4),
  };
}

function viewsForFrame(frame) {
  const count = Math.max(0, frame?.count ?? 0);
  const buffer = frame?.buffer;
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('render unit frame requires an ArrayBuffer');
  }
  const layout = layoutForCount(count);
  if (buffer.byteLength < layout.byteLength) {
    throw new RangeError('render unit frame buffer is truncated');
  }
  return {
    count,
    ids: new Int32Array(buffer, layout.ids, count),
    types: new Uint8Array(buffer, layout.types, count),
    ownerSlots: new Uint8Array(buffer, layout.ownerSlots, count),
    teams: new Uint8Array(buffer, layout.teams, count),
    x: new Float32Array(buffer, layout.x, count),
    y: new Float32Array(buffer, layout.y, count),
    hp: new Uint32Array(buffer, layout.hp, count),
    maxHp: new Uint32Array(buffer, layout.maxHp, count),
    facing: new Float32Array(buffer, layout.facing, count),
    attackFlashMs: new Uint16Array(buffer, layout.attackFlashMs, count),
  };
}

export function packRenderUnitFrame(units) {
  const source = Array.isArray(units) ? units : [];
  const count = source.length;
  const layout = layoutForCount(count);
  const frame = { count, buffer: new ArrayBuffer(layout.byteLength) };
  const views = viewsForFrame(frame);

  for (let index = 0; index < count; index += 1) {
    const unit = source[index];
    views.ids[index] = unit.id ?? 0;
    views.types[index] = UNIT_TYPE_TO_CODE[unit.type] ?? 0;
    views.ownerSlots[index] = Number.isInteger(unit.ownerSlot) ? unit.ownerSlot : 0xff;
    views.teams[index] = Number.isInteger(unit.team) ? unit.team : 0xff;
    views.x[index] = unit.x ?? 0;
    views.y[index] = unit.y ?? 0;
    views.hp[index] = Math.max(0, unit.hp ?? 0);
    views.maxHp[index] = Math.max(0, unit.maxHp ?? 0);
    views.facing[index] = unit.facing ?? 0;
    views.attackFlashMs[index] = Math.max(0, unit.attackFlashMs ?? 0);
  }
  return frame;
}

export function unpackRenderUnitFrame(frame, cache = new Map()) {
  const views = viewsForFrame(frame);
  const units = new Array(views.count);

  for (let index = 0; index < views.count; index += 1) {
    const id = views.ids[index];
    let unit = cache.get(id);
    if (!unit) {
      unit = { id };
      cache.set(id, unit);
    }
    unit.type = UNIT_CODE_TO_TYPE[views.types[index]] ?? 'unknown';
    unit.ownerSlot = views.ownerSlots[index] === 0xff ? null : views.ownerSlots[index];
    unit.team = views.teams[index] === 0xff ? null : views.teams[index];
    unit.x = views.x[index];
    unit.y = views.y[index];
    unit.hp = views.hp[index];
    unit.maxHp = views.maxHp[index];
    unit.facing = views.facing[index];
    unit.attackFlashMs = views.attackFlashMs[index];
    units[index] = unit;
  }

  if (cache.size > views.count + 512) {
    const activeIds = new Set(units.map((unit) => unit.id));
    for (const id of cache.keys()) {
      if (!activeIds.has(id)) cache.delete(id);
    }
  }
  return units;
}

export function renderUnitFrameByteLength(count) {
  return layoutForCount(Math.max(0, count)).byteLength;
}
