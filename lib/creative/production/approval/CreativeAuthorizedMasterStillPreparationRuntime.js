import { createHash } from "node:crypto";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

import {
  CreativeMasterStillPilotPreparationRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotPreparationRuntime";

const RUNTIME_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_PREPARATION_V1";
const CHECKPOINT_VERSION =
  "CREATIVE_MASTER_STILL_PILOT_CHECKPOINT_V1";
const AUTHORIZATION_VERSION =
  "CREATIVE_MASTER_STILL_PROOF_AUTHORIZATION_V2";

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

function jsonHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value || {}))
    .digest("hex");
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

function normalizeIds(value) {
  return list(value).map(String).filter(Boolean);
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function deliverable(value = {}) {
  return String(
    value.metadata?.deliverable ||
    value.intent?.deliverable ||
    "",
  ).toUpperCase();
}

function specification(value = {}) {
  const input = object(value.input);
  const requirements = object(input.requirements);

  return (
    input.specification ||
    requirements.specification ||
    requirements.shot_specification ||
    value.requirements?.specification ||
    value.generation?.input?.specification ||
    {}
  );
}

function stepSceneNumber(value = {}) {
  return Number(
    specification(value).scene?.number ||
    value.metadata?.scene_number ||
    0,
  );
}

function stepShotNumber(value = {}) {
  return Number(
    specification(value).shot?.number ||
    value.metadata?.shot_number ||
    0,
  );
}

function hasPilotPair(plan = {}, sceneNumber, shotNumber) {
  const steps = list(plan.steps);
  const master = steps.find(
    (step) =>
      deliverable(step) === "MASTER_STILL" &&
      stepSceneNumber(step) === Number(sceneNumber) &&
      stepShotNumber(step) === Number(shotNumber),
  );

  if (!master) return false;

  return steps.some(
    (step) =>
      deliverable(step) === "MASTER_STILL_QA" &&
      (
        step.metadata?.inspected_node_id === master.node_id ||
        step.input?.inspected_node_id === master.node_id ||
        step.requirements?.inspected_node_id === master.id ||
        list(step.depends_on).includes(master.id)
      ),
  );
}

function validateAuthorization({
  organization_id,
  creative_project_id,
  approval_candidate,
  proof_authorization,
}) {
  const candidate = object(approval_candidate);
  const authorization = object(proof_authorization);
  const story = object(candidate.story);
  const proofShot = object(authorization.proof_shot);
  const scope = object(authorization.authorization_scope);

  if (candidate.success !== true) {
    throw runtimeError("CREATIVE_APPROVAL_CANDIDATE_REQUIRED");
  }
  if (authorization.success !== true) {
    throw runtimeError("CREATIVE_PROOF_AUTHORIZATION_REQUIRED");
  }
  if (authorization.authorization_version !== AUTHORIZATION_VERSION) {
    throw runtimeError(
      "CREATIVE_PROOF_AUTHORIZATION_VERSION_INVALID",
      {
        expected: AUTHORIZATION_VERSION,
        actual: authorization.authorization_version || null,
      },
    );
  }

  for (const value of [candidate, authorization]) {
    if (
      String(value.organization_id || "") !==
      String(organization_id || "")
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_PREPARATION_ORGANIZATION_MISMATCH",
      );
    }
    if (
      String(value.creative_project_id || "") !==
      String(creative_project_id || "")
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_PREPARATION_PROJECT_MISMATCH",
      );
    }
  }

  const legacyStoryHash = jsonHash(story);
  const canonicalStoryHash = stableHash(story);
  const declaredApprovalHash = text(
    authorization.approval_candidate_hash,
  );

  if (
    declaredApprovalHash !== legacyStoryHash &&
    declaredApprovalHash !== canonicalStoryHash
  ) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PREPARATION_STORY_HASH_MISMATCH",
      {
        declared_approval_hash: declaredApprovalHash,
        legacy_story_hash: legacyStoryHash,
        canonical_story_hash: canonicalStoryHash,
      },
    );
  }
  if (
    text(authorization.canonical_story_hash) !==
    canonicalStoryHash
  ) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PREPARATION_CANONICAL_HASH_MISMATCH",
    );
  }

  const authorizationPayload = {
    version: authorization.authorization_version,
    organization_id,
    creative_project_id,
    approval_candidate_hash: declaredApprovalHash,
    approval_hash_algorithm:
      authorization.approval_hash_algorithm,
    canonical_story_hash: canonicalStoryHash,
    proof_shot_key: proofShot.key,
    scene_number: proofShot.scene_number,
    shot_number: proofShot.shot_number,
    shot_hash: proofShot.shot_hash,
    reference_asset_ids:
      normalizeIds(proofShot.reference_asset_ids),
    authorization_scope: scope,
    issued_at: authorization.issued_at,
  };
  const calculatedAuthorizationHash =
    stableHash(authorizationPayload);

  if (
    text(authorization.authorization_hash) !==
    calculatedAuthorizationHash
  ) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PREPARATION_AUTHORIZATION_HASH_MISMATCH",
      {
        declared_hash: authorization.authorization_hash || null,
        calculated_hash: calculatedAuthorizationHash,
      },
    );
  }

  const key = text(proofShot.key);
  const selected = shotMap(story).get(key);

  if (!key || !selected) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PREPARATION_SHOT_NOT_FOUND",
      { proof_shot_key: key || null },
    );
  }
  if (
    selected.scene_number !== Number(proofShot.scene_number) ||
    selected.shot_number !== Number(proofShot.shot_number)
  ) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PREPARATION_SHOT_SCOPE_MISMATCH",
    );
  }
  if (stableHash(selected.shot) !== text(proofShot.shot_hash)) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PREPARATION_SHOT_HASH_MISMATCH",
    );
  }

  const candidateReferences = normalizeIds(
    selected.shot.reference_asset_ids,
  );
  const authorizedReferences = normalizeIds(
    proofShot.reference_asset_ids,
  );

  if (!equalJson(candidateReferences, authorizedReferences)) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PREPARATION_REFERENCE_SCOPE_MISMATCH",
      {
        candidate_reference_asset_ids: candidateReferences,
        authorized_reference_asset_ids: authorizedReferences,
      },
    );
  }

  const requiredScope = {
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

  for (const [field, expected] of Object.entries(requiredScope)) {
    if (scope[field] !== expected) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_PREPARATION_SCOPE_INVALID",
        { field, expected, actual: scope[field] },
      );
    }
  }

  return {
    candidate,
    authorization,
    story,
    selected,
    key,
    references: authorizedReferences,
    canonical_story_hash: canonicalStoryHash,
    authorization_hash: calculatedAuthorizationHash,
  };
}

