const NON_ARCHIVABLE_WORKSPACES = new Set([
  "organization_profile",
  "exchange_rates",
]);

const CONTROLLED_ACCOUNTING_WORKSPACES = new Set([
  "opening_balances",
  "bank_statements",
  "bank_reconciliation",
  "fx_revaluation",
  "vat_returns",
  "depreciation",
  "statutory_filings",
]);

const NON_DUPLICABLE_WORKSPACES = new Set([
  ...CONTROLLED_ACCOUNTING_WORKSPACES,
  "collections",
  "revenue_recognition",
  "government_connections",
  "banking_integrations",
  "e_invoicing",
]);

export function resolveFinanceWorkspaceMutationPolicy(
  capabilityId,
  contract
) {
  const writable = Boolean(
    contract &&
    !contract.readOnly &&
    contract.table &&
    Array.isArray(contract.schema) &&
    contract.schema.length > 0
  );

  const singleton = Boolean(contract?.singleton);
  const controlled = CONTROLLED_ACCOUNTING_WORKSPACES.has(capabilityId);
  const editable = Boolean(writable && !controlled);
  const duplicable = Boolean(
    writable &&
    !singleton &&
    !controlled &&
    !NON_DUPLICABLE_WORKSPACES.has(capabilityId)
  );
  const archivable = Boolean(
    writable &&
    !singleton &&
    !controlled &&
    !NON_ARCHIVABLE_WORKSPACES.has(capabilityId)
  );

  return Object.freeze({
    writable,
    editable,
    duplicable,
    archivable,
    controlled,
  });
}

export function isFinanceWorkspaceArchivable(
  capabilityId,
  contract
) {
  return resolveFinanceWorkspaceMutationPolicy(
    capabilityId,
    contract
  ).archivable;
}
