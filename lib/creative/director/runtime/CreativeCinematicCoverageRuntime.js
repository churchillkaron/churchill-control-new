const CAMERA_FIELDS = Object.freeze([
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

const CONTINUITY_FIELDS = Object.freeze([
  "screen_direction",
  "spatial_geography",
]);

const MOTION_TOKEN = /\b(?:pan|tilt|dolly|track|truck|orbit|crane|jib|push|pull|zoom|handheld|steadicam|gimbal|move|travel|arc)\b/i;

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function upper(value) {
  return text(value, 160).toUpperCase();
}

function allQueueTasks(queue = {}) {
  const seen = new Set();
  const result = [];
  for (const key of ["ready", "waiting", "running", "review", "completed", "failed", "blocked"]) {
    for (const task of list(queue?.[key])) {
      const id = text(task?.id || task?.task_id || `${key}:${result.length}`, 180);
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(task);
    }
  }
  return result;
}

function directionOf(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const intent = object(input.intent);
  return {
    camera: object(input.camera || requirements.camera || intent.camera),
    continuity: object(input.continuity || requirements.continuity || intent.continuity),
    coverage: object(input.coverage || requirements.coverage || intent.coverage),
    shot_id: text(task.shot_id || input.shot_id || requirements.shot_id || intent.shot_id, 180) || null,
    scene_id: text(task.scene_id || input.scene_id || requirements.scene_id || intent.scene_id, 180) || null,
  };
}

function missingFields(source, fields) {
  return fields.filter((field) => !text(source[field], 600));
}

function issue({ code, severity = "warning", task, shotId, sceneId, message }) {
  return {
    code,
    severity,
    task_id: text(task?.id || task?.task_id, 180) || null,
    shot_id: shotId || null,
    scene_id: sceneId || null,
    message: text(message, 800),
  };
}

function pushCoverageContradictions(issues, task, direction) {
  const coverage = direction.coverage;
  const camera = direction.camera;
  const shotId = direction.shot_id;
  const sceneId = direction.scene_id;

  if (coverage.axis_break === true && !text(coverage.axis_break_motivation, 800)) {
    issues.push(issue({
      code: "UNMOTIVATED_AXIS_BREAK",
      severity: "blocking",
      task,
      shotId,
      sceneId,
      message:
        "The shot explicitly crosses the established axis but provides no creative or spatial reason and no re-establishing strategy.",
    }));
  }

  if (
    ["CONTRADICTED", "BROKEN", "REVERSED"].includes(
      upper(coverage.screen_direction_status || coverage.screen_direction_transition),
    ) &&
    coverage.intentional_screen_direction_break !== true
  ) {
    issues.push(issue({
      code: "SCREEN_DIRECTION_CONTRADICTION",
      severity: "blocking",
      task,
      shotId,
      sceneId,
      message:
        "Screen direction contradicts the established geography without an explicit intentional break.",
    }));
  }

  if (
    coverage.eyeline_match_required === true &&
    !["MATCHED", "INTENTIONALLY_BROKEN"].includes(upper(coverage.eyeline_match_status))
  ) {
    issues.push(issue({
      code: "EYELINE_MISMATCH",
      severity: "blocking",
      task,
      shotId,
      sceneId,
      message:
        "This shot requires an eyeline match but the coverage contract does not prove a matched or intentionally broken eyeline.",
    }));
  }

  if (["INCOMPATIBLE", "FAIL", "BLOCKED"].includes(upper(coverage.edit_compatibility_status))) {
    issues.push(issue({
      code: "EDIT_INCOMPATIBLE_SHOT",
      severity: "blocking",
      task,
      shotId,
      sceneId,
      message:
        "The shot is explicitly marked incompatible with the intended edit relationship and must be revised before provider dispatch.",
    }));
  }

  if (
    coverage.intentional_stillness === true &&
    MOTION_TOKEN.test(text(camera.movement_path, 1000)) &&
    !/\b(?:no movement|does not move|locked off|static)\b/i.test(text(camera.movement_path, 1000))
  ) {
    issues.push(issue({
      code: "STILLNESS_MOVEMENT_CONTRADICTION",
      severity: "blocking",
      task,
      shotId,
      sceneId,
      message:
        "Coverage declares intentional stillness while camera direction specifies physical movement. Resolve the contradiction rather than silently choosing one.",
    }));
  }
}

function inspectTask(task) {
  const direction = directionOf(task);
  const issues = [];
  const hasCamera = Object.keys(direction.camera).length > 0;
  const hasContinuity = Object.keys(direction.continuity).length > 0;
  const hasCoverage = Object.keys(direction.coverage).length > 0;

  if (hasCamera) {
    const missing = missingFields(direction.camera, CAMERA_FIELDS);
    if (missing.length) {
      issues.push(issue({
        code: "CAMERA_DIRECTION_INCOMPLETE",
        task,
        shotId: direction.shot_id,
        sceneId: direction.scene_id,
        message: `Camera direction is missing: ${missing.join(", ")}.`,
      }));
    }
  }

  if (hasContinuity) {
    const missing = missingFields(direction.continuity, CONTINUITY_FIELDS);
    if (missing.length) {
      issues.push(issue({
        code: "SPATIAL_CONTINUITY_INCOMPLETE",
        task,
        shotId: direction.shot_id,
        sceneId: direction.scene_id,
        message: `Continuity direction is missing: ${missing.join(", ")}.`,
      }));
    }
  }

  if (hasCamera && !hasCoverage) {
    issues.push(issue({
      code: "COVERAGE_GRAMMAR_NOT_EXPLICIT",
      task,
      shotId: direction.shot_id,
      sceneId: direction.scene_id,
      message:
        "This shot has camera craft but no explicit coverage relationship. It can execute, but Pro Studio cannot yet explain why this framing/lens/movement belongs here relative to adjacent shots.",
    }));
  }

  if (hasCoverage) {
    pushCoverageContradictions(issues, task, direction);
  }

  return {
    task_id: text(task?.id || task?.task_id, 180) || null,
    shot_id: direction.shot_id,
    scene_id: direction.scene_id,
    camera_directed: hasCamera,
    continuity_directed: hasContinuity,
    coverage_directed: hasCoverage,
    issues,
  };
}

export const CREATIVE_COVERAGE_PRESENTATION = Object.freeze({
  AUTONOMOUS: Object.freeze({
    mode: "AUTONOMOUS",
    surface: "AI_CREATIVE_STUDIO",
    description:
      "Coverage, lens, movement and continuity are chosen by Creative Intelligence and surfaced as concise directorial reasoning only when the user needs a decision or revision.",
  }),
  PROFESSIONAL: Object.freeze({
    mode: "PROFESSIONAL",
    surface: "PRO_STUDIO",
    description:
      "The same canonical coverage decisions are inspectable and overridable shot by shot, including coverage role, camera, lens, movement, axis, eyeline, screen direction and edit relationship.",
  }),
});

export const CREATIVE_CINEMATIC_COVERAGE_CONTRACT = Object.freeze({
  contract: "AVANTIQO_CINEMATIC_COVERAGE_V1",
  principle:
    "Camera craft is subordinate to story purpose and edit continuity. A technically attractive shot is not acceptable when it breaks spatial geography, screen direction, eyelines, reveal order or the intended shot-to-shot rhythm without an explicit creative reason.",
  film_level: Object.freeze([
    "spatial_map",
    "dominant_axis",
    "intentional_axis_breaks",
    "lens_progression",
    "shot_size_rhythm",
    "movement_rhythm",
    "reveal_hierarchy",
  ]),
  shot_level: Object.freeze([
    "coverage_role",
    "framing",
    "angle",
    "camera_height",
    "camera_position",
    "subject_distance",
    "lens_intent",
    "movement",
    "stabilization",
    "focus_behavior",
    "eyeline",
    "screen_direction",
    "entry_exit_direction",
    "match_action",
    "shot_to_shot_contrast",
    "edit_compatibility",
    "continuity_consequence",
  ]),
  deterministic_guards: Object.freeze([
    "axis breaks require explicit motivation",
    "screen-direction contradictions require explicit intent",
    "required eyeline matches must be matched or intentionally broken",
    "edit-incompatible shots cannot dispatch",
    "intentional stillness cannot simultaneously specify physical camera movement",
  ]),
  presentation: CREATIVE_COVERAGE_PRESENTATION,
});

export function inspectCreativeCoverageQueue(queue = {}) {
  const tasks = allQueueTasks(queue);
  const inspected = tasks.map(inspectTask);
  const issues = inspected.flatMap((item) => item.issues);
  const cameraDirected = inspected.filter((item) => item.camera_directed).length;
  const coverageDirected = inspected.filter((item) => item.coverage_directed).length;
  const continuityDirected = inspected.filter((item) => item.continuity_directed).length;
  const blocking = issues.filter((item) => item.severity === "blocking");

  return {
    contract: CREATIVE_CINEMATIC_COVERAGE_CONTRACT.contract,
    total_tasks: inspected.length,
    camera_directed: cameraDirected,
    continuity_directed: continuityDirected,
    coverage_directed: coverageDirected,
    explicit_coverage_ratio: cameraDirected ? coverageDirected / cameraDirected : 0,
    status:
      blocking.length > 0
        ? "BLOCKED"
        : issues.length > 0
          ? "NEEDS_COVERAGE_ENRICHMENT"
          : inspected.length > 0
            ? "READY"
            : "NO_TASKS",
    issues: issues.slice(0, 40),
    blocking_issues: blocking.length,
    presentation: CREATIVE_COVERAGE_PRESENTATION,
  };
}
