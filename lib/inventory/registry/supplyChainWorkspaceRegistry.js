export const SUPPLY_CHAIN_RETIRED_WORKSPACE_IDS = new Set([
  "recipe_components",
  "expiry",
]);

function convergeWarehouseTasksWorkspace(item) {
  if (item?.id !== "warehouse_tasks") return item;

  item.description = "Warehouse execution, putaway and transfers.";

  const actions = Array.isArray(item.actions) ? item.actions : [];
  const withoutStart = actions.filter(
    (action) => String(action?.type || "").trim().toLowerCase() !== "start",
  );

  const completeIndex = withoutStart.findIndex(
    (action) => String(action?.type || "").trim().toLowerCase() === "complete",
  );
  const startAction = {
    label: "Start Task",
    type: "start",
  };

  if (completeIndex >= 0) {
    item.actions = [
      ...withoutStart.slice(0, completeIndex),
      startAction,
      ...withoutStart.slice(completeIndex),
    ];
  } else {
    item.actions = [startAction, ...withoutStart];
  }

  return item;
}

export function applySupplyChainWorkspaceRegistry(registry) {
  const supplyChain = registry?.workspaces?.["supply-chain"];
  if (!supplyChain) return registry;

  const groups = Array.isArray(supplyChain.groups) ? supplyChain.groups : [];

  for (const group of groups) {
    if (!Array.isArray(group?.items)) continue;

    group.items = group.items
      .filter((item) => !SUPPLY_CHAIN_RETIRED_WORKSPACE_IDS.has(item?.id))
      .map(convergeWarehouseTasksWorkspace);
  }

  return registry;
}
