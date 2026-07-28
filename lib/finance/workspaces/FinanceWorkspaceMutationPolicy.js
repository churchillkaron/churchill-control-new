const NON_ARCHIVABLE_WORKSPACES = new Set([
  "organization_profile",
  "exchange_rates",
  "banking_integrations",
  "government_connections",
]);

const NON_EDITABLE_WORKSPACES = new Set([
  "banking_integrations",
  "government_connections",
]);

const NON_DUPLICABLE_WORKSPACES = new Set([
  "posting_rules",
  "banking_integrations",
  "government_connections",
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
  const editable = Boolean(
    writable &&
    !NON_EDITABLE_WORKSPACES.has(capabilityId)
  );
  const duplicable = Boolean(
    writable &&
    !singleton &&
    !NON_DUPLICABLE_WORKSPACES.has(capabilityId)
  );
  const archivable = Boolean(
    writable &&
    !singleton &&
    !NON_ARCHIVABLE_WORKSPACES.has(capabilityId)
  );

  return Object.freeze({
    writable,
    editable,
    duplicable,
    archivable,
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
