export const CREATIVE_PURSUIT_PERFORMANCE_CHOREOGRAPHY_CONTRACT = "CREATIVE_PURSUIT_PERFORMANCE_CHOREOGRAPHY_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value) {
  return String(value ?? "").trim();
}
function lower(value) {
  return text(value).toLowerCase();
}
function pursuitLike(scene = {}, shots = []) {
  const corpus = lower([
    scene.objective, scene.emotion, scene.human_stake,
    ...list(shots).flatMap((shot) => [shot.title, shot.purpose, shot.action]),
  ].map(text).join(" "));
  return /hunt|pursu|chase|flee|escape|stalk|predator|drone threat|search beam/.test(corpus);
}

export function evaluatePursuitPerformanceChoreography({ scene = {}, shots = [] } = {}) {
  if (!pursuitLike(scene, shots)) {
    return {
      contract: CREATIVE_PURSUIT_PERFORMANCE_CHOREOGRAPHY_CONTRACT,
      applicable: false,
      passed: true,
      failures: [],
    };
  }

  const failures = [];
  const emotionalStates = [];
  const fatigueStates = [];

  list(shots).forEach((shot, index) => {
    const performance = object(shot.pursuit_performance_choreography);
    const required = [
      ["fear_state_before", 12],
      ["trigger_or_threat_read", 12],
      ["involuntary_reaction", 12],
      ["decision_and_intent", 12],
      ["body_mechanics", 16],
      ["breath_state", 10],
      ["gaze_and_head_behavior", 12],
      ["contact_or_obstacle_response", 12],
      ["fatigue_state", 10],
      ["fear_state_after", 12],
      ["next_action_impulse", 12],
    ];
    for (const [field, minimum] of required) {
      if (text(performance[field]).length < minimum) {
        failures.push({
          code: "PURSUIT_PERFORMANCE_FIELD_REQUIRED",
          path: "shots." + index + ".pursuit_performance_choreography." + field,
          message: "Pursuit performance requires explicit " + field + " so fear and body mechanics evolve instead of resetting.",
        });
      }
    }
    if (!list(performance.micro_behavior_cues).length) {
      failures.push({
        code: "PURSUIT_PERFORMANCE_MICRO_CUES_REQUIRED",
        path: "shots." + index + ".pursuit_performance_choreography.micro_behavior_cues",
        message: "Add observable micro-behavior cues such as breath interruption, eye flick, jaw tension, hand tremor, shoulder load or recovery.",
      });
    }
    if (!list(performance.physical_carryover).length) {
      failures.push({
        code: "PURSUIT_PERFORMANCE_CARRYOVER_REQUIRED",
        path: "shots." + index + ".pursuit_performance_choreography.physical_carryover",
        message: "State what body/wardrobe/dirt/fatigue consequences must persist into the next shot.",
      });
    }
    emotionalStates.push(lower(performance.fear_state_after));
    fatigueStates.push(lower(performance.fatigue_state));
  });

  if (emotionalStates.length >= 3 && new Set(emotionalStates.filter(Boolean)).size < 2) {
    failures.push({
      code: "PURSUIT_PERFORMANCE_EMOTION_FLAT",
      path: "shots",
      message: "Fear state remains materially unchanged across the pursuit; performance needs escalation, interruption, false relief or recovery.",
    });
  }
  if (fatigueStates.length >= 3 && new Set(fatigueStates.filter(Boolean)).size < 2) {
    failures.push({
      code: "PURSUIT_PERFORMANCE_FATIGUE_FLAT",
      path: "shots",
      message: "Fatigue/body load remains unchanged across sustained pursuit; physical effort must accumulate or deliberately recover.",
    });
  }

  return {
    contract: CREATIVE_PURSUIT_PERFORMANCE_CHOREOGRAPHY_CONTRACT,
    applicable: true,
    passed: failures.length === 0,
    failures,
    policy: {
      fear_must_be_observable_not_adjectival: true,
      reaction_must_precede_deliberate_action: true,
      body_mechanics_must_follow_obstacle_and_terrain: true,
      fatigue_must_accumulate_causally: true,
      breath_must_track_exertion_and_shock: true,
      gaze_must_follow_threat_information: true,
      stumble_duck_contact_must_change_next_body_state: true,
      physical_consequences_must_survive_cuts: true,
      generic_running_loop_forbidden: true,
      repeated_stock_fear_face_forbidden: true,
    },
  };
}

export const CreativePursuitPerformanceChoreographyRuntime = Object.freeze({
  contract: CREATIVE_PURSUIT_PERFORMANCE_CHOREOGRAPHY_CONTRACT,
  evaluate: evaluatePursuitPerformanceChoreography,
});
