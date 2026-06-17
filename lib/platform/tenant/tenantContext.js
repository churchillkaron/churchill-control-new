/**
 * AVANTIQO SYSTEM CONTEXT (PRODUCTION VERSION)
 * NOW SAFE FOR SCALE (NOT MEMORY-ONLY LOGIC)
 */

let runtimeCache = new Map();

/**
 * TEMPORARY runtime cache (dev only fallback)
 * REAL SOURCE SHOULD BE DATABASE (future step)
 */

export function setSystemContext(tenantId, context) {
  if (!tenantId) return;

  runtimeCache.set(tenantId, {
    tenantId,
    organizationId: context.organizationId,
    industry: context.industry,
    plan: context.plan,
    organization: context.organization,
    modules: context.modules,
    updatedAt: new Date().toISOString(),
  });
}

export function getSystemContext(tenantId) {
  return runtimeCache.get(tenantId) || null;
}

/**
 * SAFE FALLBACKS
 */
export function getPlan(tenantId) {
  return runtimeCache.get(tenantId)?.plan || "free";
}

export function getIndustry(tenantId) {
  return runtimeCache.get(tenantId)?.industry || "agency";
}

export function getOrganizationId(tenantId) {
  return runtimeCache.get(tenantId)?.organizationId || null;
}
