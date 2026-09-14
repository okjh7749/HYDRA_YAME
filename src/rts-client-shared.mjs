import {
  FOG_EXPLORED,
  FOG_UNEXPLORED,
  FOG_VISIBLE,
  createExplorationGrid,
  fogStateForTile,
  updateExplorationGrid,
} from './game-visibility.mjs';

export { FOG_EXPLORED, FOG_UNEXPLORED, FOG_VISIBLE };

export function createClientFogMemory(map) {
  return createExplorationGrid(map);
}

export function updateClientFogMemory(memory, map, sources, fullVision = false) {
  if (fullVision) {
    memory.fill(1);
    return memory;
  }
  return updateExplorationGrid(memory, map, sources);
}

export function clientFogStateForTile(memory, map, sources, tileX, tileY, fullVision = false) {
  if (fullVision) return FOG_VISIBLE;
  return fogStateForTile(memory, map, sources, tileX, tileY);
}

export function screenPointToWorld(point, camera, zoom = 1) {
  return {
    x: camera.x + point.x / zoom,
    y: camera.y + point.y / zoom,
  };
}

export function pointerEventToWorld(event, canvas, camera, zoom = 1) {
  const rect = canvas.getBoundingClientRect();
  return screenPointToWorld({
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }, camera, zoom);
}

export function minimapEventToWorld(event, minimap, map) {
  const rect = minimap.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  return {
    x: (x / Math.max(1, rect.width)) * map.worldWidth,
    y: (y / Math.max(1, rect.height)) * map.worldHeight,
  };
}

export function selectionBounds(start, end) {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  };
}

export function selectionDistance(start, end) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function touchTapShouldIssueMove({ pointerType, selectedCount, hitSelectable, dragDistance }) {
  return pointerType === 'touch'
    && selectedCount > 0
    && !hitSelectable
    && dragDistance < 18;
}

export function setTextIfChanged(node, value) {
  const text = String(value);
  if (node && node.textContent !== text) node.textContent = text;
}

export function setHiddenIfChanged(node, hidden) {
  const next = Boolean(hidden);
  if (node && node.hidden !== next) node.hidden = next;
}
