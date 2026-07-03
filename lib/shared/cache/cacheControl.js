import { clearCache } from "./memoryCache";

/**
 * GLOBAL CACHE CONTROL (NO TENANT)
 */

export function invalidateCache() {
  clearCache();
}

export function invalidateFinanceCache() {
  clearCache();
}

export function invalidateAnalyticsCache() {
  clearCache();
}
