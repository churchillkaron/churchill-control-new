import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-review-settlement.v4",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nestedEvidence(value, seen = new Set(), depth = 0) {
  if (!value || typeof value !== "object" || seen.has(value) || depth > 10) {
    return {};
  }
  seen.add(value);

  const candidate = object(value);
  const keys = Object.keys(candidate);
  if (
    keys.some((key) => [
      "identity_score",
      "identityScore",
      "story_score",
      "storyScore",
      "total_score",
      "totalScore",
      "sync_score",
      "syncScore",
      "performance_score",
      "performanceScore",
      "anatomy_score",
      "anatomyScore",
      "temporal_identity_consistency_score",
      "temporalIdentityConsistencyScore",
      "automated_validation_available",
    ].includes(key)) ||
    (
      Object.prototype.hasOwnProperty.call(candidate, "passed") &&
      keys.some((key) => /score|mouth_visible|audio_conditioned|human_review|anatomy|limb|hand|identity|body_proportion/.test(key))
    )
  ) {
    return candidate;
  }

  for (const key of [
    "validation_evidence",
    "validation",
    "review",
    "result",
    "output",
    "data",
    "raw",
    "provider_poll",
    "provider_submission",
  ]) {
    const evidence = nestedEvidence(candidate[key], seen, depth + 1);
    if (Object.keys(evidence).length) return evidence;
  }

  for (const child of Object.values(candidate)) {
    const evidence = nestedEvidence(child, seen, depth + 1);
    if (Object.keys(evidence).length) return evidence;
  }

  return {};
}

