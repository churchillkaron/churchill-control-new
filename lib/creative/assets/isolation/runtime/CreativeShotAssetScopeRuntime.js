import crypto from "node:crypto";

const CREATIVE_ASSET_ID_KEYS = [
  "creative_asset_id",
  "creativeAssetId",
  "asset_id",
  "assetId",
  "source_asset_id",
  "sourceAssetId",
  "reference_asset_id",
  "referenceAssetId",
  "identity_reference_asset_id",
  "primary_audio_asset_id",
  "audio_asset_id",
  "id",
];

const ASSET_NODE_ID_KEYS = [
  "asset_node_id",
  "assetNodeId",
  "source_asset_node_id",
  "sourceAssetNodeId",
  "reference_asset_node_id",
  "referenceAssetNodeId",
  "identity_atlas_asset_node_id",
  "id",
];

const PRODUCTION_NODE_ID_KEYS = [
  "production_node_id",
  "productionNodeId",
  "node_id",
  "nodeId",
  "id",
];

const NESTED_REFERENCE_KEYS = new Set([
  "asset",
  "creative_asset",
  "creativeAsset",
  "reference",
  "source",
  "item",
  "value",
  "node",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function validIdentifier(value) {
  const source = text(value);
  if (!source) return null;
  if (/^(?:\[object Object\]|undefined|null|true|false)$/i.test(source)) {
    return null;
  }
  return source;
}

function primitiveStrings(value, output = [], seen = new Set()) {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value) primitiveStrings(item, output, seen);
    return output;
  }
  if (typeof value === "object") return output;
  const normalized = validIdentifier(value);
  if (normalized) output.push(normalized);
  return output;
}

function identifierValues(
  value,
  preferredKeys = CREATIVE_ASSET_ID_KEYS,
  output = [],
  seen = new Set(),
) {
  if (value === null || value === undefined) return output;

  if (Array.isArray(value)) {
    for (const item of value) {
      identifierValues(item, preferredKeys, output, seen);
    }
    return output;
  }

  if (typeof value !== "object") {
    const normalized = validIdentifier(value);
    if (normalized) output.push(normalized);
    return output;
  }

  if (seen.has(value)) return output;
  seen.add(value);

  let directMatch = false;
  for (const key of preferredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    directMatch = true;
    identifierValues(value[key], preferredKeys, output, seen);
  }

  if (!directMatch) {
    for (const [key, nested] of Object.entries(value)) {
      if (!NESTED_REFERENCE_KEYS.has(key)) continue;
      identifierValues(nested, preferredKeys, output, seen);
    }
  }

  return output;
}

function unique(values = []) {
  return [...new Set(primitiveStrings(values))].sort();
}

function uniqueIdentifiers(values = [], preferredKeys = CREATIVE_ASSET_ID_KEYS) {
  return [...new Set(identifierValues(values, preferredKeys))].sort();
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
  if (typeof value !== "string") return null;
  const source = value.trim();
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

function addIdentifiers(target, value, preferredKeys) {
  for (const id of uniqueIdentifiers(value, preferredKeys)) {
    target.add(id);
  }
}

function collect(value, state, key = "", seen = new Set()) {
  if (value === null || value === undefined) return;

  if (typeof value === "string") {
    const reference = mediaReference(value);
    if (reference && !/prompt|description|instructions/i.test(key)) {
      state.mediaReferences.add(reference);
    }
    const id = validIdentifier(value);
    if (!id) return;
    if (creativeAssetKey(key)) state.creativeAssetIds.add(id);
    if (assetNodeKey(key)) state.assetNodeIds.add(id);
    if (productionNodeKey(key) && state.productionNodeIds.has(id)) {
      state.authorizedNodeIds.add(id);
    }
    if (/audio/i.test(key) && /asset_id/i.test(key)) {
      state.audioAssetIds.add(id);
    }
    return;
  }

  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);

  if (creativeAssetKey(key)) {
    addIdentifiers(state.creativeAssetIds, value, CREATIVE_ASSET_ID_KEYS);
  }
  if (assetNodeKey(key)) {
    addIdentifiers(state.assetNodeIds, value, ASSET_NODE_ID_KEYS);
  }
  if (/audio/i.test(key) && /asset_id/i.test(key)) {
    addIdentifiers(state.audioAssetIds, value, CREATIVE_ASSET_ID_KEYS);
  }

  if (Array.isArray(value)) {
    for (const item of value) collect(item, state, key, seen);
    return;
  }

  for (const [childKey, childValue] of Object.entries(value)) {
    if (/provider_prompt|prompt|description|instructions/i.test(childKey)) continue;
    if (productionNodeKey(childKey)) {
      const ids = uniqueIdentifiers(childValue, PRODUCTION_NODE_ID_KEYS);
      for (const id of ids) {
        if (state.productionNodeIds.has(id)) state.authorizedNodeIds.add(id);
      }
    }
    collect(childValue, state, childKey, seen);
  }
}

function referenceIds(node = {}) {
  return uniqueIdentifiers([
    node.requirements?.reference_asset_ids,
    node.metadata?.reference_asset_ids,
    node.generation?.provider_parameters?.reference_asset_ids,
    node.generation?.provider_parameters?.identity_reference_asset_ids,
    node.requirements?.expected_contract?.reference_asset_ids,
    node.requirements?.expected_contract?.identity_requirements?.reference_asset_ids,
    node.requirements?.reference_images,
    node.generation?.provider_parameters?.reference_images,
  ], CREATIVE_ASSET_ID_KEYS);
}

