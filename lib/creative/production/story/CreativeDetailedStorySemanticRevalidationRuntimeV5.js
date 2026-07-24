import {
  CreativeDetailedStorySemanticRevalidationRuntimeV4,
} from "@/lib/creative/production/story/CreativeDetailedStorySemanticRevalidationRuntimeV4";

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_SEMANTIC_REVALIDATION_V5_FINAL_EVIDENCE";

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

function isConstraintEvidence(value) {
  const source = text(value).toLowerCase();

  return [
    /\bavoid(?:ing|ed)?\b/,
    /\bstrict avoidance\b/,
    /\bprohibition(?:s)?\b/,
    /\bprohibit(?:ed|ing)?\b/,
    /\bforbid(?:den)?\b/,
    /\bmust not\b/,
    /\bdo not\b/,
    /\bnever\b/,
    /\bwithout\b/,
    /\bno\s+(?:synchronized|coordinated|uniform|identical|forced|staged)\b/,
    /\bexclude(?:s|d|ing)?\b/,
    /\beliminat(?:e|ed|ing)\b/,
    /\bprevent(?:s|ed|ing)?\b/,
    /\bunsynchronized\b/,
    /\bnon[- ]synchronized\b/,
    /\bnot synchronized\b/,
    /\basymmetr(?:y|ic|ically)\b/,
    /\bvaried gaze\b/,
    /\bunique micro[- ]behaviors?\b/,
  ].some((pattern) => pattern.test(source));
}

function normalizeCoordinationFailure(failure = {}) {
  if (failure.code !== "OVER_COORDINATED_PERFORMANCE_DIRECTION") {
    return failure;
  }

  const evidence = list(failure.evidence).filter(
    (sentence) => !isConstraintEvidence(sentence),
  );

  if (!evidence.length) return null;

  return {
    ...failure,
    evidence,
  };
}

function normalizeShot(shot = {}) {
  const failures = list(shot.failures)
    .map(normalizeCoordinationFailure)
    .filter(Boolean);
  const validationEvidence = object(shot.validation_evidence);
  const coordinationEvidence = list(
    validationEvidence.over_coordinated_performance,
  ).filter((sentence) => !isConstraintEvidence(sentence));

  return {
    ...shot,
    passed: failures.length === 0,
    failures,
    validation_evidence: {
      ...validationEvidence,
      over_coordinated_performance: coordinationEvidence,
    },
  };
}

export const CreativeDetailedStorySemanticRevalidationRuntimeV5 = {
  async run(args = {}) {
    const previous =
      await CreativeDetailedStorySemanticRevalidationRuntimeV4.run(args);
    const previousReview = object(previous.revalidation);
    const shots = list(previousReview.shots).map(normalizeShot);
    const failedShots = shots.filter((shot) => !shot.passed);
    const shotFailures = failedShots.map((shot) => ({
      scene_number: shot.scene_number,
      shot_number: shot.shot_number,
      title: shot.title,
      failures: shot.failures,
    }));
    const structuralFailures = list(previousReview.failures).filter(
      (failure) => !failure.scene_number,
    );
    const failures = [
      ...shotFailures,
      ...structuralFailures,
    ];
    const passed = failures.length === 0;

    return {
      ...previous,
      success: passed,
      dynamic_contract: true,
      contextual_validation: true,
      evidence_validation: true,
      final_evidence_validation: true,
      revalidation_version: RUNTIME_VERSION,
      revalidation: {
        ...previousReview,
        passed,
        dynamic_contract: true,
        contextual_validation: true,
        evidence_validation: true,
        final_evidence_validation: true,
        passed_shot_count:
          shots.length - failedShots.length,
        failed_shot_count: failedShots.length,
        failed_shot_keys: failedShots.map((shot) => shot.key),
        shots,
        failures,
      },
      next_gate: passed
        ? "DETAILED_STORY_SEMANTIC_REVIEW_REQUIRED"
        : "DETAILED_STORY_TARGETED_REPAIR_REQUIRED",
    };
  },
};