function threshold(task = {}, key, fallback) {
  const value =
    task.input?.[key] ??
    task.input?.requirements?.[key] ??
    task.input?.validation?.[key] ??
    task.metadata?.[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalScorePass(value, minimum) {
  const score = finite(value);
  return score === null || score >= minimum;
}

function humanContinuityReviewPassed(task = {}, evidenceInput = null) {
  const evidence = evidenceInput || nestedEvidence(task.output);
  const minimumAnatomy = threshold(task, "minimum_anatomy_score", 88);
  const minimumTemporalIdentity = threshold(
    task,
    "minimum_temporal_identity_consistency_score",
    88,
  );

  const anatomyScore = evidence.anatomy_score ?? evidence.anatomyScore;
  const temporalIdentity =
    evidence.temporal_identity_consistency_score ??
    evidence.temporalIdentityConsistencyScore;

  return optionalScorePass(anatomyScore, minimumAnatomy) &&
    optionalScorePass(temporalIdentity, minimumTemporalIdentity) &&
    evidence.anatomy_valid !== false &&
    evidence.human_anatomy_valid !== false &&
    evidence.face_geometry_preserved !== false &&
    evidence.body_proportions_preserved !== false &&
    evidence.limb_topology_valid !== false &&
    evidence.hand_integrity_valid !== false &&
    evidence.natural_pose !== false &&
    evidence.identity_consistent_across_frames !== false &&
    evidence.extra_limbs_detected !== true &&
    evidence.missing_limbs_detected !== true &&
    evidence.malformed_hands_detected !== true &&
    evidence.duplicate_subject_detected !== true &&
    evidence.face_identity_drift_detected !== true &&
    evidence.body_identity_drift_detected !== true;
}

function identityReviewPassed(task = {}) {
  const evidence = nestedEvidence(task.output);
  const identityScore = finite(evidence.identity_score ?? evidence.identityScore);
  const storyScore = finite(evidence.story_score ?? evidence.storyScore);
  const totalScore = finite(
    evidence.total_score ?? evidence.totalScore ?? evidence.score,
  );
  const minimumIdentity = threshold(task, "minimum_identity_score", 90);
  const minimumStory = threshold(task, "minimum_story_score", 85);
  const minimumTotal = threshold(task, "minimum_total_score", 88);

  return evidence.passed === true &&
    identityScore !== null && identityScore >= minimumIdentity &&
    storyScore !== null && storyScore >= minimumStory &&
    totalScore !== null && totalScore >= minimumTotal &&
    evidence.person_count_correct !== false &&
    evidence.requested_angle_correct !== false &&
    evidence.background_is_new_story_environment !== false &&
    humanContinuityReviewPassed(task, evidence);
}

function lipSyncReviewPassed(task = {}) {
  const evidence = nestedEvidence(task.output);
  const sync = finite(evidence.sync_score ?? evidence.syncScore);
  const identity = finite(evidence.identity_score ?? evidence.identityScore);
  const performance = finite(
    evidence.performance_score ?? evidence.performanceScore,
  );
  const minimumSync = threshold(task, "minimum_sync_score", 88);
  const minimumIdentity = threshold(task, "minimum_identity_score", 90);
  const minimumPerformance = threshold(
    task,
    "minimum_performance_score",
    82,
  );

  return evidence.passed === true &&
    sync !== null && sync >= minimumSync &&
    identity !== null && identity >= minimumIdentity &&
    performance !== null && performance >= minimumPerformance &&
    evidence.mouth_visible !== false &&
    evidence.audio_conditioned !== false &&
    evidence.identity_preserved !== false &&
    evidence.natural_face_motion !== false &&
    humanContinuityReviewPassed(task, evidence);
}

function trustedAutomationUnavailable(task = {}) {
  const evidence = nestedEvidence(task.output);
  return text(task.metadata?.contract) === "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V2" &&
    evidence.automated_validation_available === false &&
    evidence.human_review_required === true;
}

const REVIEW_POLICIES = Object.freeze({
  IDENTITY_KEYFRAME_REVIEW_V1: {
    failure: "IDENTITY_KEYFRAME_REVIEW_FAILED",
    passed: identityReviewPassed,
    metadata_flag: "automated_identity_keyframe_validation_passed",
  },
  AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V1: {
    failure: "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_FAILED",
    passed: lipSyncReviewPassed,
    metadata_flag: "automated_lipsync_validation_passed",
  },
  AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V2: {
    failure: "AUDIO_CONDITIONED_VOCAL_PERFORMANCE_VALIDATION_FAILED",
    passed: lipSyncReviewPassed,
    metadata_flag: "automated_vocal_performance_validation_passed",
    allow_human_only_when_trusted_automation_unavailable: true,
  },
});

function candidateTask(task = {}, output = {}) {
  return {
    ...task,
    output: {
      ...object(task.output),
      ...object(output),
    },
  };
}

function normalizedReviewOutput(output = {}, evidence = {}, contract = "") {
  const providerReviewOutput = output?.output ?? null;
  return {
    ...object(output),
    provider_review_output: providerReviewOutput,
    output: {
      ...object(providerReviewOutput),
      result: evidence,
      validation: evidence,
    },
    validation_evidence: evidence,
    automated_review_contract: contract,
  };
}

function alreadyHumanApproved(task = {}) {
  return task.status === "COMPLETED" &&
    task.review?.approved === true &&
    task.metadata?.human_review_approved === true;
}

async function settleForReview(task = {}, output = {}) {
  const contract = text(task.metadata?.contract);
  const policy = REVIEW_POLICIES[contract];
  if (!policy) return null;
  if (alreadyHumanApproved(task)) return task;

  const candidate = candidateTask(task, output);
  const evidence = nestedEvidence(candidate.output);
  const humanOnly =
    policy.allow_human_only_when_trusted_automation_unavailable === true &&
    trustedAutomationUnavailable(candidate);

  if (!humanOnly && !policy.passed(candidate)) {
    return ProductionTaskRuntime.fail(
      task.id,
      new Error(policy.failure),
      {
        validation_evidence: evidence,
        automated_review_contract: contract,
      },
    );
  }

  return {
    contract,
    policy,
    candidate,
    evidence,
    human_only: humanOnly,
  };
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const completeWithoutReviewSettlement = ProductionTaskRuntime.complete.bind(
    ProductionTaskRuntime,
  );
  const dispatchWithoutReviewSettlement = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.complete = async function completeWithMandatoryReview(
    id,
    output = {},
  ) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    if (alreadyHumanApproved(task)) return task;

    const reviewSettlement = await settleForReview(task, output);
    if (!reviewSettlement) {
      return completeWithoutReviewSettlement(id, output);
    }
    if (reviewSettlement.id && reviewSettlement.status === "FAILED") {
      return reviewSettlement;
    }

    const completed = await completeWithoutReviewSettlement(
      id,
      normalizedReviewOutput(
        output,
        reviewSettlement.evidence,
        reviewSettlement.contract,
      ),
    );

    return ProductionTaskRuntime.update(id, {
      status: "REVIEW",
      review: {
        ...object(completed.review),
        required: true,
        approved: false,
        approved_by: null,
      },
      metadata: {
        ...object(completed.metadata),
        ...(reviewSettlement.human_only
          ? {
              trusted_automated_validation_unavailable: true,
              human_only_validation_required: true,
            }
          : {
              [reviewSettlement.policy.metadata_flag]: true,
              automated_review_evidence_present: true,
            }),
        automated_review_contract: reviewSettlement.contract,
        downstream_blocked_until_human_approval: true,
      },
      error: null,
    });
  };

  ProductionTaskRuntime.dispatch = async function dispatchWithReviewHold(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const contract = text(task.metadata?.contract);
    if (
      REVIEW_POLICIES[contract] &&
      (task.status === "REVIEW" || alreadyHumanApproved(task))
    ) {
      return task;
    }
    return dispatchWithoutReviewSettlement(id);
  };
}

install();

export const CreativeProductionTaskReviewSettlementGate = {
  installed: true,
  nestedEvidence,
  identityReviewPassed,
  lipSyncReviewPassed,
  humanContinuityReviewPassed,
  trustedAutomationUnavailable,
};
