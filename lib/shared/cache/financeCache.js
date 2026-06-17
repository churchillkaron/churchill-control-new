import { getCache, setCache } from "./memoryCache";

/**
 * CACHE WRAPPER FOR FINANCE ENGINE
 */

export function getCachedFinance(key) {
  return getCache(`finance:${key}`);
}

export function setCachedFinance(key, value) {
  setCache(`finance:${key}`, value, 120000); // 2 min cache
}
