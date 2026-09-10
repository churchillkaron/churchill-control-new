import crypto from "node:crypto";

export const STUDIO_VISUAL_CERTIFICATION_CONTRACT =
  "AVANTIQO_STUDIO_VISUAL_GENERATION_CERTIFICATION_V1";

const REQUIRED_DISCIPLINES = Object.freeze([
  "prompt_transport_clean",
  "subject_class_fidelity",
  "mechanical_system_plausibility",
  "camera_path_feasibility",
  "persistent_subject_identity",
  "persistent_world_geometry",
  "geography_truth",
  "temporal_continuity",
  "no_hidden_reset",
  "no_unintended_generated_text",
  "cinematic_authoring_specificity",
  "reveal_progression",
  "beauty_weakest_link",
  "deterministic_frame_dynamics",
  "elite_department_orchestration",
  "sealed_previsualization",
  "sealed_department_handoff",
  "hero_asset_truth_boundary",
  "subject_motion_choreography",
  "virtual_camera_state",
  "deterministic_audio_dynamics",
  "technical_subject_truth",
  "human_place_patience_truth",
  "product_capability_truth",
  "virtual_production_specialist_depth",
  "research_technical_scout_truth",
  "creative_floor_concept_competition",
  "production_office_orchestration",
  "production_work_order_orchestration",
  "durable_production_state_concurrency",
  "owned_production_specialist_execution",
  "parallel_specialist_wave_orchestration",
  "production_dependency_deadlock_free",
  "production_room_pipeline",
  "virtual_rehearsal_production_gate",
  "production_unit_take_governance",
  "dailies_post_release_chain",
  "reference_grammar_alignment",
  "known_failure_preflight_rejection",
  "zero_paid_media_generation",
]);

function text(value) {
  return String(value ?? "").trim();
}
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function disciplineResult(evidence = {}, id) {
  const source = evidence[id] || {};
  return {
    id,
    passed: source.passed === true,
    score: finite(source.score),
    evidence: Array.isArray(source.evidence) ? source.evidence.filter(Boolean) : [],
  };
}
export function evaluateStudioVisualReadiness(evidence = {}) {
  const disciplines = REQUIRED_DISCIPLINES.map((id) =>
    disciplineResult(evidence, id),
  );
  const failed = disciplines.filter((item) =>
    item.passed !== true || item.score !== 100 || !item.evidence.length,
  );
  const score = disciplines.length
    ? Math.min(...disciplines.map((item) => item.score ?? 0))
    : 0;
  return {
    contract: STUDIO_VISUAL_CERTIFICATION_CONTRACT,
    passed: failed.length === 0 && score === 100,
    score,
    required_score: 100,
    disciplines,
    failed_disciplines: failed.map((item) => item.id),
    zero_paid_media_generation:
      evidence.zero_paid_media_generation?.passed === true,
    known_failure_suite_passed:
      evidence.known_failure_preflight_rejection?.passed === true,
  };
}

export function issueStudioVisualGenerationCertification(evidence = {}) {
  const evaluated = evaluateStudioVisualReadiness(evidence);
  if (!evaluated.passed) {
    throw new Error(
      `STUDIO_VISUAL_READINESS_NOT_CERTIFIED:${evaluated.failed_disciplines.join(",")}`,
    );
  }
  const benchmarkSuiteDigest = digest({
    contract: STUDIO_VISUAL_CERTIFICATION_CONTRACT,
    disciplines: evaluated.disciplines,
  });
  return Object.freeze({
    contract: STUDIO_VISUAL_CERTIFICATION_CONTRACT,
    passed: true,
    score: 100,
    required_score: 100,
    zero_paid_media_generation: true,
    known_failure_suite_passed: true,
    generation_unlocked: false,
    benchmark_suite_digest: benchmarkSuiteDigest,
    certified_at: new Date().toISOString(),
  });
}

export const CreativeStudioVisualReadinessCertificationRuntime = Object.freeze({
  contract: STUDIO_VISUAL_CERTIFICATION_CONTRACT,
  required_disciplines: REQUIRED_DISCIPLINES,
  required_score: 100,
  evaluate: evaluateStudioVisualReadiness,
  issue: issueStudioVisualGenerationCertification,
  generation_unlock_requires_explicit_human_action: true,
});
