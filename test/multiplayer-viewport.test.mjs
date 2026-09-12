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
  assert.match(client, /window\.addEventListener\('pointermove'/);
  assert.match(client, /const edge = 30;/);
  assert.doesNotMatch(client, /combatShakeOffset|translate\(shake\.x/);
  assert.match(client, /fillStyle = '#43e6b1'/);
  assert.match(client, /event\.code === 'KeyA'/);
  assert.match(client, /type: 'attack-move'/);
  assert.match(client, /function panCameraFromMinimap\(/);
  assert.match(client, /minimap\.addEventListener\('pointermove'/);
  assert.match(html, /A\+CLICK: ATTACK MOVE/);
  assert.match(client, /projectLockstepSnapshot/);
  assert.match(client, /function lockstepRenderingHealthy\(\)/);
  assert.match(client, /if \(lockstepRenderingHealthy\(\)\) return;/);
  assert.match(client, /lockstepResyncs < 3/);
});

test('multiplayer snapshots render visible MASS ASSAULT beacon pads', async () => {
  const client = await readFile(clientUrl, 'utf8');
  assert.match(client, /function drawBeacons\(\)/);
  assert.match(client, /snapshot\?\.beacons/);
  assert.match(client, /MASS ASSAULT/);
});

test('multiplayer renders base infrastructure and can recenter on the authoritative home', async () => {
  const [html, client] = await Promise.all([
    readFile(htmlUrl, 'utf8'),
    readFile(clientUrl, 'utf8'),
  ]);

  assert.match(client, /function drawUpgradeBuildings\(\)/);
  assert.match(client, /snapshot\?\.buildings/);
  assert.match(client, /snapshot\.self\.homeX/);
  assert.match(client, /centerCameraOnHome\(true\)/);
  assert.match(client, /event\.code === 'KeyH'/);
  assert.match(html, /H: HOME/);
});
