import {
  setState,
  getState,
  deleteState
} from "@/lib/shared/ubte/distributed";

/**
 * UBTE DISTRIBUTED IDEMPOTENCY
 */

export function generateKey(tenant_id, order_id, action) {
  return `${tenant_id}:${order_id}:${action}`;
}

export async function isDuplicate(key) {
  const val = await getState(`lock:${key}`);
  return !!val;
}

export async function lock(key) {
  await setState(`lock:${key}`, true, 10);
}

export async function unlock(key) {
  await deleteState(`lock:${key}`);
}
