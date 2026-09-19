export const CREATIVE_PURSUIT_SPATIAL_CHOREOGRAPHY_CONTRACT = "CREATIVE_PURSUIT_SPATIAL_CHOREOGRAPHY_V1";

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
  return /hunt|pursu|chase|flee|escape|stalk|track|predator|drone threat|search beam/.test(corpus);
}

function spatialContract(shot = {}) {
  return object(shot.pursuit_spatial_choreography);
}

export function evaluatePursuitSpatialChoreography({ scene = {}, shots = [] } = {}) {
  if (!pursuitLike(scene, shots)) {
    return {
      contract: CREATIVE_PURSUIT_SPATIAL_CHOREOGRAPHY_CONTRACT,
      applicable: false,
      passed: true,
      failures: [],
    };
  }

  const failures = [];
  let prior = null;
  for (let index = 0; index < list(shots).length; index += 1) {
    const shot = shots[index];
    const spatial = spatialContract(shot);
    const required = [
      ["target_position", 12],
      ["threat_position", 12],
      ["camera_position", 12],
      ["line_of_action", 12],
      ["target_heading", 8],
      ["threat_heading", 8],
      ["threat_target_distance", 8],
      ["occlusion_state", 10],
      ["search_or_attack_vector", 12],
      ["entry_exit_logic", 12],
      ["cut_spatial_handoff", 16],
    ];
    for (const [field, minimum] of required) {
      if (text(spatial[field]).length < minimum) {
        failures.push({
          code: "PURSUIT_SPATIAL_FIELD_REQUIRED",
          path: "shots." + index + ".pursuit_spatial_choreography." + field,
          message: "Pursuit choreography requires explicit " + field + " so the cut preserves predator/target/camera geometry.",
        });
      }
    }
    if (!list(spatial.obstacles_and_clearance).length) {
      failures.push({
        code: "PURSUIT_SPATIAL_CLEARANCE_REQUIRED",
        path: "shots." + index + ".pursuit_spatial_choreography.obstacles_and_clearance",
        message: "Pursuit action needs explicit obstacle and clearance constraints.",
      });
    }
    if (spatial.axis_break === true && text(spatial.axis_break_motivation).length < 20) {
      failures.push({
        code: "PURSUIT_AXIS_BREAK_MOTIVATION_REQUIRED",
        path: "shots." + index + ".pursuit_spatial_choreography.axis_break_motivation",
        message: "Intentional line-of-action breaks require an authored disorientation/recovery reason.",
      });
    }

    if (prior) {
      const priorExit = lower(prior.entry_exit_logic);
      const currentEntry = lower(spatial.entry_exit_logic);
      if (priorExit && currentEntry &&
          /exit.*left/.test(priorExit) && /enter.*left/.test(currentEntry) &&
          spatial.axis_break !== true) {
        failures.push({
          code: "PURSUIT_SCREEN_DIRECTION_REVERSAL_RISK",
          path: "shots." + index + ".pursuit_spatial_choreography.entry_exit_logic",
          message: "Subject exits and re-enters on the same side without an authored axis break; spatial pursuit continuity may reverse.",
        });
      }
      if (priorExit && currentEntry &&
          /exit.*right/.test(priorExit) && /enter.*right/.test(currentEntry) &&
          spatial.axis_break !== true) {
        failures.push({
          code: "PURSUIT_SCREEN_DIRECTION_REVERSAL_RISK",
          path: "shots." + index + ".pursuit_spatial_choreography.entry_exit_logic",
          message: "Subject exits and re-enters on the same side without an authored axis break; spatial pursuit continuity may reverse.",
        });
      }
    }
    prior = spatial;
  }

  return {
    contract: CREATIVE_PURSUIT_SPATIAL_CHOREOGRAPHY_CONTRACT,
    applicable: true,
    passed: failures.length === 0,
    failures,
    policy: {
      predator_target_camera_triangle_required: true,
      line_of_action_must_be_legible: true,
      axis_break_requires_motivation_and_recovery: true,
      threat_may_not_teleport_between_cuts: true,
      camera_may_cross_axis_only_when_authored: true,
      obstacles_must_affect_paths_and_visibility: true,
      proximity_change_must_be_causal: true,
    },
  };
}

export const CreativePursuitSpatialChoreographyRuntime = Object.freeze({
  contract: CREATIVE_PURSUIT_SPATIAL_CHOREOGRAPHY_CONTRACT,
  evaluate: evaluatePursuitSpatialChoreography,
});
