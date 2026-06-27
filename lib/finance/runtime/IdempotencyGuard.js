/**
 * IDEMPOTENCY GUARD
 * Prevents duplicate financial execution
 */

const executedKeys = new Set();

export function assertIdempotency(key) {
  if (!key) {
    throw new Error("Idempotency key required");
  }

  if (executedKeys.has(key)) {
    throw new Error(`DUPLICATE FINANCE EXECUTION BLOCKED: ${key}`);
  }

  executedKeys.add(key);
}
