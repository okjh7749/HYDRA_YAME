import test from 'node:test';
import assert from 'node:assert/strict';

import { drawVisionFog, resizeFogSurface } from '../public/vision-render.mjs';

function fakeContext() {
  const calls = [];
  let composite = 'source-over';
  const ctx = {
    calls,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    clearRect(...args) { calls.push(['clearRect', ...args]); },
    fillRect(...args) { calls.push(['fillRect', ...args]); },
    setTransform(...args) { calls.push(['setTransform', ...args]); },
    beginPath() { calls.push(['beginPath']); },
    arc(...args) { calls.push(['arc', ...args]); },
    fill() { calls.push(['fill']); },
    drawImage(...args) { calls.push(['drawImage', ...args]); },
    createRadialGradient(...args) {
      calls.push(['createRadialGradient', ...args]);
      return { addColorStop: (...stop) => calls.push(['addColorStop', ...stop]) };
    },
  };
  Object.defineProperty(ctx, 'globalCompositeOperation', {
    get() { return composite; },
    set(value) {
      composite = value;
      calls.push(['composite', value]);
    },
  });
  return ctx;
}

test('fog surface scales to the device pixel ratio', () => {
  const canvas = {};
  const ctx = fakeContext();
  resizeFogSurface(canvas, ctx, 640, 360, 2);
  assert.equal(canvas.width, 1280);
  assert.equal(canvas.height, 720);
  assert.deepEqual(ctx.calls.at(-1), ['setTransform', 2, 0, 0, 2, 0, 0]);
});

test('vision holes are composited on the fog surface, not the battlefield', () => {
  const ctx = fakeContext();
  const fogCtx = fakeContext();
  const fogCanvas = { id: 'fog' };
  drawVisionFog({
    ctx,
    fogCtx,
    fogCanvas,
    sources: [{ x: 120, y: 80, radius: 60 }],
    camera: { x: 20, y: 10 },
    viewportWidth: 640,
    viewportHeight: 360,
    visibleWorldPoint: () => true,
  });

  assert.ok(fogCtx.calls.some((call) => call[0] === 'composite' && call[1] === 'destination-out'));
  assert.equal(
    ctx.calls.some((call) => call[0] === 'composite' && call[1] === 'destination-out'),
    false,
  );
  assert.ok(ctx.calls.some(
    (call) => call[0] === 'drawImage'
      && call[1] === fogCanvas
      && call[4] === 640
      && call[5] === 360,
  ));
});
