import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-review-settlement.v1",
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
    ].includes(key)) ||
    (
      Object.prototype.hasOwnProperty.call(candidate, "passed") &&
      keys.some((key) => /score|mouth_visible|audio_conditioned/.test(key))
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

function identityReviewPassed(task = {}) {
  const evidence = nestedEvidence(task.output);
  const identityScore = finite(evidence.identity_score ?? evidence.identityScore);
  const storyScore = finite(evidence.story_score ?? evidence.storyScore);
  const totalScore = finite(
    evidence.total_score ?? evidence.totalScore ?? evidence.score,
  );
  const minimumIdentity = finite(task.metadata?.minimum_identity_score) ?? 90;
  const minimumStory = finite(task.metadata?.minimum_story_score) ?? 85;
  const minimumTotal = finite(task.metadata?.minimum_total_score) ?? 88;

  return evidence.passed === true &&
    identityScore !== null && identityScore >= minimumIdentity &&
    storyScore !== null && storyScore >= minimumStory &&
    totalScore !== null && totalScore >= minimumTotal &&
    evidence.person_count_correct !== false &&
    evidence.requested_angle_correct !== false &&
    evidence.background_is_new_story_environment !== false;
}

function lipSyncReviewPassed(task = {}) {
  const evidence = nestedEvidence(task.output);
  const sync = finite(evidence.sync_score ?? evidence.syncScore);
  const identity = finite(evidence.identity_score ?? evidence.identityScore);
  const performance = finite(
    evidence.performance_score ?? evidence.performanceScore,
  );
  const minimumSync = Number(task.input?.minimum_sync_score || 88);
  const minimumIdentity = Number(task.input?.minimum_identity_score || 90);
  const minimumPerformance = Number(
    task.input?.minimum_performance_score || 82,
  );

  return evidence.passed === true &&
    sync !== null && sync >= minimumSync &&
    identity !== null && identity >= minimumIdentity &&
    performance !== null && performance >= minimumPerformance &&
    evidence.mouth_visible !== false &&
    evidence.audio_conditioned !== false;
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
  if (!policy.passed(candidate)) {
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
  };
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const completeWithoutReviewSettlement = ProductionTaskRuntime.complete.bind(
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

    const completed = await completeWithoutReviewSettlement(id, {
      ...object(output),
      validation_evidence: reviewSettlement.evidence,
      automated_review_contract: reviewSettlement.contract,
    });

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
        [reviewSettlement.policy.metadata_flag]: true,
        automated_review_contract: reviewSettlement.contract,
        automated_review_evidence_present: true,
        downstream_blocked_until_human_approval: true,
      },
      error: null,
    });
  };
}

install();

export const CreativeProductionTaskReviewSettlementGate = {
  installed: true,
  nestedEvidence,
  identityReviewPassed,
  lipSyncReviewPassed,
};
