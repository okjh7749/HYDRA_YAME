import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildClassicMap } from '../src/game-core.mjs';
import { stepFormationMovement } from '../src/game-formation.mjs';
import {
  HYDRA_SPAWN_INTERVAL_MS,
  createSimulation,
  formationOffset,
  stepProduction,
} from '../src/game-simulation.mjs';

test('80-unit formation stays narrow enough for RTS choke approaches', () => {
  const offsets = Array.from({ length: 80 }, (_, index) => formationOffset(index, 80));
  const columns = new Set(offsets.map((offset) => offset.x));
  const rows = new Set(offsets.map((offset) => offset.y));

  assert.equal(columns.size, 7);
  assert.equal(rows.size, 12);
  assert.ok(Math.max(...offsets.map((offset) => Math.abs(offset.x))) <= 66);
});

test('hydras hold their firing position during the short attack animation', () => {
  const map = buildClassicMap();
  const state = createSimulation(map, { localTeam: 0 });
  stepProduction(state, map, HYDRA_SPAWN_INTERVAL_MS);
  const hydra = state.units.find((unit) => unit.type === 'hydra' && unit.ownerSlot === 0);
  const zone = map.zones[7];

  hydra.x = zone.x;
  hydra.y = zone.y;
  hydra.path = [{ x: zone.x, y: zone.y }, { x: zone.x + 96, y: zone.y }];
  hydra.pathIndex = 1;
  hydra.attackFlashMs = 180;
  const before = { x: hydra.x, y: hydra.y };

  stepFormationMovement(state, map, 50);

  assert.equal(hydra.x, before.x);
  assert.equal(hydra.y, before.y);
  assert.equal(hydra.pathIndex, 1);
});

test('classic and multiplayer wire distinct RTS cues and ground-spike sunken strikes', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const classic = fs.readFileSync(path.join(root, 'public/game-v3.mjs'), 'utf8');
  const multiplayer = fs.readFileSync(path.join(root, 'public/multiplayer-client.mjs'), 'utf8');
  const audio = fs.readFileSync(path.join(root, 'public/rts-audio.mjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'public/rts-render-v3.mjs'), 'utf8');

  for (const source of [classic, multiplayer]) {
    assert.match(source, /playUiCue\('select'\)/);
    assert.match(source, /playUiCue\('move'\)/);
    assert.match(source, /playUiCue\('upgrade'\)/);
  }
  assert.match(audio, /kind === 'capture'/);
  assert.match(renderer, /const segments = 7/);
  assert.match(renderer, /ctx\.lineTo\(x, y - height\)/);
});
