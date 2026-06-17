/**
 * COST ENGINE
 * Defines pricing per AI feature
 */

export const COST_TABLE = {
  chat: 0.002,
  enhance: 0.003,
  invoice: 0.01,
  video: 0.05,
  composite: 0.04,
};

export function calculateCost(feature, usage = {}) {
  const base = COST_TABLE[feature] || 0.002;

  // future: tokens, duration, size scaling
  const multiplier = usage.multiplier || 1;

  return base * multiplier;
}
