const NON_ARCHIVABLE_WORKSPACES = new Set([
  "organization_profile",
  "exchange_rates",
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
  const editable = writable;
  const duplicable = writable && !singleton;
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
