import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const htmlUrl = new URL('../public/multiplayer.html', import.meta.url);
const clientUrl = new URL('../public/multiplayer-client.mjs', import.meta.url);
const cssUrl = new URL('../public/multiplayer.css', import.meta.url);

test('multiplayer match uses a full-screen camera viewport with in-world HUD', async () => {
  const [html, client, css] = await Promise.all([
    readFile(htmlUrl, 'utf8'),
    readFile(clientUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
  ]);

  assert.doesNotMatch(html, /<aside class="side-panel">/);
  assert.match(html, /<canvas id="battlefield"/);
  assert.match(html, /<canvas id="minimap"/);
  assert.match(html, /hud-top-left/);
  assert.match(html, /hud-top-right/);
  assert.match(css, /\.game-screen \{[\s\S]*position: fixed;[\s\S]*inset: 0;/);
  assert.match(css, /#battlefield \{[\s\S]*width: 100%;[\s\S]*height: 100%;/);
  assert.match(client, /const CAMERA_ZOOM = RTS_CAMERA_ZOOM;/);
  assert.match(client, /function interpolatedUnits\(/);
  assert.match(client, /drawIndustrialTerrain/);
  assert.match(client, /drawRtsUnit/);
  assert.match(css, /RTS command console visual overhaul/);
  assert.match(client, /function updateCamera\(/);
  assert.match(client, /cameraWorldWidth\(\)/);
  assert.match(client, /minimap\.addEventListener\('pointerdown'/);
});

test('multiplayer snapshots render visible MASS ASSAULT beacon pads', async () => {
  const client = await readFile(clientUrl, 'utf8');
  assert.match(client, /function drawBeacons\(\)/);
  assert.match(client, /snapshot\?\.beacons/);
  assert.match(client, /MASS ASSAULT/);
});
