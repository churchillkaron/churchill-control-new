/**
 * AVANTIQO CACHE LAYER (v1)
 * Simple in-memory cache for performance optimization
 */

const cache = new Map();

export function setCache(key, value, ttl = 60000) {
  const expires = Date.now() + ttl;

  cache.set(key, {
    value,
    expires
  });
}

export function getCache(key) {
  const data = cache.get(key);

  if (!data) return null;

  if (Date.now() > data.expires) {
    cache.delete(key);
    return null;
  }

  return data.value;
}

export function clearCache() {
  cache.clear();
}
