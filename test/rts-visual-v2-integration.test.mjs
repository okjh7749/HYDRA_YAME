import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const multiplayerUrl = new URL('../public/multiplayer-client.mjs', import.meta.url);
const classicUrl = new URL('../public/game-v3.mjs', import.meta.url);
const rendererUrl = new URL('../public/rts-render-v3.mjs', import.meta.url);
const atlasUrl = new URL('../public/rts-sprite-atlas.mjs', import.meta.url);

test('classic and multiplayer use the sprite-atlas RTS renderer', async () => {
  const [multiplayer, classic, renderer, atlas] = await Promise.all([
    readFile(multiplayerUrl, 'utf8'),
    readFile(classicUrl, 'utf8'),
    readFile(rendererUrl, 'utf8'),
    readFile(atlasUrl, 'utf8'),
  ]);

  assert.match(multiplayer, /rts-render-v3\.mjs/);
  assert.match(classic, /rts-render-v3\.mjs/);
  assert.match(multiplayer, /isUnitMoving/);
  assert.match(multiplayer, /moving: unit\.moving/);
  assert.match(multiplayer, /effects: frameEffects/);
  assert.match(classic, /moving: unit\.pathIndex < unit\.path\.length/);
  assert.match(classic, /effects: simulation\.effects/);
  assert.match(classic, /function drawClassicBeacons/);
  assert.doesNotMatch(classic, /drawZealot/);

  assert.match(renderer, /getSpriteAtlas/);
  assert.match(renderer, /resolveUnitAnimation/);
  assert.match(renderer, /drawHydraProjectile/);
  assert.match(renderer, /drawDeathSprite/);
  assert.match(atlas, /OffscreenCanvas/);
  assert.match(atlas, /SPRITE_FRAMES_PER_DIRECTION/);
  assert.match(atlas, /drawAtlasSprite/);
  assert.match(atlas, /ctx\.drawImage/);
});
