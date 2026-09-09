/**
 * Calculate risk-weighted assets for a single exposure.
 *
 * @param {number} exposureAtDefault non-negative exposure amount
 * @param {number} riskWeight non-negative decimal risk weight (for example, 1 for 100%)
 * @returns {number} risk-weighted asset amount
 */
export function calculateRwa(exposureAtDefault, riskWeight) {
  if (!Number.isFinite(exposureAtDefault) || exposureAtDefault < 0) {
    throw new TypeError('exposureAtDefault must be a non-negative finite number');
  }

  if (!Number.isFinite(riskWeight) || riskWeight < 0) {
    throw new TypeError('riskWeight must be a non-negative finite number');
  }

  return exposureAtDefault * riskWeight;
}

export default calculateRwa;
