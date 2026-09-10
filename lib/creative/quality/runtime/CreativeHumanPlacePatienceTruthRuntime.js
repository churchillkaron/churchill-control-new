function text(value) {
  return String(value ?? "").trim();
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function meaningful(value, minimum = 20) {
  return text(value).length >= minimum && !/^(?:cinematic|emotional|authentic|human|beautiful|premium|natural|atmospheric)$/i.test(text(value));
}
function add(failures, condition, code) {
  if (!condition) failures.push(code);
}

export function creativeConceptHumanPlacePatienceFailures(plan = {}) {
  if (plan.temporal_contract?.human_place_patience_required !== true) return [];
  const concept = object(plan.concept);
  const task = object(concept.task_truth);
  const human = object(concept.human_truth);
  const place = object(concept.place_truth);
  const patience = object(concept.patience_strategy);
  const failures = [];
  add(failures, meaningful(task.real_problem, 30), "CONCEPT_REAL_TASK_PROBLEM_REQUIRED");
  add(failures, meaningful(task.human_tension, 30), "CONCEPT_HUMAN_TENSION_REQUIRED");
  add(failures, meaningful(task.brand_reason_to_exist, 30), "CONCEPT_BRAND_REASON_TO_EXIST_REQUIRED");
  add(failures, list(task.evidence_refs).length >= 1, "CONCEPT_TASK_EVIDENCE_REQUIRED");  add(failures, meaningful(human.lived_behavior_or_ritual, 30), "CONCEPT_LIVED_HUMAN_BEHAVIOR_REQUIRED");
  add(failures, meaningful(human.emotional_contradiction, 30), "CONCEPT_EMOTIONAL_CONTRADICTION_REQUIRED");
  add(failures, meaningful(human.why_it_matters, 30), "CONCEPT_HUMAN_MEANING_REQUIRED");
  add(failures, list(human.evidence_refs).length >= 1, "CONCEPT_HUMAN_EVIDENCE_REQUIRED");
  add(failures, meaningful(place.why_here_not_anywhere, 30), "CONCEPT_PLACE_SPECIFICITY_REQUIRED");
  add(failures, list(place.environmental_pressures).length >= 2, "CONCEPT_ENVIRONMENTAL_PRESSURES_REQUIRED");
  add(failures, list(place.cultural_or_working_details).length >= 2, "CONCEPT_PLACE_LIVED_DETAILS_REQUIRED");
  add(failures, list(place.evidence_refs).length >= 1, "CONCEPT_PLACE_EVIDENCE_REQUIRED");
  add(failures, meaningful(patience.what_to_withhold, 25), "CONCEPT_PATIENCE_WITHHOLD_REQUIRED");
  add(failures, meaningful(patience.what_to_let_breathe, 25), "CONCEPT_PATIENCE_BREATHING_SPACE_REQUIRED");
  add(failures, meaningful(patience.exit_trigger, 25), "CONCEPT_PATIENCE_EXIT_TRIGGER_REQUIRED");
  add(failures, meaningful(patience.anti_stasis_rule, 25), "CONCEPT_PATIENCE_ANTI_STASIS_REQUIRED");
  return [...new Set(failures)];
}

export function creativeSceneHumanPlacePatienceFailures(scene = {}) {
  const soul = object(scene.human_place_patience);
  const human = object(soul.human_observation);
  const place = object(soul.place_observation);
  const patience = object(soul.patience_design);
  const failures = [];
  if (human.required === true) {
    add(failures, meaningful(human.observed_behavior, 25), "SCENE_HUMAN_OBSERVED_BEHAVIOR_REQUIRED");
    add(failures, meaningful(human.micro_detail, 20), "SCENE_HUMAN_MICRO_DETAIL_REQUIRED");    add(failures, meaningful(human.relationship_or_consequence, 25), "SCENE_HUMAN_RELATIONSHIP_OR_CONSEQUENCE_REQUIRED");
    add(failures, meaningful(human.non_performance_rule, 25), "SCENE_HUMAN_NON_PERFORMANCE_RULE_REQUIRED");
  }
  if (place.required === true) {
    add(failures, meaningful(place.sensory_fact, 25), "SCENE_PLACE_SENSORY_FACT_REQUIRED");
    add(failures, meaningful(place.behavioral_effect, 25), "SCENE_PLACE_BEHAVIORAL_EFFECT_REQUIRED");
    add(failures, meaningful(place.material_or_weather_effect, 25), "SCENE_PLACE_MATERIAL_WEATHER_EFFECT_REQUIRED");
    add(failures, meaningful(place.sound_fact, 20), "SCENE_PLACE_SOUND_FACT_REQUIRED");
  }
  if (patience.required === true) {
    add(failures, meaningful(patience.held_question, 20), "SCENE_PATIENCE_HELD_QUESTION_REQUIRED");
    add(failures, meaningful(patience.internal_change, 25), "SCENE_PATIENCE_INTERNAL_CHANGE_REQUIRED");
    add(failures, meaningful(patience.cut_trigger, 20), "SCENE_PATIENCE_CUT_TRIGGER_REQUIRED");
    add(failures, meaningful(patience.visual_evolution, 25), "SCENE_PATIENCE_VISUAL_EVOLUTION_REQUIRED");
  }
  return [...new Set(failures)];
}

export const CreativeHumanPlacePatienceTruthRuntime = Object.freeze({
  contract: "CREATIVE_HUMAN_PLACE_PATIENCE_TRUTH_V1",
  conceptFailures: creativeConceptHumanPlacePatienceFailures,
  sceneFailures: creativeSceneHumanPlacePatienceFailures,
});