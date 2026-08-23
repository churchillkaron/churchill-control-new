import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BENCHMARK = resolve(
  process.env.AVANTIQO_MEDIA_FULL_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-owned-media-full-capability-benchmark.json",
);
const FIXTURES = resolve(
  process.env.AVANTIQO_MEDIA_CERTIFICATION_FIXTURES ||
    "/tmp/avantiqo-media-certification-fixtures.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MEDIA_HUMAN_REVIEW_OUTPUT ||
    "/tmp/avantiqo-owned-media-human-review.json",
);

const CRITERIA = Object.freeze({
  "ai.image.generate": [
    "photorealism_and_material_truth",
    "composition_and_lighting_quality",
    "artifact_absence",
    "instruction_adherence",
    "no_unrequested_text_or_logo",
  ],
  "ai.image.edit": [
    "requested_change_only",
    "source_identity_preserved",
    "source_geometry_preserved",
    "composition_preserved",
    "artifact_absence",
  ],
  "ai.image.inpaint": [
    "masked_region_semantic_correctness",
    "unmasked_region_preservation",
    "boundary_seam_absence",
    "lighting_and_texture_coherence",
    "artifact_absence",
  ],
  "ai.image.outpaint": [
    "original_region_preserved",
    "extension_semantically_coherent",
    "seam_absence",
    "perspective_and_lighting_continuity",
    "artifact_absence",
  ],
  "ai.image.upscale": [
    "real_detail_improvement",
    "identity_and_geometry_preserved",
    "color_preserved",
    "no_hallucinated_structure",
    "artifact_absence",
  ],
  "ai.image.analyze": [
    "visible_evidence_accuracy",
    "no_invented_visual_facts",
    "scores_supported_by_visible_evidence",
    "release_recommendation_coherent",
    "structured_result_complete",
  ],
  "ai.video.generate": [
    "cinematic_visual_quality",
    "temporal_consistency",
    "physics_plausibility",
    "camera_motion_coherence",
    "artifact_absence",
  ],
  "ai.video.image_to_video": [
    "reference_identity_preserved",
    "reference_composition_preserved",
    "motion_plausibility",
    "temporal_consistency",
    "artifact_absence",
  ],
  "ai.video.first_last_frame_to_video": [
    "opening_endpoint_fidelity",
    "closing_endpoint_fidelity",
    "transition_coherence",
    "identity_and_geometry_continuity",
    "temporal_artifact_absence",
  ],
  "ai.video.video_to_video": [
    "source_timing_preserved",
    "source_motion_preserved",
    "identity_and_geometry_preserved",
    "requested_treatment_adherence",
    "temporal_artifact_absence",
  ],
  "ai.video.edit": [
    "requested_change_only",
    "source_identity_preserved",
    "source_motion_preserved",
    "temporal_consistency",
    "artifact_absence",
  ],
  "ai.video.inpaint": [
    "masked_region_semantic_correctness",
    "unmasked_region_preservation",
    "moving_boundary_consistency",
    "temporal_consistency",
    "artifact_absence",
  ],
  "ai.video.extend": [
    "exact_source_tail_continuity",
    "extension_identity_continuity",
    "camera_and_spatial_direction_continuity",
    "lighting_and_physics_continuity",
    "join_seam_absence",
  ],
  "ai.video.upscale": [
    "real_detail_improvement",
    "identity_and_geometry_preserved",
    "color_preserved",
    "temporal_flicker_absence",
    "hallucinated_detail_absence",
  ],
  "ai.video.lipsync": [
    "phoneme_viseme_sync",
    "facial_identity_preserved",
    "non_mouth_detail_preserved",
    "temporal_face_stability",
    "mouth_artifact_absence",
  ],
});

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

const benchmark = JSON.parse(await readFile(BENCHMARK, "utf8"));
const fixtures = JSON.parse(await readFile(FIXTURES, "utf8"));

if (benchmark?.contract !== "AVANTIQO_OWNED_MEDIA_FULL_CAPABILITY_BENCHMARK_V1") {
  throw new Error("AVANTIQO_MEDIA_HUMAN_REVIEW_BENCHMARK_CONTRACT_INVALID");
}
if (benchmark?.summary?.all_mechanical_checks_passed !== true) {
  throw new Error("AVANTIQO_MEDIA_HUMAN_REVIEW_MECHANICAL_GATE_NOT_PASSED");
}
if (benchmark?.summary?.economics_evidence_complete !== true) {
  throw new Error("AVANTIQO_MEDIA_HUMAN_REVIEW_ECONOMICS_GATE_NOT_PASSED");
}
if (benchmark?.summary?.ready_for_human_quality_review !== true) {
  throw new Error("AVANTIQO_MEDIA_HUMAN_REVIEW_NOT_READY");
}
if (fixtures?.contract !== "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1") {
  throw new Error("AVANTIQO_MEDIA_HUMAN_REVIEW_FIXTURE_CONTRACT_INVALID");
}