function buildCheckpoint({
  organization_id,
  creative_project_id,
  creative_mission_id,
  validated,
}) {
  const { shots: ignoredShots, ...scene } =
    validated.selected.scene;

  return {
    contract_version: CHECKPOINT_VERSION,
    created_at: new Date().toISOString(),
    organization_id,
    creative_mission_id,
    creative_project_id,
    scene_number: validated.selected.scene_number,
    shot_number: validated.selected.shot_number,
    source: "APPROVED_STORY_PROOF_AUTHORIZATION_V2",
    title:
      validated.story.title ||
      validated.candidate.title ||
      "Authorized Master Still Proof",
    logline: validated.story.logline || null,
    objective:
      validated.story.objective ||
      validated.candidate.objective ||
      null,
    selected_concept:
      object(validated.story.selected_concept),
    visual_motif:
      validated.story.visual_motif || null,
    scene,
    shot: {
      ...validated.selected.shot,
      scene_number: validated.selected.scene_number,
      shot_number: validated.selected.shot_number,
      assets: validated.references,
      reference_asset_ids: validated.references,
    },
    production_specification:
      validated.story.production_specification || null,
    director_metadata: {
      authorization_bound: true,
      reasoning_executed: false,
      approval_candidate_hash:
        validated.authorization.approval_candidate_hash,
      canonical_story_hash:
        validated.canonical_story_hash,
      proof_authorization_hash:
        validated.authorization_hash,
      authorized_shot_hash:
        validated.authorization.proof_shot.shot_hash,
    },
    proof_authorization: {
      authorization_version:
        validated.authorization.authorization_version,
      authorization_hash:
        validated.authorization_hash,
      approval_candidate_hash:
        validated.authorization.approval_candidate_hash,
      canonical_story_hash:
        validated.canonical_story_hash,
      proof_shot_key: validated.key,
      shot_hash:
        validated.authorization.proof_shot.shot_hash,
      reference_asset_ids: validated.references,
      authorization_scope:
        validated.authorization.authorization_scope,
      issued_at: validated.authorization.issued_at,
    },
  };
}

