import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { CREATIVE_ASSET_NODE_TYPES } from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import { CreativeFinalisationRouter } from "@/lib/creative/finalisation/runtime/CreativeFinalisationRouter";
import { CreativeShotCandidateReviewRuntime } from "./CreativeShotCandidateReviewRuntime";
import { CreativeShotCandidateSelectionRuntime } from "./CreativeShotCandidateSelectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.shot-candidate-quality-gate.v1",
);
const CONTRACT = "CREATIVE_SHOT_CANDIDATE_QUALITY_GATE_V1";
const CANONICAL_REVIEW_SOURCE = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";

let videoTechnicalQualityRuntimePromise = null;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function integer(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

async function loadVideoTechnicalQualityRuntime() {
  if (!videoTechnicalQualityRuntimePromise) {
    videoTechnicalQualityRuntimePromise = import(
      "./CreativeVideoTechnicalQualityRuntime"
    ).then((module) => {
      const runtime = module?.CreativeVideoTechnicalQualityRuntime;
      if (!runtime || typeof runtime.assess !== "function") {
        throw new Error("CREATIVE_VIDEO_TECHNICAL_QUALITY_RUNTIME_INVALID");
      }
      return runtime;
    });
  }
  return videoTechnicalQualityRuntimePromise;
}

function configuredPolicy(project = {}) {
  const qualityGate = object(project.metadata?.quality_gate);
  return object(
    qualityGate.shot_candidate_review ||
    qualityGate.shotCandidateReview ||
    project.metadata?.shot_candidate_review ||
    project.metadata?.shotCandidateReview,
  );
}

function technicalPolicy(project = {}) {
  const qualityGate = object(project.metadata?.quality_gate);
  return object(
    qualityGate.video_technical_review ||
    qualityGate.videoTechnicalReview ||
    project.metadata?.video_technical_review ||
    project.metadata?.videoTechnicalReview,
  );
}

function candidate(node = {}) {
  return node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
    Boolean(text(node.metadata?.shot_id)) &&
    Boolean(text(node.production_task_id || node.metadata?.production_task_id));
}

function canonicalPerceptualReview(node = {}) {
  return text(node.metadata?.shot_candidate_review_source) ===
    CANONICAL_REVIEW_SOURCE &&
    Boolean(text(node.metadata?.shot_candidate_review_report_id));
}

async function evaluate(input = {}) {
  const { organization_id, creative_project_id } = input;
  if (!organization_id || !creative_project_id) {
    throw new Error("SHOT_CANDIDATE_QUALITY_GATE_SCOPE_REQUIRED");
  }

  const project = await CreativeProjectRepository.getById(creative_project_id);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("Creative project not found");
  }
  const policy = configuredPolicy(project);
  const resolvedTechnicalPolicy = technicalPolicy(project);
  const nodes = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });
  const videos = nodes.filter(candidate);
  if (!videos.length) {
    return {
      contract: CONTRACT,
      enabled: false,
      status: "NO_VIDEO_CANDIDATES",
      passed: true,
      provider_calls_executed: 0,
      technical_checks_executed: 0,
    };
  }

  const CreativeVideoTechnicalQualityRuntime =
    await loadVideoTechnicalQualityRuntime();
  const technicalResults = [];
  for (const video of videos) {
    technicalResults.push(await CreativeVideoTechnicalQualityRuntime.assess({
      organization_id,
      asset_node_id: video.id,
      policy: resolvedTechnicalPolicy,
    }));
  }
  const technicalFailures = technicalResults.filter((result) => !result.passed);
  if (technicalFailures.length) {
    return {
      contract: CONTRACT,
      enabled: true,
      mode: "DETERMINISTIC_TECHNICAL_GATE",
      status: "BLOCKED",
      passed: false,
      provider_calls_executed: 0,
      technical_checks_executed: technicalResults.length,
      technical_results: technicalResults,
      blockers: technicalFailures.map((result) =>
        `SHOT_${result.shot_id || result.asset_node_id}:TECHNICAL_${result.failed_checks.join("+")}`,
      ),
    };
  }

  const refreshedAfterTechnical = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });
  const technicallyQualifiedVideos = refreshedAfterTechnical.filter(candidate);
  const canonicalReviewed = technicallyQualifiedVideos.filter(canonicalPerceptualReview);
  const canonicalMode = canonicalReviewed.length > 0;
  const fallbackEnabled = policy.enabled === true;

  if (!canonicalMode && !fallbackEnabled) {
    return {
      contract: CONTRACT,
      enabled: true,
      mode: "REVIEW_REQUIRED",
      status: "BLOCKED",
      passed: false,
      provider_calls_executed: 0,
      technical_checks_executed: technicalResults.length,
      technical_results: technicalResults,
      blockers: ["PERCEPTUAL_VIDEO_REVIEW_REQUIRED_BEFORE_FINALISATION"],
      reason: "GENERATED_VIDEO_CANDIDATES_MUST_NOT_FINALISE_WITHOUT_PERCEPTUAL_REVIEW",
    };
  }

  if (
    fallbackEnabled &&
    (!text(policy.model) || Number(policy.maximum_review_customer_price || 0) <= 0)
  ) {
    return {
      contract: CONTRACT,
      enabled: true,
      status: "BLOCKED",
      passed: false,
      provider_calls_executed: 0,
      technical_checks_executed: technicalResults.length,
      technical_results: technicalResults,
      blockers: ["SHOT_CANDIDATE_FALLBACK_REVIEW_POLICY_INCOMPLETE"],
    };
  }

  const maximumReviews = Math.max(1, Math.min(10, integer(
    policy.maximum_reviews_per_finalisation ??
    policy.maximumReviewsPerFinalisation,
    3,
  )));
  const reviewResults = [];
  let reviewCalls = 0;

  if (fallbackEnabled) {
    for (const video of technicallyQualifiedVideos) {
      if (video.metadata?.shot_candidate_review_report_id) continue;
      if (reviewCalls >= maximumReviews) break;
      const reviewed = await CreativeShotCandidateReviewRuntime.analyze({
        organization_id,
        asset_node_id: video.id,
        policy,
      });
      reviewResults.push(reviewed);
      if (reviewed.reused !== true) reviewCalls += 1;
    }
  }

  const refreshed = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });
  const reviewedVideos = refreshed.filter(candidate);
  const shotIds = [...new Set(reviewedVideos.map((node) =>
    text(node.metadata?.shot_id),
  ).filter(Boolean))];
  const selections = [];
  for (const shotId of shotIds) {
    selections.push(await CreativeShotCandidateSelectionRuntime.select({
      organization_id,
      creative_project_id,
      shot_id: shotId,
    }));
  }

  const unreviewed = reviewedVideos.filter((node) =>
    !node.metadata?.shot_candidate_review_report_id,
  );
  const blockedSelections = selections.filter((selection) =>
    selection.status !== "SELECTED",
  );
  const blockers = [
    ...(unreviewed.length
      ? [canonicalMode && !fallbackEnabled
          ? "CANONICAL_PERCEPTUAL_REVIEW_REQUIRED_FOR_ALL_VIDEO_CANDIDATES"
          : "SHOT_CANDIDATES_AWAIT_REVIEW"]
      : []),
    ...blockedSelections.map((selection) =>
      `SHOT_${selection.shot_id}:${selection.reason || "NO_WORLD_CLASS_CANDIDATE"}`,
    ),
  ];

  return {
    contract: CONTRACT,
    enabled: true,
    mode: canonicalMode
      ? "CANONICAL_PERCEPTUAL_EVIDENCE"
      : "FALLBACK_SHOT_CANDIDATE_REVIEW",
    status: blockers.length ? "BLOCKED" : "PASS",
    passed: blockers.length === 0,
    world_class_floor: CreativeShotCandidateSelectionRuntime.world_class_floor,
    candidate_count: reviewedVideos.length,
    canonical_reviewed_candidate_count: canonicalReviewed.length,
    shot_count: shotIds.length,
    provider_calls_executed: reviewCalls,
    technical_checks_executed: technicalResults.length,
    technical_results: technicalResults,
    duplicate_review_provider_calls_avoided:
      canonicalMode ? canonicalReviewed.length : 0,
    review_results: reviewResults.map((result) => ({
      candidate_asset_node_id: result.candidate_asset_node_id,
      report_id: result.report?.id || null,
      passed: result.evaluation?.passed ?? result.report?.metadata?.passed ?? null,
      score: result.evaluation?.overall_score ?? result.report?.metadata?.overall_score ?? null,
      weakest_score:
        result.evaluation?.weakest_score ?? result.report?.metadata?.weakest_score ?? null,
      reused: result.reused === true,
    })),
    selections,
    unreviewed_candidate_ids: unreviewed.map((node) => node.id),
    blockers,
  };
}

function install() {
  if (CreativeFinalisationRouter[INSTALL_FLAG]) return;
  const runWithoutShotGate = CreativeFinalisationRouter.run.bind(
    CreativeFinalisationRouter,
  );
  Object.defineProperty(CreativeFinalisationRouter, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeFinalisationRouter.run = async function runWithShotCandidateGate(input = {}) {
    const gate = await evaluate(input);
    if (!gate.passed) {
      return {
        success: false,
        passed: false,
        status: "SHOT_CANDIDATE_QUALITY_BLOCKED",
        shot_candidate_quality_gate: gate,
      };
    }
    const finalisation = await runWithoutShotGate(input);
    return {
      ...finalisation,
      shot_candidate_quality_gate: gate,
    };
  };
}

install();

export const CreativeShotCandidateQualityGateBootstrap = Object.freeze({
  contract: CONTRACT,
  installed: true,
  evaluate,
});
