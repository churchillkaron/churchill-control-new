import {
  resolveCreativeFreedomPolicy,
} from "@/lib/creative/director/runtime/CreativeFreedomPolicyRuntime";

const CAST_MODES = new Set([
  "NO_PEOPLE",
  "REFERENCE_IDENTITY",
  "GENERATED_CAST",
  "MIXED_CAST",
]);

const MASKED_COMPOSITION_MODES = new Set([
  "IMMUTABLE_PLATE_MASKED_CAST",
  "MASKED_CAST_COMPOSITE",
  "SOURCE_PLATE_WITH_APPROVED_BRAND_OVERLAY",
  "POST_COMPOSITE_EXACT_BRAND",
]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function selectedAssets(payload = {}) {
  if (Array.isArray(payload.assets)) return payload.assets.filter(Boolean);
  return list(payload.assets?.selectedAssets);
}

function assetId(asset = null) {
  if (!asset || typeof asset !== "object") return "";
  return String(asset.id || asset.asset_id || "");
}

function assetRoles(asset = {}) {
  return unique([
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.metadata?.roles),
    ...list(asset.analysis?.reference_roles),
    ...list(asset.analysis?.reference_role),
    ...list(asset.analysis?.roles),
  ]).map((role) => role.toUpperCase());
}

function roleMatches(asset = {}, patterns = []) {
  return assetRoles(asset).some((role) =>
    patterns.some((pattern) => pattern.test(role)),
  );
}

function isVenueReference(asset = {}) {
  return roleMatches(asset, [
    /VENUE/,
    /LOCATION/,
    /ENTRANCE/,
    /EXTERIOR/,
    /INTERIOR/,
    /ARCHITECTURE/,
    /ENVIRONMENT/,
    /SCENE_PLATE/,
  ]);
}

function isIdentityReference(asset = {}) {
  return roleMatches(asset, [
    /IDENTITY/,
    /PERSON/,
    /STAFF/,
    /CAST/,
    /CHARACTER/,
    /TALENT/,
  ]);
}

function isBrandReference(asset = {}) {
  return roleMatches(asset, [
    /BRAND/,
    /LOGO/,
    /WORDMARK/,
    /SIGNAGE/,
    /PACKAGING/,
    /LABEL/,
    /TYPOGRAPHY/,
  ]);
}

function castingActors(source = {}) {
  return list(source?.actors || source?.people);
}

function meaningfulCastingSource(source = null) {
  return Boolean(
    source &&
    typeof source === "object" &&
    (
      castingActors(source).length ||
      source.mode ||
      source.cast_mode ||
      source.castMode
    ),
  );
}

function firstCastingActors(...sources) {
  for (const source of sources) {
    const actors = castingActors(source);
    if (actors.length) return actors;
  }
  return [];
}

function actorReferenceIds(actor = {}) {
  return unique(list(
    actor.identity_reference_asset_ids ||
    actor.reference_asset_ids ||
    actor.identity_reference_asset_id ||
    actor.reference_asset_id,
  ));
}

function normalizeActor(value, index) {
  const actor = typeof value === "string"
    ? { role: value }
    : { ...(value || {}) };
  const referenceIds = actorReferenceIds(actor);
  const identityMode = String(
    actor.identity_mode ||
    actor.identityMode ||
    (referenceIds.length ? "REFERENCE_IDENTITY" : "GENERATED_CAST"),
  ).toUpperCase();
  const role = String(
    actor.role ||
    actor.character ||
    actor.type ||
    actor.name ||
    actor.description ||
    actor.brief ||
    actor.prompt ||
    (
      identityMode === "GENERATED_CAST"
        ? `Generated cast ${index + 1}`
        : ""
    ),
  ).trim();
  const count = Math.max(0, Number(actor.count || actor.quantity || 1));
  const missing = [];

  if (!role) missing.push("role");
  if (!count) missing.push("count");
  if (!CAST_MODES.has(identityMode) || identityMode === "NO_PEOPLE") {
    missing.push("identity_mode");
  }
  if (identityMode === "REFERENCE_IDENTITY" && !referenceIds.length) {
    missing.push("identity_reference_asset_ids");
  }

  return {
    ...actor,
    index,
    role,
    count,
    identity_mode: identityMode,
    identity_reference_asset_ids: referenceIds,
    wardrobe: actor.wardrobe || actor.costume || actor.styling || null,
    action:
      actor.action || actor.performance || actor.behavior || actor.direction || null,
    placement:
      actor.placement || actor.position || actor.blocking || actor.frame_position || null,
    missing,
    complete: missing.length === 0,
  };
}

