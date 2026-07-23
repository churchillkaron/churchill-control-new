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
} from "@/lib/creative/production/contracts/CreativeEvidenceRoleContract";

const RUNTIME_VERSION =
  "CREATIVE_AUTHORIZED_PROOF_EVIDENCE_AUDIT_V1";
const AUTHORIZATION_VERSION =
  "CREATIVE_MASTER_STILL_PROOF_AUTHORIZATION_V2";
const PREPARATION_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_PREPARATION_V1";

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

function dedupeAssets(groups = []) {
  const map = new Map();

  for (const asset of groups.flat()) {
    const id = creativeEvidenceAssetId(asset);
    if (!id) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, asset);
      continue;
    }

    map.set(id, {
      ...existing,
      ...asset,
      metadata: {
        ...(existing.metadata || {}),
        ...(asset.metadata || {}),
      },
      analysis: {
        ...(existing.analysis || {}),
        ...(asset.analysis || {}),
      },
    });
  }

  return [...map.values()];
}

function actorList(scene = {}, shot = {}) {
  return [
    ...list(scene.actors),
    ...list(shot.actors),
    ...list(scene.casting?.actors),
    ...list(shot.casting?.actors),
  ];
}

function productList(scene = {}, shot = {}) {
  return [
    ...list(scene.products),
    ...list(shot.products),
  ];
}

function roleInventory(assets = []) {
  const inventory = {};

  for (const asset of assets) {
    for (const role of classifyCreativeEvidenceRoles(asset)) {
      inventory[role] = inventory[role] || [];
      inventory[role].push(asset);
    }
  }

  return inventory;
}

function compactAsset(asset = {}, authorizedIds = new Set()) {
  const id = creativeEvidenceAssetId(asset);

  return {
    id: id || null,
    name:
      asset.name ||
      asset.title ||
      asset.file_name ||
      asset.filename ||
      null,
    evidence_roles: classifyCreativeEvidenceRoles(asset),
    approved: isCreativeEvidenceApproved(asset),
    authorized_for_proof: authorizedIds.has(id),
    source_scope:
      asset.creative_project_id
        ? "PROJECT"
        : asset.creative_mission_id
          ? "MISSION"
          : "ORGANIZATION",
    ai_generated: asset.ai_generated === true,
    has_delivery_url: Boolean(creativeEvidenceAssetUrl(asset)),
    url: creativeEvidenceAssetUrl(asset),
    reference_roles: unique([
      ...list(asset.reference_roles),
      ...list(asset.reference_role),
      ...list(asset.metadata?.reference_roles),
      ...list(asset.metadata?.reference_role),
      ...list(asset.analysis?.reference_roles),
      ...list(asset.analysis?.reference_role),
    ]),
    tags: unique([
      ...list(asset.tags),
      ...list(asset.metadata?.tags),
      ...list(asset.analysis?.tags),
    ]).slice(0, 30),
    analysis_summary:
      asset.analysis?.summary ||
      asset.analysis?.description ||
      asset.description ||
      asset.caption ||
      null,
  };
}

function reviewRecommendations({
  selected,
  inventory,
  manifest,
}) {
  const actors = actorList(selected.scene, selected.shot);
  const products = productList(selected.scene, selected.shot);
  const required = new Set(manifest.required_roles);
  const recommendations = [];

  function recommend(role, reason, severity = "REVIEW") {
    const assets = list(inventory[role]);
    if (!assets.length || required.has(role)) return;

    recommendations.push({
      role,
      reason,
      severity,
      available_asset_ids:
        assets.map(creativeEvidenceAssetId).filter(Boolean),
      approved_asset_ids:
        assets
          .filter(isCreativeEvidenceApproved)
          .map(creativeEvidenceAssetId)
          .filter(Boolean),
    });
  }

  if (manifest.required_roles.includes("LOCATION")) {
    recommend(
      "BRAND",
      "A location/source-plate shot has approved brand evidence available. Review whether visible signage or brand marks must be exact or removed.",
      "HIGH",
    );
  }

  if (actors.length) {
    recommend(
      "WARDROBE",
      "The shot contains visible people and wardrobe evidence exists. Review whether clothing or uniforms must be bound rather than generated generically.",
      "HIGH",
    );
    recommend(
      "IDENTITY",
      "The shot contains visible people and identity evidence exists. Review which declared roles require exact identity fidelity and which may use generated cast.",
      "REVIEW",
    );
  }

  if (products.length) {
    recommend(
      "PRODUCT",
      "The shot contains declared products and product evidence exists. Review whether exact product fidelity is required.",
      "HIGH",
    );
  }

  recommend(
    "STYLE",
    "Style evidence exists and can guide lighting, mood or composition without changing factual references.",
    "OPTIONAL",
  );

  return recommendations;
}

