export const SUPPLY_CHAIN_RETIRED_WORKSPACE_IDS = new Set([
  "recipe_components",
]);

export function applySupplyChainWorkspaceRegistry(registry) {
  const supplyChain = registry?.workspaces?.["supply-chain"];
  if (!supplyChain) return registry;

  const groups = Array.isArray(supplyChain.groups) ? supplyChain.groups : [];
  const production = groups.find((group) => group?.id === "production");

  if (!production || !Array.isArray(production.items)) {
    return registry;
  }

  production.items = production.items.filter(
    (item) => !SUPPLY_CHAIN_RETIRED_WORKSPACE_IDS.has(item?.id)
  );

  return registry;
}
