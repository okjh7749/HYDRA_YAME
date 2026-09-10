import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const multiplayerUrl = new URL('../public/multiplayer-client.mjs', import.meta.url);
const classicUrl = new URL('../public/game-v3.mjs', import.meta.url);
const rendererUrl = new URL('../public/rts-render-v2.mjs', import.meta.url);

test('classic and multiplayer use the animated RTS renderer v2', async () => {
  const [multiplayer, classic, renderer] = await Promise.all([
    readFile(multiplayerUrl, 'utf8'),
    readFile(classicUrl, 'utf8'),
    readFile(rendererUrl, 'utf8'),
  ]);

  assert.match(multiplayer, /rts-render-v2\.mjs/);
  assert.match(classic, /rts-render-v2\.mjs/);
  assert.match(multiplayer, /isUnitMoving/);
  assert.match(multiplayer, /moving: unit\.moving/);
  assert.match(classic, /moving: unit\.pathIndex < unit\.path\.length/);
  assert.match(classic, /function drawClassicBeacons/);
  assert.doesNotMatch(classic, /drawZealot/);

  assert.match(renderer, /terrainMacroCell/);
  assert.match(renderer, /drawGatewayMarking/);
  assert.match(renderer, /drawControlDecks/);
  assert.match(renderer, /spriteAnimationFrame/);
  assert.match(renderer, /facingDirection8/);
  assert.match(renderer, /drawHydraBody/);
  assert.match(renderer, /drawOverlordBody/);
});
