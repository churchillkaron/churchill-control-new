import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeShotAssetScopeRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.shot-primary-source-dispatch-gate.v1",
);

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

async function enforce(task = {}) {
  const input = object(task.input);
  const scope = object(input.requirements?.asset_scope);
  if (!CreativeShotAssetScopeRuntime.verify(scope)) {
    throw new Error("STRICT_SHOT_ASSET_SCOPE_REQUIRED");
  }

  const sourceIds = [...new Set(list(scope.source_asset_ids).map(text).filter(Boolean))];
  const primarySourceAssetId = text(scope.primary_source_asset_id);

  if (sourceIds.length && !primarySourceAssetId) {
    throw new Error(`SHOT_PRIMARY_SOURCE_REQUIRED:${task.id}`);
  }
  if (
    primarySourceAssetId &&
    !sourceIds.includes(primarySourceAssetId)
  ) {
    throw new Error(
      `SHOT_PRIMARY_SOURCE_NOT_IN_SCOPE:${task.id}:${primarySourceAssetId}`,
    );
  }

  const generation = object(input.generation);
  const providerParameters = object(generation.provider_parameters);

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...input,
      primary_source_asset_id: primarySourceAssetId || null,
      source_binding_contract: primarySourceAssetId
        ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
        : null,
      source_assets: primarySourceAssetId ? [primarySourceAssetId] : [],
      selected_assets: primarySourceAssetId ? [primarySourceAssetId] : [],
      assets: primarySourceAssetId ? [primarySourceAssetId] : [],
      source: primarySourceAssetId || input.source || null,
      prompt_image: primarySourceAssetId || input.prompt_image || null,
      generation: {
        ...generation,
        primary_source_asset_id: primarySourceAssetId || null,
        source_binding_contract: primarySourceAssetId
          ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
          : null,
        provider_parameters: {
          ...providerParameters,
          primary_source_asset_id: primarySourceAssetId || null,
          source_binding_contract: primarySourceAssetId
            ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
            : null,
        },
      },
      provider_policy: {
        ...object(input.provider_policy),
        asset_access_mode: "EXPLICIT_PRIMARY_SOURCE_ONLY",
        allow_project_asset_pool: false,
        allow_organization_asset_pool: false,
        allow_implicit_media_discovery: false,
        reject_ambiguous_primary_source: true,
        asset_scope_hash: scope.scope_hash,
      },
    },
    metadata: {
      ...object(task.metadata),
      verified_primary_source_asset_id: primarySourceAssetId || null,
      verified_source_asset_ids: sourceIds,
      provider_input_mode: "EXPLICIT_PRIMARY_SOURCE_ONLY",
      project_asset_pool_exposed: false,
      organization_asset_pool_exposed: false,
    },
  });
}

if (!ProductionTaskRuntime[INSTALL_FLAG]) {
  const dispatchWithoutPrimarySourceGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  ProductionTaskRuntime.dispatch = async function dispatchWithPrimarySourceGate(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const verified = await enforce(task);
    return dispatchWithoutPrimarySourceGate(verified.id);
  };
}

export const CreativeShotPrimarySourceDispatchGate = {
  installed: true,
  enforce,
};
