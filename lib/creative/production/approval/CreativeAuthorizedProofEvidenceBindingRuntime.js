import { createHash } from "node:crypto";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  buildCreativeEvidenceRoleManifest,
  classifyCreativeEvidenceRoles,
  creativeEvidenceAssetId,
  creativeEvidenceAssetUrl,
  isCreativeEvidenceApproved,
  normalizeCreativeEvidenceRole,
} from "@/lib/creative/production/contracts/CreativeEvidenceRoleContract";

const RUNTIME_VERSION =
  "CREATIVE_AUTHORIZED_PROOF_EVIDENCE_BINDING_V1";
const AUTHORIZATION_VERSION =
  "CREATIVE_MASTER_STILL_PROOF_AUTHORIZATION_V2";
const PREPARATION_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_PREPARATION_V1";
const AUDIT_VERSION =
  "CREATIVE_AUTHORIZED_PROOF_EVIDENCE_AUDIT_V1";
const COMPOSITION_MODE =
  "IMMUTABLE_PLATE_MASKED_CAST";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((output, key) => {
        output[key] = stableValue(value[key]);
        return output;
      }, {});
  }

  return value;
}

function stableHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value || {})))
    .digest("hex");
}

function runtimeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function storyShot(story = {}, key) {
  let selected = null;

  list(story.scenes).forEach((scene, sceneIndex) => {
    list(scene.shots).forEach((shot, shotIndex) => {
      if (`${sceneIndex + 1}:${shotIndex + 1}` !== key) return;

      const { shots: ignoredShots, ...sceneWithoutShots } = scene;
      selected = {
        scene: sceneWithoutShots,
        shot,
        scene_number: sceneIndex + 1,
        shot_number: shotIndex + 1,
      };
    });
  });

  return selected;
}

function normalizeRoleBinding(value = {}) {
  const role = normalizeCreativeEvidenceRole(value.role);
  const assetIds = unique(
    list(value.asset_ids || value.assetIds).map((entry) =>
      typeof entry === "string" || typeof entry === "number"
        ? entry
        : entry?.id || entry?.asset_id,
    ),
  );

  if (!role) {
    throw runtimeError("CREATIVE_EVIDENCE_BINDING_ROLE_INVALID", {
      role: value.role || null,
    });
  }
  if (!assetIds.length) {
    throw runtimeError("CREATIVE_EVIDENCE_BINDING_ASSET_REQUIRED", {
      role,
    });
  }

  return {
    role,
    asset_ids: assetIds,
    exact_fidelity_required:
      value.exact_fidelity_required !== false,
    authoritative_source_required:
      value.authoritative_source_required === true,
  };
}

function validateEnvelope({
  organization_id,
  creative_project_id,
  approval_candidate,
  proof_authorization,
  authorized_preparation,
  evidence_audit,
}) {
  const candidate = object(approval_candidate);
  const authorization = object(proof_authorization);
  const preparation = object(authorized_preparation);
  const audit = object(evidence_audit);

  if (candidate.success !== true) {
    throw runtimeError("CREATIVE_APPROVAL_CANDIDATE_REQUIRED");
  }
  if (
    authorization.success !== true ||
    authorization.authorization_version !== AUTHORIZATION_VERSION
  ) {
    throw runtimeError("CREATIVE_PROOF_AUTHORIZATION_REQUIRED");
  }
  if (
    preparation.success !== true ||
    preparation.preparation_version !== PREPARATION_VERSION
  ) {
    throw runtimeError("CREATIVE_AUTHORIZED_PREPARATION_REQUIRED");
  }
  if (
    audit.success !== true ||
    audit.audit_version !== AUDIT_VERSION ||
    audit.audit_only !== true
  ) {
    throw runtimeError("CREATIVE_PROOF_EVIDENCE_AUDIT_REQUIRED");
  }

  for (const value of [candidate, authorization, preparation, audit]) {
    if (
      String(value.organization_id || "") !== String(organization_id) ||
      String(value.creative_project_id || "") !== String(creative_project_id)
    ) {
      throw runtimeError("CREATIVE_EVIDENCE_BINDING_SCOPE_MISMATCH");
    }
  }

  const authorizationHash = text(authorization.authorization_hash);
  if (
    text(preparation.proof_authorization_hash) !== authorizationHash ||
    text(audit.proof_authorization_hash) !== authorizationHash ||
    text(audit.approval_candidate_hash) !==
      text(authorization.approval_candidate_hash) ||
    text(audit.canonical_story_hash) !==
      text(authorization.canonical_story_hash)
  ) {
    throw runtimeError("CREATIVE_EVIDENCE_BINDING_HASH_MISMATCH");
  }

  return { candidate, authorization, preparation, audit };
}

