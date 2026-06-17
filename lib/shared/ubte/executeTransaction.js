import { invalidatePOSCache } from "@/lib/shared/cache/posCacheInvalidation";
import { emitPOS } from "@/lib/shared/realtime/posEventBus";

import {
  generateKey,
  isDuplicate,
  lock,
  unlock
} from "@/lib/shared/ubte/idempotency";

import { logUBTE } from "@/lib/shared/ubte/observability";
import { writeAuditLog } from "@/lib/shared/ubte/audit";
import { validateUBTE } from "@/lib/shared/ubte/safety";
import { checkUBTEGuard } from "@/lib/shared/ubte/guard";
import { validateDomain } from "@/lib/shared/ubte/isolation";

/**
 * UBTE EXECUTION ENGINE (CLEAN STABLE VERSION)
 */

export async function executeTransaction({
  tenant_id,
  domain,
  event,
  order_id = null,
  type = "default",
  action = "unknown",
  db,
  payload = {}
}) {

  validateUBTE({ tenant_id, action, db });
  validateDomain(domain);


  const key = generateKey(tenant_id, order_id, action);

  const guard = checkUBTEGuard(key);
  if (guard.blocked) {
    return { blocked: true, reason: guard.reason };
  }

  const start = Date.now();

  const baseLog = {
    tenant_id,
    order_id,
    action,
    domain: resolvedDomain,
    payload
  };

  logUBTE({ stage: "START", ...baseLog });

  if (isDuplicate(key)) {
    await writeAuditLog({ ...baseLog, stage: "SKIP_DUPLICATE" });
    return { skipped: true };
  }

  lock(key);

  try {
    const result = await db();

    const successLog = {
      ...baseLog,
      stage: "SUCCESS",
      status: "ok",
      duration: Date.now() - start
    };

    if (tenant_id) {
      invalidatePOSCache(tenant_id);
    }

    if (event) {
      emitPOS(event, {
        tenant_id,
        order_id,
        domain: resolvedDomain,
        type,
        payload,
        timestamp: Date.now()
      });
    }

    logUBTE(successLog);
    await writeAuditLog(successLog);

    return result;

  } catch (err) {

    const errorLog = {
      ...baseLog,
      stage: "ERROR",
      status: "error",
      error: err.message,
      duration: Date.now() - start
    };

    logUBTE(errorLog);
    await writeAuditLog(errorLog);

    throw err;

  } finally {
    unlock(key);
  }
}
