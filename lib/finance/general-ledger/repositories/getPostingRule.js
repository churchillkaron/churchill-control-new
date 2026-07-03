import { getAccountingMode } from "../rules/getAccountingMode.js";

export async function getPostingRule({ organizationId, entityId, eventType }) {
  if (!organizationId || !eventType) {
    throw new Error("organizationId required");
  }

  const mode = getAccountingMode(organizationId);

  return {
    organizationId,
    entityId: mode === "MULTI_ENTITY" ? entityId : null,
    eventType,
    debit_account_id: "DEFAULT_DEBIT",
    credit_account_id: "DEFAULT_CREDIT",
    tax_account_id: null,
  };
}
