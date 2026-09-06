import {
  CreativeCameraGrammarRuntime,
} from "@/lib/creative/director/runtime/CreativeCameraGrammarRuntime";

const CONTRACT = "AVANTIQO_AERIAL_CINEMATOGRAPHY_V1";

const FPV_TOKEN = /\b(?:fpv|first[- ]person)\b/i;
const ORBIT_TOKEN = /\b(?:orbit|arc|circle|spiral)\b/i;
const TRACK_TOKEN = /\b(?:track|tracking|follow|chase|lead)\b/i;
const REVEAL_TOKEN = /\b(?:reveal|rise|riser|ascend|lift|emerge|from behind|over the)\b/i;
const ROLL_TOKEN = /\b(?:roll|bank|barrel|tilt(?:ed)? horizon)\b/i;
const SELF_VISIBLE_TOKEN = /\b(?:show|visible|include|see|reveal)\b.{0,40}\b(?:drone|camera vehicle|propeller|rotor|shadow|reflection)\b/i;
const AERIAL_MOVE_TOKEN = /\b(?:flyover|fly-over|push|pull|track|tracking|follow|orbit|arc|circle|spiral|rise|riser|ascend|descend|dive|swoop|crane|reveal|fpv|drone|aerial)\b/gi;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 1800) {
  return String(value ?? "").trim().slice(0, limit);
}

function firstObject(...values) {
  for (const value of values) {
    const candidate = object(value);
    if (Object.keys(candidate).length) return candidate;
  }
  return {};
}

function firstValue(...values) {
  return values.find((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }) ?? null;
}

