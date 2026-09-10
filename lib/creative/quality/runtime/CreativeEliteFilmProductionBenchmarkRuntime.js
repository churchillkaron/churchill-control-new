import { CREATIVE_AGENCY_ROLES } from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";

export const ELITE_FILM_PRODUCTION_BENCHMARK_CONTRACT =
  "CREATIVE_ELITE_FILM_PRODUCTION_BENCHMARK_V1";

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
  editorial: Object.freeze([
    "editor", "post_production_supervisor",
  ]),
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
export function evaluateEliteFilmProductionBenchmark() {
  const roleIds = new Set(CREATIVE_AGENCY_ROLES.map((role) => role.id));
  const missing = [];
  for (const [family, roles] of Object.entries(DEPARTMENT_FAMILIES)) {
    for (const role of roles) {
      if (!roleIds.has(role)) missing.push(`${family}:${role}`);
    }
  }
  return Object.freeze({
    contract: ELITE_FILM_PRODUCTION_BENCHMARK_CONTRACT,
    passed: missing.length === 0,
    score: missing.length ? 0 : 100,
    department_families: DEPARTMENT_FAMILIES,
    missing_roles: missing,
    benchmark_mode: "ABSTRACT_PRODUCTION_DEPARTMENT_COVERAGE_NOT_CAMPAIGN_COPYING",
  });
}

export const CreativeEliteFilmProductionBenchmarkRuntime = Object.freeze({
  contract: ELITE_FILM_PRODUCTION_BENCHMARK_CONTRACT,
  department_families: DEPARTMENT_FAMILIES,
  evaluate: evaluateEliteFilmProductionBenchmark,
});
