import crypto from "node:crypto";

import "@/lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate";
import "@/lib/creative/identity/runtime/CreativeIdentityKeyframeExecutionGate";
import "@/lib/creative/performance/runtime/CreativeLipSyncExecutionGate";
import "@/lib/creative/production/dossier/runtime/CreativeProductionDossierExecutionGate";
import "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate";

import {
  buildProductionGraph,
} from "../planner/ProductionGraphPlanner";
import {
  buildUniversalProductionGraph,
} from "../planner/UniversalProductionGraphPlanner";
import {
  bindCreativeAssetManifest,
} from "../planner/bindCreativeAssetManifest";
import {
  buildCreativePerformanceContracts,
} from "@/lib/creative/performance/runtime/CreativePerformanceContractRuntime";
import {
  CreativePerformanceContractConvergenceRuntime,
} from "@/lib/creative/performance/runtime/CreativePerformanceContractConvergenceRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  CreativeIdentityKeyframeGraphRuntime,
} from "@/lib/creative/identity/runtime/CreativeIdentityKeyframeGraphRuntime";
import {
  CreativeLipSyncGraphRuntime,
} from "@/lib/creative/performance/runtime/CreativeLipSyncGraphRuntime";
import {
  CreativeGeneratedMediaPerceptualGraphRuntime,
} from "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualGraphRuntime";
import {
  CreativeShotAssetIsolationGraphRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationGraphRuntime";
import {
  CreativeCastClassificationRuntime,
} from "@/lib/creative/identity/runtime/CreativeCastClassificationRuntime";
import {
  createProductionGraph,
} from "../documents/ProductionGraph";
import * as Repository
from "../repositories/ProductionGraphRepository";

function workflowKind(input = {}) {
  return String(input.creative_plan?.workflow_kind || "")
    .trim()
    .toUpperCase();
}

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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function singingShot(shot = {}) {
  const contract = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  return contract.singing_visible === true ||
    contract.visible_singing === true ||
    contract.lip_sync_required === true;
}

function videoShot(shot = {}) {
  const service = text(
    shot.generation?.capability ||
    shot.generation?.service ||
    shot.capability ||
    shot.service_id,
  ).toLowerCase();
  return service.includes("video");
}

function validateConceptCouncil(plan = {}) {
  const council = object(plan.concept_council);
  if (council.contract !== "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1") {
    throw new Error("INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_REQUIRED");
  }
  if (list(council.critic_reports).length < 4) {
    throw new Error("INDEPENDENT_CREATIVE_CRITIC_REPORTS_REQUIRED");
  }
  if (list(council.scorecards).length < 3) {
    throw new Error("INDEPENDENT_CREATIVE_SCORECARDS_REQUIRED");
  }
  const selected = council.scorecards.find((scorecard) =>
    scorecard.concept_id === plan.selected_concept_id,
  );
  if (
    !selected ||
    selected.all_critics_passed !== true ||
    Number(selected.weighted_score || 0) < 76
  ) {
    throw new Error("INDEPENDENT_CREATIVE_SELECTED_CONCEPT_NOT_QUALIFIED");
  }
  if (
    plan.production?.prohibit_self_judged_concept_selection !== true ||
    plan.production?.prohibit_hybrid_concept_selection !== true
  ) {
    throw new Error("INDEPENDENT_CREATIVE_GOVERNANCE_FLAGS_REQUIRED");
  }
  if (
    text(council.council_hash) !== text(plan.production?.concept_council_hash) ||
    text(council.concept_hash) !== text(plan.production?.selected_concept_hash)
  ) {
    throw new Error("INDEPENDENT_CREATIVE_COUNCIL_HASH_MISMATCH");
  }
}

function collectUniversalCreativeFailures({
  creative_plan = {},
  shots = [],
} = {}) {
  const plan = object(creative_plan);
  const failures = [];
  const universal = list(plan.concept_candidates).length >= 3 &&
    Boolean(text(plan.selected_concept_id)) &&
    Boolean(object(plan.music_world));

  if (workflowKind({ creative_plan: plan }) === "TEMPORAL" && !universal) {
    failures.push("UNIVERSAL_CREATIVE_DOSSIER_REQUIRED_BEFORE_PRODUCTION");
  }
  if (workflowKind({ creative_plan: plan }) === "TEMPORAL") {
    try {
      validateConceptCouncil(plan);
    } catch (error) {
      failures.push(text(error?.message || error));
    }
  }

  const classifications = list(shots).map((shot) => ({
    shot,
    classification: CreativeCastClassificationRuntime.classifyShot(shot),
  }));
  const unresolved = classifications.filter((entry) =>
    entry.classification.unresolved,
  );
  if (unresolved.length) {
    failures.push(
      `UNIVERSAL_HUMAN_CAST_CLASSIFICATION_REQUIRED:${unresolved
        .map((entry) => entry.shot.id)
        .join(",")}`,
    );
  }

  const realIdentityShots = classifications
    .filter((entry) => entry.classification.real_identity)
    .map((entry) => entry.shot);
  const missingIdentity = realIdentityShots.filter((shot) =>
    !CreativeCastClassificationRuntime.identityReferenceAssetIds(shot).length,
  );
  if (missingIdentity.length) {
    failures.push(
      `UNIVERSAL_IDENTITY_REFERENCES_REQUIRED:${missingIdentity
        .map((shot) => shot.id)
        .join(",")}`,
    );
  }

  const humanVideoShots = realIdentityShots.filter(videoShot);
  const missingAtlas = humanVideoShots.filter((shot) =>
    !text(
      shot.identity_requirements?.identity_atlas_asset_node_id ||
      shot.generation?.identity_lock?.identity_atlas_asset_node_id ||
      shot.metadata?.identity_atlas_asset_node_id,
    ),
  );
  if (missingAtlas.length) {
    failures.push(
      `IDENTITY_ATLAS_REQUIRED:${missingAtlas
        .map((shot) => shot.id)
        .join(",")}`,
    );
  }

  const missingKeyframe = humanVideoShots.filter((shot) =>
    shot.keyframe_contract?.required !== true ||
    !text(shot.keyframe_contract?.identity_atlas_hash),
  );
  if (missingKeyframe.length) {
    failures.push(
      `IDENTITY_STORY_KEYFRAME_REQUIRED:${missingKeyframe
        .map((shot) => shot.id)
        .join(",")}`,
    );
  }

  const singing = list(shots).filter(singingShot);
  const invalidSinging = singing.filter((shot) => {
    const contract = object(
      shot.performance_contract || shot.metadata?.performance_contract,
    );
    return contract.singing_visible !== true ||
      contract.mouth_visible !== true ||
      contract.lip_sync_required !== true ||
      !text(contract.primary_audio_asset_id) ||
      !Number.isFinite(Number(contract.audio_start_seconds)) ||
      !Number.isFinite(Number(contract.audio_end_seconds)) ||
      Number(contract.audio_end_seconds) <= Number(contract.audio_start_seconds);
  });
  if (invalidSinging.length) {
    failures.push(
      `MUSIC_PERFORMANCE_CONTRACT_INVALID:${invalidSinging
        .map((shot) => shot.id)
        .join(",")}`,
    );
  }

  if (plan.production?.dry_run_dossier_required_before_paid_generation !== true) {
    failures.push("ZERO_COST_CREATIVE_DOSSIER_GATE_REQUIRED");
  }
  if (plan.production?.reuse_policy !== "NO_REUSE_UNLESS_EXPLICITLY_APPROVED") {
    failures.push("UNAPPROVED_ASSET_REUSE_POLICY_BLOCKED");
  }
  if (
    humanVideoShots.length &&
    plan.production?.identity_story_keyframe_required_before_video !== true
  ) {
    failures.push("IDENTITY_KEYFRAME_PRODUCTION_GATE_REQUIRED");
  }
  if (
    humanVideoShots.length &&
    plan.production?.identity_story_keyframe_human_approval_required_before_video !== true
  ) {
    failures.push("IDENTITY_KEYFRAME_HUMAN_APPROVAL_GATE_REQUIRED");
  }
  if (
    singing.length &&
    plan.production?.audio_conditioned_lip_sync_required !== true
  ) {
    failures.push("AUDIO_CONDITIONED_LIPSYNC_GATE_REQUIRED");
  }

  return [...new Set(failures.filter(Boolean))];
}

function validateUniversalCreativeContract(input = {}) {
  const failures = collectUniversalCreativeFailures(input);
  if (failures.length) {
    throw new Error(
      `CREATIVE_PRODUCTION_READINESS_FAILED:${failures.join("|")}`,
    );
  }
}

function approvalMetadata(plan = {}) {
  return {
    approval_plan_snapshot: plan,
    approval_plan_hash: hash(plan),
    concept_council_hash:
      plan.concept_council?.council_hash ||
      plan.production?.concept_council_hash ||
      null,
    selected_concept_hash:
      plan.concept_council?.concept_hash ||
      plan.production?.selected_concept_hash ||
      null,
    measured_audio_evidence_hash:
      plan.measured_audio_intelligence?.evidence_hash ||
      plan.production?.measured_audio_evidence_hash ||
      null,
    identity_atlas_hashes: list(plan.identity_atlases)
      .map((atlas) => atlas.hash || atlas.identity_atlas_hash)
      .filter(Boolean),
    production_dossier_required: true,
    production_dossier_human_approval_required: true,
    generated_media_perceptual_review_required: true,
    generated_media_rejected_before_editing: true,
    strict_shot_asset_isolation_required: true,
    project_asset_pool_exposed_to_providers: false,
    organization_asset_pool_exposed_to_providers: false,
  };
}

export const ProductionGraphRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async get(id) {
    return Repository.getById(id);
  },

  async create(input = {}) {
    return Repository.create(
      createProductionGraph(input),
    );
  },

  async update(id, values = {}) {
    return Repository.update(
      id,
      values,
    );
  },

  async plan(input = {}) {
    const kind = workflowKind(input);

    if (kind && kind !== "TEMPORAL") {
      return buildUniversalProductionGraph(input);
    }

    const assets = await CreativeAssetsRuntime.list({
      organization_id: input.organization_id,
      creative_project_id: input.creative_project_id,
    });

    const classifiedPlan = CreativeCastClassificationRuntime.normalizePlan(
      object(input.creative_plan),
    );
    const classifiedShots = list(input.shots).map(
      CreativeCastClassificationRuntime.normalizeSyntheticShot,
    );
    const bound = bindCreativeAssetManifest({
      scenes: input.scenes,
      shots: classifiedShots,
      creative_plan: classifiedPlan,
    });

    const enrichedPerformance = buildCreativePerformanceContracts({
      ...bound,
      assets,
    });
    const performanceBound = CreativePerformanceContractConvergenceRuntime.apply({
      performance_bound: enrichedPerformance,
      source_shots: classifiedShots,
      source_plan: classifiedPlan,
    });

    validateUniversalCreativeContract({
      creative_plan: performanceBound.creative_plan,
      shots: performanceBound.shots,
    });

    const baseGraph = buildProductionGraph({
      ...input,
      ...performanceBound,
    });

    const keyframeGraph = CreativeIdentityKeyframeGraphRuntime.apply({
      graph: baseGraph,
      shots: performanceBound.shots,
    });

    const lipSyncGraph = CreativeLipSyncGraphRuntime.apply({
      graph: keyframeGraph,
      shots: performanceBound.shots,
    });

    const perceptualGraph = CreativeGeneratedMediaPerceptualGraphRuntime.apply({
      graph: lipSyncGraph,
      shots: performanceBound.shots,
    });

    const finalGraph = CreativeShotAssetIsolationGraphRuntime.apply({
      graph: perceptualGraph,
      project_assets: assets,
    });
    finalGraph.metadata = {
      ...object(finalGraph.metadata),
      ...approvalMetadata(performanceBound.creative_plan),
      cast_classification_contract: "CREATIVE_CAST_CLASSIFICATION_V1",
      performance_contract_convergence:
        "CREATIVE_PERFORMANCE_CONTRACT_CONVERGENCE_V1",
      zero_cost_readiness_validation_contract:
        "CREATIVE_PRODUCTION_READINESS_AGGREGATE_V1",
    };
    finalGraph.cost_plan = {
      ...object(finalGraph.cost_plan),
      approval_required: true,
      approved: false,
    };
    finalGraph.status = "PLANNED";

    return Repository.create(finalGraph);
  },
};

export const CreativeProductionReadinessValidationRuntime = {
  collectUniversalCreativeFailures,
  validateUniversalCreativeContract,
};