async function loadBoundAssets(assetIds = []) {
  const assets = await Promise.all(
    assetIds.map((id) => CreativeAssetsRuntime.get(id)),
  );

  return assets.filter(Boolean);
}

function assertBindingAssets({
  bindings,
  assets,
  organization_id,
}) {
  const byId = new Map(
    assets.map((asset) => [creativeEvidenceAssetId(asset), asset]),
  );

  for (const binding of bindings) {
    for (const assetId of binding.asset_ids) {
      const asset = byId.get(assetId);

      if (!asset) {
        throw runtimeError("CREATIVE_EVIDENCE_BINDING_ASSET_NOT_FOUND", {
          role: binding.role,
          asset_id: assetId,
        });
      }
      if (
        String(asset.organization_id || "") !== String(organization_id)
      ) {
        throw runtimeError(
          "CREATIVE_EVIDENCE_BINDING_ASSET_ORGANIZATION_MISMATCH",
          { role: binding.role, asset_id: assetId },
        );
      }
      if (!creativeEvidenceAssetUrl(asset)) {
        throw runtimeError(
          "CREATIVE_EVIDENCE_BINDING_ASSET_DELIVERY_REQUIRED",
          { role: binding.role, asset_id: assetId },
        );
      }
      if (
        binding.exact_fidelity_required &&
        !isCreativeEvidenceApproved(asset)
      ) {
        throw runtimeError(
          "CREATIVE_EVIDENCE_BINDING_APPROVED_ASSET_REQUIRED",
          { role: binding.role, asset_id: assetId },
        );
      }
      if (
        binding.exact_fidelity_required &&
        asset.ai_generated === true
      ) {
        throw runtimeError(
          "CREATIVE_EVIDENCE_BINDING_ORIGINAL_ASSET_REQUIRED",
          { role: binding.role, asset_id: assetId },
        );
      }
    }
  }

  return byId;
}

function actorRole(actor = {}, index = 0) {
  return text(
    actor.narrative_role ||
    actor.role ||
    actor.character ||
    actor.name ||
    actor.description,
  ) || `Generated subject ${index + 1}`;
}

function actorWardrobeDescription(actor = {}) {
  const source =
    actor.wardrobe ||
    actor.costume ||
    actor.clothing ||
    actor.outfit ||
    actor.styling ||
    actor.uniform ||
    "";

  if (typeof source === "string") return text(source);

  return text(
    source.description ||
    source.brief ||
    source.style ||
    source.name,
  );
}

function normalizeGeneratedActors(scene = {}, shot = {}) {
  const source = list(shot.actors).length
    ? list(shot.actors)
    : list(scene.actors);

  return source.map((actor, index) => ({
    ...actor,
    role: actorRole(actor, index),
    identity_mode: "GENERATED_CAST",
    identity_reference_asset_ids: [],
    wardrobe: {
      mode: "GENERATED_FROM_APPROVED_BRIEF",
      description:
        actorWardrobeDescription(actor) ||
        "Generate clothing appropriate to the approved narrative role and setting.",
      exact_reference_required: false,
      reference_asset_ids: [],
    },
  }));
}

function bindingForRole(bindings, role) {
  return bindings.find((binding) => binding.role === role) || null;
}