function resolveCasting(specification = {}, task = {}) {
  const scene = specification.scene || {};
  const shot = specification.shot || {};
  const preparedCasting = task.input?.casting || null;
  const shotCasting = shot.casting || null;
  const sceneCasting = scene.casting || null;
  const sources = [
    { name: "TASK_PREPARED_CASTING", value: preparedCasting },
    { name: "SHOT_CASTING", value: shotCasting },
    { name: "SCENE_CASTING", value: sceneCasting },
  ];
  const selected = sources.find(({ value }) =>
    meaningfulCastingSource(value),
  ) || {
    name: "NO_CASTING_SOURCE",
    value: {},
  };
  const actors = firstCastingActors(
    preparedCasting,
    shotCasting,
    sceneCasting,
    { actors: shot.actors },
    { actors: scene.actors },
  ).map(normalizeActor);
  const explicitMode =
    preparedCasting?.mode ||
    preparedCasting?.cast_mode ||
    preparedCasting?.castMode ||
    selected.value?.mode ||
    selected.value?.cast_mode ||
    selected.value?.castMode ||
    null;
  const hasReferenceIdentity = actors.some(
    (actor) => actor.identity_mode === "REFERENCE_IDENTITY",
  );
  const hasGeneratedCast = actors.some(
    (actor) => actor.identity_mode === "GENERATED_CAST",
  );
  const inferredMode =
    hasReferenceIdentity && hasGeneratedCast
      ? "MIXED_CAST"
      : hasReferenceIdentity
        ? "REFERENCE_IDENTITY"
        : actors.length
          ? "GENERATED_CAST"
          : "NO_PEOPLE";
  const mode = String(explicitMode || inferredMode).toUpperCase();
  const incompleteActors = actors
    .filter((actor) => !actor.complete)
    .map((actor) => ({
      index: actor.index,
      role: actor.role,
      missing: actor.missing,
    }));

  return {
    requested: mode !== "NO_PEOPLE" || actors.length > 0,
    mode,
    source: selected.name,
    prepared_contract_present: meaningfulCastingSource(preparedCasting),
    actors,
    incomplete_actors: incompleteActors,
    complete:
      mode === "NO_PEOPLE"
        ? actors.length === 0
        : CAST_MODES.has(mode) &&
          actors.length > 0 &&
          incompleteActors.length === 0,
  };
}

