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
} from "@/lib/creative/production/contracts/CreativeEvidenceRoleContractV2";

const RUNTIME_VERSION =
  "CREATIVE_AUTHORIZED_PROOF_IDENTITY_BINDING_V1";
const REQUIRED_PREVIOUS_BINDING_VERSION =
  "CREATIVE_AUTHORIZED_PROOF_EVIDENCE_BINDING_V2";
const AUTHORIZATION_VERSION =
  "CREATIVE_MASTER_STILL_PROOF_AUTHORIZATION_V2";
const PREPARATION_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_PREPARATION_V1";
const AUDIT_VERSION =
  "CREATIVE_AUTHORIZED_PROOF_EVIDENCE_AUDIT_V1";

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

function referenceId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }

  return text(
    value?.id ||
    value?.asset_id ||
    value?.reference_asset_id,
  );
}

function normalizeReferenceIds(value) {
  return unique(list(value).map(referenceId));
}

function validateEnvelope({
  organization_id,
  creative_project_id,
  approval_candidate,
  proof_authorization,
  authorized_preparation,
  evidence_audit,
  previous_binding,
}) {
  const candidate = object(approval_candidate);
  const authorization = object(proof_authorization);
  const preparation = object(authorized_preparation);
  const audit = object(evidence_audit);
  const previous = object(previous_binding);

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
  if (
    previous.success !== true ||
    previous.binding_version !== REQUIRED_PREVIOUS_BINDING_VERSION ||
    previous.binding_only !== true ||
    !text(previous.binding_hash)
  ) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PROOF_EVIDENCE_BINDING_V2_REQUIRED",
    );
  }

  for (const value of [
    candidate,
    authorization,
    preparation,
    audit,
    previous,
  ]) {
    if (
      String(value.organization_id || "") !== String(organization_id) ||
      String(value.creative_project_id || "") !== String(creative_project_id)
    ) {
      throw runtimeError("CREATIVE_IDENTITY_BINDING_SCOPE_MISMATCH");
    }
  }

  const authorizationHash = text(authorization.authorization_hash);

  if (
    text(preparation.proof_authorization_hash) !== authorizationHash ||
    text(audit.proof_authorization_hash) !== authorizationHash ||
    text(previous.proof_authorization_hash) !== authorizationHash
  ) {
    throw runtimeError("CREATIVE_IDENTITY_BINDING_HASH_MISMATCH");
  }

  return {
    candidate,
    authorization,
    preparation,
    audit,
    previous,
  };
}

function normalizeIdentityBinding(value = {}, index = 0) {
  const assetIds = normalizeReferenceIds(
    value.asset_ids ||
    value.asset_id ||
    value.identity_reference_asset_ids ||
    value.identity_reference_asset_id,
  );
  const role = text(
    value.narrative_role ||
    value.role ||
    value.subject_role,
  );
  const bindingKey = text(
    value.binding_key ||
    value.key ||
    value.subject_key,
  ) || `reference-subject-${index + 1}`;
  const count = Math.max(1, Number(value.count || 1));
  const missing = [];

  if (!role) missing.push("narrative_role");
  if (!assetIds.length) missing.push("asset_ids");
  if (assetIds.length !== count) {
    missing.push("one_identity_asset_per_subject");
  }
  if (!text(value.action)) missing.push("action");
  if (!text(value.placement)) missing.push("placement");

  if (missing.length) {
    throw runtimeError(
      `CREATIVE_REFERENCE_SUBJECT_${index + 1}_INCOMPLETE`,
      { binding_key: bindingKey, missing },
    );
  }

  return {
    binding_key: bindingKey,
    narrative_role: role,
    count,
    identity_mode: "REFERENCE_IDENTITY",
    identity_reference_asset_ids: assetIds,
    action: text(value.action),
    placement: text(value.placement),
    wardrobe: text(
      value.wardrobe_brief ||
      value.wardrobe ||
      value.clothing_brief,
    ) || null,
    wardrobe_mode: "GENERATED_FROM_APPROVED_BRIEF",
  };
}

