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
  assert.match(classic, /clientFogStateForTile/);
  assert.match(classic, /FOG_EXPLORED/);
  assert.match(classic, /FOG_VISIBLE/);
  const fogStart = classic.indexOf('function drawFog()');
  const fogEnd = classic.indexOf('function drawSelectionBox()', fogStart);
  const fogBlock = classic.slice(fogStart, fogEnd);
  assert.doesNotMatch(fogBlock, /createRadialGradient/);

  const renderStart = classic.indexOf('function render(');
  const renderEnd = classic.indexOf('function selectFromDrag()', renderStart);
  const renderBlock = classic.slice(renderStart, renderEnd);
  assert.doesNotMatch(renderBlock, /combatShakeOffset|translate\(shake\.x/);
  assert.match(classic, /fillStyle = '#43e6b1'/);
  assert.ok(renderBlock.indexOf('drawFog();') < renderBlock.indexOf('drawUnits();'));
  assert.match(
    classic,
    /ctx\.drawImage\(fogCanvas, 0, 0, viewportWidth, viewportHeight\)/,
  );
});

test('classic controls expose fast RTS selection and responsive attack-move feedback', async () => {
  const classic = await readFile(classicUrl, 'utf8');
  assert.match(classic, /event\.code === 'Digit1'/);
  assert.match(classic, /event\.code === 'Digit2'/);
  assert.match(classic, /event\.code === 'Digit3'/);
  assert.match(classic, /event\.code === 'Digit4'/);
  assert.match(classic, /event\.code === 'Digit5'/);
  assert.match(classic, /event\.code === 'Space'/);
  assert.match(classic, /orderType: 'attack-move'/);
  assert.match(classic, /function drawMoveMarker\(\)/);
  assert.match(classic, /DRAG_SELECTION_LIMIT = 24/);
  assert.match(classic, /const speed = 700/);
  assert.match(classic, /const edge = 44/);
  assert.match(classic, /document\.addEventListener\('contextmenu'/);
  const contextMenuBlock = classic.slice(
    classic.indexOf("document.addEventListener('contextmenu'"),
    classic.indexOf("gameCanvas.addEventListener('contextmenu'"),
  );
  assert.match(contextMenuBlock, /event\.preventDefault\(\)/);
  assert.doesNotMatch(contextMenuBlock, /stopPropagation/);
  const pointerDownBlock = classic.slice(
    classic.indexOf("gameCanvas.addEventListener('pointerdown'"),
    classic.indexOf("gameCanvas.addEventListener('pointermove'"),
  );
  assert.match(pointerDownBlock, /event\.button === 2/);
  assert.match(pointerDownBlock, /issueMoveCommand\(event\.clientX - rect\.left, event\.clientY - rect\.top\)/);
  const canvasContextBlock = classic.slice(
    classic.indexOf("gameCanvas.addEventListener('contextmenu'"),
    classic.indexOf("minimap.addEventListener('pointerdown'"),
  );
  assert.doesNotMatch(canvasContextBlock, /issueMoveCommand/);
});
