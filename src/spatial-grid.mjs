export class SpatialGrid {
  constructor(cellSize = 128) {
    this.cellSize = Math.max(1, cellSize);
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  keyFor(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  insert(item, x = item.x, y = item.y) {
    const key = this.keyFor(x, y);
    const bucket = this.cells.get(key) ?? [];
    bucket.push(item);
    this.cells.set(key, bucket);
    return item;
  }

  build(items, predicate = null) {
    this.clear();
    for (const item of items ?? []) {
      if (predicate && !predicate(item)) continue;
      this.insert(item);
    }
    return this;
  }

  query(x, y, radius) {
    const span = Math.max(0, Math.ceil(radius / this.cellSize));
    const centerX = Math.floor(x / this.cellSize);
    const centerY = Math.floor(y / this.cellSize);
    const result = [];
    for (let offsetY = -span; offsetY <= span; offsetY += 1) {
      for (let offsetX = -span; offsetX <= span; offsetX += 1) {
        const bucket = this.cells.get(`${centerX + offsetX},${centerY + offsetY}`);
        if (bucket) result.push(...bucket);
      }
    }
    return result;
  }
}

export function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
