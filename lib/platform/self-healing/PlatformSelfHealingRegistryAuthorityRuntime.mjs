import {
  getCapabilitySearchIndex,
  getWorkspaceItemByRoute,
  normalizeRegistryItemId,
} from "@/lib/platform/registry/erpRegistry";

const INCOMPLETE = new Set(["planned", "incomplete", "unfinished", "unimplemented"]);
const text = (value, limit = 600) => String(value ?? "").trim().slice(0, limit);
const normalized = (value) => normalizeRegistryItemId(text(value, 300));

export function provePlatformRepairRegistryAuthority({ route, capability } = {}) {
  const routeHint = text(route, 600);
  const capabilityHint = normalized(capability);
  let item = routeHint ? getWorkspaceItemByRoute(routeHint) : null;
  let matchSource = item ? "route" : null;

  if (item && capabilityHint) {
    const identities = new Set([item.id, item.data?.capability, item.create?.capability].map(normalized).filter(Boolean));
    if (!identities.has(capabilityHint)) item = null;
  }

  if (!item && capabilityHint) {
    const matches = getCapabilitySearchIndex().filter((candidate) => {
      const identities = new Set([candidate.id, candidate.data?.capability, candidate.create?.capability].map(normalized).filter(Boolean));
      return identities.has(capabilityHint);
    });
    if (matches.length > 1) return { proven: false, reason: "ERP_REGISTRY_CAPABILITY_AMBIGUOUS" };
    if (matches.length === 1) {
      item = matches[0];
      matchSource = "capability";
    }
  }

  if (!item) return { proven: false, reason: routeHint ? "ERP_REGISTRY_ROUTE_OR_CAPABILITY_NOT_FOUND" : "ERP_REGISTRY_CAPABILITY_NOT_FOUND" };
  const status = text(item.status, 80).toLowerCase();
  if (INCOMPLETE.has(status)) return { proven: false, reason: "REGISTERED_SURFACE_IS_INCOMPLETE_NOT_REPAIR" };
  return {
    proven: true,
    item,
    evidence: {
      authority_purpose: "repair",
      match_source: matchSource,
      workspace_id: item.workspaceId || null,
      item_id: item.id || null,
      capability: item.data?.capability || item.create?.capability || item.id || null,
      route: item.route || null,
      status: status || null,
      registered_route: true,
      explicit_incomplete_status: false,
    },
  };
}
