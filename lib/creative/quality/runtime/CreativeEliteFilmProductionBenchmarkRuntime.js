import { CREATIVE_AGENCY_ROLES } from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";

export const ELITE_FILM_PRODUCTION_BENCHMARK_CONTRACT =
  "CREATIVE_ELITE_FILM_PRODUCTION_BENCHMARK_V2";

const DEPARTMENT_FAMILIES = Object.freeze({
  creative_leadership: Object.freeze([
    "executive_creative_director", "strategy_director", "film_director", "art_director",
  ]),
  cinematography_and_world: Object.freeze([
    "director_of_photography", "production_designer", "location_production_supervisor",
  ]),
  preproduction_and_execution: Object.freeze([
    "production_director", "previsualization_supervisor", "talent_performance_director", "action_motion_supervisor", "technical_subject_supervisor",
  ]),
  editorial: Object.freeze(["editor", "post_production_supervisor"]),
  digital_image_pipeline: Object.freeze([
    "vfx_director", "cg_asset_supervisor", "simulation_physics_supervisor",
    "tracking_roto_supervisor", "compositing_supervisor", "motion_design_director",
  ]),
  color_and_finishing: Object.freeze([
    "color_di_supervisor", "quality_director", "release_director",
  ]),
  sound: Object.freeze([
    "sound_director", "sound_design_supervisor", "mix_finishing_engineer",
  ]),
});

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function score(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

function executionChecks(plan = {}) {
  const scenes = list(plan.scenes);
  const world = object(plan.visual_world);
  const taste = object(world.taste_gate);
  const invention = list(plan.shot_invention_map);
  const coverage = object(plan.cinematic_coverage?.film_coverage || plan.cinematic_coverage);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const sourceConditionedPhysicalShots = shots.filter((shot) =>
    text(shot.primary_source_asset_id).length > 0 && text(shot.camera?.platform).length > 0
  );
  const sceneIds = new Set(scenes.map((scene) => text(scene.id)).filter(Boolean));
  const inventionIds = new Set(invention.map((entry) => text(entry.scene_id)).filter(Boolean));
  const checks = {
    visual_world_authored: text(world.name).length > 0 && text(world.visual_thesis).length > 0,
    visual_taste_gate: taste.passed === true && score(taste.overall) >= 88 && score(taste.art_direction) >= 88 && score(taste.cinematic_invention) >= 88,
    signature_image_system: list(world.signature_images).length >= 4 && list(world.anti_flatness_rules).length >= 3,
    shot_invention_complete: scenes.length > 0 && sceneIds.size === inventionIds.size && [...sceneIds].every((id) => inventionIds.has(id)),
    shot_invention_substantive: invention.length > 0 && invention.every((entry) => text(entry.invention_thesis).length >= 20 && list(entry.shot_ideas).length > 0),
    directed_shots_present: shots.length > 0,
    camera_choices_motivated: shots.length > 0 && shots.every((shot) => text(shot.camera?.platform).length > 0 && text(shot.camera?.platform_motivation).length >= 12),
    authored_beauty: shots.length > 0 && shots.every((shot) => shot.cinematic_beauty_intent?.required === true && text(shot.cinematic_beauty_intent?.composition).length >= 16),
    source_conditioned_reinterpretation: sourceConditionedPhysicalShots.every((shot) => {
      const contract = object(shot.source_reinterpretation);
      const mode = text(contract.mode).toUpperCase();
      if (mode === "EXACT_ARCHIVAL") return contract.required === true;
      return contract.required === true && mode === "CINEMATIC_REINTERPRETATION" &&
        text(contract.identity_truth).length >= 20 &&
        text(contract.production_value_transformation).length >= 24 &&
        text(contract.vfx_cgi_integration).length >= 24 &&
        text(contract.consumer_ai_failure_test).length >= 24 &&
        contract.source_frame_is_not_final_frame === true;
    }),
    sound_picture_authored: shots.length > 0 && shots.every((shot) => text(shot.audio?.mix_intent).length >= 12 && list(shot.audio?.sync_events).length > 0),
    coverage_contrast_architecture: text(coverage.contrast_architecture).length >= 20,
    coverage_material_world: text(coverage.material_world).length >= 20,
    coverage_vfx_philosophy: text(coverage.vfx_philosophy).length >= 20,
    coverage_sound_picture_causality: text(coverage.sound_picture_causality).length >= 20,
  };
  const entries = Object.entries(checks);
  const passed = entries.filter(([, value]) => value).length;
  return {
    assessed: scenes.length > 0,
    passed: entries.length > 0 && passed === entries.length,
    score: Math.round((passed / entries.length) * 100),
    checks,
    failures: entries.filter(([, value]) => !value).map(([name]) => name),
  };
}

export function evaluateEliteFilmProductionBenchmark({ plan = null } = {}) {
  const roleIds = new Set(CREATIVE_AGENCY_ROLES.map((role) => role.id));
  const missing = [];
  for (const [family, roles] of Object.entries(DEPARTMENT_FAMILIES)) {
    for (const role of roles) if (!roleIds.has(role)) missing.push(`${family}:${role}`);
  }
  const departmentCoveragePassed = missing.length === 0;
  const execution = executionChecks(object(plan));
  const finalScore = Math.round((departmentCoveragePassed ? 35 : 0) + (execution.score * 0.65));
  return Object.freeze({
    contract: ELITE_FILM_PRODUCTION_BENCHMARK_CONTRACT,
    passed: departmentCoveragePassed && execution.assessed && execution.passed,
    score: finalScore,
    department_coverage_passed: departmentCoveragePassed,
    department_coverage_score: departmentCoveragePassed ? 100 : 0,
    creative_execution_assessed: execution.assessed,
    creative_execution_passed: execution.passed,
    creative_execution_score: execution.score,
    creative_execution_checks: execution.checks,
    creative_execution_failures: execution.failures,
    department_families: DEPARTMENT_FAMILIES,
    missing_roles: missing,
    benchmark_mode: "DEPARTMENT_COVERAGE_PLUS_OBSERVABLE_CREATIVE_EXECUTION",
  });
}

export const CreativeEliteFilmProductionBenchmarkRuntime = Object.freeze({
  contract: ELITE_FILM_PRODUCTION_BENCHMARK_CONTRACT,
  department_families: DEPARTMENT_FAMILIES,
  evaluate: evaluateEliteFilmProductionBenchmark,
});
