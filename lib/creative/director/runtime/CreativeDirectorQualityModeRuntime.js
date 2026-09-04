import {
  CreativeSemanticQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeSemanticQualityRuntime";

export const CREATIVE_DIRECTOR_QUALITY_MODE_CONTRACT =
  "AVANTIQO_CREATIVE_DIRECTOR_QUALITY_MODE_V1";

const DETERMINISTIC_TARGETS = Object.freeze({
  SHOT_SCOPE_FIDELITY: "shot_scope_fidelity",
  PRESERVED_SHOT_IMMUTABILITY: "preserved_shot_immutability",
  PROFESSIONAL_LOCK_COMPLIANCE: "professional_lock_compliance",
  STALE_PLAN_FRESHNESS: "stale_plan_freshness",
});

const SEMANTIC_TARGET_CHECKS = Object.freeze({
  SHOT_TO_SHOT_CONTINUITY: [
    "identity_continuity",
    "product_continuity",
    "production_design_coherence",
    "environmental_coherence",
  ],
  IDENTITY_CONSISTENCY: ["identity_continuity"],
  PRODUCT_FIDELITY: ["product_continuity"],
  REFERENCE_ASSET_FIDELITY: [
    "identity_continuity",
    "product_continuity",
    "production_design_coherence",
    "environmental_coherence",
  ],
  AUDIOVISUAL_CONTINUITY: [
    "lip_synchronisation",
    "music_and_sound_design",
    "mix_hierarchy_and_silence",
  ],
  CINEMATIC_DIRECTION_FIDELITY: [
    "camera_plausibility",
    "motion_cadence",
    "shot_purpose",
  ],
  PERFORMANCE_DIRECTION_FIDELITY: [
    "performance_authenticity",
    "lip_synchronisation",
  ],
  EDIT_RELATIONSHIP_FIDELITY: [
    "pacing_and_transitions",
    "narrative_progression",
  ],
  SEQUENCE_COHERENCE: [
    "narrative_progression",
    "pacing_and_transitions",
    "emotional_arc",
  ],
});

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value, limit = 800) {
  return String(value ?? "").trim().slice(0, limit);
}

function shotIds(shots = []) {
  return [...new Set(list(shots).map((shot) =>
    text(shot?.shot_id || shot?.id, 180),
  ).filter(Boolean))];
}

function normalizeGovernanceEvidence(value = {}) {
  const source = object(value);
  return Object.fromEntries(
    Object.values(DETERMINISTIC_TARGETS).map((key) => [key, source[key] === true]),
  );
}

function requiredSemanticChecks(targets = []) {
  return [...new Set(list(targets).flatMap((target) =>
    SEMANTIC_TARGET_CHECKS[text(target, 120).toUpperCase()] || [],
  ))];
}

function checkById(evaluation = {}) {
  return new Map(list(evaluation.checks).map((check) => [check.id, check]));
}

function targetEvidence({ target, semanticChecks, governance }) {
  const deterministicKey = DETERMINISTIC_TARGETS[target];
  if (deterministicKey) {
    const passed = governance[deterministicKey] === true;
    return {
      target,
      source: "DETERMINISTIC_GOVERNANCE",
      status: passed ? "PASS" : "FAIL",
      passed,
      checks: [],
    };
  }

  const required = SEMANTIC_TARGET_CHECKS[target] || [];
  const checks = required.map((id) => semanticChecks.get(id)).filter(Boolean);
  const missing = required.filter((id) => !semanticChecks.has(id));
  const failed = checks.filter((check) => check.status === "FAIL" || check.passed !== true);
  const passed = required.length > 0 && missing.length === 0 && failed.length === 0;
  return {
    target,
    source: "EXISTING_SEMANTIC_QUALITY_RUNTIME",
    status: passed ? "PASS" : "FAIL",
    passed,
    checks: checks.map((check) => check.id),
    missing_checks: missing,
    failed_checks: failed.map((check) => check.id),
  };
}

function boundedRepairs({ evaluation, editableShotIds, preservedShotIds }) {
  const editable = new Set(editableShotIds);
  const preserved = new Set(preservedShotIds);
  const bounded = [];
  const blocked = [];

  for (const item of list(evaluation.repair_plan)) {
    const affected = [...new Set(list(item.affected_shot_ids).map((id) => text(id, 180)).filter(Boolean))];
    if (!affected.length) {
      blocked.push({
        ...item,
        reason: "DIRECTOR_QC_REPAIR_REQUIRES_EXACT_SHOT_SCOPE",
      });
      continue;
    }
    const touchesPreserved = affected.filter((id) => preserved.has(id));
    const outsideEditable = affected.filter((id) => !editable.has(id));
    if (touchesPreserved.length || outsideEditable.length) {
      blocked.push({
        ...item,
        reason: touchesPreserved.length
          ? "DIRECTOR_QC_REPAIR_TOUCHES_PRESERVED_SHOT"
          : "DIRECTOR_QC_REPAIR_OUTSIDE_EDITABLE_SET",
        preserved_shot_ids: touchesPreserved,
        outside_editable_shot_ids: outsideEditable,
      });
      continue;
    }
    bounded.push({
      ...item,
      affected_shot_ids: affected,
      change_only_failed_requirements: true,
      preserve_approved_direction: true,
      preserve_unaffected_requirements: true,
    });
  }

  return { bounded, blocked };
}

