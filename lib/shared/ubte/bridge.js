import { executeTransaction } from "./executeTransaction";

/**
 * UBTE MODULE BRIDGE
 * Connects UI modules → transaction engine
 */

export async function runModuleTransaction({
  moduleId,
  action,
  payload,
  tenant_id,
}) {
  return await executeTransaction({
    module: moduleId,
    action,
    payload,
    tenant_id,
  });
}
