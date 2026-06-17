/**
 * AVANTIQO TENANT CONFIGURATION SOURCE OF TRUTH
 * THIS IS WHAT MAKES IT PRODUCTION-READY
 */

const tenantConfigCache = new Map();

/**
 * Save tenant configuration after onboarding
 */
export function setTenantConfig(tenantId, config) {
  if (!tenantId) return;

  tenantConfigCache.set(tenantId, {
    ...config,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Get tenant configuration
 */
export function getTenantConfig(tenantId) {
  return tenantConfigCache.get(tenantId) || null;
}

/**
 * Get tenant plan safely
 */
export function getTenantPlan(tenantId) {
  return tenantConfigCache.get(tenantId)?.plan || "free";
}