function substantive(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length >= 4;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function sourceAerial(input = {}) {
  const requirements = object(input.requirements);
  const intent = object(input.intent);
  const generation = object(input.generation);
  const metadata = object(input.metadata);

  return firstObject(
    input.aerial_cinematography,
    input.aerial,
    requirements.aerial_cinematography,
    requirements.aerial,
    intent.aerial_cinematography,
    intent.aerial,
    generation.aerial_cinematography,
    generation.aerial,
    metadata.aerial_cinematography,
    metadata.aerial,
  );
}

function issue(code, field, message, severity = "blocking", evidence = null) {
  return {
    code,
    field,
    message,
    severity,
    evidence,
  };
}

function namedFlightOperations(value) {
  const matches = text(value, 2400).match(AERIAL_MOVE_TOKEN) || [];
  return [...new Set(matches.map((item) => item.toLowerCase()))];
}

function normalizedMode(source = {}, camera = {}) {
  const explicit = text(source.mode || source.flight_mode, 180).toUpperCase();
  if (explicit === "FPV" || explicit === "STABILIZED_AERIAL") return explicit;
  return FPV_TOKEN.test([
    source.flight_path,
    source.mode,
    camera.movement_path,
  ].map((value) => text(value, 1200)).join(" "))
    ? "FPV"
    : "STABILIZED_AERIAL";
}

function altitudeProfile(source = {}, camera = {}) {
  const explicit = firstValue(
    source.altitude_profile,
    source.altitude_relationship,
    source.height_profile,
  );
  if (explicit) return explicit;

  const distance = text(camera.camera_distance, 700);
  const angle = text(camera.angle, 700);
  if (!distance && !angle) return null;
  return [
    "Preserve the scene-scale altitude relationship implied by the canonical camera direction; do not invent an arbitrary altitude jump.",
    distance ? `camera distance: ${distance}` : null,
    angle ? `camera angle: ${angle}` : null,
  ].filter(Boolean).join(" ");
}

function yawBehavior(source = {}, coverage = {}) {
  const explicit = firstValue(source.yaw_behavior, source.heading_behavior);
  if (explicit) return explicit;
  const direction = firstValue(
    coverage.screen_direction,
    coverage.entry_exit_direction,
    coverage.axis_relationship,
  );
  return direction
    ? `Preserve the established screen/heading relationship while yawing only as required by the flight path: ${text(direction, 1000)}`
    : null;
}

function gimbalBehavior(source = {}, camera = {}) {
  const explicit = firstValue(source.gimbal_behavior, source.look_direction);
  if (explicit) return explicit;
  const target = firstValue(camera.focus_target, source.point_of_interest);
  const transition = firstValue(camera.focus_transition, source.focus_transition);
  if (!target) return null;
  return [
    `Keep the optical look direction intentionally related to ${text(target, 900)} rather than allowing free camera drift.`,
    transition ? `Focus/look transition: ${text(transition, 900)}` : null,
  ].filter(Boolean).join(" ");
}

function horizonBehavior(source = {}, mode = "STABILIZED_AERIAL") {
  const explicit = firstValue(source.horizon_behavior, source.horizon_policy);
  if (explicit) return explicit;
  return mode === "FPV"
    ? "Preserve a readable horizon; banking or roll is permitted only when the canonical flight path explicitly earns it, and must settle before the closing composition unless the closing frame requires the bank."
    : "Keep the horizon level and stabilized. No unmotivated roll, banking or horizon wobble is allowed in stabilized aerial mode.";
}

function subjectTracking(source = {}, camera = {}, coverage = {}) {
  return firstValue(
    source.subject_tracking,
    source.tracking_target,
    source.subject_relationship,
    camera.focus_target,
    coverage.eyeline,
    coverage.coverage_role,
  );
}

function pointOfInterest(source = {}, camera = {}) {
  return firstValue(
    source.point_of_interest,
    source.orbit_target,
    source.tracking_target,
    camera.focus_target,
  );
}

function parallaxIntent(source = {}, coverage = {}, framePlan = {}) {
  return firstValue(
    source.parallax_intent,
    source.depth_reveal,
    coverage.reveal_hierarchy,
    coverage.shot_to_shot_contrast,
    framePlan.progression,
  );
}

function foregroundReveal(source = {}, coverage = {}, framePlan = {}) {
  return firstValue(
    source.foreground_reveal,
    source.reveal_geometry,
    coverage.reveal_hierarchy,
    framePlan.progression,
  );
}

function terrainRelationship(source = {}, camera = {}) {
  const explicit = firstValue(
    source.terrain_relationship,
    source.environment_relationship,
  );
  if (explicit) return explicit;
  const angle = text(camera.angle, 700);
  const distance = text(camera.camera_distance, 700);
  if (!angle && !distance) return null;
  return `Preserve believable scale and separation from terrain/architecture under the canonical ${angle || "camera angle"} and ${distance || "camera distance"}; do not clip, tunnel through, or distort scene geometry.`;
}

function selfVisibilityPolicy(source = {}) {
  return firstValue(
    source.self_visibility_policy,
    source.camera_vehicle_visibility,
  ) ||
    "Exclude the camera vehicle, drone body, propellers/rotors, drone shadow and unintended vehicle reflections unless the canonical shot explicitly makes the camera vehicle diegetic.";
}

function entryMotion(input = {}, source = {}, coverage = {}) {
  return firstValue(
    source.entry_motion,
    input.transition_in,
    coverage.edit_relationship,
    coverage.entry_exit_direction,
  );
}

function exitMotion(input = {}, source = {}, coverage = {}) {
  return firstValue(
    source.exit_motion,
    input.transition_out,
    coverage.edit_relationship,
    coverage.entry_exit_direction,
  );
}

function executionOrder(contract = {}) {
  return [
    {
      stage: "FLIGHT_GEOMETRY",
      flight_path: contract.flight_path,
      start_position: contract.start_position,
      end_position: contract.end_position,
      altitude_profile: contract.altitude_profile,
      terrain_relationship: contract.terrain_relationship,
      clearance_strategy: contract.clearance_strategy,
    },
    {
      stage: "HEADING_YAW",
      yaw_behavior: contract.yaw_behavior,
      horizon_behavior: contract.horizon_behavior,
    },
    {
      stage: "GIMBAL_LOOK",
      gimbal_behavior: contract.gimbal_behavior,
      point_of_interest: contract.point_of_interest,
      subject_tracking: contract.subject_tracking,
    },
    {
      stage: "SPEED_EASING",
      speed_profile: contract.speed_profile,
      settling_behavior: contract.settling_behavior,
    },
    {
      stage: "PARALLAX_REVEAL",
      parallax_intent: contract.parallax_intent,
      foreground_reveal: contract.foreground_reveal,
    },
    {
      stage: "EDIT_CONTINUITY",
      entry_motion: contract.entry_motion,
      exit_motion: contract.exit_motion,
      edit_relationship: contract.edit_relationship,
    },
  ];
}

function validateRequired(contract = {}, issues = []) {
  const required = [
    ["flight_path", "AERIAL_FLIGHT_PATH_REQUIRED"],
    ["start_position", "AERIAL_START_POSITION_REQUIRED"],
    ["end_position", "AERIAL_END_POSITION_REQUIRED"],
    ["altitude_profile", "AERIAL_ALTITUDE_PROFILE_REQUIRED"],
    ["speed_profile", "AERIAL_SPEED_PROFILE_REQUIRED"],
    ["yaw_behavior", "AERIAL_YAW_BEHAVIOR_REQUIRED"],
    ["gimbal_behavior", "AERIAL_GIMBAL_BEHAVIOR_REQUIRED"],
    ["horizon_behavior", "AERIAL_HORIZON_BEHAVIOR_REQUIRED"],
    ["subject_tracking", "AERIAL_SUBJECT_RELATIONSHIP_REQUIRED"],
    ["movement_motivation", "AERIAL_MOVEMENT_MOTIVATION_REQUIRED"],
    ["terrain_relationship", "AERIAL_TERRAIN_RELATIONSHIP_REQUIRED"],
    ["clearance_strategy", "AERIAL_CLEARANCE_STRATEGY_REQUIRED"],
    ["self_visibility_policy", "AERIAL_SELF_VISIBILITY_POLICY_REQUIRED"],
  ];

  for (const [field, code] of required) {
    if (substantive(contract[field])) continue;
    issues.push(issue(
      code,
      `aerial_cinematography.${field}`,
      `World-class aerial cinematography requires ${field} before provider execution.`,
    ));
  }
}

function validateFlightSemantics(contract = {}, source = {}, issues = [], warnings = []) {
  const flight = [
    contract.flight_path,
    contract.mode,
    contract.yaw_behavior,
    contract.horizon_behavior,
  ].map((value) => text(value, 1600)).join(" ");

  if (ORBIT_TOKEN.test(flight) && !substantive(contract.point_of_interest)) {
    issues.push(issue(
      "AERIAL_POINT_OF_INTEREST_REQUIRED",
      "aerial_cinematography.point_of_interest",
      "An aerial orbit/arc/circle must name the point of interest that anchors the flight geometry.",
    ));
  }

  if (TRACK_TOKEN.test(flight) && !substantive(contract.subject_tracking)) {
    issues.push(issue(
      "AERIAL_TRACKING_TARGET_REQUIRED",
      "aerial_cinematography.subject_tracking",
      "A tracking/follow/chase aerial move must define the subject relationship it tracks.",
    ));
  }

  if (
    REVEAL_TOKEN.test(flight) &&
    !substantive(contract.foreground_reveal) &&
    !substantive(contract.parallax_intent)
  ) {
    issues.push(issue(
      "AERIAL_REVEAL_GEOMETRY_REQUIRED",
      "aerial_cinematography.foreground_reveal",
      "An aerial reveal must define the occlusion/parallax geometry and what becomes visible at the reveal endpoint.",
    ));
  }

  const intentionalRoll = source.intentional_roll === true ||
    source.intentional_bank === true ||
    source.diegetic_bank === true;
  if (
    contract.mode === "STABILIZED_AERIAL" &&
    ROLL_TOKEN.test(flight) &&
    !intentionalRoll
  ) {
    issues.push(issue(
      "AERIAL_HORIZON_ROLL_CONTRADICTION",
      "aerial_cinematography.horizon_behavior",
      "Stabilized aerial cinematography may not roll or bank the horizon unless the canonical direction explicitly marks that roll as intentional.",
      "blocking",
      flight,
    ));
  }

  const policy = text(contract.self_visibility_policy, 1800);
  if (
    SELF_VISIBLE_TOKEN.test(policy) &&
    source.diegetic_camera_visible !== true
  ) {
    issues.push(issue(
      "AERIAL_CAMERA_SELF_VISIBILITY_FORBIDDEN",
      "aerial_cinematography.self_visibility_policy",
      "The camera vehicle, drone, propellers, rotor shadow or reflection may be visible only when the canonical shot explicitly makes the camera vehicle diegetic.",
      "blocking",
      policy,
    ));
  }

  const operations = namedFlightOperations(contract.flight_path);
  if (operations.length > 2) {
    warnings.push(issue(
      "AERIAL_COMPOUND_FLIGHT_OVERLOADED",
      "aerial_cinematography.flight_path",
      "The aerial shot contains more than two named flight operations. Prefer one dominant flight idea unless the compound path is essential to the story beat.",
      "warning",
      operations,
    ));
  }
}

export function compileCreativeAerialCinematography(input = {}) {
  const cameraGrammar = CreativeCameraGrammarRuntime.compile(input);
  if (cameraGrammar.status === "BLOCKED") {
    return {
      contract: CONTRACT,
      status: "BLOCKED",
      reason: "CAMERA_GRAMMAR_BLOCKED",
      camera_grammar_contract: cameraGrammar.contract,
      blocking_issues: [
        issue(
          "AERIAL_CAMERA_GRAMMAR_REQUIRED",
          "camera",
          "Aerial cinematography cannot compile until the canonical camera grammar passes.",
          "blocking",
          cameraGrammar.blocking_issues,
        ),
      ],
      warnings: [],
      execution_contract: null,
      provider_execution_order: [],
    };
  }

  const source = sourceAerial(input);
  const applicable = cameraGrammar.aerial_candidate === true ||
    Object.keys(source).length > 0;
  if (!applicable) {
    return {
      contract: CONTRACT,
      status: "NOT_APPLICABLE",
      reason: "NO_AERIAL_CAMERA_INTENT",
      camera_grammar_contract: cameraGrammar.contract,
      blocking_issues: [],
      warnings: [],
      execution_contract: null,
      provider_execution_order: [],
    };
  }

  const camera = object(cameraGrammar.camera);
  const coverage = object(cameraGrammar.coverage);
  const framePlan = object(cameraGrammar.frame_plan);
  const mode = normalizedMode(source, camera);
  const subject = subjectTracking(source, camera, coverage);
  const point = pointOfInterest(source, camera);
  const executionContract = {
    contract: CONTRACT,
    mode,
    flight_path: firstValue(
      source.flight_path,
      source.vehicle_path,
      camera.movement_path,
    ),
    start_position: firstValue(
      source.start_position,
      source.opening_position,
      framePlan.opening_frame,
      coverage.camera_position,
    ),
    end_position: firstValue(
      source.end_position,
      source.closing_position,
      framePlan.closing_frame,
    ),
    altitude_profile: altitudeProfile(source, camera),
    speed_profile: firstValue(
      source.speed_profile,
      source.speed_easing,
      camera.movement_speed,
    ),
    yaw_behavior: yawBehavior(source, coverage),
    gimbal_behavior: gimbalBehavior(source, camera),
    horizon_behavior: horizonBehavior(source, mode),
    subject_tracking: subject,
    point_of_interest: point,
    parallax_intent: parallaxIntent(source, coverage, framePlan),
    foreground_reveal: foregroundReveal(source, coverage, framePlan),
    clearance_strategy: firstValue(
      source.clearance_strategy,
      source.obstacle_clearance,
    ) ||
      "Preserve believable clearance from terrain, architecture, people and foreground objects. The virtual camera may not clip, tunnel through, intersect or phase through scene geometry.",
    terrain_relationship: terrainRelationship(source, camera),
    entry_motion: entryMotion(input, source, coverage),
    exit_motion: exitMotion(input, source, coverage),
    settling_behavior: firstValue(
      source.settling_behavior,
      source.end_behavior,
    ) ||
      "Settle exactly on the canonical closing composition with no post-endpoint drift, wobble or unmotivated overshoot.",
    self_visibility_policy: selfVisibilityPolicy(source),
    movement_motivation: firstValue(
      source.movement_motivation,
      camera.movement_motivation,
    ),
    edit_relationship: firstValue(
      source.edit_relationship,
      coverage.edit_relationship,
    ),
    diegetic_camera_visible: source.diegetic_camera_visible === true,
    intentional_roll: source.intentional_roll === true ||
      source.intentional_bank === true ||
      source.diegetic_bank === true,
    provider_neutral: true,
    provider_prompt_persisted: false,
  };

  const issues = [];
  const warnings = [];
  validateRequired(executionContract, issues);
  validateFlightSemantics(executionContract, source, issues, warnings);
  const operations = namedFlightOperations(executionContract.flight_path);
  const providerExecutionOrder = executionOrder(executionContract);
  const blocking = issues.filter((item) => item.severity === "blocking");

  return {
    contract: CONTRACT,
    status: blocking.length ? "BLOCKED" : "READY",
    mode,
    camera_grammar_contract: cameraGrammar.contract,
    camera_grammar_status: cameraGrammar.status,
    execution_contract: executionContract,
    named_flight_operations: operations,
    compound_move_count: operations.length,
    provider_execution_order: providerExecutionOrder,
    blocking_issues: blocking,
    warnings,
  };
}

export function assertCreativeAerialCinematography(input = {}) {
  const compiled = compileCreativeAerialCinematography(input);
  if (compiled.status === "BLOCKED") {
    const codes = compiled.blocking_issues.map((item) => item.code).join(",");
    throw new Error(`CREATIVE_AERIAL_CINEMATOGRAPHY_BLOCKED:${codes}`);
  }
  return compiled;
}

export const CreativeAerialCinematographyRuntime = Object.freeze({
  compile: compileCreativeAerialCinematography,
  assertReady: assertCreativeAerialCinematography,
  contract: CONTRACT,
  modes: Object.freeze(["STABILIZED_AERIAL", "FPV"]),
  provider_neutral: true,
});
