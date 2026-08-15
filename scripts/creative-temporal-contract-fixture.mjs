// A temporal plan that satisfies the canonical contract, used by the repair-path audit.
//
// Nothing had ever demonstrated that the temporal path can produce a valid plan. Every
// film observed had failed somewhere earlier -- base plan, scene architecture, shot
// direction, JSON format, the contract itself -- so it was unknown whether success was
// even reachable or whether the contract was unsatisfiable. This fixture is the proof
// that it is reachable, and the regression guard that it stays so.
//
// It is deliberately mechanical rather than creatively good: it exercises the contract's
// structure, not its taste. The shot contract alone requires around forty fields, so
// they are generated rather than hand-written.

import { CREATIVE_AGENCY_ROLES } from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";

export const long = (n) =>
  "Specific evidence-backed direction that carries real substance for this exact mission. "
    .repeat(Math.ceil(n / 85) + 1).slice(0, Math.max(n, 6));

const fields = (names, n) => Object.fromEntries(names.map((k) => [k, long(n)]));

export function temporalShot(id) {
  return {
    id, title: long(20), purpose: long(30), subject: long(20), action: long(30),
    performance: long(30), device: long(60), duration_seconds: 30,
    frame_plan: { opening_frame: long(40), progression: long(50), closing_frame: long(40) },
    camera: fields(["framing","angle","camera_distance","lens_intent","movement_path",
      "movement_speed","stabilization","movement_motivation","focus_target","focus_transition"], 12),
    lighting: fields(["source","direction","contrast","colour","exposure_intent"], 12),
    production_design: fields(["environment","wardrobe","props","materials","texture_detail"], 12),
    continuity: fields(["identity","product","location","wardrobe","screen_direction","spatial_geography"], 12),
    audio: { source_sound: long(12), mix_intent: long(16) },
    transition_in: long(12), transition_out: long(12),
    negative_constraints: [long(30)], known_failure_modes: [long(30)], repair_instructions: [long(30)],
    primary_source_asset_id: "a1",
    reference_assets: [{ asset_id: "a1", role: "PRIMARY_SOURCE", reason: long(30) }],
    reference_asset_ids: [],
    generation: { required: true, service: "ai.video.generate", capability: "ai.video.generate",
      output_spec: { width:1920, height:1080, resolution:"1920x1080", frame_rate:24, aspect_ratio:"16:9", duration_seconds:30 } },
  };
}

export function temporalScene(id) {
  return {
    id, title: long(20), objective: long(30), story_state_before: long(30),
    state_change: long(30), story_state_after: long(30), transition_logic: long(20),
    duration_seconds: 30,
  };
}

export function temporalBasePlan() {
  const roles = Object.fromEntries(CREATIVE_AGENCY_ROLES.map((r) => [r.id, {
    status: "ACTIVE", decision: long(90), evidence: [long(30)], confidence: 90,
  }]));
  return {
    workflow_kind: "TEMPORAL",
    concept: { title: long(20), creative_thesis: long(320), hook: long(60), message: long(90),
      narrative: long(240), creative_system: long(220), emotional_promise: long(90),
      call_to_action: long(70), target_audience: long(140),
      signature_device: long(180), refused_devices: long(200) },
    story: { hook: long(80), audience_tension: long(120), escalation: long(120),
      observable_proof: long(120), turn: long(90), resolution: long(90),
      call_to_action: long(70), emotional_arc: long(110), anti_cliche_strategy: long(140) },
    role_decisions: roles,
    creative_review: { passed: true, overall_score: 95,
      dimensions: Object.fromEntries(["strategic_specificity","originality","ownability",
        "audience_truth","brand_truth","medium_fitness","craft_specificity","factual_discipline",
        "language_specificity","production_feasibility","finishing_readiness"].map(d=>[d,95])),
      selected_direction_reason: long(140),
      rejected_patterns: [long(50),long(52),long(54),long(56)],
      craft_risks: [long(50),long(52),long(54),long(56)],
      finishing_requirements: [long(50),long(52),long(54),long(56)],
      weakest_link: long(60), repair_before_production: [] },
    asset_manifest: [{ asset_id:"a1", disposition:"ASSIGNED", confidence:90,
      reason: long(40), assignments:[{ scene_id:"scene-1", role:"PRIMARY_SOURCE", reason: long(30) }] }],
    deliverables: [{ id:"deliverable-one", code:"D1", type:"FILM", purpose: long(40),
      output_spec:{width:1920,height:1080,resolution:"1920x1080",frame_rate:24,aspect_ratio:"16:9",duration_seconds:30} }],
    production: {},
  };
}

export const TEMPORAL_QUALITY = { version:"V1", minimum_scene_score:92, regenerate_below_score:88,
  require_brand_fit:true, require_non_ai_feel:true, require_identity_continuity:true,
  require_product_continuity:false, require_story_progression:true };