export const CreativeDirectorQualityModeRuntime = {
  review({
    director_plan,
    semantic_review,
    semantic_policy,
    governance_evidence = {},
  } = {}) {
    const plan = object(director_plan);
    if (!text(plan.contract, 180).startsWith("AVANTIQO_CREATIVE_DIRECTOR_PLAN_")) {
      throw new Error("CREATIVE_DIRECTOR_QC_PLAN_REQUIRED");
    }
    if (!text(plan.fingerprints?.director_plan, 180)) {
      throw new Error("CREATIVE_DIRECTOR_QC_PLAN_FINGERPRINT_REQUIRED");
    }

    const requiredTargets = list(plan.quality?.required_qc_targets)
      .map((target) => text(target, 120).toUpperCase())
      .filter(Boolean);
    if (!requiredTargets.length) {
      throw new Error("CREATIVE_DIRECTOR_QC_TARGETS_REQUIRED");
    }

    const semanticRequired = requiredSemanticChecks(requiredTargets);
    const policy = {
      ...object(semantic_policy),
      required_checks: semanticRequired,
    };
    const semanticEvaluation = semanticRequired.length
      ? CreativeSemanticQualityRuntime.validate(object(semantic_review), policy)
      : {
          passed: true,
          checks: [],
          failed_checks: [],
          validation_failures: [],
          repair_plan: [],
        };
    const semanticChecks = checkById(semanticEvaluation);
    const governance = normalizeGovernanceEvidence(governance_evidence);
    const target_results = requiredTargets.map((target) => targetEvidence({
      target,
      semanticChecks,
      governance,
    }));

    const editableShotIds = shotIds(plan.change_set?.editable?.shots);
    const preservedShotIds = shotIds(plan.change_set?.preserved?.shots);
    const repairs = boundedRepairs({
      evaluation: semanticEvaluation,
      editableShotIds,
      preservedShotIds,
    });
    const failedTargets = target_results.filter((result) => !result.passed);
    const evidenceInvalid = list(semanticEvaluation.validation_failures).length > 0;
    const blocked = evidenceInvalid || repairs.blocked.length > 0;
    const passed = failedTargets.length === 0 && !blocked;
    const verdict = passed
      ? "PASS"
      : blocked
        ? "BLOCKED"
        : repairs.bounded.length
          ? "REPAIR"
          : "REJECT";

    return {
      contract: CREATIVE_DIRECTOR_QUALITY_MODE_CONTRACT,
      mode: "QUALITY_REVIEW",
      director_plan_contract: plan.contract,
      director_plan_fingerprint: plan.fingerprints.director_plan,
      experience_mode: plan.experience_mode || null,
      verdict,
      release_ready: passed,
      final_delivery_blocked: !passed,
      required_qc_targets: requiredTargets,
      target_results,
      semantic_quality: {
        required_checks: semanticRequired,
        passed: semanticEvaluation.passed === true,
        overall_score: semanticEvaluation.overall_score ?? null,
        weakest_score: semanticEvaluation.weakest_score ?? null,
        weakest_dimension: semanticEvaluation.weakest_dimension || null,
        failed_checks: list(semanticEvaluation.failed_checks),
        validation_failures: list(semanticEvaluation.validation_failures),
      },
      repair: {
        automatic_execution_authorized: false,
        bounded_repairs: repairs.bounded,
        blocked_repairs: repairs.blocked,
        editable_shot_ids: editableShotIds,
        preserved_shot_ids: preservedShotIds,
        existing_repair_runtime: "CreativeAutonomousRepairDirectorRuntime",
        handoff_required_before_execution: repairs.bounded.length > 0,
      },
      governance: {
        deterministic_evidence: governance,
        preserved_shots_immutable: true,
        professional_locks_enforced: true,
        stale_plan_preflight_required: true,
        exact_shot_scope_required_for_repair: true,
        media_generation_authorized: false,
        publication_authorized: false,
      },
    };
  },
};

export default CreativeDirectorQualityModeRuntime;