function buildBoundSpecification({
  selected,
  bindings,
  assetsById,
}) {
  const location = bindingForRole(bindings, "LOCATION");
  const brand = bindingForRole(bindings, "BRAND");

  if (!location || !location.authoritative_source_required) {
    throw runtimeError(
      "CREATIVE_EVIDENCE_BINDING_AUTHORITATIVE_LOCATION_REQUIRED",
    );
  }
  if (!brand) {
    throw runtimeError("CREATIVE_EVIDENCE_BINDING_EXACT_BRAND_REQUIRED");
  }

  const locationAssetId = location.asset_ids[0];
  const brandAssetId = brand.asset_ids[0];
  const actors = normalizeGeneratedActors(
    selected.scene,
    selected.shot,
  );
  const requiredRoles = ["LOCATION", "BRAND"];
  const allAssetIds = unique(
    bindings.flatMap((binding) => binding.asset_ids),
  );
  const roleTaggedAssets = allAssetIds.map((id) => {
    const asset = assetsById.get(id);
    const roles = bindings
      .filter((binding) => binding.asset_ids.includes(id))
      .map((binding) => binding.role);

    return {
      ...asset,
      evidence_roles: unique([
        ...classifyCreativeEvidenceRoles(asset),
        ...roles,
      ]),
      metadata: {
        ...(asset.metadata || {}),
        evidence_roles: unique([
          ...list(asset.metadata?.evidence_roles),
          ...roles,
        ]),
        evidence_binding_source:
          "AUTHORIZED_PROOF_EVIDENCE_BINDING_V1",
      },
    };
  });
  const shot = {
    ...selected.shot,
    actors,
    casting: {
      mode: "GENERATED_CAST",
      actors,
      exact_identity_required: false,
    },
    evidence_requirements: {
      required_roles: requiredRoles,
      generated_roles: ["IDENTITY", "WARDROBE"],
      optional_roles: ["PRODUCT", "STYLE"],
      excluded_exact_roles: ["IDENTITY", "WARDROBE"],
    },
    location_exact: true,
    location_reference_asset_ids: location.asset_ids,
    brand_exact: true,
    brand_reference_asset_ids: brand.asset_ids,
    generated_text_allowed: false,
    exact_text_required: false,
    composition_plan: {
      mode: COMPOSITION_MODE,
      source_plate_asset_id: locationAssetId,
      exact_brand_overlay_required: true,
      brand_overlay_asset_id: brandAssetId,
      placement_regions: [],
      protected_regions: [],
      mask_asset_id: null,
      mask_required: true,
      exact_pixels_outside_mask_required: true,
      generated_text_allowed: false,
      logo_redraw_allowed: false,
      rectangular_cutouts_forbidden: true,
      alpha_matte_required: true,
      edge_feathering_required: true,
      occlusion_map_required: true,
      contact_shadow_required: true,
      depth_consistency_required: true,
      perspective_consistency_required: true,
    },
    reference_pack: {
      ...(selected.shot.reference_pack || {}),
      required: true,
      required_roles: requiredRoles,
      location_asset_ids: location.asset_ids,
      brand_asset_ids: brand.asset_ids,
      exact_location_required: true,
      exact_brand_required: true,
      preserve: unique([
        ...list(selected.shot.reference_pack?.preserve),
        "Exact authoritative location architecture, geometry, materials, perspective and existing source pixels outside the approved mask",
        "Exact approved brand artwork through source preservation or controlled overlay",
      ]),
      may_change: unique([
        ...list(selected.shot.reference_pack?.may_change),
        "Generated cast appearance inside the approved placement mask",
        "Generated wardrobe consistent with the approved narrative brief",
        "Lighting integration on generated cast while preserving source-plate truth",
      ]),
      never_change: unique([
        ...list(selected.shot.reference_pack?.never_change),
        "Authoritative location geometry and recognizable entrance structure",
        "Approved logo artwork, spelling, geometry and color",
        "Source pixels outside the approved edit mask",
      ]),
    },
    assets: allAssetIds,
    reference_asset_ids: allAssetIds,
  };
  const scene = {
    ...selected.scene,
    actors,
    evidence_requirements: {
      required_roles: requiredRoles,
      generated_roles: ["IDENTITY", "WARDROBE"],
    },
    location_exact: true,
    location_reference_asset_ids: location.asset_ids,
    brand_exact: true,
    brand_reference_asset_ids: brand.asset_ids,
  };
  const manifest = buildCreativeEvidenceRoleManifest({
    scene,
    shot,
    assets: roleTaggedAssets,
    authorized_asset_ids: allAssetIds,
  });

  if (!manifest.complete) {
    throw runtimeError(
      "CREATIVE_EVIDENCE_BINDING_MANIFEST_INCOMPLETE",
      manifest,
    );
  }

  return {
    scene,
    shot,
    assets: roleTaggedAssets,
    manifest,
    location_asset_id: locationAssetId,
    brand_asset_id: brandAssetId,
  };
}

