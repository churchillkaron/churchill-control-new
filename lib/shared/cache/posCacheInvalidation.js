import { clearCache } from "./memoryCache";

/**
 * POS CACHE INVALIDATION LAYER
 * Keeps realtime POS consistent across all terminals
 */

export function invalidatePOSCache(tenant_id) {
  // v1: safe global clear (can be optimized later per-tenant)
  clearCache();
}

export function invalidatePOSOrderCache(tenant_id) {
  clearCache();
}

export function invalidateKitchenCache(tenant_id) {
  clearCache();
}