function normalizeGeneratedGroup(value = {}, index = 0) {
  const role = text(
    value.narrative_role ||
    value.role ||
    value.subject_role,
  );
  const bindingKey = text(
    value.binding_key ||
    value.key ||
    value.subject_key,
  ) || `generated-group-${index + 1}`;
  const count = Math.max(1, Number(value.count || 1));
  const missing = [];

  if (!role) missing.push("narrative_role");
  if (!text(value.action)) missing.push("action");
  if (!text(value.placement)) missing.push("placement");

  if (missing.length) {
    throw runtimeError(
      `CREATIVE_GENERATED_GROUP_${index + 1}_INCOMPLETE`,
      { binding_key: bindingKey, missing },
    );
  }

  return {
    binding_key: bindingKey,
    narrative_role: role,
    count,
    identity_mode: "GENERATED_CAST",
    identity_reference_asset_ids: [],
    action: text(value.action),
    placement: text(value.placement),
    wardrobe: text(
      value.wardrobe_brief ||
      value.wardrobe ||
      value.clothing_brief,
    ) || null,
    wardrobe_mode: "GENERATED_FROM_APPROVED_BRIEF",
  };
}

function validateUniqueBindings(referenceSubjects, generatedGroups) {
  const keys = [
    ...referenceSubjects.map((subject) => subject.binding_key),
    ...generatedGroups.map((group) => group.binding_key),
  ];
  const duplicates = keys.filter(
    (key, index) => keys.indexOf(key) !== index,
  );

  if (duplicates.length) {
    throw runtimeError("CREATIVE_CAST_BINDING_KEY_DUPLICATE", {
      binding_keys: unique(duplicates),
    });
  }

  const identityIds = referenceSubjects.flatMap(
    (subject) => subject.identity_reference_asset_ids,
  );
  const duplicateIdentityIds = identityIds.filter(
    (id, index) => identityIds.indexOf(id) !== index,
  );

  if (duplicateIdentityIds.length) {
    throw runtimeError("CREATIVE_IDENTITY_ASSET_BOUND_MORE_THAN_ONCE", {
      asset_ids: unique(duplicateIdentityIds),
    });
  }
}

async function loadAssets(assetIds = []) {
  const assets = await Promise.all(
    assetIds.map((id) => CreativeAssetsRuntime.get(id)),
  );

  return assets.filter(Boolean);
}

function validateIdentityAssets({
  assets,
  requestedIds,
  organization_id,
}) {
  const byId = new Map(
    assets.map((asset) => [creativeEvidenceAssetId(asset), asset]),
  );

  for (const assetId of requestedIds) {
    const asset = byId.get(assetId);

    if (!asset) {
      throw runtimeError("CREATIVE_IDENTITY_ASSET_NOT_FOUND", {
        asset_id: assetId,
      });
    }
    if (
      String(asset.organization_id || "") !== String(organization_id)
    ) {
      throw runtimeError("CREATIVE_IDENTITY_ASSET_SCOPE_MISMATCH", {
        asset_id: assetId,
      });
    }
    if (!creativeEvidenceAssetUrl(asset)) {
      throw runtimeError("CREATIVE_IDENTITY_ASSET_DELIVERY_REQUIRED", {
        asset_id: assetId,
      });
    }
    if (!isCreativeEvidenceApproved(asset)) {
      throw runtimeError("CREATIVE_IDENTITY_ASSET_APPROVAL_REQUIRED", {
        asset_id: assetId,
      });
    }
    if (asset.ai_generated === true) {
      throw runtimeError("CREATIVE_ORIGINAL_IDENTITY_ASSET_REQUIRED", {
        asset_id: assetId,
      });
    }
  }

  return byId;
}

function roleBindingMap(bindings = []) {
  return new Map(
    list(bindings).map((binding) => [
      text(binding.role).toUpperCase(),
      binding,
    ]),
  );
}

function mergeRoleBindings(previousBindings, identityAssetIds) {
  const map = roleBindingMap(previousBindings);

  map.set("IDENTITY", {
    role: "IDENTITY",
    asset_ids: identityAssetIds,
    exact_fidelity_required: true,
    authoritative_source_required: false,
  });

  return [...map.values()];
}

function taggedAsset(asset = {}, role) {
  const roles = unique([
    ...classifyCreativeEvidenceRoles(asset),
    ...list(asset.evidence_roles),
    ...list(asset.metadata?.evidence_roles),
    role,
  ]);

  return {
    ...asset,
    evidence_roles: roles,
    metadata: {
      ...(asset.metadata || {}),
      evidence_roles: roles,
      evidence_binding_source: RUNTIME_VERSION,
    },
  };
}

