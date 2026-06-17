
import { acquireLock, releaseLock } from "./distributedLock";
import { emitAndPersist } from "./posEventEngine";

/**
 * SAFE ORDER EXECUTION (ENTERPRISE GUARANTEE)
 */

export async function safeExecuteOrder(orderId, fn) {

  const locked = acquireLock(orderId);

  if (!locked) {
    console.warn("ORDER BLOCKED (LOCKED):", orderId);
    return;
  }

  try {

    const result = await fn();

    await emitAndPersist("POS", {
      type: "ORDER_PROCESSED",
      orderId,
      result
    });

    return result;

  } finally {
    releaseLock(orderId);
  }
}

