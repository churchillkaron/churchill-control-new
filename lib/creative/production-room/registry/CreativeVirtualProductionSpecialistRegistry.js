export const CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS = Object.freeze([
  Object.freeze({
    id: "research_scouting", requirement: 1,
    stages: ["RESEARCH_ROOM", "TECHNICAL_SCOUT"], owner: "strategy_director",
    specialists: [
      "location_scout", "cultural_researcher", "technical_researcher",
      "visual_reference_researcher", "archive_researcher", "weather_daylight_researcher",
      "local_behavior_researcher", "claims_fact_checker",
    ],
  }),
  Object.freeze({
    id: "casting_performance_pipeline", requirement: 2,
    stages: ["RESEARCH_ROOM", "DEPARTMENT_BREAKDOWN", "VIRTUAL_REHEARSAL"],
    owner: "talent_performance_director",
    specialists: [
      "casting_director", "principal_cast_researcher", "extras_casting_coordinator",
      "character_bible_editor", "wardrobe_fitting_supervisor", "grooming_continuity_artist",
      "movement_coach", "performance_rehearsal_coordinator",
    ],
  }),
  Object.freeze({
    id: "production_design_crew", requirement: 3,
    stages: ["TECHNICAL_SCOUT", "DEPARTMENT_BREAKDOWN", "PRODUCTION_UNITS"],
    owner: "production_designer",
    specialists: ["set_decorator", "prop_master", "graphic_signage_designer",
      "wardrobe_designer", "hair_makeup_designer", "surface_aging_artist",
      "environment_dresser", "set_continuity_coordinator"],
  }),
  Object.freeze({
    id: "cinematography_engineering", requirement: 4,
    stages: ["PREVIS", "VIRTUAL_REHEARSAL", "PRODUCTION_UNITS"],
    owner: "director_of_photography",
    specialists: ["camera_operator", "first_ac_focus", "grip_key", "gaffer",
      "lighting_programmer", "aerial_camera_operator", "vehicle_rig_operator",
      "specialty_camera_engineer", "dit_imaging_technician"],
  }),
  Object.freeze({
    id: "physical_lighting_simulation", requirement: 5,
    stages: ["TECHNICAL_SCOUT", "PREVIS", "VIRTUAL_REHEARSAL"],
    owner: "director_of_photography",
    specialists: ["sun_path_analyst", "practical_light_planner", "reflection_supervisor",
      "shadow_continuity_analyst", "surface_response_lighter", "exposure_continuity_analyst"],
  }),
  Object.freeze({
    id: "action_rehearsal", requirement: 6,
    stages: ["PREVIS", "VIRTUAL_REHEARSAL"], owner: "action_motion_supervisor",
    specialists: ["action_previz_artist", "trajectory_simulator", "timing_coordinator",
      "obstacle_clearance_analyst", "stunt_safety_planner", "edit_point_planner"],
  }),
  Object.freeze({
    id: "coverage_intelligence", requirement: 7,
    stages: ["PREVIS", "VIRTUAL_REHEARSAL", "PRODUCTION_UNITS", "EDITORIAL"],
    owner: "second_unit_director",
    specialists: ["hero_camera_planner", "insert_unit_planner", "pov_unit_planner",
      "aerial_unit_planner", "detail_unit_planner", "coverage_continuity_editor"],
  }),
  Object.freeze({
    id: "material_environment_physics", requirement: 8,
    stages: ["TECHNICAL_SCOUT", "PREVIS", "VFX"], owner: "simulation_physics_supervisor",
    specialists: ["material_response_artist", "weather_fx_analyst", "cloth_hair_dynamics_artist",
      "fluid_spray_artist", "surface_wear_artist", "contact_deformation_analyst"],
  }),
  Object.freeze({
    id: "practical_digital_effects_strategy", requirement: 9,
    stages: ["DEPARTMENT_BREAKDOWN", "PREVIS", "VFX"], owner: "vfx_director",
    specialists: ["practical_fx_supervisor", "hybrid_fx_planner", "invisible_vfx_planner",
      "digital_fx_supervisor", "plate_strategy_supervisor"],
  }),
  Object.freeze({
    id: "vfx_shot_management", requirement: 10,
    stages: ["DEPARTMENT_BREAKDOWN", "VFX"], owner: "post_production_supervisor",
    specialists: ["vfx_producer", "shot_coordinator", "asset_version_manager",
      "render_dependency_manager", "review_note_coordinator", "approved_state_controller"],
  }),
  Object.freeze({
    id: "dailies_room", requirement: 11,
    stages: ["DAILIES"], owner: "quality_director",
    specialists: ["dailies_editor", "director_review_coordinator", "dp_review_coordinator",
      "vfx_dailies_reviewer", "continuity_dailies_reviewer", "technical_qc_operator"],
  }),
  Object.freeze({
    id: "editorial_preproduction", requirement: 12,
    stages: ["CONCEPT_COMPETITION", "PREVIS", "VIRTUAL_REHEARSAL", "EDITORIAL"], owner: "editor",
    specialists: ["previs_editor", "story_editor", "transition_editor", "coverage_editor",
      "time_compression_editor", "insert_need_analyst"],
  }),
  Object.freeze({
    id: "script_continuity", requirement: 13,
    stages: ["PREVIS", "VIRTUAL_REHEARSAL", "PRODUCTION_UNITS", "DAILIES", "EDITORIAL"],
    owner: "post_production_supervisor",
    specialists: ["script_supervisor", "prop_continuity_tracker", "wardrobe_continuity_tracker",
      "eyeline_screen_direction_tracker", "weather_wetness_tracker", "story_timekeeper"],
  }),
  Object.freeze({
    id: "sonic_world_preproduction", requirement: 14,
    stages: ["CREATIVE_FLOOR", "PREVIS", "SOUND_MUSIC"], owner: "sound_director",
    specialists: ["production_sound_concept_editor", "acoustic_space_designer", "foley_planner",
      "transition_sound_editor", "silence_dynamics_designer", "sound_perspective_editor"],
  }),
  Object.freeze({
    id: "music_department", requirement: 15,
    stages: ["CREATIVE_FLOOR", "EDITORIAL", "SOUND_MUSIC"], owner: "sound_director",
    specialists: ["composer", "music_supervisor", "music_editor", "score_arranger",
      "music_clearance_coordinator", "picture_sync_editor"],
  }),
  Object.freeze({
    id: "look_development_color", requirement: 16,
    stages: ["CREATIVE_FLOOR", "PREVIS", "COLOR"], owner: "color_di_supervisor",
    specialists: ["look_development_colorist", "show_lut_designer", "exposure_pipeline_supervisor",
      "skin_tone_colorist", "shot_match_colorist", "hdr_sdr_trim_supervisor"],
  }),
  Object.freeze({
    id: "pixel_level_finishing", requirement: 17,
    stages: ["VFX", "COLOR", "MASTER_DIRECTOR_REVIEW", "RELEASE"], owner: "quality_director",
    specialists: ["grain_texture_supervisor", "motion_blur_qc", "lens_character_qc",
      "edge_detail_qc", "noise_consistency_qc", "compression_mastering_qc"],
  }),
  Object.freeze({
    id: "production_management", requirement: 18,
    stages: ["DEPARTMENT_BREAKDOWN", "PRODUCTION_UNITS", "DAILIES", "RELEASE"], owner: "production_director",
    specialists: ["line_producer", "production_manager", "production_coordinator",
      "unit_manager", "schedule_dependency_planner", "cost_risk_controller"],
  }),
  Object.freeze({
    id: "take_strategy", requirement: 19,
    stages: ["PREVIS", "PRODUCTION_UNITS", "DAILIES", "EDITORIAL"], owner: "film_director",
    specialists: ["take_variant_planner", "performance_option_editor", "camera_ending_variant_planner",
      "expression_variant_planner", "insert_variant_planner", "cost_benefit_take_controller"],
  }),
  Object.freeze({
    id: "creative_taste_memory", requirement: 20,
    stages: ["CREATIVE_FLOOR", "DAILIES", "MASTER_DIRECTOR_REVIEW"], owner: "executive_creative_director",
    specialists: ["taste_comparison_critic", "weakest_link_critic", "accepted_rejected_pair_analyst",
      "reference_difference_analyst", "director_choice_archivist", "advisory_taste_learner"],
  }),
]);

export const CREATIVE_VIRTUAL_SPECIALISTS = Object.freeze(
  CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS.flatMap((workstream) =>
    workstream.specialists.map((id) => Object.freeze({
      id, owner: workstream.owner, workstream_id: workstream.id,
      requirement: workstream.requirement, stages: workstream.stages,
    })),
  ),
);

export function specialistsForStage(stageId) {
  return CREATIVE_VIRTUAL_SPECIALISTS.filter((specialist) => specialist.stages.includes(stageId));
}

export function workstreamByRequirement(number) {
  return CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS.find((item) => item.requirement === Number(number)) || null;
}