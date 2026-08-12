export const SUPPLY_CHAIN_RETIRED_WORKSPACE_IDS = new Set([
  "recipe_components",
  "expiry",
]);

export function applySupplyChainWorkspaceRegistry(registry) {
  const supplyChain = registry?.workspaces?.["supply-chain"];
  if (!supplyChain) return registry;

  const groups = Array.isArray(supplyChain.groups) ? supplyChain.groups : [];

  for (const group of groups) {
    if (!Array.isArray(group?.items)) continue;

    group.items = group.items.filter(
      (item) => !SUPPLY_CHAIN_RETIRED_WORKSPACE_IDS.has(item?.id)
    );
  }

  return registry;
}
