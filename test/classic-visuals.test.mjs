import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const classicUrl = new URL('../public/game-v3.mjs', import.meta.url);
const rendererUrl = new URL('../public/rts-render.mjs', import.meta.url);

test('classic mode shares the detailed RTS terrain and unit renderer', async () => {
  const [classic, renderer] = await Promise.all([
    readFile(classicUrl, 'utf8'),
    readFile(rendererUrl, 'utf8'),
  ]);

  assert.match(classic, /drawIndustrialTerrain/);
  assert.match(classic, /drawRtsUnit/);
  assert.match(classic, /drawRtsSunken/);
  assert.match(renderer, /function drawRtsUnit/);
  assert.match(classic, /const fogCanvas = document\.createElement\('canvas'\)/);
  assert.match(classic, /fogCtx\.globalCompositeOperation = 'destination-out'/);
  assert.match(
    classic,
    /ctx\.drawImage\(fogCanvas, 0, 0, viewportWidth, viewportHeight\)/,
  );
});
