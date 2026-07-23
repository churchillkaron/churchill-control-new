import { createHash } from "node:crypto";

const RUNTIME_VERSION =
  "CREATIVE_MASTER_STILL_PROOF_AUTHORIZATION_V1";

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

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

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

function hash(value) {
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

function shotMap(story = {}) {
  const map = new Map();

  list(story.scenes).forEach((scene, sceneIndex) => {
    list(scene.shots).forEach((shot, shotIndex) => {
      map.set(`${sceneIndex + 1}:${shotIndex + 1}`, {
        scene,
        shot,
        scene_number: sceneIndex + 1,
        shot_number: shotIndex + 1,
      });
    });
  });

  return map;
}

function validateCandidate({
  organization_id,
  creative_project_id,
  approval_candidate,
  approval_candidate_hash,
}) {
  const candidate = object(approval_candidate);
  const normalization = object(candidate.human_normalization);
  const finalReview = object(
    candidate.final_revalidation?.revalidation,
  );
  const story = object(candidate.story);
  const calculatedHash = hash(story);
  const declaredHash = text(
    approval_candidate_hash ||
    normalization.approval_candidate_hash,
  );

  if (candidate.success !== true) {
    throw runtimeError(
      "CREATIVE_APPROVAL_CANDIDATE_MUST_BE_SUCCESSFUL",
    );
  }
  if (!candidate.preview_only || !candidate.repair_only) {
    throw runtimeError(
      "CREATIVE_APPROVAL_CANDIDATE_PREVIEW_REQUIRED",
    );
  }
  if (normalization.validation_passed !== true) {
    throw runtimeError(
      "CREATIVE_APPROVAL_CANDIDATE_VALIDATION_REQUIRED",
    );
  }
  if (
    Number(finalReview.failed_shot_count || 0) !== 0 ||
    list(finalReview.failed_shot_keys).length !== 0
  ) {
    throw runtimeError(
      "CREATIVE_APPROVAL_CANDIDATE_HAS_FAILED_SHOTS",
      {
        failed_shot_count:
          Number(finalReview.failed_shot_count || 0),
        failed_shot_keys:
          list(finalReview.failed_shot_keys),
      },
    );
  }
  if (
    String(candidate.organization_id || "") !==
    String(organization_id || "")
  ) {
    throw runtimeError(
      "CREATIVE_PROOF_AUTHORIZATION_ORGANIZATION_MISMATCH",
    );
  }
  if (
    String(candidate.creative_project_id || "") !==
    String(creative_project_id || "")
  ) {
    throw runtimeError(
      "CREATIVE_PROOF_AUTHORIZATION_PROJECT_MISMATCH",
    );
  }
  if (!declaredHash) {
    throw runtimeError(
      "CREATIVE_APPROVAL_CANDIDATE_HASH_REQUIRED",
    );
  }
  if (
    declaredHash !== calculatedHash ||
    text(normalization.approval_candidate_hash) !== calculatedHash
  ) {
    throw runtimeError(
      "CREATIVE_APPROVAL_CANDIDATE_HASH_MISMATCH",
      {
        declared_hash: declaredHash,
        normalization_hash:
          normalization.approval_candidate_hash || null,
        calculated_hash: calculatedHash,
      },
    );
  }

  return {
    candidate,
    story,
    approval_candidate_hash: calculatedHash,
  };
}

export const CreativeProofAuthorizationRuntime = {
  async issue({
    organization_id,
    creative_project_id,
    approval_candidate,
    approval_candidate_hash,
    proof_shot_key,
    human_approved = false,
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }
    if (human_approved !== true) {
      throw runtimeError(
        "CREATIVE_HUMAN_APPROVAL_REQUIRED",
      );
    }

    const validated = validateCandidate({
      organization_id,
      creative_project_id,
      approval_candidate,
      approval_candidate_hash,
    });
    const key = text(proof_shot_key);
    const shots = shotMap(validated.story);
    const selected = shots.get(key);

    if (!key || !selected) {
      throw runtimeError(
        "CREATIVE_PROOF_SHOT_NOT_FOUND",
        { proof_shot_key: key || null },
      );
    }

    const references = list(
      selected.shot.reference_asset_ids,
    ).map(String).filter(Boolean);

    if (!references.length) {
      throw runtimeError(
        "CREATIVE_PROOF_SHOT_REFERENCES_REQUIRED",
        { proof_shot_key: key },
      );
    }

    const issuedAt = new Date().toISOString();
    const scope = {
      proof_shot_key: key,
      scene_number: selected.scene_number,
      shot_number: selected.shot_number,
      image_generation_limit: 1,
      image_qa_required: true,
      automatic_repair_limit: 1,
      repair_qa_required: true,
      video_generation_allowed: false,
      motion_generation_allowed: false,
      full_pipeline_allowed: false,
      additional_shots_allowed: false,
      provider_retry_without_review_allowed: false,
    };
    const authorizationPayload = {
      version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      approval_candidate_hash:
        validated.approval_candidate_hash,
      proof_shot_key: key,
      scene_number: selected.scene_number,
      shot_number: selected.shot_number,
      shot_hash: hash(selected.shot),
      reference_asset_ids: references,
      authorization_scope: scope,
      issued_at: issuedAt,
    };
    const authorizationHash = hash(authorizationPayload);

    return {
      success: true,
      preview_only: true,
      authorization_only: true,
      authorization_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      approval_candidate_hash:
        validated.approval_candidate_hash,
      proof_shot: {
        key,
        scene_number: selected.scene_number,
        shot_number: selected.shot_number,
        title: selected.shot.title || null,
        duration_seconds:
          Number(selected.shot.duration_seconds || 0),
        shot_hash: authorizationPayload.shot_hash,
        reference_asset_ids: references,
        reference_grounding:
          selected.shot.reference_grounding || null,
      },
      authorization_scope: scope,
      authorization_hash: authorizationHash,
      issued_at: issuedAt,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
      next_gate: "MASTER_STILL_PROOF_PREPARATION_REQUIRED",
    };
  },
};
