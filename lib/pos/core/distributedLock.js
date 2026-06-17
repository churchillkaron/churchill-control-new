
const locks = new Map();

/**
 * GLOBAL LOCKING SYSTEM
 * Prevents duplicate order execution
 */

export function acquireLock(key) {
  if (locks.has(key)) return false;
  locks.set(key, true);
  return true;
}

export function releaseLock(key) {
  locks.delete(key);
}

export function isLocked(key) {
  return locks.has(key);
}

