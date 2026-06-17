/**
 * AVANTIQO NAV CACHE LAYER
 * Prevents recomputation per request
 */

const navCache = new Map();

export function getCachedNav(tenantKey, builderFn) {
  if (navCache.has(tenantKey)) {
    return navCache.get(tenantKey);
  }

  const nav = builderFn();

  navCache.set(tenantKey, nav);

  return nav;
}

export function clearNavCache() {
  navCache.clear();
}
