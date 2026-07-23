const ROUTES = Object.freeze({
  STRUCTURAL_REPLAN: "STRUCTURAL_REPLAN",
  TEMPORAL_REFERENCE_RECOVERY: "TEMPORAL_REFERENCE_RECOVERY",
  TEMPORAL_CONVERGENCE: "TEMPORAL_CONVERGENCE",
  TARGETED_STORYBOARD_REPAIR: "TARGETED_STORYBOARD_REPAIR",
  FINAL_EVIDENCE_REPAIR: "FINAL_EVIDENCE_REPAIR",
  RETRY_FAILED_STEP: "RETRY_FAILED_STEP",
  HUMAN_REVIEW: "HUMAN_REVIEW",
});

const STRUCTURAL_CODES = new Set([
  "CREATIVE_PRODUCTION_SPECIFICATION_PLAN_MISMATCH",
  "CREATIVE_FINAL_STORYBOARD_STRUCTURAL_REPLAN_REQUIRED",
  "CREATIVE_DIRECTOR_SCENES_REQUIRED",
  "CREATIVE_DIRECTOR_SCENE_SHOTS_REQUIRED",
  "CREATIVE_DIRECTOR_SHOT_DURATION_REQUIRED",
  "CREATIVE_DIRECTOR_DURATION_REQUIRED",
  "CREATIVE_DIRECTOR_JOB_PLAN_SCENES_REQUIRED",
  "CREATIVE_DIRECTOR_JOB_PLAN_SHOTS_REQUIRED",
]);

const TEMPORAL_REFERENCE_CODES = new Set([
  "CREATIVE_TEMPORAL_MASTER_STILL_REFERENCE_SET_INVALID",
  "CREATIVE_DIRECTOR_JOB_UNKNOWN_REFERENCE_ASSET",
  "CREATIVE_DIRECTOR_UNKNOWN_REFERENCE_ASSET",
]);

const TEMPORAL_CODES = new Set([
  "CREATIVE_TEMPORAL_DEPARTMENT_REJECTED",
  "CREATIVE_TEMPORAL_GOVERNANCE_REJECTED",
  "CREATIVE_TEMPORAL_GRANULAR_SHOT_REJECTED",
  "CREATIVE_TEMPORAL_DIRECTOR_SHOT_PATCH_MISSING",
  "CREATIVE_TEMPORAL_DIRECTOR_PATCH_ADDRESS_INVALID",
]);

const STORYBOARD_CODES = new Set([
  "CREATIVE_DIRECTOR_REPAIR_CANDIDATE_REJECTED",
  "CREATIVE_DIRECTOR_REPAIR_DID_NOT_IMPROVE",
  "CREATIVE_DIRECTOR_FINAL_AUDIT_REJECTED",
]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function codeFrom(value = {}) {
  const source = object(value);
  return String(
    source.code ||
    source.error ||
    source.message ||
    "",
  ).trim().toUpperCase();
}

function failureStrings(value = {}) {
  const source = object(value);
  const details = object(source.details);
  return list(
    details.failures ||
    source.failures,
  ).map((failure) => String(failure).toUpperCase());
}

function containsStructuralFailure(value = {}) {
  const failures = failureStrings(value);
  return failures.some((failure) =>
    failure.includes("DURATION") ||
    failure.includes("SHOT_COUNT") ||
    failure.includes("SCENES_REQUIRED") ||
    failure.includes("SHOTS_REQUIRED") ||
    failure.includes("STRUCTURE") ||
    failure.includes("REQUIRED_REFERENCE"),
  );
}

export function classifyCreativeFailure({
  failure = {},
  step_key = null,
  attempt = 0,
} = {}) {
  const code = codeFrom(failure);
  const stepKey = String(step_key || "");

  if (
    STRUCTURAL_CODES.has(code) ||
    containsStructuralFailure(failure)
  ) {
    return {
      route: ROUTES.STRUCTURAL_REPLAN,
      defect_class: "STRUCTURE_AND_DURATION",
      code,
      retryable: Number(attempt) < 2,
    };
  }

  if (TEMPORAL_REFERENCE_CODES.has(code)) {
    return {
      route: ROUTES.TEMPORAL_REFERENCE_RECOVERY,
      defect_class: "REFERENCE_BINDING",
      code,
      retryable: true,
    };
  }

  if (
    TEMPORAL_CODES.has(code) ||
    stepKey === "temporal_shot_direction"
  ) {
    return {
      route: ROUTES.TEMPORAL_CONVERGENCE,
      defect_class: "TEMPORAL_CONTRACT",
      code,
      retryable: Number(attempt) < 6,
    };
  }

  if (stepKey === "targeted_repair_1") {
    return {
      route: ROUTES.TARGETED_STORYBOARD_REPAIR,
      defect_class: "STORYBOARD_QUALITY",
      code,
      retryable: Number(attempt) < 2,
    };
  }

  if (stepKey === "targeted_repair_2") {
    return {
      route: ROUTES.FINAL_EVIDENCE_REPAIR,
      defect_class: "FINAL_EVIDENCE",
      code,
      retryable: Number(attempt) < 2,
    };
  }

  if (STORYBOARD_CODES.has(code)) {
    return {
      route: ROUTES.TARGETED_STORYBOARD_REPAIR,
      defect_class: "STORYBOARD_QUALITY",
      code,
      retryable: Number(attempt) < 2,
    };
  }

  if (!code) {
    return {
      route: ROUTES.RETRY_FAILED_STEP,
      defect_class: "UNKNOWN_TRANSIENT",
      code,
      retryable: Number(attempt) < 1,
    };
  }

  return {
    route: ROUTES.HUMAN_REVIEW,
    defect_class: "UNSUPPORTED_FAILURE",
    code,
    retryable: false,
  };
}

export function classifyCreativeJobFailure(job = {}) {
  const step = list(job.steps).find((candidate) =>
    candidate?.step_key === job.current_step_key,
  ) || list(job.steps).find((candidate) =>
    candidate?.status === "FAILED",
  ) || null;

  const failure = step?.error || job.error || {};
  return classifyCreativeFailure({
    failure,
    step_key: step?.step_key || job.current_step_key,
    attempt: step?.attempt || 0,
  });
}

export const CreativeFailureRouter = Object.freeze({
  routes: ROUTES,
  classify: classifyCreativeFailure,
  classifyJob: classifyCreativeJobFailure,
});
