import {
  workstreamByRequirement,
} from "../registry/CreativeVirtualProductionSpecialistRegistry.js";

export const CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT = "CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_V1";

const REQUIRED_OUTPUTS = Object.freeze({
  1: ["source_manifest", "location_findings", "cultural_findings", "technical_findings", "weather_daylight_findings", "open_questions"],
  2: ["character_bible", "casting_specification", "extras_plan", "wardrobe_fit_rules", "performance_rehearsal"],
  3: ["set_dressing_bible", "props_bible", "wardrobe_bible", "surface_aging_rules", "environment_continuity"],
  4: ["camera_package_logic", "focus_plan", "grip_support_plan", "lighting_plan", "specialty_rig_plan", "dit_color_pipeline"],
  5: ["sun_path", "motivated_light_map", "shadow_map", "reflection_map", "surface_response", "exposure_continuity"],
  6: ["action_path", "timing_map", "obstacle_clearance", "safety_constraints", "coverage_timing", "edit_points"],
  7: ["master_action_state", "camera_units", "shared_continuity", "coverage_purposes", "cut_opportunities"],
  8: ["material_library", "weather_behavior", "cloth_hair_behavior", "fluid_particulate_behavior", "contact_deformation"],
  9: ["effect_mode_decisions", "practical_elements", "digital_elements", "hybrid_handoffs", "plate_requirements"],
  10: ["shot_ownership", "version_lineage", "asset_dependencies", "review_notes", "approved_states"],
});
const REQUIRED_OUTPUTS_POST = Object.freeze({
  11: ["take_manifest", "department_reviews", "rejections", "approved_takes", "repair_routes"],
  12: ["editorial_precheck", "assembly_logic", "coverage_gaps", "transition_logic", "time_compression_plan", "insert_needs"],
  13: ["story_time", "prop_state", "wardrobe_state", "eyeline_screen_direction", "weather_wetness_state", "change_log"],
  14: ["sonic_world_bible", "acoustic_spaces", "foreground_sound_plan", "silence_strategy", "transition_sound_motifs"],
  15: ["score_thesis", "music_supervision", "music_edit_map", "picture_sync_points", "clearance_state", "mix_relationship"],
  16: ["show_look", "show_lut_or_transform", "exposure_rules", "skin_product_rules", "shot_match_strategy"],
  17: ["grain_rule", "motion_blur_rule", "lens_character_rule", "noise_rule", "edge_detail_rule", "compression_mastering_rule"],
  18: ["dependency_graph", "schedule", "cost_risks", "parallel_work", "approval_dependencies", "redo_cost_map"],
  19: ["take_objectives", "performance_variants", "camera_variants", "insert_variants", "editorial_value", "cost_limit"],
  20: ["accepted_rejected_pairs", "choice_reasons", "weakest_link_patterns", "reference_differences", "advisory_learning", "governance_boundary"],
});

export function requiredOutputsForWorkstream(number) {
  return REQUIRED_OUTPUTS[number] || REQUIRED_OUTPUTS_POST[number] || [];
}

function text(value) {
  return String(value ?? "").trim();
}

function hasEvidence(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return text(value).length > 0;
}
export function evaluateVirtualProductionWorkstream({ requirement, evidence = {} } = {}) {
  const number = Number(requirement);
  const workstream = workstreamByRequirement(number);
  const failures = [];
  if (!workstream) failures.push(`VIRTUAL_PRODUCTION_WORKSTREAM_UNKNOWN:${number || "missing"}`);
  const required = requiredOutputsForWorkstream(number);
  for (const key of required) {
    if (!hasEvidence(evidence[key])) failures.push(`VIRTUAL_PRODUCTION_WORKSTREAM_EVIDENCE_REQUIRED:${number}:${key}`);
  }
  if (number === 1) {
    const sources = Array.isArray(evidence.source_manifest) ? evidence.source_manifest : [];
    if (sources.length < 2) failures.push("VIRTUAL_PRODUCTION_RESEARCH_MULTI_SOURCE_REQUIRED");
  }
  if (number === 19 && Number(evidence.cost_limit) < 0) {
    failures.push("VIRTUAL_PRODUCTION_TAKE_COST_LIMIT_INVALID");
  }
  if (number === 20) {
    const boundary = text(evidence.governance_boundary).toUpperCase();
    if (!/ADVISORY/.test(boundary) || !/CANNOT|MUST NOT|NO AUTHORITY/.test(boundary)) {
      failures.push("VIRTUAL_PRODUCTION_TASTE_MEMORY_ADVISORY_ONLY_REQUIRED");
    }
  }
  return Object.freeze({
    contract: CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT,
    requirement: number,
    workstream_id: workstream?.id || null,
    owner: workstream?.owner || null,
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    required_outputs: required,
    evidence,
    zero_media_generation: true,
  });
}
export function evaluateAllVirtualProductionWorkstreams(evidence_by_requirement = {}) {
  const reports = Array.from({ length: 20 }, (_, index) => index + 1).map((requirement) =>
    evaluateVirtualProductionWorkstream({
      requirement,
      evidence: evidence_by_requirement[requirement] || {},
    }),
  );
  return Object.freeze({
    contract: CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT,
    passed: reports.every((report) => report.passed),
    reports,
    failed_requirements: reports.filter((report) => !report.passed).map((report) => report.requirement),
    zero_media_generation: true,
  });
}

export const CreativeVirtualProductionWorkstreamRuntime = Object.freeze({
  contract: CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT,
  evaluate: evaluateVirtualProductionWorkstream,
  evaluateAll: evaluateAllVirtualProductionWorkstreams,
});