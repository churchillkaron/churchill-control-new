import {
  creativeConceptHumanPlacePatienceFailures,
} from "../../quality/runtime/CreativeHumanPlacePatienceTruthRuntime.js";
import { evaluateBenchmarkLab } from "../../director/runtime/CreativeBenchmarkLabRuntime.js";

export const CREATIVE_FRONT_PRODUCTION_ROOMS_CONTRACT =
  "CREATIVE_FRONT_PRODUCTION_ROOMS_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}

export function evaluateCreativeFloor({ plan = {}, reference_strategy = {}, benchmark_lab = {}, taste_learning = {} } = {}) {
  const failures = creativeConceptHumanPlacePatienceFailures(plan);
  const benchmarkLab = evaluateBenchmarkLab({ plan, benchmark_lab });
  if (benchmarkLab.passed !== true) failures.push(...benchmarkLab.failures.map((failure) => `BENCHMARK_LAB:${failure}`));
  if (text(plan.story?.hook).length < 20) failures.push("CREATIVE_FLOOR_STORY_HOOK_REQUIRED");
  if (text(plan.story?.emotional_arc).length < 20) failures.push("CREATIVE_FLOOR_EMOTIONAL_ARC_REQUIRED");
  if (!list(plan.anti_cliche_rules).length) failures.push("CREATIVE_FLOOR_ANTI_CLICHE_RULES_REQUIRED");
  if (!Object.keys(reference_strategy || {}).length) failures.push("CREATIVE_FLOOR_REFERENCE_STRATEGY_REQUIRED");
  if (taste_learning.authority && String(taste_learning.authority).toUpperCase() !== "ADVISORY_ONLY") {
    failures.push("CREATIVE_FLOOR_TASTE_LEARNING_MUST_BE_ADVISORY_ONLY");
  }
  return Object.freeze({
    contract: CREATIVE_FRONT_PRODUCTION_ROOMS_CONTRACT,
    room: "CREATIVE_FLOOR",
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    benchmark_lab: benchmarkLab,
  });
}

export function evaluateConceptCompetition({ council = {} } = {}) {
  const failures = [];
  if (council.contract !== "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1") {
    failures.push("CONCEPT_COMPETITION_COUNCIL_CONTRACT_REQUIRED");
  }
  if (list(council.concepts).length < 3) failures.push("CONCEPT_COMPETITION_THREE_CONCEPTS_REQUIRED");
  if (list(council.critic_reports).length < 5) failures.push("CONCEPT_COMPETITION_FIVE_CRITICS_REQUIRED");
  if (council.distinctness?.passed !== true) failures.push("CONCEPT_COMPETITION_DISTINCTNESS_REQUIRED");
  const selected = council.selection?.selected_concept;
  if (!selected || !text(selected.id)) failures.push("CONCEPT_COMPETITION_SELECTION_REQUIRED");
  if (selected && !list(council.concepts).some((concept) => text(concept.id) === text(selected.id))) {
    failures.push("CONCEPT_COMPETITION_SELECTION_MUST_BE_EXISTING_CONCEPT");
  }
  const criticIds = list(council.critic_reports).map((report) => text(report.id || report.critic_id || report.role).toLowerCase());
  if (!criticIds.some((id) => id.includes("human_place") || id.includes("human place") || id.includes("patience"))) {
    failures.push("CONCEPT_COMPETITION_HUMAN_PLACE_PATIENCE_CRITIC_REQUIRED");
  }
  return Object.freeze({
    contract: CREATIVE_FRONT_PRODUCTION_ROOMS_CONTRACT,
    room: "CONCEPT_COMPETITION",
    passed: failures.length === 0,
    failures: [...new Set(failures)],
  });
}

export const CreativeFrontProductionRoomsRuntime = Object.freeze({
  contract: CREATIVE_FRONT_PRODUCTION_ROOMS_CONTRACT,
  evaluateCreativeFloor,
  evaluateConceptCompetition,
});