async function persistAssetRoles(assets = []) {
  const results = [];

  for (const asset of assets) {
    const roles = unique([
      ...classifyCreativeEvidenceRoles(asset),
      ...list(asset.evidence_roles),
      ...list(asset.metadata?.evidence_roles),
    ]);
    const updated = await CreativeAssetsRuntime.update(
      creativeEvidenceAssetId(asset),
      {
        metadata: {
          ...(asset.metadata || {}),
          evidence_roles: roles,
          evidence_binding_source:
            "AUTHORIZED_PROOF_EVIDENCE_BINDING_V1",
        },
      },
    );

    results.push({
      id: creativeEvidenceAssetId(updated),
      evidence_roles: roles,
      updated: true,
    });
  }

  return results;
}

export const CreativeAuthorizedProofEvidenceBindingRuntime = {
  async bind({
    organization_id,
    creative_project_id,
    approval_candidate,
    proof_authorization,
    authorized_preparation,
    evidence_audit,
    role_bindings = [],
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }

    const envelope = validateEnvelope({
      organization_id,
      creative_project_id,
      approval_candidate,
      proof_authorization,
      authorized_preparation,
      evidence_audit,
    });
    const bindings = list(role_bindings).map(normalizeRoleBinding);
    const duplicateRoles = bindings
      .map((binding) => binding.role)
      .filter((role, index, values) => values.indexOf(role) !== index);

    if (duplicateRoles.length) {
      throw runtimeError("CREATIVE_EVIDENCE_BINDING_DUPLICATE_ROLE", {
        roles: unique(duplicateRoles),
      });
    }

    const boundAssetIds = unique(
      bindings.flatMap((binding) => binding.asset_ids),
    );
    const assets = await loadBoundAssets(boundAssetIds);
    const assetsById = assertBindingAssets({
      bindings,
      assets,
      organization_id,
    });
    const proofShot = object(envelope.authorization.proof_shot);
    const selected = storyShot(
      envelope.candidate.story,
      text(proofShot.key),
    );

    if (!selected) {
      throw runtimeError("CREATIVE_EVIDENCE_BINDING_SHOT_NOT_FOUND");
    }

    const bound = buildBoundSpecification({
      selected,
      bindings,
      assetsById,
    });
    const bindingPayload = {
      version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      proof_authorization_hash:
        envelope.authorization.authorization_hash,
      approval_candidate_hash:
        envelope.authorization.approval_candidate_hash,
      canonical_story_hash:
        envelope.authorization.canonical_story_hash,
      proof_shot_key: proofShot.key,
      authorized_shot_hash: proofShot.shot_hash,
      role_bindings: bindings,
      evidence_role_manifest: bound.manifest,
      composition_plan: bound.shot.composition_plan,
      generated_cast: true,
      generated_wardrobe: true,
    };
    const bindingHash = stableHash(bindingPayload);
    const project = await CreativeProjectRuntime.get(creative_project_id);

    if (
      !project ||
      String(project.organization_id || "") !== String(organization_id)
    ) {
      throw runtimeError("CREATIVE_PROJECT_NOT_IN_ORGANIZATION");
    }

    const persistedAssets = await persistAssetRoles(bound.assets);
    await CreativeProjectRuntime.update(creative_project_id, {
      metadata: {
        ...(project.metadata || {}),
        authorized_proof_evidence_binding: {
          ...bindingPayload,
          binding_hash: bindingHash,
          bound_at: new Date().toISOString(),
          scene: bound.scene,
          shot: bound.shot,
        },
      },
    });

    return {
      success: true,
      binding_only: true,
      binding_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      proof_authorization_hash:
        envelope.authorization.authorization_hash,
      proof_shot: {
        key: proofShot.key,
        title: selected.shot.title || proofShot.title || null,
        scene_number: selected.scene_number,
        shot_number: selected.shot_number,
        shot_hash: proofShot.shot_hash,
      },
      binding_hash: bindingHash,
      role_bindings: bindings,
      evidence_role_manifest: bound.manifest,
      authoritative_location_asset_id:
        bound.location_asset_id,
      exact_brand_asset_id:
        bound.brand_asset_id,
      cast_mode: "GENERATED_CAST",
      wardrobe_mode: "GENERATED_FROM_APPROVED_BRIEF",
      composition_plan: bound.shot.composition_plan,
      persisted_asset_roles: persistedAssets,
      mask_ready: false,
      placement_regions_ready: false,
      protected_regions_ready: false,
      production_task_modified: false,
      provider_dispatched: false,
      wallet_reserved: false,
      usage_created: false,
      image_generated: false,
      video_generated: false,
      next_gate: "AUTHORIZED_PROOF_MASK_PREPARATION_REQUIRED",
    };
  },
};
