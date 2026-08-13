const TABLE_MANAGEMENT_GROUP_ID = "table_management";

const TABLE_CONFIGURATION_WORKSPACE = {
  id: "table_configuration",
  name: "Table Configuration",
  route: "/operations/tables/configuration",
  description:
    "Configure organization table behavior and floor-service settings.",
  order: 40,
  status: "active",
};

export function applyOperationsWorkspaceRegistry(registry) {
  const operations = registry?.workspaces?.operations;
  if (!operations) return registry;

  const group = (operations.groups || []).find(
    (candidate) => candidate?.id === TABLE_MANAGEMENT_GROUP_ID
  );
  if (!group) return registry;

  const items = Array.isArray(group.items) ? group.items : [];
  const existingIndex = items.findIndex(
    (item) => item?.id === TABLE_CONFIGURATION_WORKSPACE.id
  );

  if (existingIndex >= 0) {
    items[existingIndex] = {
      ...items[existingIndex],
      ...TABLE_CONFIGURATION_WORKSPACE,
    };
  } else {
    items.push({ ...TABLE_CONFIGURATION_WORKSPACE });
  }

  group.items = items.sort(
    (left, right) => Number(left?.order || 0) - Number(right?.order || 0)
  );

  return registry;
}

export default applyOperationsWorkspaceRegistry;