function validateEnvelope({
  organization_id,
  creative_project_id,
  approval_candidate,
  proof_authorization,
  authorized_preparation,
}) {
  const candidate = object(approval_candidate);
  const authorization = object(proof_authorization);
  const preparation = object(authorized_preparation);

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

  for (const value of [candidate, authorization, preparation]) {
    if (
      String(value.organization_id || "") !== String(organization_id) ||
      String(value.creative_project_id || "") !== String(creative_project_id)
    ) {
      throw runtimeError("CREATIVE_EVIDENCE_AUDIT_SCOPE_MISMATCH");
    }
  }

  if (
    text(preparation.proof_authorization_hash) !==
      text(authorization.authorization_hash) ||
    text(preparation.approval_candidate_hash) !==
      text(authorization.approval_candidate_hash) ||
    text(preparation.canonical_story_hash) !==
      text(authorization.canonical_story_hash)
  ) {
    throw runtimeError("CREATIVE_EVIDENCE_AUDIT_HASH_BINDING_MISMATCH");
  }

  return { candidate, authorization, preparation };
}

export const CreativeAuthorizedProofEvidenceAuditRuntime = {
  async audit({
    organization_id,
    creative_project_id,
    approval_candidate,
    proof_authorization,
    authorized_preparation,
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
    });
    const proofShot = object(envelope.authorization.proof_shot);
    const selected = storyShot(
      envelope.candidate.story,
      text(proofShot.key),
    );

    if (!selected) {
      throw runtimeError("CREATIVE_EVIDENCE_AUDIT_SHOT_NOT_FOUND");
    }

    const project = await CreativeProjectRuntime.get(creative_project_id);

    if (
      !project ||
      String(project.organization_id || "") !== String(organization_id)
    ) {
      throw runtimeError("CREATIVE_PROJECT_NOT_IN_ORGANIZATION");
    }

    const [projectAssets, missionAssets, organizationAssets] =
      await Promise.all([
        CreativeAssetsRuntime.list({
          organization_id,
          creative_project_id,
          limit: 500,
        }),
        project.creative_mission_id
          ? CreativeAssetsRuntime.list({
              organization_id,
              creative_mission_id: project.creative_mission_id,
              limit: 500,
            })
          : Promise.resolve([]),
        CreativeAssetsRuntime.list({
          organization_id,
          limit: 500,
        }),
      ]);
    const assets = dedupeAssets([
      projectAssets,
      missionAssets,
      organizationAssets,
    ]).filter((asset) => creativeEvidenceAssetUrl(asset));
    const authorizedIds = new Set(
      list(proofShot.reference_asset_ids).map(String),
    );
    const manifest = buildCreativeEvidenceRoleManifest({
      scene: selected.scene,
      shot: selected.shot,
      assets,
      authorized_asset_ids: [...authorizedIds],
    });
    const inventory = roleInventory(assets);
    const recommendations = reviewRecommendations({
      selected,
      inventory,
      manifest,
    });
    const allInventory = Object.fromEntries(
      Object.entries(inventory).map(([role, values]) => [
        role,
        values.map((asset) => compactAsset(asset, authorizedIds)),
      ]),
    );
    const authorizedAssets = assets
      .filter((asset) => authorizedIds.has(creativeEvidenceAssetId(asset)))
      .map((asset) => compactAsset(asset, authorizedIds));
    const unclassifiedAssets = assets
      .filter((asset) => !classifyCreativeEvidenceRoles(asset).length)
      .map((asset) => compactAsset(asset, authorizedIds));
    const bindingReviewRequired =
      !manifest.complete ||
      recommendations.some((item) =>
        ["HIGH", "REVIEW"].includes(item.severity),
      );

    return {
      success: true,
      audit_only: true,
      audit_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      proof_authorization_hash:
        envelope.authorization.authorization_hash,
      approval_candidate_hash:
        envelope.authorization.approval_candidate_hash,
      canonical_story_hash:
        envelope.authorization.canonical_story_hash,
      proof_shot: {
        key: proofShot.key,
        title: selected.shot.title || proofShot.title || null,
        scene_number: selected.scene_number,
        shot_number: selected.shot_number,
        shot_hash: proofShot.shot_hash,
        actor_count: actorList(selected.scene, selected.shot).length,
        product_count: productList(selected.scene, selected.shot).length,
      },
      asset_counts: {
        project: projectAssets.length,
        mission: missionAssets.length,
        organization: organizationAssets.length,
        unique_deliverable_assets: assets.length,
        authorized_for_proof: authorizedAssets.length,
        unclassified: unclassifiedAssets.length,
      },
      authorized_assets: authorizedAssets,
      evidence_role_inventory: allInventory,
      unclassified_assets: unclassifiedAssets,
      evidence_role_manifest: manifest,
      review_recommendations: recommendations,
      binding_review_required: bindingReviewRequired,
      provider_dispatched: false,
      wallet_reserved: false,
      usage_created: false,
      image_generated: false,
      video_generated: false,
      next_gate: bindingReviewRequired
        ? "PROOF_EVIDENCE_BINDING_REVIEW_REQUIRED"
        : "PROOF_EVIDENCE_BINDING_READY",
    };
  },
};
