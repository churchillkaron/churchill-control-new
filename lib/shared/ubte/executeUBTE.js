import { executeTransaction } from "./executeTransaction";

/**
 * UBTE DOMAIN EXECUTOR
 * Adds structured domain awareness to execution engine
 */

export async function executeUBTE({
  domain,
  action,
  tenant_id,
  order_id = null,
  db,
  payload = {}
}) {
  return executeTransaction({
    tenant_id,
    order_id,
    event: `${domain}.${action}`,
    type: domain,
    action,
    db,
    payload
  });
}