export const CreativeAuthorizedMasterStillPreparationRuntime = {
  async prepare({
    organization_id,
    creative_project_id,
    approval_candidate,
    proof_authorization,
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }

    const validated = validateAuthorization({
      organization_id,
      creative_project_id,
      approval_candidate,
      proof_authorization,
    });
    const project = await CreativeProjectRuntime.get(
      creative_project_id,
    );

    if (
      !project ||
      String(project.organization_id || "") !==
      String(organization_id)
    ) {
      throw runtimeError(
        "CREATIVE_PROJECT_NOT_IN_ORGANIZATION",
      );
    }
    if (!project.creative_mission_id) {
      throw runtimeError("creative_mission_id required");
    }

    const existingLock = object(
      project.metadata?.master_still_pilot_checkpoint
        ?.proof_authorization,
    );
    const existingPlans = await ExecutionRuntime.list({
      organization_id,
      creative_project_id,
    });
    const matchingPlans = list(existingPlans).filter((plan) =>
      hasPilotPair(
        plan,
        validated.selected.scene_number,
        validated.selected.shot_number,
      ),
    );

    if (
      matchingPlans.length > 0 &&
      text(existingLock.authorization_hash) !==
        validated.authorization_hash
    ) {
      throw runtimeError(
        "CREATIVE_UNBOUND_EXISTING_MASTER_STILL_PLAN",
        {
          proof_shot_key: validated.key,
          matching_plan_ids:
            matchingPlans.map((plan) => plan.id).filter(Boolean),
        },
      );
    }

    const checkpoint = buildCheckpoint({
      organization_id,
      creative_project_id,
      creative_mission_id: project.creative_mission_id,
      validated,
    });

    await CreativeProjectRuntime.update(
      creative_project_id,
      {
        metadata: {
          ...(project.metadata || {}),
          master_still_pilot_checkpoint: checkpoint,
        },
      },
    );

    const preparation =
      await CreativeMasterStillPilotPreparationRuntime.ensure({
        organization_id,
        creative_project_id,
        scene_number: validated.selected.scene_number,
        shot_number: validated.selected.shot_number,
      });

    if (preparation.reasoning_executed !== false) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_PREPARATION_REASONING_FORBIDDEN",
      );
    }
    if (
      preparation.video_nodes_persisted !== 0 ||
      preparation.video_steps_persisted !== 0 ||
      preparation.video_execution_forbidden !== true
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_PREPARATION_VIDEO_SCOPE_INVALID",
      );
    }
    if (
      Number(preparation.scene_number) !==
        validated.selected.scene_number ||
      Number(preparation.shot_number) !==
        validated.selected.shot_number
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_PREPARATION_RESULT_SCOPE_MISMATCH",
      );
    }

    return {
      success: true,
      preparation_only: true,
      preparation_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      approval_candidate_hash:
        validated.authorization.approval_candidate_hash,
      canonical_story_hash:
        validated.canonical_story_hash,
      proof_authorization_hash:
        validated.authorization_hash,
      proof_shot: {
        key: validated.key,
        scene_number: validated.selected.scene_number,
        shot_number: validated.selected.shot_number,
        title: validated.selected.shot.title || null,
        shot_hash:
          validated.authorization.proof_shot.shot_hash,
        reference_asset_ids: validated.references,
      },
      checkpoint: {
        contract_version: checkpoint.contract_version,
        source: checkpoint.source,
        authorization_bound: true,
        reasoning_executed: false,
      },
      preparation,
      authorization_scope:
        validated.authorization.authorization_scope,
      production_dispatched: false,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      next_gate: "MASTER_STILL_PROOF_GENERATION_REQUIRES_EXPLICIT_CONFIRMATION",
    };
  },
};
