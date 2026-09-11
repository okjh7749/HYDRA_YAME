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
  assert.match(classic, /fogCtx\.fillStyle = 'rgba\(0,0,0,1\)'/);
  const fogStart = classic.indexOf('function drawFog()');
  const fogEnd = classic.indexOf('function drawSelectionBox()', fogStart);
  const fogBlock = classic.slice(fogStart, fogEnd);
  assert.doesNotMatch(fogBlock, /createRadialGradient/);

  const renderStart = classic.indexOf('function render(');
  const renderEnd = classic.indexOf('function selectFromDrag()', renderStart);
  const renderBlock = classic.slice(renderStart, renderEnd);
  assert.ok(renderBlock.indexOf('drawFog();') < renderBlock.indexOf('drawUnits();'));
  assert.match(
    classic,
    /ctx\.drawImage\(fogCanvas, 0, 0, viewportWidth, viewportHeight\)/,
  );
});
