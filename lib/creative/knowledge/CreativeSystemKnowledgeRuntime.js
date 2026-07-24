import {
  ERP_REGISTRY,
} from "@/lib/platform/registry/erpRegistry";

function flattenWorkspaceItems() {
  return Object.entries(ERP_REGISTRY.workspaces || {})
    .flatMap(([domainId, workspace]) => (
      (workspace?.groups || []).flatMap((group) => (
        (group?.items || []).map((item) => ({
          domain_id: domainId,
          group_id: group.id,
          id: item.id,
          name: item.name,
          route: item.route,
          description: item.description || null,
          status: item.status || "active",
          runtime: item.runtime || null,
          capability: item.capability || null,
          renderer: item.renderer || null,
        }))
      ))
    ));
}

function sourceIsAvailable(source) {
  return (
    source.status !== "planned" &&
    Boolean(source.route || source.runtime || source.capability)
  );
}

export function resolveCreativeSystemKnowledge({
  organization_id,
  entity_id = null,
  period_id = null,
} = {}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const sources = flattenWorkspaceItems()
    .filter(sourceIsAvailable)
    .map((source) => ({
      id: `${source.domain_id}.${source.id}`,
      domain_id: source.domain_id,
      name: source.name,
      description: source.description,
      route: source.route,
      binding: {
        organization_id,
        entity_id,
        period_id,
      },
      resolution_mode: "LIVE_CANONICAL_SOURCE",
    }));

  return {
    organization_id,
    entity_id,
    period_id,
    source_policy: {
      business_facts: "LIVE_CANONICAL_SOURCE",
      creative_interpretation: "OPEN",
      stale_copies_allowed: false,
      prompt_reentry_required: false,
      resolve_at_execution_time: true,
    },
    sources,
  };
}

export const CreativeSystemKnowledgeRuntime = {
  resolve: resolveCreativeSystemKnowledge,
};
