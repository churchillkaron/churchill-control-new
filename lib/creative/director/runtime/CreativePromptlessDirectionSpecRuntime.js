import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.promptless-direction-spec.v1",
);

const FORBIDDEN_PROMPT_KEYS = new Set([
  "prompt",
  "provider_prompt",
  "negative_prompt",
  "system_prompt",
  "developer_prompt",
  "user_prompt",
  "generation_prompt",
  "visual_prompt",
  "video_prompt",
  "image_prompt",
  "transport_prompt",
  "prompt_template",
  "prompt_text",
  "prompt_override",
  "original_prompt",
  "additional_prompt",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

function forbiddenPromptKey(value) {
  return FORBIDDEN_PROMPT_KEYS.has(normalizedKey(value));
}

function sanitizeValue(value, evidence, path = "plan") {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeValue(item, evidence, `${path}.${index}`),
    );
  }
  if (!value || typeof value !== "object") return value;

  const sanitized = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenPromptKey(key)) {
      evidence.removed_prompt_field_count += 1;
      evidence.removed_prompt_paths.push(childPath);
      continue;
    }
    sanitized[key] = sanitizeValue(child, evidence, childPath);
  }
  return sanitized;
}

function findForbiddenPromptPaths(value, path = "plan", matches = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findForbiddenPromptPaths(item, `${path}.${index}`, matches),
    );
    return matches;
  }
  if (!value || typeof value !== "object") return matches;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenPromptKey(key)) matches.push(childPath);
    findForbiddenPromptPaths(child, childPath, matches);
  }
  return matches;
}

function movementPath(camera = {}) {
  return text(
    camera.movement_path ||
    camera.movementPath ||
    camera.movement ||
    camera.motion ||
    camera.move,
  );
}

function derivedMovementMotivation(shot = {}, scene = {}) {
  const camera = object(shot.camera);
  const path = movementPath(camera) || "the specified camera path";
  const subject = text(shot.subject) || "the visible subject";
  const action = text(shot.action) || "the visible action";
  const focus = text(camera.focus_target || camera.focusTarget) ||
    text(shot.closing_frame?.description) ||
    text(shot.frame_plan?.closing_frame) ||
    "the resulting changed state";
  const purpose = text(shot.purpose) ||
    text(scene.state_change) ||
    text(scene.objective) ||
    "the intended story change";
  const stationary = /\b(static|locked|fixed|tripod|still|stationary)\b/i
    .test(path);

  if (stationary) {
    return [
      `Keep the camera ${path} so ${subject} and the surrounding evidence remain spatially credible while ${action}.`,
      `The stillness lets the viewer register ${focus} and understand ${purpose}.`,
    ].join(" ");
  }

  return [
    `Use ${path} to follow ${subject} through ${action}, with movement beginning and ending on the action rather than moving decoratively.`,
    `Transfer attention toward ${focus} so the camera makes this story purpose visible: ${purpose}.`,
  ].join(" ");
}

function completeMovementMotivations(plan = {}, evidence = {}) {
  const scenes = list(plan.scenes).map((scene) => ({
    ...object(scene),
    shots: list(scene?.shots).map((shot) => {
      const camera = object(shot?.camera);
      const supplied = text(
        camera.movement_motivation || camera.movementMotivation,
      );
      if (supplied) {
        return {
          ...object(shot),
          camera: {
            ...camera,
            movement_motivation: supplied,
          },
        };
      }

      evidence.completed_movement_motivation_count += 1;
      return {
        ...object(shot),
        camera: {
          ...camera,
          movement_motivation: derivedMovementMotivation(shot, scene),
        },
      };
    }),
  }));

  return {
    ...object(plan),
    scenes,
  };
}