function buildMixedCastSpecification({
  storedBinding,
  roleBindings,
  referenceSubjects,
  generatedGroups,
  assets,
}) {
  const storedScene = object(storedBinding.scene);
  const storedShot = object(storedBinding.shot);
  const identityAssetIds = referenceSubjects.flatMap(
    (subject) => subject.identity_reference_asset_ids,
  );
  const actors = [
    ...referenceSubjects.map((subject) => ({
      role: subject.narrative_role,
      count: subject.count,
      identity_mode: subject.identity_mode,
      identity_reference_asset_ids:
        subject.identity_reference_asset_ids,
      wardrobe: subject.wardrobe,
      wardrobe_mode: subject.wardrobe_mode,
      action: subject.action,
      placement: subject.placement,
      evidence_binding_key: subject.binding_key,
    })),
    ...generatedGroups.map((group) => ({
      role: group.narrative_role,
      count: group.count,
      identity_mode: group.identity_mode,
      identity_reference_asset_ids: [],
      wardrobe: group.wardrobe,
      wardrobe_mode: group.wardrobe_mode,
      action: group.action,
      placement: group.placement,
      evidence_binding_key: group.binding_key,
    })),
  ];
  const evidenceRequirements = {
    required_roles: ["LOCATION", "IDENTITY", "BRAND"],
    generated_roles: ["WARDROBE"],
    optional_roles: ["PRODUCT", "STYLE", "TEXT"],
    excluded_exact_roles: ["WARDROBE"],
    identity_binding_mode: "PER_SUBJECT",
  };
  const scene = {
    ...storedScene,
    actors,
    casting: {
      mode: generatedGroups.length
        ? "MIXED_CAST"
        : "REFERENCE_IDENTITY",
      actors,
      exact_identity_required: true,
    },
    evidence_requirements: evidenceRequirements,
    identity_exact: true,
    wardrobe_exact: false,
  };
  const shot = {
    ...storedShot,
    actors,
    casting: {
      mode: generatedGroups.length
        ? "MIXED_CAST"
        : "REFERENCE_IDENTITY",
      actors,
      exact_identity_required: true,
    },
    evidence_requirements: evidenceRequirements,
    identity_exact: true,
    identity_reference_asset_ids: identityAssetIds,
    wardrobe_exact: false,
    assets: unique([
      ...list(storedShot.assets),
      ...identityAssetIds,
    ]),
    reference_asset_ids: unique([
      ...list(storedShot.reference_asset_ids),
      ...identityAssetIds,
    ]),
  };
  const taggedAssets = assets.map((asset) => {
    const id = creativeEvidenceAssetId(asset);
    const role = identityAssetIds.includes(id)
      ? "IDENTITY"
      : roleBindings.find((binding) =>
          list(binding.asset_ids).includes(id),
        )?.role;

    return taggedAsset(asset, role);
  });
  const allAssetIds = unique(
    roleBindings.flatMap((binding) => list(binding.asset_ids)),
  );
  const manifest = buildCreativeEvidenceRoleManifest({
    scene,
    shot,
    assets: taggedAssets,
    authorized_asset_ids: allAssetIds,
  });

  if (!manifest.complete) {
    throw runtimeError(
      "CREATIVE_IDENTITY_BINDING_MANIFEST_INCOMPLETE",
      manifest,
    );
  }

  return {
    scene,
    shot,
    actors,
    manifest,
    tagged_assets: taggedAssets,
    all_asset_ids: allAssetIds,
    identity_asset_ids: identityAssetIds,
    cast_mode: generatedGroups.length
      ? "MIXED_CAST"
      : "REFERENCE_IDENTITY",
  };
}

async function persistIdentityRoles(assets = [], identityIds = []) {
  const identitySet = new Set(identityIds);
  const results = [];

  for (const asset of assets) {
    const id = creativeEvidenceAssetId(asset);
    if (!identitySet.has(id)) continue;

    const roles = unique([
      ...classifyCreativeEvidenceRoles(asset),
      ...list(asset.evidence_roles),
      ...list(asset.metadata?.evidence_roles),
      "IDENTITY",
    ]);
    const updated = await CreativeAssetsRuntime.update(id, {
      metadata: {
        ...(asset.metadata || {}),
        evidence_roles: roles,
        evidence_binding_source: RUNTIME_VERSION,
      },
    });

    results.push({
      id: creativeEvidenceAssetId(updated),
      evidence_roles: roles,
      updated: true,
    });
  }

  return results;
}

