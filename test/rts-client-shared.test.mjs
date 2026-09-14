import assert from 'node:assert/strict';
import test from 'node:test';

import { buildClassicMap } from '../src/game-core.mjs';
import {
  minimapEventToWorld,
  screenPointToWorld,
  touchTapShouldIssueMove,
} from '../src/rts-client-shared.mjs';

test('shared client coordinates preserve camera/zoom and minimap bounds', () => {
  const map = buildClassicMap();
  assert.deepEqual(screenPointToWorld({ x: 200, y: 100 }, { x: 50, y: 75 }, 2), {
    x: 150,
    y: 125,
  });

  const minimap = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }),
  };
  assert.deepEqual(
    minimapEventToWorld({ clientX: 110, clientY: 70 }, minimap, map),
    { x: map.worldWidth / 2, y: map.worldHeight / 2 },
  );
});

test('touch tap moves only when a selection exists and the tap is on empty ground', () => {
  assert.equal(touchTapShouldIssueMove({
    pointerType: 'touch', selectedCount: 3, hitSelectable: false, dragDistance: 2,
  }), true);
  assert.equal(touchTapShouldIssueMove({
    pointerType: 'touch', selectedCount: 3, hitSelectable: true, dragDistance: 2,
  }), false);
  assert.equal(touchTapShouldIssueMove({
    pointerType: 'touch', selectedCount: 3, hitSelectable: false, dragDistance: 40,
  }), false);
  assert.equal(touchTapShouldIssueMove({
    pointerType: 'mouse', selectedCount: 3, hitSelectable: false, dragDistance: 2,
  }), false);
});
