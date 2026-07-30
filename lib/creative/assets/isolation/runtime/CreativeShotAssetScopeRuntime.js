import crypto from "node:crypto";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map(text).filter(Boolean))].sort();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !["scope_hash", "created_at", "updated_at"].includes(key))
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function mediaReference(value) {
  const source = text(value);
  return /^(storage|https?):\/\//i.test(source) ? source : null;
}

function creativeAssetKey(key = "") {
  const value = text(key).toLowerCase();
  if (value.includes("asset_node")) return false;
  return value === "asset_id" ||
    value === "asset_ids" ||
    /(?:^|_)(?:creative|source|reference|identity_reference|primary_audio|audio)_asset_ids?$/.test(value);
}

function assetNodeKey(key = "") {
  return /(?:^|_)asset_node_ids?$/.test(text(key).toLowerCase());
}

function productionNodeKey(key = "") {
  const value = text(key).toLowerCase();
  return value.endsWith("_node_id") && !value.includes("asset_node_id");
}

function addScalarOrArray(target, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = text(item?.asset_id || item?.assetId || item?.id || item);
      if (id) target.add(id);
    }
    return;
  }
  const id = text(value?.asset_id || value?.assetId || value?.id || value);
  if (id) target.add(id);
}

function collect(value, state, key = "", seen = new Set()) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const reference = mediaReference(value);
    if (reference && !/prompt|description|instructions/i.test(key)) {
      state.mediaReferences.add(reference);
    }
    if (creativeAssetKey(key)) state.creativeAssetIds.add(text(value));
    if (assetNodeKey(key)) state.assetNodeIds.add(text(value));
    if (productionNodeKey(key) && state.productionNodeIds.has(text(value))) {
      state.authorizedNodeIds.add(text(value));
    }
    if (/audio/i.test(key) && /asset_id/i.test(key)) state.audioAssetIds.add(text(value));
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);

  if (creativeAssetKey(key)) addScalarOrArray(state.creativeAssetIds, value);
  if (assetNodeKey(key)) addScalarOrArray(state.assetNodeIds, value);
  if (/audio/i.test(key) && /asset_id/i.test(key)) addScalarOrArray(state.audioAssetIds, value);

  if (Array.isArray(value)) {
    for (const item of value) collect(item, state, key, seen);
    return;
  }

  for (const [childKey, childValue] of Object.entries(value)) {
    if (/provider_prompt|prompt|description|instructions/i.test(childKey)) continue;
    if (productionNodeKey(childKey)) {
      const ids = Array.isArray(childValue) ? childValue : [childValue];
      for (const item of ids) {
        const id = text(item?.id || item);
        if (state.productionNodeIds.has(id)) state.authorizedNodeIds.add(id);
      }
    }
    collect(childValue, state, childKey, seen);
  }
}

function referenceIds(node = {}) {
  return unique([
    list(node.requirements?.reference_asset_ids),
    list(node.metadata?.reference_asset_ids),
    list(node.generation?.provider_parameters?.reference_asset_ids),
    list(node.generation?.provider_parameters?.identity_reference_asset_ids),
    list(node.requirements?.expected_contract?.reference_asset_ids),
    list(node.requirements?.expected_contract?.identity_requirements?.reference_asset_ids),
    list(node.requirements?.reference_images).map((item) => item?.asset_id),
    list(node.generation?.provider_parameters?.reference_images).map((item) => item?.asset_id),
  ]);
}

export const CreativeShotAssetScopeRuntime = {
  build({ node, graph_nodes = [], edges = [], project_asset_ids = [] } = {}) {
    if (!node?.id) throw new Error("ASSET_SCOPE_NODE_REQUIRED");
    const productionNodeIds = new Set(list(graph_nodes).map((item) => text(item.id)).filter(Boolean));
    const state = {
      productionNodeIds,
      creativeAssetIds: new Set(),
      assetNodeIds: new Set(),
      authorizedNodeIds: new Set(),
      audioAssetIds: new Set(),
      mediaReferences: new Set(),
    };

    const sourceAssetIds = unique(list(node.assets).map((item) =>
      item?.asset_id || item?.assetId || item?.id || item,
    ));
    const explicitReferenceIds = referenceIds(node);
    for (const id of sourceAssetIds) state.creativeAssetIds.add(id);
    for (const id of explicitReferenceIds) state.creativeAssetIds.add(id);

    collect(node.requirements, state, "requirements");
    collect(node.generation?.provider_parameters, state, "provider_parameters");
    collect(node.generation?.identity_lock, state, "identity_lock");
    collect(node.metadata?.asset_binding, state, "asset_binding");

    const dependencyNodeIds = unique(list(edges)
      .filter((edge) => edge.to === node.id && edge.type === "DEPENDS_ON")
      .map((edge) => edge.from));
    for (const id of dependencyNodeIds) state.authorizedNodeIds.add(id);

    const projectIds = new Set(unique(project_asset_ids));
    const creativeAssetIds = unique([...state.creativeAssetIds]);
    const missing = creativeAssetIds.filter((id) => !projectIds.has(id));
    if (missing.length) {
      throw new Error(`SHOT_ASSET_SCOPE_PROJECT_ASSET_MISSING:${node.id}:${missing.join(",")}`);
    }

    const scope = {
      contract: "STRICT_SHOT_ASSET_SCOPE_V1",
      node_id: node.id,
      source_asset_ids: sourceAssetIds,
      reference_asset_ids: explicitReferenceIds,
      audio_asset_ids: unique([...state.audioAssetIds]),
      creative_asset_ids: creativeAssetIds,
      asset_node_ids: unique([...state.assetNodeIds]),
      dependency_node_ids: dependencyNodeIds,
      authorized_production_node_ids: unique([...state.authorizedNodeIds]),
      allowed_media_references: unique([...state.mediaReferences]),
      access_policy: {
        project_asset_pool_access: false,
        organization_asset_pool_access: false,
        implicit_asset_discovery: false,
        dependency_output_access: "EXPLICIT_GRAPH_ANCESTORS_ONLY",
        provider_input_mode: "LEAST_PRIVILEGE",
        reject_unscoped_media: true,
      },
    };
    return {
      ...scope,
      scope_hash: digest(scope),
    };
  },

  verify(scope = {}) {
    if (scope.contract !== "STRICT_SHOT_ASSET_SCOPE_V1") return false;
    return Boolean(text(scope.scope_hash)) && text(scope.scope_hash) === digest(scope);
  },

  hash: digest,
  mediaReference,
  creativeAssetKey,
  assetNodeKey,
  productionNodeKey,
  canonical,
  list,
  object,
  text,
  unique,
};