function resolveCompositionPlan({
  specification = {},
  task = {},
  assets = [],
  casting = {},
  freedom = {},
} = {}) {
  const shot = specification.shot || {};
  const explicitPlan =
    task.input?.composition_plan ||
    shot.composition_plan ||
    specification.composition_plan ||
    {};
  const explicitMode =
    explicitPlan.mode ||
    freedom.structure?.composition_mode ||
    freedom.structure?.compositionMode ||
    null;
  const hasVenue = assets.some(isVenueReference);
  const hasIdentity = assets.some(isIdentityReference) ||
    casting.actors.some(
      (actor) => actor.identity_mode === "REFERENCE_IDENTITY",
    );
  const inferredMode =
    hasVenue && (hasIdentity || casting.requested)
      ? "FULL_SCENE_REFERENCE_SYNTHESIS"
      : assets.length
        ? "REFERENCE_GROUNDED_GENERATION"
        : "OPEN_GENERATION";
  const mode = String(explicitMode || inferredMode).toUpperCase();
  const placementRegions = list(
    explicitPlan.placement_regions || explicitPlan.placementRegions,
  );
  const protectedRegions = list(
    explicitPlan.protected_regions || explicitPlan.protectedRegions,
  );
  const sourcePlateAssetId =
    explicitPlan.source_plate_asset_id ||
    explicitPlan.sourcePlateAssetId ||
    assets.find(isVenueReference)?.id ||
    assets[0]?.id ||
    null;
  const maskAssetId =
    explicitPlan.mask_asset_id ||
    explicitPlan.maskAssetId ||
    null;
  const masked = MASKED_COMPOSITION_MODES.has(mode);
  const ready = masked
    ? Boolean(
        sourcePlateAssetId &&
        (maskAssetId || placementRegions.length),
      )
    : true;

  return {
    ...explicitPlan,
    mode,
    source_plate_asset_id: sourcePlateAssetId,
    mask_asset_id: maskAssetId,
    placement_regions: placementRegions,
    protected_regions: protectedRegions,
    masked,
    ready,
    full_scene_regeneration_required:
      mode === "FULL_SCENE_REFERENCE_SYNTHESIS",
    creative_interpretation_open:
      mode !== "IMMUTABLE_PLATE_MASKED_CAST",
  };
}

function referenceSummary(assets = []) {
  return assets.map((asset, index) => ({
    index,
    id: assetId(asset) || null,
    name: asset.name || asset.title || asset.file_name || null,
    roles: assetRoles(asset),
    approved:
      asset.approved_reference === true ||
      asset.status === "APPROVED" ||
      asset.status === "approved" ||
      asset.reuse_status === "APPROVED" ||
      asset.reuse_status === "approved" ||
      null,
    rights: asset.rights || asset.metadata?.rights || null,
    has_delivery_url: Boolean(
      asset.image_url || asset.file_url || asset.url,
    ),
  }));
}

function providerInstruction(contract) {
  const compact = {
    version: contract.version,
    generation: contract.generation,
    references: contract.references,
    casting: contract.casting,
    composition: contract.composition,
    factual_invariants: contract.factual_invariants,
    creative_freedom: contract.creative_freedom,
  };

  return [
    "Use the supplied evidence contract as production truth.",
    "Preserve only declared factual invariants and exact approved references.",
    "Treat every unspecified creative choice as open to strong original interpretation.",
    "Create one coherent image; never paste reference images as visible rectangles or collages unless the composition contract explicitly requests collage work.",
    JSON.stringify(compact),
  ].join("\n");
}

