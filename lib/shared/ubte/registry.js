/**
 * UBTE FEATURE REGISTRY
 * Controls what is allowed in production
 */

export const UBTE_FEATURES = {
  EXECUTION: true,
  QUEUE: true,
  AI: true,
  AUTO_ACTION: process.env.NODE_ENV !== "production" ? true : false,
  REALTIME: true,
  AUDIT: true,
  DASHBOARD: true
};

export function isFeatureEnabled(feature) {
  return !!UBTE_FEATURES[feature];
}
