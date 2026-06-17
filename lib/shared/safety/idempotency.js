/**
 * ERP IDEMPOTENCY LAYER
 * Prevents duplicate execution of financial / production logic
 */

const executed = new Set();

/**
 * Checks if operation was already executed
 */
export function isExecuted(key) {
  return executed.has(key);
}

/**
 * Marks operation as executed
 */
export function markExecuted(key) {
  executed.add(key);
}

/**
 * Wraps any critical ERP operation safely
 */
export async function runOnce(key, fn) {

  if (executed.has(key)) {
    return {
      skipped: true,
      reason: "DUPLICATE_PROTECTED"
    };
  }

  executed.add(key);

  return await fn();
}