function invalidReferenceDiagnostics(node = {}) {
  const candidates = [
    ["requirements.reference_asset_ids", node.requirements?.reference_asset_ids],
    ["metadata.reference_asset_ids", node.metadata?.reference_asset_ids],
    [
      "generation.provider_parameters.reference_asset_ids",
      node.generation?.provider_parameters?.reference_asset_ids,
    ],
    [
      "generation.provider_parameters.identity_reference_asset_ids",
      node.generation?.provider_parameters?.identity_reference_asset_ids,
    ],
    ["requirements.reference_images", node.requirements?.reference_images],
    [
      "generation.provider_parameters.reference_images",
      node.generation?.provider_parameters?.reference_images,
    ],
  ];

  return candidates.flatMap(([field, value]) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const ids = uniqueIdentifiers(item, CREATIVE_ASSET_ID_KEYS);
      const hasMedia = Object.values(item).some((entry) => Boolean(mediaReference(entry)));
      return ids.length || hasMedia
        ? []
        : [{ field, index, keys: Object.keys(item).sort() }];
    });
  });
}

export const CreativeShotAssetScopeRuntime = {
  build({ node, graph_nodes = [], edges = [], project_asset_ids = [] } = {}) {
    if (!node?.id) throw new Error("ASSET_SCOPE_NODE_REQUIRED");
    const productionNodeIds = new Set(
      uniqueIdentifiers(
        list(graph_nodes).map((item) => ({ id: item?.id })),
        PRODUCTION_NODE_ID_KEYS,
      ),
    );
    const state = {
      productionNodeIds,
      creativeAssetIds: new Set(),
      assetNodeIds: new Set(),
      authorizedNodeIds: new Set(),
      audioAssetIds: new Set(),
      mediaReferences: new Set(),
    };

    const sourceAssetIds = uniqueIdentifiers(
      node.assets,
      CREATIVE_ASSET_ID_KEYS,
    );
    const explicitReferenceIds = referenceIds(node);
    for (const id of sourceAssetIds) state.creativeAssetIds.add(id);
    for (const id of explicitReferenceIds) state.creativeAssetIds.add(id);

    collect(node.requirements, state, "requirements");
    collect(node.generation?.provider_parameters, state, "provider_parameters");
    collect(node.generation?.identity_lock, state, "identity_lock");
    collect(node.metadata?.asset_binding, state, "asset_binding");

    const dependencyNodeIds = uniqueIdentifiers(
      list(edges)
        .filter((edge) => edge.to === node.id && edge.type === "DEPENDS_ON")
        .map((edge) => ({ id: edge.from })),
      PRODUCTION_NODE_ID_KEYS,
    );
    for (const id of dependencyNodeIds) state.authorizedNodeIds.add(id);

    const projectIds = new Set(
      uniqueIdentifiers(project_asset_ids, CREATIVE_ASSET_ID_KEYS),
    );
    const creativeAssetIds = unique([...state.creativeAssetIds]);
    const missing = creativeAssetIds.filter((id) => !projectIds.has(id));
    if (missing.length) {
      throw new Error(
        `SHOT_ASSET_SCOPE_PROJECT_ASSET_MISSING:${node.id}:${missing.join(",")}`,
      );
    }

    const diagnostics = invalidReferenceDiagnostics(node);
    const scope = {
      contract: "STRICT_SHOT_ASSET_SCOPE_V2",
      node_id: node.id,
      source_asset_ids: sourceAssetIds,
      reference_asset_ids: explicitReferenceIds,
      audio_asset_ids: unique([...state.audioAssetIds]),
      creative_asset_ids: creativeAssetIds,
      asset_node_ids: unique([...state.assetNodeIds]),
      dependency_node_ids: dependencyNodeIds,
      authorized_production_node_ids: unique([...state.authorizedNodeIds]),
      allowed_media_references: unique([...state.mediaReferences]),
      ignored_unresolved_reference_descriptors: diagnostics,
      access_policy: {
        project_asset_pool_access: false,
        organization_asset_pool_access: false,
        implicit_asset_discovery: false,
        dependency_output_access: "EXPLICIT_GRAPH_ANCESTORS_ONLY",
        provider_input_mode: "LEAST_PRIVILEGE",
        reject_unscoped_media: true,
        structured_reference_normalization: true,
        object_stringification_prohibited: true,
      },
    };
    return {
      ...scope,
      scope_hash: digest(scope),
    };
  },

  verify(scope = {}) {
    if (!["STRICT_SHOT_ASSET_SCOPE_V1", "STRICT_SHOT_ASSET_SCOPE_V2"]
      .includes(scope.contract)) {
      return false;
    }
    return Boolean(text(scope.scope_hash)) && text(scope.scope_hash) === digest(scope);
  },

  hash: digest,
  mediaReference,
  creativeAssetKey,
  assetNodeKey,
  productionNodeKey,
  identifierValues,
  uniqueIdentifiers,
  canonical,
  list,
  object,
  text,
  unique,
};
