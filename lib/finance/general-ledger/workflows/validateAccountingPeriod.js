import { getAccountingMode } from "../rules/getAccountingMode.js";

export async function validateAccountingPeriod({ organizationId, entityId, postingDate }) {
  if (!organizationId || !postingDate) {
    throw new Error("organizationId required");
  }

  const mode = getAccountingMode(organizationId);

  if (mode === "MULTI_ENTITY" && !entityId) {
    throw new Error("entity_id required in multi-entity mode");
  }

  return true;
}
