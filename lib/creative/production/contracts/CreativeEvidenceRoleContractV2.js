import {
  buildCreativeEvidenceRoleManifest as buildV1Manifest,
  creativeEvidenceAssetId,
  deriveCreativeEvidenceRequirements as deriveV1Requirements,
} from "./CreativeEvidenceRoleContract";

export {
  CREATIVE_EVIDENCE_ROLES,
  classifyCreativeEvidenceRoles,
  creativeEvidenceAssetId,
  creativeEvidenceAssetUrl,
  creativeEvidenceTokens,
  isCreativeEvidenceApproved,
  normalizeCreativeEvidenceRole,
} from "./CreativeEvidenceRoleContract";

const POLICY_VERSION =
  "CREATIVE_EVIDENCE_REQUIREMENT_POLICY_V4_ALIAS_EQUIVALENCE";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function text(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function normalizeRole(value) {
  return text(value).toUpperCase();
}

function generatedRoles(scene = {}, shot = {}) {
  return new Set(
    unique([
      ...list(scene.evidence_requirements?.generated_roles),
      ...list(scene.evidence_requirements?.excluded_exact_roles),
      ...list(shot.evidence_requirements?.generated_roles),
      ...list(shot.evidence_requirements?.excluded_exact_roles),
    ]).map(normalizeRole),
  );
}

function referenceIds(value) {
  return unique(list(value).map((entry) =>
    typeof entry === "string" || typeof entry === "number"
      ? entry
      : entry?.id ||
        entry?.asset_id ||
        entry?.reference_asset_id,
  ));
}

function assetAliases(asset = {}) {
  return unique([
    creativeEvidenceAssetId(asset),
    asset.asset_id,
    asset.creative_asset_id,
    asset.source_asset_id,
    asset.reference_asset_id,
    asset.metadata?.source_asset_id,
    asset.metadata?.creative_asset_id,
  ]);
}

function actorIdentityReferences(actor = {}) {
  return referenceIds(
    actor.identity_reference_asset_ids ||
    actor.reference_asset_ids ||
    actor.identity_reference_asset_id ||
    actor.reference_asset_id,
  );
}

function actorWardrobeReferences(actor = {}) {
  const wardrobe =
    actor.wardrobe && typeof actor.wardrobe === "object"
      ? actor.wardrobe
      : {};

  return referenceIds(
    wardrobe.reference_asset_ids ||
    wardrobe.asset_ids ||
    wardrobe.reference_asset_id ||
    actor.wardrobe_reference_asset_ids ||
    actor.wardrobe_reference_asset_id,
  );
}

function wardrobeDescription(actor = {}) {
  const wardrobe =
    actor.wardrobe ||
    actor.costume ||
    actor.clothing ||
    actor.outfit ||
    actor.styling ||
    actor.uniform ||
    "";

  if (typeof wardrobe === "string") return text(wardrobe);

  return text(
    wardrobe.description ||
    wardrobe.brief ||
    wardrobe.style ||
    wardrobe.name,
  );
}

function sanitizeActor(actor = {}, generated = new Set()) {
  const identityMode = text(
    actor.identity_mode || actor.identityMode,
  ).toUpperCase();
  const identityGenerated =
    generated.has("IDENTITY") ||
    identityMode === "GENERATED_CAST";
  const wardrobeMode = text(
    actor.wardrobe_mode ||
    actor.wardrobe?.mode,
  ).toUpperCase();
  const wardrobeGenerated =
    generated.has("WARDROBE") ||
    wardrobeMode.startsWith("GENERATED_");
  const identityReferences = actorIdentityReferences(actor);
  const wardrobeReferences = actorWardrobeReferences(actor);
  const next = { ...actor };

  if (identityGenerated && !identityReferences.length) {
    next.identity_mode = "GENERATED_CAST";
    delete next.identityMode;
    delete next.identity_reference_asset_ids;
    delete next.identity_reference_asset_id;
    delete next.reference_asset_ids;
    delete next.reference_asset_id;
    delete next.identity_exact;
  }

  if (wardrobeGenerated && !wardrobeReferences.length) {
    next.wardrobe_mode = "GENERATED_FROM_APPROVED_BRIEF";
    next.wardrobe = wardrobeDescription(actor) || null;
    next.wardrobe_exact = false;
    delete next.wardrobe_reference_asset_ids;
    delete next.wardrobe_reference_asset_id;
  }

  return next;
}

function sanitizeRequirements(requirements = {}, generated = new Set()) {
  return {
    ...requirements,
    required_roles: list(requirements.required_roles)
      .filter((role) => !generated.has(normalizeRole(role))),
    generated_roles: unique([
      ...list(requirements.generated_roles),
      ...generated,
    ]),
    excluded_exact_roles: unique([
      ...list(requirements.excluded_exact_roles),
      ...generated,
    ]),
    policy_version: POLICY_VERSION,
  };
}

function sanitizeEvidenceInput(scene = {}, shot = {}) {
  const generated = generatedRoles(scene, shot);
  const sanitizedScene = {
    ...scene,
    actors: list(scene.actors).map((actor) =>
      sanitizeActor(actor, generated),
    ),
    casting: scene.casting
      ? {
          ...scene.casting,
          actors: list(scene.casting.actors).map((actor) =>
            sanitizeActor(actor, generated),
          ),
        }
      : scene.casting,
    evidence_requirements: sanitizeRequirements(
      scene.evidence_requirements || {},
      generated,
    ),
  };
  const sanitizedShot = {
    ...shot,
    actors: list(shot.actors).map((actor) =>
      sanitizeActor(actor, generated),
    ),
    casting: shot.casting
      ? {
          ...shot.casting,
          actors: list(shot.casting.actors).map((actor) =>
            sanitizeActor(actor, generated),
          ),
        }
      : shot.casting,
    evidence_requirements: sanitizeRequirements(
      shot.evidence_requirements || {},
      generated,
    ),
  };

  if (generated.has("IDENTITY")) {
    sanitizedScene.identity_exact = false;
    sanitizedShot.identity_exact = false;
  }

  if (generated.has("WARDROBE")) {
    sanitizedScene.wardrobe_exact = false;
    sanitizedShot.wardrobe_exact = false;
  }

  return {
    scene: sanitizedScene,
    shot: sanitizedShot,
    generated_roles: [...generated],
    policy_version: POLICY_VERSION,
  };
}

function explicitRoleBindings(requirements = []) {
  const rolesByAssetId = new Map();

  for (const requirement of list(requirements)) {
    const role = normalizeRole(requirement.role);
    if (!role) continue;

    for (const assetId of referenceIds(requirement.explicit_asset_ids)) {
      const roles = rolesByAssetId.get(assetId) || new Set();
      roles.add(role);
      rolesByAssetId.set(assetId, roles);
    }
  }

  return rolesByAssetId;
}

function annotateExplicitRoleBindings({
  assets = [],
  requirements = [],
} = {}) {
  const rolesByAssetId = explicitRoleBindings(requirements);

  return list(assets).map((asset) => {
    const boundRoles = unique(
      assetAliases(asset).flatMap((assetId) =>
        [...(rolesByAssetId.get(assetId) || [])],
      ),
    );

    if (!boundRoles.length) return asset;

    return {
      ...asset,
      evidence_roles: unique([
        ...list(asset.evidence_roles),
        ...list(asset.evidence_role),
        ...boundRoles,
      ]),
      metadata: {
        ...(asset.metadata || {}),
        evidence_roles: unique([
          ...list(asset.metadata?.evidence_roles),
          ...list(asset.metadata?.evidence_role),
          ...boundRoles,
        ]),
        authored_evidence_role_binding: true,
        authored_evidence_role_binding_policy: POLICY_VERSION,
      },
    };
  });
}

function aliasIndex(assets = []) {
  const index = new Map();

  for (const asset of list(assets)) {
    const canonical = creativeEvidenceAssetId(asset);
    if (!canonical) continue;
    for (const alias of assetAliases(asset)) index.set(alias, canonical);
  }

  return index;
}

function reconcileBindingAliases(binding = {}, aliases = new Map()) {
  const selectedIds = unique(binding.selected_asset_ids);
  const selectedCanonical = new Set(
    selectedIds.map((id) => aliases.get(id) || id),
  );
  const explicitIds = unique(binding.explicit_asset_ids);
  const explicitMissing = explicitIds.filter((id) =>
    !selectedCanonical.has(aliases.get(id) || id),
  );
  const approvedIds = unique(binding.approved_selected_asset_ids);
  const explicitResolved = explicitMissing.length === 0;
  const minimum = Math.max(1, Number(binding.minimum_assets || 1));
  const complete =
    selectedIds.length >= minimum &&
    explicitResolved &&
    (
      binding.exact_fidelity_required !== true ||
      approvedIds.length >= minimum ||
      explicitIds.length > 0
    );

  return {
    ...binding,
    complete,
    missing_explicit_asset_ids: explicitMissing,
    alias_equivalence_applied: explicitIds.some((id) => aliases.has(id)),
  };
}

function compactManifestForPrompt(manifest = {}) {
  return {
    version: manifest.version || null,
    policy_version: manifest.policy_version || null,
    complete: manifest.complete === true,
    spend_authorized: manifest.spend_authorized === true,
    blockers: list(manifest.blockers),
    required_roles: list(manifest.required_roles),
    generated_roles: list(manifest.generated_roles),
    authoritative_source_asset_id:
      manifest.authoritative_source_asset_id || null,
    authorized_reference_asset_ids:
      list(manifest.authorized_reference_asset_ids),
    all_selected_asset_ids: list(manifest.all_selected_asset_ids),
    bindings: list(manifest.bindings).map((binding) => ({
      role: binding.role || null,
      complete: binding.complete === true,
      minimum_assets: Number(binding.minimum_assets || 1),
      exact_fidelity_required:
        binding.exact_fidelity_required === true,
      authoritative_source_required:
        binding.authoritative_source_required === true,
      selected_asset_ids: list(binding.selected_asset_ids),
      approved_selected_asset_ids:
        list(binding.approved_selected_asset_ids),
      missing_explicit_asset_ids:
        list(binding.missing_explicit_asset_ids),
    })),
  };
}

export function deriveCreativeEvidenceRequirements({
  scene = {},
  shot = {},
  authorized_assets = [],
} = {}) {
  const sanitized = sanitizeEvidenceInput(scene, shot);
  const requirements = deriveV1Requirements({
    scene: sanitized.scene,
    shot: sanitized.shot,
    authorized_assets,
  });
  const generated = new Set(sanitized.generated_roles);

  return requirements.filter((requirement) =>
    !generated.has(normalizeRole(requirement.role)),
  );
}

export function buildCreativeEvidenceRoleManifest({
  scene = {},
  shot = {},
  assets = [],
  authorized_asset_ids = [],
} = {}) {
  const sanitized = sanitizeEvidenceInput(scene, shot);
  const aliases = aliasIndex(assets);
  const authorizedIds = new Set(referenceIds(authorized_asset_ids));
  const authorizedCanonicalIds = new Set(
    [...authorizedIds].map((id) => aliases.get(id) || id),
  );
  const authorizedAssets = list(assets).filter((asset) =>
    assetAliases(asset).some((assetId) =>
      authorizedIds.has(assetId) ||
      authorizedCanonicalIds.has(aliases.get(assetId) || assetId),
    ),
  );
  const declaredRequirements = deriveV1Requirements({
    scene: sanitized.scene,
    shot: sanitized.shot,
    authorized_assets: authorizedAssets,
  });
  const explicitlyBoundAssets = annotateExplicitRoleBindings({
    assets,
    requirements: declaredRequirements,
  });
  const baseManifest = buildV1Manifest({
    scene: sanitized.scene,
    shot: sanitized.shot,
    assets: explicitlyBoundAssets,
    authorized_asset_ids: unique([
      ...authorizedIds,
      ...authorizedCanonicalIds,
    ]),
  });
  const generated = new Set(sanitized.generated_roles);
  const bindings = list(baseManifest.bindings)
    .filter((binding) =>
      !generated.has(normalizeRole(binding.role)),
    )
    .map((binding) => reconcileBindingAliases(binding, aliases));
  const blockers = bindings
    .filter((binding) => binding.complete !== true)
    .map((binding) =>
      `REQUIRED_EVIDENCE_ROLE_${normalizeRole(binding.role)}_INCOMPLETE`,
    );
  const requiredRoles = list(baseManifest.required_roles).filter((role) =>
    !generated.has(normalizeRole(role)),
  );
  const manifest = {
    ...baseManifest,
    version: "CREATIVE_EVIDENCE_ROLE_CONTRACT_V4_ALIAS_EQUIVALENCE",
    policy_version: POLICY_VERSION,
    complete: blockers.length === 0,
    spend_authorized: blockers.length === 0,
    blockers: unique(blockers),
    required_roles: requiredRoles,
    generated_roles: sanitized.generated_roles,
    bindings,
    authorized_reference_asset_ids: unique([
      ...authorizedIds,
      ...authorizedCanonicalIds,
    ]),
    requirement_inference: {
      generated_roles_are_not_reference_requirements: true,
      exact_evidence_requires_true_flag_or_asset_ids: true,
      object_key_names_do_not_create_requirements: true,
      explicit_asset_role_bindings_are_authoritative: true,
      explicit_binding_does_not_imply_approval: true,
      source_asset_and_imported_node_ids_are_equivalent: true,
    },
  };

  Object.defineProperty(manifest, "toJSON", {
    enumerable: false,
    value() {
      return compactManifestForPrompt(manifest);
    },
  });

  return manifest;
}