const cases = Array.isArray(benchmark.cases) ? benchmark.cases : [];
const seenCapabilities = new Set();
const items = cases.map((item) => {
  const capability = text(item.capability);
  const criteria = CRITERIA[capability];
  if (!criteria) {
    throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_CRITERIA_MISSING:${capability}`);
  }
  if (seenCapabilities.has(capability)) {
    throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_DUPLICATE_CAPABILITY:${capability}`);
  }
  seenCapabilities.add(capability);
  if (item.mechanical_passed !== true) {
    throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_CASE_NOT_MECHANICALLY_PASSED:${capability}`);
  }

  const model = text(item.foundation_model);
  if (!model || text(item?.output?.foundation_model) !== model) {
    throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_MODEL_BINDING_INVALID:${capability}`);
  }
  const definitionFingerprint = text(item.benchmark_definition_sha256);
  if (!definitionFingerprint) {
    throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_DEFINITION_BINDING_MISSING:${capability}`);
  }

  const provenance = object(item.fixture_provenance);
  if (
    text(provenance.contract) !== "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1" ||
    !text(provenance.prefix) ||
    !text(provenance.fingerprint_sha256)
  ) {
    throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_CASE_PROVENANCE_INVALID:${capability}`);
  }
  const sourceStorageReferences = object(provenance.source_storage_references);
  if (Object.keys(sourceStorageReferences).length === 0) {
    throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_SOURCE_PROVENANCE_MISSING:${capability}`);
  }

  const outputStorageReference = text(item.storage_reference) || null;
  if (capability !== "ai.image.analyze") {
    if (!outputStorageReference?.startsWith("storage://creative-assets/")) {
      throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_OUTPUT_REFERENCE_INVALID:${capability}`);
    }
    if (text(provenance.output_storage_reference) !== outputStorageReference) {
      throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_OUTPUT_PROVENANCE_MISMATCH:${capability}`);
    }
  }

  return {
    capability,
    engine: item.engine || null,
    model,
    output_storage_reference: outputStorageReference,
    source_storage_references: sourceStorageReferences,
    fixture_provenance: provenance,
    benchmark_definition_sha256: definitionFingerprint,
    benchmark_attempt_number: Number(item.attempt_number || 1),
    benchmark_executed_at: item.executed_at || null,
    resumed_from_previous_report: item.resumed_from_previous_report === true,
    mechanical_passed: true,
    economics: item.economics || null,
    review_status: "PENDING_HUMAN_REVIEW",
    required_criteria: criteria.map((criterion) => ({
      criterion,
      status: "PENDING",
      score_0_100: null,
      evidence_note: null,
    })),
    minimum_score_per_criterion: 86,
    critical_identity_or_endpoint_minimum: 90,
    reviewer: null,
    reviewed_at: null,
    human_quality_passed: false,
    production_certified: false,
  };
});

if (items.length !== Object.keys(CRITERIA).length) {
  throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_CAPABILITY_COUNT_INVALID:${items.length}`);
}

const manifest = {
  contract: "AVANTIQO_OWNED_MEDIA_HUMAN_REVIEW_V1",
  generated_at: new Date().toISOString(),
  benchmark_contract: benchmark.contract,
  benchmark_generated_at: benchmark.generated_at || null,
  benchmark_resume: benchmark.resume || null,
  source_scope: "BENCHMARK_ONLY",
  capability_count: items.length,
  review_status: "PENDING_HUMAN_REVIEW",
  human_quality_certified: false,
  economics_certified: false,
  production_certified: false,
  activation_allowed: false,
  automatic_human_approval_forbidden: true,
  items,
  certification_rule: {
    every_criterion_requires_explicit_human_result: true,
    every_criterion_minimum_score: 86,
    identity_endpoint_and_lipsync_critical_minimum: 90,
    any_failed_criterion_blocks_capability: true,
    every_capability_uses_its_own_fixture_provenance: true,
    resumed_campaign_evidence_may_span_fixture_runs_only_with_per_case_provenance: true,
    exact_returned_model_binding_required: true,
    exact_benchmark_definition_binding_required: true,
    production_activation_requires_separate_final_certification: true,
  },
};

await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      success: true,
      output_path: OUTPUT,
      capability_count: items.length,
      review_status: manifest.review_status,
      resumed_capabilities: items.filter((item) => item.resumed_from_previous_report).length,
      activation_allowed: false,
    },
    null,
    2,
  ),
);
