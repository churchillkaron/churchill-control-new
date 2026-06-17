/**
 * UBTE STATE ADAPTER LAYER
 * Abstracts memory so we can scale later to Redis or external systems
 */

const memory = {
  locks: new Map(),
  logs: []
};

/**
 * LOCK SYSTEM (replace with Redis later)
 */
export function setLock(key) {
  memory.locks.set(key, Date.now());
}

export function hasLock(key) {
  return memory.locks.has(key);
}

export function releaseLock(key) {
  memory.locks.delete(key);
}

/**
 * LOG SYSTEM (replace with streaming DB later)
 */
export function pushLog(entry) {
  memory.logs.push(entry);
}

export function getLogs() {
  return memory.logs;
}
