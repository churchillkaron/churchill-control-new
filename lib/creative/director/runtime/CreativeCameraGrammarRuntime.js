const CONTRACT = "AVANTIQO_CAMERA_GRAMMAR_V1";

const MOVEMENT_TOKEN = /\b(?:pan|tilt|dolly|track|tracking|truck|orbit|arc|crane|jib|push|pull|zoom|handheld|steadicam|gimbal|pedestal|boom|roll|static|locked[- ]?off|fixed)\b/gi;
const PHYSICAL_MOVEMENT_TOKEN = /\b(?:pan|tilt|dolly|track|tracking|truck|orbit|arc|crane|jib|push|pull|zoom|handheld|steadicam|gimbal|pedestal|boom|roll)\b/i;
const STATIC_TOKEN = /\b(?:static|locked[- ]?off|fixed|motionless|no movement|does not move)\b/i;
const AERIAL_TOKEN = /\b(?:drone|aerial|bird'?s[- ]?eye|overhead flight|flyover|fly-over|fpv|helicopter)\b/i;
const GENERIC_ONLY_TOKEN = /^(?:cinematic|dynamic|dramatic|epic|beautiful|premium|interesting|professional|movie[- ]?like|film[- ]?like|smooth|cool|stylish|creative|powerful|immersive|engaging|camera move(?:ment)?)$/i;
const GRAPHIC_MEDIUM_TOKEN = /\b(?:graphic|motion graphics|typography|text[- ]?only|ui|screen capture|screen recording|interface|diagram|slate|title card)\b/i;

const CAMERA_FIELDS = Object.freeze([
  "platform",
  "platform_motivation",
  "framing",
  "angle",
  "camera_distance",
  "lens_intent",
  "movement_path",
  "movement_speed",
  "stabilization",
  "movement_motivation",
  "focus_target",
  "focus_transition",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 1600) {
  return String(value ?? "").trim().slice(0, limit);
}

function upper(value) {
  return text(value, 180).toUpperCase();
}

function firstObject(...values) {
  for (const value of values) {
    const candidate = object(value);
    if (Object.keys(candidate).length) return candidate;
  }
  return {};
}

function direction(input = {}) {
  const requirements = object(input.requirements);
  const intent = object(input.intent);
  const generation = object(input.generation);
  const metadata = object(input.metadata);

  return {
    camera: firstObject(
      input.camera,
      requirements.camera,
      intent.camera,
      generation.camera,
      metadata.camera,
    ),
    coverage: firstObject(
      input.coverage,
      requirements.coverage,
      intent.coverage,
      generation.coverage,
      metadata.coverage,
    ),
    continuity: firstObject(
      input.continuity,
      requirements.continuity,
      intent.continuity,
      generation.continuity,
      metadata.continuity,
    ),
    frame_plan: firstObject(
      input.frame_plan,
      requirements.frame_plan,
      intent.frame_plan,
      generation.frame_plan,
      metadata.frame_plan,
    ),
    lighting: firstObject(
      input.lighting,
      requirements.lighting,
      intent.lighting,
      generation.lighting,
      metadata.lighting,
    ),
    performance: firstObject(
      input.performance_direction,
      requirements.performance_direction,
      intent.performance_direction,
      generation.performance_direction,
      metadata.performance_direction,
    ),
  };
}

function capability(input = {}) {
  return text(
    input.capability ||
      input.service_id ||
      input.service_code ||
      input.generation?.capability ||
      input.generation?.service,
    220,
  ).toLowerCase();
}

function nodeType(input = {}) {
  return upper(
    input.node_type ||
      input.type ||
      input.metadata?.node_type,
  );
}

function medium(input = {}) {
  return text(
    input.medium ||
      input.requirements?.medium ||
      input.intent?.medium ||
      input.metadata?.medium,
    220,
  );
}

function isVisual(input = {}) {
  const service = capability(input);
  const type = nodeType(input);
  return service.includes("video") ||
    service.includes("image") ||
    /SHOT|KEYFRAME|MOTION_PLATE/.test(type);
}

function isPhysicalCameraApplicable(input = {}, camera = {}) {
  if (Object.keys(camera).length) return true;
  if (!isVisual(input)) return false;
  if (GRAPHIC_MEDIUM_TOKEN.test(medium(input))) return false;
  return /SHOT|KEYFRAME|MOTION_PLATE/.test(nodeType(input));
}

function issue(code, field, message, severity = "blocking", evidence = null) {
  return {
    code,
    field,
    severity,
    message,
    evidence,
  };
}

function missingCameraFields(camera = {}) {
  return CAMERA_FIELDS.filter((field) => !text(camera[field], 1200));
}

function namedMovements(value) {
  const matches = text(value, 2000).match(MOVEMENT_TOKEN) || [];
  return [...new Set(matches.map((item) => item.toLowerCase()))];
}

function validateCoverage(coverage = {}, camera = {}, issues = []) {
  if (coverage.axis_break === true) {
    if (!text(coverage.axis_break_motivation, 1200)) {
      issues.push(issue(
        "CAMERA_AXIS_BREAK_MOTIVATION_REQUIRED",
        "coverage.axis_break_motivation",
        "An intentional axis break requires a concrete story or spatial motivation.",
      ));
    }
    if (!text(coverage.reestablish_strategy, 1200)) {
      issues.push(issue(
        "CAMERA_AXIS_REESTABLISH_REQUIRED",
        "coverage.reestablish_strategy",
        "An intentional axis break requires an explicit re-establish strategy.",
      ));
    }
  }

  const screenStatus = upper(
    coverage.screen_direction_status ||
      coverage.screen_direction_transition,
  );
  if (
    ["CONTRADICTED", "BROKEN", "REVERSED", "INTENTIONALLY_BROKEN"].includes(screenStatus) &&
    coverage.intentional_screen_direction_break !== true
  ) {
    issues.push(issue(
      "CAMERA_SCREEN_DIRECTION_BREAK_UNAUTHORISED",
      "coverage.screen_direction_status",
      "A broken screen direction must be explicitly intentional and motivated.",
      "blocking",
      screenStatus,
    ));
  }

  if (
    coverage.eyeline_match_required === true &&
    !["MATCHED", "INTENTIONALLY_BROKEN"].includes(upper(coverage.eyeline_match_status))
  ) {
    issues.push(issue(
      "CAMERA_EYELINE_MATCH_REQUIRED",
      "coverage.eyeline_match_status",
      "A required eyeline must be matched or explicitly intentionally broken.",
      "blocking",
      coverage.eyeline_match_status || null,
    ));
  }

  const editStatus = upper(coverage.edit_compatibility_status);
  if (editStatus && editStatus !== "COMPATIBLE") {
    issues.push(issue(
      "CAMERA_EDIT_RELATIONSHIP_INCOMPATIBLE",
      "coverage.edit_compatibility_status",
      "The shot cannot execute while its intended edit relationship is incompatible.",
      "blocking",
      editStatus,
    ));
  }

  if (
    coverage.intentional_stillness === true &&
    PHYSICAL_MOVEMENT_TOKEN.test(text(camera.movement_path, 1600)) &&
    !STATIC_TOKEN.test(text(camera.movement_path, 1600))
  ) {
    issues.push(issue(
      "CAMERA_STILLNESS_MOVEMENT_CONTRADICTION",
      "camera.movement_path",
      "Coverage declares intentional stillness while the camera block specifies physical movement.",
      "blocking",
      camera.movement_path || null,
    ));
  }
}

function validateCamera(camera = {}, coverage = {}, issues = [], warnings = []) {
  const missing = missingCameraFields(camera);
  for (const field of missing) {
    issues.push(issue(
      "CAMERA_GRAMMAR_FIELD_REQUIRED",
      `camera.${field}`,
      `World-class camera execution requires camera.${field}.`,
    ));
  }

  const platform = text(camera.platform, 700);
  const platformMotivation = text(camera.platform_motivation, 1200);
  const movement = text(camera.movement_path, 1600);
  const movementSpeed = text(camera.movement_speed, 500);
  const movementMotivation = text(camera.movement_motivation, 1600);
  const movements = namedMovements(movement);

  if (platform && GENERIC_ONLY_TOKEN.test(platform)) {
    issues.push(issue(
      "CAMERA_PLATFORM_VAGUE",
      "camera.platform",
      "Name the physical camera platform or operator mode: tripod/locked head, shoulder, handheld, dolly, slider, Steadicam, gimbal, crane/jib, vehicle mount, cable cam, macro rig, drone/FPV, helicopter/chase platform or another concrete platform.",
      "blocking",
      platform,
    ));
  }

  if (platform && !platformMotivation) {
    issues.push(issue(
      "CAMERA_PLATFORM_MOTIVATION_REQUIRED",
      "camera.platform_motivation",
      "Every physical camera platform must be chosen for story, geography, scale, performance, reveal, intimacy or physical action rather than visual fashion.",
    ));
  }

  if (movement && GENERIC_ONLY_TOKEN.test(movement)) {
    issues.push(issue(
      "CAMERA_MOVEMENT_GRAMMAR_VAGUE",
      "camera.movement_path",
      "Use a concrete cinematography action such as locked-off, dolly, track, pan, tilt, crane or orbit instead of a generic aesthetic adjective.",
      "blocking",
      movement,
    ));
  }

  if (PHYSICAL_MOVEMENT_TOKEN.test(movement) && !movementMotivation) {
    issues.push(issue(
      "CAMERA_MOVEMENT_MOTIVATION_REQUIRED",
      "camera.movement_motivation",
      "Physical camera movement must have an explicit story, action or reveal motivation.",
    ));
  }

  if (STATIC_TOKEN.test(movement) && /\b(?:fast|rapid|whip|aggressive)\b/i.test(movementSpeed)) {
    issues.push(issue(
      "CAMERA_STATIC_SPEED_CONTRADICTION",
      "camera.movement_speed",
      "A locked/static camera cannot also carry a physical movement speed.",
      "blocking",
      movementSpeed,
    ));
  }

  if (movements.length > 2) {
    warnings.push(issue(
      "CAMERA_MOVEMENT_OVERLOADED",
      "camera.movement_path",
      "The shot contains more than two named camera moves. Prefer one dominant move unless the compound movement is essential to the beat.",
      "warning",
      movements,
    ));
  }

  for (const field of ["framing", "angle", "lens_intent"]) {
    const value = text(camera[field], 1000);
    if (value && GENERIC_ONLY_TOKEN.test(value)) {
      issues.push(issue(
        "CAMERA_GRAMMAR_VAGUE",
        `camera.${field}`,
        `${field} must describe a concrete cinematography decision, not only an aesthetic adjective.`,
        "blocking",
        value,
      ));
    }
  }

  validateCoverage(coverage, camera, issues);
}

function executionOrder({ camera = {}, coverage = {}, frame_plan = {} } = {}) {
  return [
    {
      stage: "COMPOSITION",
      platform: camera.platform || null,
      platform_motivation: camera.platform_motivation || null,
      framing: camera.framing || null,
      angle: camera.angle || null,
      camera_distance: camera.camera_distance || null,
    },
    {
      stage: "OPTICS",
      lens_intent: camera.lens_intent || null,
      focus_target: camera.focus_target || null,
      focus_transition: camera.focus_transition || null,
    },
    {
      stage: "MOVEMENT",
      movement_path: camera.movement_path || null,
      movement_speed: camera.movement_speed || null,
      stabilization: camera.stabilization || null,
      movement_motivation: camera.movement_motivation || null,
    },
    {
      stage: "TEMPORAL_REVEAL",
      opening_frame: frame_plan.opening_frame || null,
      progression: frame_plan.progression || null,
      closing_frame: frame_plan.closing_frame || null,
      reveal_hierarchy: coverage.reveal_hierarchy || null,
      edit_relationship: coverage.edit_relationship || null,
    },
    {
      stage: "CONTINUITY",
      axis_relationship: coverage.axis_relationship || null,
      eyeline: coverage.eyeline || null,
      screen_direction: coverage.screen_direction || null,
      entry_exit_direction: coverage.entry_exit_direction || null,
      match_action: coverage.match_action || null,
    },
  ];
}

export function compileCreativeCameraGrammar(input = {}) {
  const resolved = direction(input);
  const camera = resolved.camera;
  const applicable = isPhysicalCameraApplicable(input, camera);

  if (!applicable) {
    return {
      contract: CONTRACT,
      status: "NOT_APPLICABLE",
      reason: "NO_PHYSICAL_CAMERA_CONTRACT_REQUIRED",
      blocking_issues: [],
      warnings: [],
      aerial_candidate: false,
      provider_execution_order: [],
    };
  }

  const issues = [];
  const warnings = [];

  if (!Object.keys(camera).length) {
    issues.push(issue(
      "CAMERA_DIRECTION_REQUIRED",
      "camera",
      "A physical visual shot requires explicit camera direction before provider execution.",
    ));
  } else {
    validateCamera(camera, resolved.coverage, issues, warnings);
  }

  const blocking = issues.filter((item) => item.severity === "blocking");
  return {
    contract: CONTRACT,
    status: blocking.length ? "BLOCKED" : "READY",
    camera,
    coverage: resolved.coverage,
    continuity: resolved.continuity,
    frame_plan: resolved.frame_plan,
    lighting: resolved.lighting,
    performance_direction: resolved.performance,
    named_movements: namedMovements(camera.movement_path),
    aerial_candidate: AERIAL_TOKEN.test([
      camera.framing,
      camera.angle,
      camera.camera_distance,
      camera.movement_path,
      resolved.coverage.coverage_role,
    ].map((value) => text(value, 1000)).join(" ")),
    provider_execution_order: executionOrder(resolved),
    blocking_issues: blocking,
    warnings,
  };
}

export function assertCreativeCameraGrammar(input = {}) {
  const grammar = compileCreativeCameraGrammar(input);
  if (grammar.status === "BLOCKED") {
    const codes = grammar.blocking_issues.map((item) => item.code).join(",");
    throw new Error(`CREATIVE_CAMERA_GRAMMAR_BLOCKED:${codes}`);
  }
  return grammar;
}

export function cameraGrammarExecutionText(grammar = {}) {
  if (grammar.status !== "READY") return "";
  const camera = object(grammar.camera);
  const coverage = object(grammar.coverage);
  return [
    text(camera.platform, 500),
    text(camera.platform_motivation, 700),
    text(camera.framing, 500),
    text(camera.angle, 500),
    text(camera.camera_distance, 500),
    text(camera.lens_intent, 700),
    text(camera.movement_path, 900),
    text(camera.movement_speed, 500),
    text(camera.stabilization, 500),
    text(camera.movement_motivation, 900),
    text(camera.focus_target, 500),
    text(camera.focus_transition, 500),
    text(coverage.coverage_role, 700),
    text(coverage.edit_relationship, 900),
  ].filter(Boolean).join(" | ");
}

export const CreativeCameraGrammarRuntime = Object.freeze({
  compile: compileCreativeCameraGrammar,
  assertReady: assertCreativeCameraGrammar,
  executionText: cameraGrammarExecutionText,
  contract: CONTRACT,
  camera_fields: CAMERA_FIELDS,
});