export const CreativeAuthorizedProofIdentityBindingRuntime = {
  async bind({
    organization_id,
    creative_project_id,
    approval_candidate,
    proof_authorization,
    authorized_preparation,
    evidence_audit,
    previous_binding,
    identity_bindings = [],
    generated_cast_groups = [],
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
      previous_binding,
    });
    const referenceSubjects = list(identity_bindings).map(
      normalizeIdentityBinding,
    );
    const generatedGroups = list(generated_cast_groups).map(
      normalizeGeneratedGroup,
    );

    if (!referenceSubjects.length) {
      throw runtimeError("CREATIVE_REFERENCE_IDENTITY_BINDING_REQUIRED");
    }

    validateUniqueBindings(referenceSubjects, generatedGroups);

    const project = await CreativeProjectRuntime.get(creative_project_id);

    if (
      !project ||
      String(project.organization_id || "") !== String(organization_id)
    ) {
      throw runtimeError("CREATIVE_PROJECT_NOT_IN_ORGANIZATION");
    }

    const storedBinding = object(
      project.metadata?.authorized_proof_evidence_binding,
    );

    if (
      storedBinding.version !== REQUIRED_PREVIOUS_BINDING_VERSION ||
      text(storedBinding.binding_hash) !==
        text(envelope.previous.binding_hash)
    ) {
      throw runtimeError(
        "CREATIVE_STORED_EVIDENCE_BINDING_CHANGED",
        {
          expected_binding_hash: envelope.previous.binding_hash,
          stored_binding_hash: storedBinding.binding_hash || null,
          stored_binding_version: storedBinding.version || null,
        },
      );
    }

    const identityAssetIds = unique(
      referenceSubjects.flatMap(
        (subject) => subject.identity_reference_asset_ids,
      ),
    );
    const roleBindings = mergeRoleBindings(
      storedBinding.role_bindings || envelope.previous.role_bindings,
      identityAssetIds,
    );
    const allAssetIds = unique(
      roleBindings.flatMap((binding) => list(binding.asset_ids)),
    );
    const assets = await loadAssets(allAssetIds);

    validateIdentityAssets({
      assets,
      requestedIds: identityAssetIds,
      organization_id,
    });

    const specification = buildMixedCastSpecification({
      storedBinding,
      roleBindings,
      referenceSubjects,
      generatedGroups,
      assets,
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
      proof_shot_key:
        envelope.authorization.proof_shot?.key || null,
      authorized_shot_hash:
        envelope.authorization.proof_shot?.shot_hash || null,
      supersedes_binding_hash: envelope.previous.binding_hash,
      role_bindings: roleBindings,
      identity_bindings: referenceSubjects,
      generated_cast_groups: generatedGroups,
      evidence_role_manifest: specification.manifest,
      composition_plan: storedBinding.composition_plan,
      generated_roles: ["WARDROBE"],
      cast_mode: specification.cast_mode,
    };
    const bindingHash = stableHash(bindingPayload);
    const persistedAssets = await persistIdentityRoles(
      specification.tagged_assets,
      specification.identity_asset_ids,
    );

    await CreativeProjectRuntime.update(creative_project_id, {
      metadata: {
        ...(project.metadata || {}),
        authorized_proof_evidence_binding: {
          ...bindingPayload,
          binding_hash: bindingHash,
          bound_at: new Date().toISOString(),
          scene: specification.scene,
          shot: specification.shot,
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
      proof_shot: envelope.previous.proof_shot,
      supersedes_binding_hash: envelope.previous.binding_hash,
      binding_hash: bindingHash,
      role_bindings: roleBindings,
      identity_bindings: referenceSubjects,
      generated_cast_groups: generatedGroups,
      evidence_role_manifest: specification.manifest,
      cast_mode: specification.cast_mode,
      exact_identity_asset_ids: specification.identity_asset_ids,
      generated_roles: ["WARDROBE"],
      wardrobe_mode: "GENERATED_FROM_APPROVED_BRIEF",
      composition_plan: storedBinding.composition_plan,
      persisted_identity_roles: persistedAssets,
      mask_ready: false,
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
