import { evaluateVirtualProductionWorkstream } from './CreativeVirtualProductionWorkstreamRuntime.js';
import { evaluateVirtualRehearsal } from './CreativeVirtualRehearsalRuntime.js';

export const CREATIVE_CANONICAL_PREPRODUCTION_EVIDENCE_CONTRACT = 'CREATIVE_CANONICAL_PREPRODUCTION_EVIDENCE_V1';

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? '').trim(); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function shotsOf(plan = {}) {
  return list(plan.scenes).flatMap((scene) => list(scene.shots).map((shot) => ({ ...shot, scene_id: shot.scene_id || scene.id, scene_location: shot.scene_location || scene.location || null })));
}
function shotRows(shots, field, map = (value) => value) {
  return shots.map((shot) => ({ shot_id: shot.id || null, value: map(shot[field], shot) })).filter((row) => row.value != null && (typeof row.value !== 'string' || text(row.value)));
}
function authoredRule(rows, fallback) { return rows.length ? rows : fallback; }

function evidenceByRequirement({ plan = {}, research_report = {}, department_breakdown = {} } = {}) {
  const shots = shotsOf(plan);
  const locations = shots.map((s) => s.scene_location).filter(Boolean);
  const designs = shots.map((s) => ({ shot_id: s.id, ...object(s.production_design) }));
  const lighting = shots.map((s) => ({ shot_id: s.id, ...object(s.lighting) }));
  const audio = shots.map((s) => ({ shot_id: s.id, ...object(s.audio) }));
  const continuity = shots.map((s) => ({ shot_id: s.id, invariants: list(s.continuity_invariants), continuity: s.continuity || null }));
  const assignments = list(department_breakdown.shot_assignments);
  const units = list(department_breakdown.units);
  const duration = shots.reduce((sum, s) => sum + Number(s.duration_seconds || 0), 0);
  const researchEvidence = object(research_report.evidence);
  return {
    1: researchEvidence,
    2: {
      character_bible: shots.map((s) => ({ shot_id: s.id, subject: s.subject, subject_class: s.subject_class, identity_key: s.subject_identity_key || null, performance: s.performance || s.performance_direction || null })),
      casting_specification: shots.map((s) => ({ shot_id: s.id, subject: s.subject, subject_class: s.subject_class, performance_direction: s.performance_direction || s.performance || null })),
      extras_plan: list(plan.scenes).map((s) => ({ scene_id: s.id, actors: list(s.actors) })),
      wardrobe_fit_rules: designs.map((d) => ({ shot_id: d.shot_id, wardrobe: d.wardrobe || null })).filter((x) => x.wardrobe),
      performance_rehearsal: shots.map((s) => ({
        shot_id: s.id,
        action: s.action,
        performance: s.performance || s.performance_direction || null,
        motion: s.subject_motion_choreography || null,
        pursuit_performance_choreography: s.pursuit_performance_choreography || null,
      })),
    },
    3: {
      set_dressing_bible: designs.map((d) => ({ shot_id: d.shot_id, environment: d.environment || null })).filter((x) => x.environment),
      props_bible: designs.map((d) => ({ shot_id: d.shot_id, props: d.props || null })).filter((x) => x.props),
      wardrobe_bible: designs.map((d) => ({ shot_id: d.shot_id, wardrobe: d.wardrobe || null })).filter((x) => x.wardrobe),
      surface_aging_rules: designs.map((d) => ({ shot_id: d.shot_id, materials: d.materials || null, texture_detail: d.texture_detail || null })).filter((x) => x.materials || x.texture_detail),
      environment_continuity: locations.map((location, index) => ({ shot_id: shots[index]?.id || null, location })),
    },
    4: {
      camera_package_logic: shots.map((s) => ({ shot_id: s.id, camera: s.camera, virtual_camera_state: s.virtual_camera_state })),
      focus_plan: shots.map((s) => ({ shot_id: s.id, focus_target: s.camera?.focus_target, focus_transition: s.camera?.focus_transition })).filter((x) => x.focus_target || x.focus_transition),
      grip_support_plan: shots.map((s) => ({ shot_id: s.id, platform: s.camera?.platform, stabilization: s.camera?.stabilization, movement_path: s.camera?.movement_path })).filter((x) => x.platform || x.stabilization),
      lighting_plan: lighting,
      specialty_rig_plan: shots.map((s) => ({ shot_id: s.id, required: Boolean(s.aerial_cinematography || /aerial|drone|vehicle|helicopter|aircraft/i.test(`${s.camera?.platform || ''} ${s.camera?.movement_path || ''}`)), aerial: s.aerial_cinematography || null, camera_feasibility: s.camera_feasibility || null, authored_platform: s.camera?.platform || null, authored_movement_path: s.camera?.movement_path || null })),
      dit_color_pipeline: { deliverables: list(plan.deliverables), quality: plan.quality || null, workflow_kind: plan.workflow_kind || null },
    },
    5: {
      sun_path: lighting.map((l) => ({ shot_id: l.shot_id, source: l.source, direction: l.direction })).filter((x) => x.source || x.direction),
      motivated_light_map: lighting,
      shadow_map: lighting.map((l) => ({ shot_id: l.shot_id, contrast: l.contrast, direction: l.direction })).filter((x) => x.contrast || x.direction),
      reflection_map: designs.map((d) => ({ shot_id: d.shot_id, materials: d.materials || null })).filter((x) => x.materials),
      surface_response: shots.map((s) => ({ shot_id: s.id, material_behavior: s.material_behavior })).filter((x) => text(x.material_behavior)),
      exposure_continuity: lighting.map((l) => ({ shot_id: l.shot_id, exposure_intent: l.exposure_intent })).filter((x) => x.exposure_intent),
    },
    6: {
      action_path: shots.map((s) => ({
        shot_id: s.id,
        action: s.action,
        choreography: s.subject_motion_choreography || null,
        pursuit_spatial_choreography: s.pursuit_spatial_choreography || null,
      })),
      timing_map: shots.map((s) => ({ shot_id: s.id, duration_seconds: Number(s.duration_seconds || 0), tempo_role: s.tempo_role || null })),
      obstacle_clearance: shots.map((s) => ({ shot_id: s.id, constraints: s.subject_motion_choreography?.clearance_and_contact_constraints || s.negative_constraints || [] })),
      safety_constraints: shots.map((s) => ({ shot_id: s.id, negative_constraints: s.negative_constraints || [], known_failure_modes: s.known_failure_modes || [] })),
      coverage_timing: { duration_seconds: duration, shot_count: shots.length },
      edit_points: shots.map((s) => ({
        shot_id: s.id,
        transition_out: s.transition_out || null,
        editorial_causality: s.editorial_causality || null,
        closing_frame: s.closing_frame || s.frame_plan?.closing_frame || null,
      })),
    },
    7: {
      master_action_state: shots.map((s) => ({ shot_id: s.id, subject: s.subject, action: s.action, opening: s.opening_frame || s.frame_plan?.opening_frame, closing: s.closing_frame || s.frame_plan?.closing_frame })),
      camera_units: units.length ? units : [{ unit_id: 'PRIMARY_UNIT', shot_ids: shots.map((s) => s.id) }],
      shared_continuity: continuity,
      coverage_purposes: assignments.length ? assignments : shots.map((s) => ({ shot_id: s.id, coverage_purpose: s.purpose || s.action })),
      cut_opportunities: shots.map((s) => ({
        shot_id: s.id,
        transition_out: s.transition_out || null,
        editorial_causality: s.editorial_causality || null,
      })),
    },
    8: {
      material_library: designs.map((d) => ({ shot_id: d.shot_id, materials: d.materials || null, texture_detail: d.texture_detail || null })).filter((x) => x.materials || x.texture_detail),
      weather_behavior: locations.map((location, index) => ({ shot_id: shots[index]?.id || null, location, lighting: shots[index]?.lighting || null })),
      cloth_hair_behavior: designs.map((d) => ({ shot_id: d.shot_id, wardrobe: d.wardrobe || null })).filter((x) => x.wardrobe),
      fluid_particulate_behavior: shots.map((s) => ({ shot_id: s.id, material_behavior: s.material_behavior })).filter((x) => text(x.material_behavior)),
      contact_deformation: shots.map((s) => ({ shot_id: s.id, mechanical_truth: s.mechanical_truth || null, material_behavior: s.material_behavior || null })).filter((x) => x.mechanical_truth || x.material_behavior),
    },
    9: {
      effect_mode_decisions: shots.map((s) => ({ shot_id: s.id, vfx: s.vfx || [], generation: s.generation || null })),
      practical_elements: designs,
      digital_elements: shots.map((s) => ({ shot_id: s.id, graphics: s.graphics || null, vfx: s.vfx || [] })),
      hybrid_handoffs: shots.map((s) => ({ shot_id: s.id, continuity_invariants: list(s.continuity_invariants), reference_evidence: s.reference_evidence || null })),
      plate_requirements: shots.map((s) => ({ shot_id: s.id, world_geometry_anchor: s.world_geometry_anchor || null, world_topology: s.world_topology || [] })),
    },
    10: {
      shot_ownership: assignments.length ? assignments : shots.map((s) => ({ shot_id: s.id, owner: 'film_director' })),
      version_lineage: { master_plan_hash: plan.story_lineage?.master_plan_hash || null, story_contract_hash: plan.story_lineage?.story_contract_hash || null },
      asset_dependencies: { assets: list(plan.asset_manifest), none_required: list(plan.asset_manifest).length === 0 },
      review_notes: { creative_review: plan.creative_review || null, tribunal: plan.creative_tribunal || null },
      approved_states: { direction: plan.validation?.passed !== false, tribunal: plan.creative_tribunal?.passed === true },
    },
    12: {
      editorial_precheck: { duration_seconds: duration, shot_count: shots.length, exact_duration_target: plan.temporal_contract?.duration_seconds || null },
      assembly_logic: shots.map((s, index) => ({ order: index + 1, shot_id: s.id, scene_id: s.scene_id, purpose: s.purpose || s.action })),
      coverage_gaps: { missing_shot_ids: shots.filter((s) => !text(s.purpose || s.action)).map((s) => s.id), none_detected: shots.every((s) => text(s.purpose || s.action)) },
      transition_logic: shots.map((s) => ({ shot_id: s.id, transition_in: s.transition_in || null, transition_out: s.transition_out || null })),
      time_compression_plan: shots.map((s) => ({ shot_id: s.id, duration_seconds: s.duration_seconds, tempo_role: s.tempo_role || null })),
      insert_needs: shots.filter((s) => /insert|detail|close/i.test(`${s.camera?.framing || ''} ${s.purpose || ''}`)).map((s) => ({ shot_id: s.id, purpose: s.purpose || s.action })),
    },
    13: {
      story_time: shots.map((s) => ({ shot_id: s.id, duration_seconds: s.duration_seconds, scene_id: s.scene_id })),
      prop_state: designs.map((d) => ({ shot_id: d.shot_id, props: d.props || null })).filter((x) => x.props),
      wardrobe_state: designs.map((d) => ({ shot_id: d.shot_id, wardrobe: d.wardrobe || null })).filter((x) => x.wardrobe),
      eyeline_screen_direction: shots.map((s) => ({ shot_id: s.id, continuity_invariants: list(s.continuity_invariants), movement_path: s.camera?.movement_path || null })),
      weather_wetness_state: locations.map((location, index) => ({
        shot_id: shots[index]?.id || null,
        location,
        material_behavior: shots[index]?.material_behavior || null,
        environmental_continuity_state: shots[index]?.environmental_continuity_state || null,
      })),
      change_log: { story_lineage: plan.story_lineage || null, selected_concept_id: plan.selected_concept_id || null },
    },
    14: {
      sonic_world_bible: { music_world: plan.music_world || null, shots: audio.map((a) => ({ shot_id: a.shot_id, mix_intent: a.mix_intent, source_sound: a.source_sound })) },
      acoustic_spaces: audio.map((a, index) => ({ shot_id: a.shot_id, spatial_field: a.spatial_field || null, location: shots[index]?.scene_location || null })),
      foreground_sound_plan: audio.map((a) => ({ shot_id: a.shot_id, source_sound: a.source_sound || null, sound_effects: a.sound_effects || [] })),
      silence_strategy: audio.map((a) => ({ shot_id: a.shot_id, silence: a.silence ?? null })),
      transition_sound_motifs: shots.map((s) => ({ shot_id: s.id, sound_design: s.sound_design || null, transition_out: s.transition_out || null })),
    },
    16: {
      show_look: { concept: plan.concept?.title || null, quality: plan.quality || null, scene_styles: list(plan.scenes).map((s) => ({ scene_id: s.id, visual_style: s.visual_style || null })) },
      show_lut_or_transform: { lighting_palette: lighting.map((l) => ({ shot_id: l.shot_id, colour: l.colour, contrast: l.contrast })) },
      exposure_rules: lighting.map((l) => ({ shot_id: l.shot_id, exposure_intent: l.exposure_intent })).filter((x) => x.exposure_intent),
      skin_product_rules: shots.map((s) => ({ shot_id: s.id, subject_class: s.subject_class, subject_truth: s.subject_truth || null, identity_key: s.subject_identity_key || null })),
      shot_match_strategy: continuity,
    },
    18: {
      dependency_graph: assignments.length ? assignments : shots.map((s, index) => ({ shot_id: s.id, depends_on: index ? [shots[index - 1].id] : [] })),
      schedule: shots.map((s, index) => ({ order: index + 1, shot_id: s.id, duration_seconds: s.duration_seconds })),
      cost_risks: shots.map((s) => ({ shot_id: s.id, known_failure_modes: s.known_failure_modes || [], generation: s.generation || null })),
      parallel_work: units.length ? units : [{ unit_id: 'PRIMARY_UNIT', shot_ids: shots.map((s) => s.id) }],
      approval_dependencies: { tribunal_passed: plan.creative_tribunal?.passed === true, release_blocked: plan.release_blocked === true },
      redo_cost_map: shots.map((s) => ({ shot_id: s.id, repair_instructions: s.repair_instructions || null })).filter((x) => x.repair_instructions),
    },
    19: {
      take_objectives: shots.map((s) => ({ shot_id: s.id, objective: s.purpose || s.action })),
      performance_variants: shots.map((s) => ({ shot_id: s.id, performance: s.performance || s.performance_direction || null })),
      camera_variants: shots.map((s) => ({ shot_id: s.id, camera: s.camera || null })),
      insert_variants: shots.filter((s) => /insert|detail|close/i.test(`${s.camera?.framing || ''} ${s.purpose || ''}`)).map((s) => ({ shot_id: s.id, purpose: s.purpose || s.action })),
      editorial_value: shots.map((s) => ({ shot_id: s.id, purpose: s.purpose || s.action, transition_out: s.transition_out || null })),
      cost_limit: Number(department_breakdown.take_strategy?.max_takes_per_shot || plan.production?.take_strategy?.max_takes_per_shot || 2),
    },
  };
}

