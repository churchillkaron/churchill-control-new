import { getAccountingMode } from "../rules/getAccountingMode.js";

export async function findAccount({ organizationId, entityId, accountCode }) {
  if (!organizationId || !accountCode) {
    throw new Error("organizationId required");
  }

  const mode = getAccountingMode(organizationId);

  const resolvedEntityId =
    mode === "MULTI_ENTITY" ? entityId : null;

  return {
    organizationId,
    entityId: resolvedEntityId,
    accountCode,
  };
}