export function buildCreativeGenerationEvidenceContract({
  service_id,
  payload = {},
  metadata = {},
} = {}) {
  const task = metadata.task || {};
  const specification =
    payload.specification ||
    task.input?.specification ||
    {};
  const shot = specification.shot || {};
  const assets = selectedAssets(payload);
  const casting = resolveCasting(specification, task);
  const freedom = resolveCreativeFreedomPolicy(
    metadata.creative_policy,
    task.input?.creative_policy,
    specification.creative_policy,
    shot.creative_policy,
    payload.creative_policy,
  );
  const composition = resolveCompositionPlan({
    specification,
    task,
    assets,
    casting,
    freedom,
  });
  const references = referenceSummary(assets);
  const brandReferences = assets.filter(isBrandReference);
  const exactBrandRequested = Boolean(
    shot.brand_exact === true ||
    shot.reference_pack?.exact_brand_required === true ||
    specification.brand_exact === true ||
    composition.exact_brand_overlay_required === true,
  );
  const referenceRequired = Boolean(
    shot.reference_pack?.required === true ||
    specification.reference_required === true ||
    casting.actors.some(
      (actor) => actor.identity_mode === "REFERENCE_IDENTITY",
    ) ||
    composition.source_plate_asset_id ||
    exactBrandRequested,
  );
  const blockers = [];

  if (referenceRequired && !assets.length) {
    blockers.push("REFERENCE_EVIDENCE_REQUIRED");
  }
  if (casting.requested && !casting.complete) {
    blockers.push("CASTING_CONTRACT_INCOMPLETE");
  }
  if (!composition.ready) {
    blockers.push("COMPOSITION_PLAN_INCOMPLETE");
  }
  if (exactBrandRequested && !brandReferences.length) {
    blockers.push("EXACT_BRAND_REFERENCE_REQUIRED");
  }

  const authoritativeAsset =
    assets.find((asset) =>
      assetId(asset) === String(composition.source_plate_asset_id || ""),
    ) ||
    assets.find(isVenueReference) ||
    assets[0] ||
    null;
  const providerControls = {
    ...freedom.provider_controls,
    ...(payload.provider_controls || {}),
  };
  const contract = {
    version: "creative-generation-evidence-v3",
    service_id,
    spend_authorized: blockers.length === 0,
    blockers: unique(blockers),
    generation: {
      mode: composition.mode,
      objective:
        shot.purpose ||
        specification.scene?.objective ||
        task.title ||
        null,
      reference_required: referenceRequired,
      coherent_full_frame_required:
        composition.mode !== "COLLAGE" &&
        composition.mode !== "MONTAGE",
    },
    source_plate: {
      mode: composition.masked
        ? "CONTROLLED_COMPOSITE"
        : authoritativeAsset
          ? "REFERENCE_EVIDENCE"
          : "NONE",
      authoritative_asset_id: assetId(authoritativeAsset) || null,
      references,
    },
    references,
    casting,
    brand: {
      exact_reference_required: exactBrandRequested,
      reference_asset_ids: brandReferences.map(assetId).filter(Boolean),
      generated_text_allowed:
        shot.generated_text_allowed === true ||
        specification.generated_text_allowed === true,
      post_overlay_allowed: true,
    },
    composition,
    factual_invariants: unique([
      ...list(shot.reference_pack?.preserve),
      ...list(shot.reference_pack?.never_change),
      ...list(freedom.preserve),
    ]),
    creative_freedom: {
      ...freedom,
      may_change: unique([
        ...list(shot.reference_pack?.may_change),
        ...list(freedom.may_change),
      ]),
      unspecified_fields_are_open: true,
    },
    provider_controls: providerControls,
  };

  return {
    ...contract,
    provider_instruction: providerInstruction(contract),
  };
}

export function prepareCreativeGenerationPayload({
  service_id,
  payload = {},
  metadata = {},
} = {}) {
  const task = metadata.task || {};
  const creativeImageTask =
    service_id === "ai.image.generate" &&
    Boolean(
      task.creative_project_id ||
      task.metadata?.deliverable === "MASTER_STILL" ||
      task.metadata?.pilot_scope ||
      payload.specification?.shot,
    );

  if (!creativeImageTask) {
    return {
      payload,
      contract: null,
    };
  }

  const contract = buildCreativeGenerationEvidenceContract({
    service_id,
    payload,
    metadata,
  });

  if (!contract.spend_authorized) {
    const error = new Error("CREATIVE_GENERATION_PREFLIGHT_BLOCKED");
    error.code = contract.blockers[0] || "CREATIVE_GENERATION_PREFLIGHT_BLOCKED";
    error.details = contract;
    throw error;
  }

  const specification = {
    ...(payload.specification || {}),
    generation_contract: contract,
  };
  const prompt = [
    payload.prompt || "",
    contract.provider_instruction,
  ].filter(Boolean).join("\n\n");
  const strength =
    payload.strength ??
    contract.provider_controls.strength ??
    null;
  const nextPayload = {
    ...payload,
    prompt,
    specification,
    generation_contract: contract,
  };

  if (strength !== null) {
    nextPayload.strength = strength;
  } else {
    delete nextPayload.strength;
  }

  return {
    contract,
    payload: nextPayload,
  };
}