function missingMovementMotivationPaths(plan = {}) {
  const missing = [];
  list(plan.scenes).forEach((scene, sceneIndex) => {
    list(scene?.shots).forEach((shot, shotIndex) => {
      if (!text(shot?.camera?.movement_motivation)) {
        missing.push(
          `plan.scenes.${sceneIndex}.shots.${shotIndex}.camera.movement_motivation`,
        );
      }
    });
  });
  return missing;
}

export function validateCreativePromptlessDirectionSpec(plan = {}) {
  const forbidden = findForbiddenPromptPaths(plan);
  const missingMotivations = missingMovementMotivationPaths(plan);
  return {
    contract: "CREATIVE_PROMPTLESS_DIRECTION_SPEC_V1",
    passed: forbidden.length === 0 && missingMotivations.length === 0,
    forbidden_prompt_field_count: forbidden.length,
    forbidden_prompt_paths: forbidden,
    missing_movement_motivation_count: missingMotivations.length,
    missing_movement_motivation_paths: missingMotivations,
    provider_prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    persisted_provider_prompts_allowed: false,
  };
}

export function assertCreativePromptlessDirectionSpec(plan = {}) {
  const validation = validateCreativePromptlessDirectionSpec(plan);
  if (!validation.passed) {
    const error = new Error(
      [
        "CREATIVE_PROMPTLESS_DIRECTION_SPEC_INVALID",
        `prompt_fields=${validation.forbidden_prompt_field_count}`,
        `movement_motivations=${validation.missing_movement_motivation_count}`,
      ].join(":"),
    );
    error.validation = validation;
    throw error;
  }
  return validation;
}

export function sanitizeCreativePromptlessDirectionSpec(plan = {}) {
  const evidence = {
    contract: "CREATIVE_PROMPTLESS_DIRECTION_SANITIZATION_V1",
    removed_prompt_field_count: 0,
    removed_prompt_paths: [],
    completed_movement_motivation_count: 0,
    prompt_content_reused_as_direction: false,
    movement_motivation_source:
      "EXISTING_SHOT_PURPOSE_ACTION_CAMERA_AND_SCENE_STATE",
    provider_prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
  };

  const withoutPrompts = sanitizeValue(plan, evidence);
  const completed = completeMovementMotivations(withoutPrompts, evidence);
  const sanitized = {
    ...completed,
    metadata: {
      ...object(completed.metadata),
      promptless_direction_spec: {
        ...evidence,
        removed_prompt_paths: evidence.removed_prompt_paths.slice(0, 100),
      },
    },
  };
  const validation = assertCreativePromptlessDirectionSpec(sanitized);

  return {
    plan: sanitized,
    evidence: {
      ...evidence,
      removed_prompt_paths: evidence.removed_prompt_paths.slice(0, 100),
      validation,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;

  const createWithoutPromptlessSpec =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    {
      value: true,
      enumerable: false,
      configurable: false,
    },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithPromptlessDirectionSpec(input = {}) {
      const result = await createWithoutPromptlessSpec(input);
      if (!result?.plan) return result;

      const sanitized = sanitizeCreativePromptlessDirectionSpec(result.plan);
      console.log(
        `CREATIVE_PROMPTLESS_DIRECTION_SANITIZED=${JSON.stringify({
          contract: sanitized.evidence.contract,
          removed_prompt_field_count:
            sanitized.evidence.removed_prompt_field_count,
          completed_movement_motivation_count:
            sanitized.evidence.completed_movement_motivation_count,
          validation_passed: sanitized.evidence.validation.passed,
        })}`,
      );

      return {
        ...result,
        plan: sanitized.plan,
        promptless_direction_spec: sanitized.evidence.validation,
        promptless_direction_sanitization: sanitized.evidence,
      };
    };
}

install();

export const CreativePromptlessDirectionSpecRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_PROMPTLESS_DIRECTION_SPEC_V1",
  sanitize: sanitizeCreativePromptlessDirectionSpec,
  validate: validateCreativePromptlessDirectionSpec,
  assert: assertCreativePromptlessDirectionSpec,
});
