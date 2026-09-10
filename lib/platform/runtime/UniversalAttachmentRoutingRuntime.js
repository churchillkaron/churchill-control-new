function domainFromRegistry(registry = {}, value) {
  const target = normalized(value);
  const domains = Array.isArray(registry?.domains) ? registry.domains : [];
  return domains.find((item) => {
    const id = normalized(item?.id);
    const name = normalized(item?.name);
    return target === id || target === name;
  }) || null;
}

function registryWorkspace(registry = {}, workspaceId) {
  return registry?.workspaces?.[workspaceId] || null;
}

function registryItem(registry = {}, { workspaceId, groupId = null, itemId }) {
  const workspace = registryWorkspace(registry, workspaceId);
  if (!workspace) return null;
  for (const group of workspace.groups || []) {
    if (groupId && normalized(group.id) !== normalized(groupId)) continue;
    for (const item of group.items || []) {
      if (normalized(item.id) !== normalized(itemId)) continue;
      const domain = domainFromRegistry(registry, workspaceId);
      return {
        domain: domain?.name || workspace.title || workspaceId,
        domain_id: domain?.id || workspaceId,
        workspace: workspaceId,
        workspace_name: workspace.title || null,
        group: group.name || group.id || null,
        group_id: group.id || null,
        item_id: item.id,
        route: item.route || domain?.route || null,
        label: item.name || workspace.title || domain?.name || item.id,
      };
    }
  }
  return null;
}

function registryDomainDestination(registry = {}, value) {
  const domain = domainFromRegistry(registry, value);
  if (!domain) return null;
  const workspace = registryWorkspace(registry, domain.id);
  return {
    domain: domain.name,
    domain_id: domain.id,
    workspace: domain.id,
    workspace_name: workspace?.title || domain.name,
    group: null,
    group_id: null,
    item_id: null,
    route: domain.route || null,
    label: workspace?.title || domain.name,
  };
}

function text(value) {
  return String(value ?? "").trim();
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function normalized(value) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function assetDestination(evidence = {}, registry = {}) {
  const asset = object(evidence.asset_details);
  const joined = [
    evidence.object_type,
    evidence.document_type,
    asset.type,
    asset.asset_type,
    asset.category,
  ].map(normalized).join(" ");
  if (!/\b(asset|equipment|vehicle|property|domain|ssl|software account|digital asset|device|machine|tool|fleet|building)\b/.test(joined)) return null;
  if (/\b(vehicle|car|truck|motorcycle|trailer|fleet)\b/.test(joined)) {
    return registryItem(registry, { workspaceId: "compliance", groupId: "assets", itemId: "vehicles" });
  }
  if (/\b(property|building|leasehold|premises|real estate)\b/.test(joined)) {
    return registryItem(registry, { workspaceId: "compliance", groupId: "assets", itemId: "properties" });
  }
  if (/\b(domain|ssl|software account|digital asset)\b/.test(joined)) {
    return registryItem(registry, { workspaceId: "compliance", groupId: "assets", itemId: "digital_assets" });
  }
  if (/\b(equipment|device|machine|tool|asset)\b/.test(joined)) {
    return registryItem(registry, { workspaceId: "compliance", groupId: "assets", itemId: "equipment" });
  }
  return null;
}

function specializedDestination(evidence = {}, registry = {}) {
  const doc = normalized(evidence.document_type);
  const objectType = normalized(evidence.object_type);
  const asset = assetDestination(evidence, registry);
  if (asset) return asset;
  if (/\b(contract|agreement)\b/.test(`${doc} ${objectType}`)) {
    return registryItem(registry, { workspaceId: "documents", groupId: "document_management", itemId: "contracts" });
  }
  return null;
}
function domainCandidates(evidence = {}, registry = {}) {
  const unique = new Map();
  for (const value of list(evidence.candidate_domains)) {
    const key = normalized(value);
    const destination = registryDomainDestination(registry, key);
    if (destination) unique.set(key, destination);
  }
  return [...unique.values()];
}

export function routeAnalyzedAttachment(file = {}, { registry = null } = {}) {
  const analysis = object(file.analysis);
  const evidence = object(analysis.evidence);
  if (analysis.status !== "ANALYZED") return null;

  if (analysis.clarification_required === true || evidence.clarification_required === true) {
    return {
      type: "universal_destination",
      status: "CLARIFICATION_REQUIRED",
      destination: null,
      clarification_required: true,
      clarification_question: text(analysis.clarification_question || evidence.clarification_question) ||
        "What business purpose should I use for this file?",
      authorization_effect: "NONE",
    };
  }

  const specialized = specializedDestination(evidence, registry || {});
  const candidates = domainCandidates(evidence, registry || {});
  if (specialized) {
    return {
      type: "universal_destination",
      status: "DESTINATION_RESOLVED",
      destination: specialized,
      evidence_classification: {
        object_type: text(evidence.object_type) || null,
        document_type: text(evidence.document_type) || null,
        confidence: Number(evidence.confidence || analysis.confidence) || 0,
      },
      clarification_required: false,
      authorization_effect: "NONE",
    };
  }

  if (candidates.length === 1) {
    return {
      type: "universal_destination",
      status: "DESTINATION_RESOLVED",
      destination: candidates[0],
      evidence_classification: {
        object_type: text(evidence.object_type) || null,
        document_type: text(evidence.document_type) || null,
        confidence: Number(evidence.confidence || analysis.confidence) || 0,
      },
      clarification_required: false,
      authorization_effect: "NONE",
    };
  }

  return {
    type: "universal_destination",
    status: "CLARIFICATION_REQUIRED",
    destination: null,
    candidate_destinations: candidates,
    clarification_required: true,
    clarification_question: candidates.length > 1
      ? `This file could belong to ${candidates.map((item) => item.domain).join(" or ")}. Which business purpose should I use?`
      : "I analyzed the file but cannot determine which Avantiqo area should own it. What business purpose should I use?",
    authorization_effect: "NONE",
  };
}

export default routeAnalyzedAttachment;