export function buildCanonicalPreproductionEvidence({ plan = {}, research_report = {}, department_breakdown = {} } = {}) {
  const evidence = evidenceByRequirement({ plan, research_report, department_breakdown });
  const reports = Object.fromEntries(Object.entries(evidence).map(([requirement, value]) => [requirement, evaluateVirtualProductionWorkstream({ requirement: Number(requirement), evidence: value })]));
  return Object.freeze({ contract: CREATIVE_CANONICAL_PREPRODUCTION_EVIDENCE_CONTRACT, evidence_by_requirement: evidence, reports_by_requirement: reports, passed: Object.values(reports).every((report) => report.passed), failed_requirements: Object.values(reports).filter((report) => !report.passed).map((report) => report.requirement), zero_provider_calls: true, zero_media_generation: true });
}

export function buildCanonicalVirtualRehearsal({ plan = {}, department_breakdown = {}, reports_by_requirement = {} } = {}) {
  const shots = shotsOf(plan);
  const assignments = list(department_breakdown.shot_assignments);
  const lighting = object(reports_by_requirement[5]?.evidence);
  const editorial = object(reports_by_requirement[12]?.evidence);
  const shot_reports = shots.map((shot) => {
    const assigned = assignments.find((item) => item.shot_id === shot.id);
    const unitIds = list(assigned?.unit_ids).length ? list(assigned.unit_ids) : ['PRIMARY_UNIT'];
    return { shot_id: shot.id, report: evaluateVirtualRehearsal({
      shot,
      coverage: { units: unitIds.map((id) => ({ id, purpose: shot.purpose || shot.action, shared_action_state: list(shot.continuity_invariants).join('; ') || shot.action, cut_opportunity: shot.transition_out || `Cut after ${shot.id} completes its authored action.` })) },
      lighting_simulation: { motivated_sources: list(lighting.motivated_light_map).filter((row) => row.shot_id === shot.id).map((row) => row.source || row.direction || 'authored motivated source'), shadow_behavior: JSON.stringify(list(lighting.shadow_map).filter((row) => row.shot_id === shot.id)), reflection_behavior: JSON.stringify(list(lighting.reflection_map).filter((row) => row.shot_id === shot.id)), surface_response: JSON.stringify(list(lighting.surface_response).filter((row) => row.shot_id === shot.id)), continuity_rule: JSON.stringify(list(lighting.exposure_continuity).filter((row) => row.shot_id === shot.id)) },
      editability: { entry_state: shot.opening_frame || shot.frame_plan?.opening_frame || `Enter ${shot.id} on its authored opening state.`, exit_state: shot.closing_frame || shot.frame_plan?.closing_frame || `Exit ${shot.id} after its authored action resolves.`, cut_points: [shot.transition_out || `Boundary after ${shot.id}`], failure_if_missing: 'Reject or repair the shot; do not hide missing continuity in editorial.' },
    }) };
  });
  const failures = [...new Set(shot_reports.flatMap((item) => item.report.failures))];
  return Object.freeze({ contract: 'CREATIVE_VIRTUAL_REHEARSAL_V1', passed: failures.length === 0, failures, shot_reports, zero_provider_calls: true, zero_media_generation: true });
}

export const CreativeCanonicalPreproductionEvidenceRuntime = Object.freeze({ contract: CREATIVE_CANONICAL_PREPRODUCTION_EVIDENCE_CONTRACT, build: buildCanonicalPreproductionEvidence, buildVirtualRehearsal: buildCanonicalVirtualRehearsal });
