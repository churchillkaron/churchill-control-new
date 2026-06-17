import { clearCache } from "./memoryCache";

/**
 * CACHE CONTROL LAYER (v1)
 * Centralized invalidation system for all cached modules
 */

export function invalidateTenantCache(tenant_id) {
  // For v1: full cache reset (safe + simple)
  clearCache();
}

export function invalidateFinanceCache() {
  clearCache();
}

export function invalidateAnalyticsCache() {
  clearCache();
}
