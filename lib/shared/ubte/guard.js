import { getState, setState } from "@/lib/shared/ubte/distributed";

/**
 * UBTE DISTRIBUTED SAFETY GUARD
 */

export async function checkUBTEGuard(key) {
  const windowKey = `guard:${key}`;

  const data = await getState(windowKey);

  const now = Date.now();

  let entry = data || {
    count: 0,
    last: now
  };

  if (now - entry.last > 10000) {
    entry.count = 0;
    entry.last = now;
  }

  entry.count += 1;

  await setState(windowKey, entry, 10);

  if (entry.count > 20) {
    return {
      blocked: true,
      reason: "UBTE_RATE_LIMIT_EXCEEDED"
    };
  }

  return { blocked: false };
}
