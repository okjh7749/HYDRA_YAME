import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPRITE_FRAMES_PER_DIRECTION,
  animationFrame,
  deathAnimationFrame,
  projectileProgress,
  resolveSunkenAnimation,
  resolveUnitAnimation,
  spriteColumn,
} from '../src/rts-animation.mjs';

test('sprite atlas reserves deterministic columns for every animation state', () => {
  assert.equal(SPRITE_FRAMES_PER_DIRECTION, 18);
  assert.equal(spriteColumn('idle', 0), 0);
  assert.equal(spriteColumn('move', 0), 2);
  assert.equal(spriteColumn('attack', 0), 6);
  assert.equal(spriteColumn('hit', 0), 10);
  assert.equal(spriteColumn('death', 0), 12);
  assert.equal(spriteColumn('death', 99), 17);
});

test('unit animation prioritizes attack and hit over locomotion', () => {
  const unit = { id: 7, hp: 40, attackFlashMs: 70 };
  assert.equal(resolveUnitAnimation(unit, [], true).state, 'attack');

  unit.attackFlashMs = 0;
  const hit = resolveUnitAnimation(unit, [{
    type: 'hydra-shot',
    targetId: 7,
    elapsedMs: 40,
  }], true);
  assert.equal(hit.state, 'hit');
  assert.equal(hit.ageMs, 40);

  assert.equal(resolveUnitAnimation(unit, [], true).state, 'move');
  assert.equal(resolveUnitAnimation(unit, [], false).state, 'idle');
});

test('sunken animation exposes attack and impact states from authoritative effects', () => {
  const zone = { id: 11, sunkenHp: 9999, sunkenAttackFlashMs: 100 };
  assert.equal(resolveSunkenAnimation(zone, []).state, 'attack');

  zone.sunkenAttackFlashMs = 0;
  assert.equal(resolveSunkenAnimation(zone, [{
    type: 'hydra-shot',
    targetZoneId: 11,
    elapsedMs: 30,
  }]).state, 'hit');
  assert.equal(resolveSunkenAnimation(zone, []).state, 'idle');
});

test('attack, death and projectile frames advance without wrapping terminal states', () => {
  assert.equal(animationFrame('attack', 0, 1, 0), 0);
  assert.equal(animationFrame('attack', 0, 1, 140), 3);
  assert.equal(animationFrame('death', 0, 1, 9999), 5);

  assert.equal(projectileProgress({ elapsedMs: 0, durationMs: 240 }), 0);
  assert.equal(projectileProgress({ elapsedMs: 120, durationMs: 240 }), 0.5);
  assert.equal(projectileProgress({ elapsedMs: 999, durationMs: 240 }), 1);

  assert.equal(deathAnimationFrame({ elapsedMs: 0, durationMs: 560 }), 0);
  assert.equal(deathAnimationFrame({ elapsedMs: 559, durationMs: 560 }), 5);
});

test('stale hit effects no longer override movement animation', () => {
  const unit = { id: 3, hp: 40, attackFlashMs: 0 };
  const stale = [{
    type: 'sunken-shot',
    targetId: 3,
    elapsedMs: 200,
  }];
  assert.equal(resolveUnitAnimation(unit, stale, true).state, 'move');
});
