/**
 * GLOBAL POS SAFETY CONTROLLER
 * Prevents race conditions + duplicate execution + chaos merges
 */

const locks = new Map();

export function acquireLock(key) {
  if (locks.has(key)) return false;
  locks.set(key, true);
  return true;
}

export function releaseLock(key) {
  locks.delete(key);
}

export async function safeExecute(key, fn) {

  if (!acquireLock(key)) {
    console.warn("LOCKED:", key);
    return { skipped: true };
  }

  try {
    const result = await fn();
    return result;
  } finally {
    releaseLock(key);
  }
}
