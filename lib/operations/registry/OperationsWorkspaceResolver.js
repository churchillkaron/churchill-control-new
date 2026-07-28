import OPERATIONS_WORKSPACE_REGISTRY from "./OperationsWorkspaceRegistry";

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

export function getOperationsWorkspaceGroups() {
  return [...(OPERATIONS_WORKSPACE_REGISTRY.groups || [])]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      ...group,
      items: [...(group.items || [])].sort((a, b) => a.order - b.order),
    }));
}

export function getOperationsWorkspaceItems() {
  return getOperationsWorkspaceGroups().flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupId: group.id,
      groupName: group.name,
    })),
  );
}

export function getOperationsWorkspaceItem(value) {
  const target = normalize(value);

  return getOperationsWorkspaceItems().find((item) => (
    normalize(item.id) === target
    || normalize(item.capabilityId) === target
    || normalize(item.route).endsWith(`/${target}`)
  )) || null;
}

export function getOperationsWorkspaceItemByRoute(route) {
  const cleanRoute = String(route || "")
    .split("?")[0]
    .replace(/\/$/, "");

  return getOperationsWorkspaceItems().find((item) => (
    String(item.route || "").replace(/\/$/, "") === cleanRoute
  )) || null;
}

export default Object.freeze({
  getOperationsWorkspaceGroups,
  getOperationsWorkspaceItems,
  getOperationsWorkspaceItem,
  getOperationsWorkspaceItemByRoute,
});
