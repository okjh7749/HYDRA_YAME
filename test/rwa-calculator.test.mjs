import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateRwa } from '../src/rwa-calculator.mjs';

test('calculates RWA from EAD and a decimal risk weight', () => {
  assert.equal(calculateRwa(1_000, 1), 1_000);
  assert.equal(calculateRwa(1_000, 0.5), 500);
  assert.equal(calculateRwa(2_500, 1.5), 3_750);
});

test('supports zero exposure and zero risk weight', () => {
  assert.equal(calculateRwa(0, 1), 0);
  assert.equal(calculateRwa(1_000, 0), 0);
});

test('rejects invalid exposure values', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '100']) {
    assert.throws(
      () => calculateRwa(value, 1),
      /exposureAtDefault must be a non-negative finite number/,
    );
  }
});

test('rejects invalid risk weights', () => {
  for (const value of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, '1']) {
    assert.throws(
      () => calculateRwa(1_000, value),
      /riskWeight must be a non-negative finite number/,
    );
  }
});
