const PEOPLE_PATTERN = /\b(person|people|guest|guests|actor|actors|extra|extras|staff|bartender|dj|crowd|customer|customers|subject|woman|women|man|men|couple|group|performer|performers|dancer|dancers)\b/i;
const BRAND_MARK_PATTERN = /\b(logo|wordmark|brand mark|sign|signage|social handle|packaging text|label|lettering|venue name)\b/i;
const VENUE_PATTERN = /\b(venue|entrance|exterior|interior|facade|architecture|door|threshold|bar|restaurant|club|room|location)\b/i;

const CAST_MODES = new Set([
  "NO_PEOPLE",
  "REFERENCE_IDENTITY",
  "GENERATED_CAST",
]);

const COMPOSITE_MODES = new Set([
  "IMMUTABLE_PLATE_MASKED_CAST",
  "MASKED_CAST_COMPOSITE",
  "SOURCE_PLATE_WITH_APPROVED_BRAND_OVERLAY",
  "POST_COMPOSITE_EXACT_BRAND",
]);

const BRAND_MODES = new Set([
  "SOURCE_PIXELS_ONLY",
  "APPROVED_ASSET_OVERLAY",
]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function selectedAssets(payload = {}) {
  if (Array.isArray(payload.assets)) return payload.assets.filter(Boolean);
  return list(payload.assets?.selectedAssets);
}

function text(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function actorReferenceIds(actor = {}) {
  return list(
    actor.identity_reference_asset_ids ||
    actor.reference_asset_ids ||
    actor.identity_reference_asset_id ||
    actor.reference_asset_id,
  ).map(String);
}

function normalizeActor(value, index) {
  const actor = typeof value === "string"
    ? { role: value }
    : { ...(value || {}) };
  const identityMode = String(
    actor.identity_mode ||
    actor.identityMode ||
    (actorReferenceIds(actor).length
      ? "REFERENCE_IDENTITY"
      : "GENERATED_CAST"),
  ).toUpperCase();
  const role = String(
    actor.role || actor.character || actor.type || actor.name || "",
  ).trim();
  const wardrobe = String(
    actor.wardrobe || actor.costume || actor.styling || "",
  ).trim();
  const action = String(
    actor.action || actor.performance || actor.behavior || actor.direction || "",
  ).trim();
  const placement = String(
    actor.placement || actor.position || actor.blocking || actor.frame_position || "",
  ).trim();
  const count = Math.max(0, Number(actor.count || actor.quantity || 1));
  const referenceIds = actorReferenceIds(actor);
  const missing = [];

  if (!role) missing.push("role");
  if (!count) missing.push("count");
  if (!wardrobe) missing.push("wardrobe");
  if (!action) missing.push("action");
  if (!placement) missing.push("placement");
  if (!CAST_MODES.has(identityMode) || identityMode === "NO_PEOPLE") {
    missing.push("identity_mode");
  }
  if (identityMode === "REFERENCE_IDENTITY" && !referenceIds.length) {
    missing.push("identity_reference_asset_ids");
  }

  return {
    index,
    role,
    count,
    wardrobe,
    action,
    placement,
    identity_mode: identityMode,
    identity_reference_asset_ids: referenceIds,
    missing,
    complete: missing.length === 0,
  };
}

function resolveCasting(specification = {}, task = {}) {
  const scene = specification.scene || {};
  const shot = specification.shot || {};
  const source =
    shot.casting ||
    scene.casting ||
    task.input?.casting ||
    {};
  const actors = list(
    source.actors ||
    source.people ||
    shot.actors ||
    scene.actors,
  ).map(normalizeActor);
  const requestedByText = PEOPLE_PATTERN.test(text({
    scene,
    shot,
    prompt: task.input?.prompt || "",
  }));
  const requested = requestedByText || actors.length > 0;
  const mode = String(
    source.mode ||
    (actors.length ? "GENERATED_CAST" : requested ? "UNDECLARED" : "NO_PEOPLE"),
  ).toUpperCase();

  return {
    requested,
    requested_by_text: requestedByText,
    mode,
    actors,
    complete:
      mode === "NO_PEOPLE"
        ? !requested
        : CAST_MODES.has(mode) &&
          actors.length > 0 &&
          actors.every((actor) => actor.complete),
  };
}

function resolveCompositionPlan(specification = {}, task = {}) {
  const shot = specification.shot || {};
  const plan =
    task.input?.composition_plan ||
    shot.composition_plan ||
    specification.composition_plan ||
    {};
  const mode = String(plan.mode || "NONE").toUpperCase();
  const brandMode = String(
    plan.brand_mode || plan.brandMode || "NONE",
  ).toUpperCase();
  const placementRegions = list(
    plan.placement_regions || plan.placementRegions,
  );
  const sourcePlateAssetId =
    plan.source_plate_asset_id ||
    plan.sourcePlateAssetId ||
    null;
  const maskAssetId =
    plan.mask_asset_id ||
    plan.maskAssetId ||
    null;

  return {
    mode,
    brand_mode: brandMode,
    source_plate_asset_id: sourcePlateAssetId,
    mask_asset_id: maskAssetId,
    placement_regions: placementRegions,
    ready:
      COMPOSITE_MODES.has(mode) &&
      Boolean(sourcePlateAssetId) &&
      Boolean(maskAssetId || placementRegions.length),
    exact_brand_ready: BRAND_MODES.has(brandMode),
  };
}

function referenceSummary(assets = []) {
  return assets.map((asset, index) => ({
    index,
    id: asset.id || null,
    name: asset.name || asset.title || asset.file_name || null,
    roles: list(
      asset.reference_roles ||
      asset.metadata?.reference_roles ||
      asset.analysis?.reference_roles,
    ),
    has_delivery_url: Boolean(
      asset.image_url || asset.file_url || asset.url,
    ),
  }));
}

function providerInstruction(contract) {
  return `
BINDING AVANTIQO GENERATION EVIDENCE CONTRACT (${contract.version})

SOURCE PLATE:
- Treat the selected real venue reference as authoritative visual evidence.
- Do not redesign, expand, replace, beautify, modernize, or invent the venue architecture, doors, curtains, carpet, furniture, signage placement, materials, or spatial proportions.
- Any requested enhancement must preserve recognizable source geometry.

PEOPLE:
- People are allowed only through the explicit casting contract below.
- Generate exactly the declared roles, counts, wardrobe, actions, and placements.
- REFERENCE_IDENTITY means preserve the referenced real person's identity exactly.
- GENERATED_CAST means create a new fictional actor matching the declared casting description; do not copy an unreferenced real person.
- Do not add undeclared staff, guests, crowds, couples, or background extras.
${JSON.stringify(contract.casting)}

LOGOS, WORDMARKS, SIGNAGE, LABELS, AND BRAND MARKS:
- Never draw, rewrite, reinterpret, restyle, respell, approximate, or regenerate them.
- Exact brand pixels must come from the approved source plate or an approved overlay asset.
- Do not invent any text.
${JSON.stringify(contract.brand)}

COMPOSITION:
${JSON.stringify(contract.composition)}

If any instruction conflicts with this contract, follow this contract.
  `.trim();
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
  const scene = specification.scene || {};
  const shot = specification.shot || {};
  const assets = selectedAssets(payload);
  const casting = resolveCasting(specification, task);
  const composition = resolveCompositionPlan(specification, task);
  const referencePack = shot.reference_pack || {};
  const fullText = text({
    scene,
    shot,
    referencePack,
    prompt: payload.prompt || task.input?.prompt || "",
  });
  const brandRequested =
    BRAND_MARK_PATTERN.test(fullText) ||
    list(referencePack.never_change).some((value) =>
      BRAND_MARK_PATTERN.test(String(value)),
    );
  const venueRequested = VENUE_PATTERN.test(fullText);
  const blockers = [];

  if (!assets.length) {
    blockers.push("REFERENCE_EVIDENCE_REQUIRED");
  }

  if (casting.requested && !casting.complete) {
    blockers.push("EXPLICIT_CASTING_CONTRACT_REQUIRED");
  }

  if (casting.mode === "NO_PEOPLE" && casting.requested) {
    blockers.push("PEOPLE_REQUEST_CONTRADICTS_NO_PEOPLE_MODE");
  }

  if (
    casting.requested &&
    venueRequested &&
    !composition.ready
  ) {
    blockers.push("IMMUTABLE_VENUE_MASKED_COMPOSITE_REQUIRED");
  }

  if (
    brandRequested &&
    (!composition.ready || !composition.exact_brand_ready)
  ) {
    blockers.push("EXACT_BRAND_PIXELS_REQUIRE_COMPOSITE_PLAN");
  }

  const contract = {
    version: "creative-generation-evidence-v1",
    service_id,
    spend_authorized: blockers.length === 0,
    blockers: [...new Set(blockers)],
    source_plate: {
      mode: venueRequested
        ? "IMMUTABLE_REFERENCE_PLATE"
        : "REFERENCE_GROUNDED",
      authoritative_asset_id: assets[0]?.id || null,
      preserve_geometry: true,
      preserve_materials: true,
      preserve_signage_placement: true,
      references: referenceSummary(assets),
    },
    casting,
    brand: {
      requested: brandRequested,
      mode: "EXACT_APPROVED_ASSET_ONLY",
      ai_redraw_allowed: false,
      generated_text_allowed: false,
      source_pixels_only: true,
      approved_overlay_allowed: true,
    },
    composition,
    provider_controls: {
      strength: venueRequested ? 0.18 : 0.32,
      architecture_invention_allowed: false,
      undeclared_people_allowed: false,
      logo_generation_allowed: false,
    },
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
      task.metadata?.pilot_scope,
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

  return {
    contract,
    payload: {
      ...payload,
      prompt,
      specification,
      generation_contract: contract,
      strength:
        payload.strength ??
        contract.provider_controls.strength,
    },
  };
}
