import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.short-form-temporal-planning.v1",
);

const explicitShotCountByProject = new Map();

function text(value) {
  return String(value ?? "");
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function durationFromPrompt(prompt, label) {
  const pattern = new RegExp(
    `${label}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*seconds?`,
    "i",
  );
  return finite(text(prompt).match(pattern)?.[1]);
}

function jsonNumberFromPrompt(prompt, keys = []) {
  const source = text(prompt);
  for (const key of keys) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*(\\d+)`, "i");
    const value = positiveInteger(source.match(pattern)?.[1]);
    if (value) return value;
  }
  return null;
}

function jsonBooleanFromPrompt(prompt, keys = []) {
  const source = text(prompt);
  for (const key of keys) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*(true|false)`, "i");
    const value = source.match(pattern)?.[1];
    if (value) return value.toLowerCase() === "true";
  }
  return null;
}

function exactRange(count) {
  const value = positiveInteger(count);
  return value
    ? { minimum: value, preferred: value, maximum: value }
    : null;
}

function sceneRange(duration) {
  if (duration !== null && duration <= 15) {
    return { minimum: 3, preferred: 3, maximum: 3 };
  }
  if (duration !== null && duration <= 30) {
    return { minimum: 3, preferred: 4, maximum: 5 };
  }
  return null;
}

function shotRange(duration) {
  if (duration !== null && duration <= 5) {
    return { minimum: 1, preferred: 1, maximum: 2 };
  }
  if (duration !== null && duration <= 10) {
    return { minimum: 1, preferred: 2, maximum: 3 };
  }
  return null;
}

function replaceCount(prompt, label, range) {
  if (!range) return prompt;
  const replacement =
    `${label}: minimum ${range.minimum}, preferred ${range.preferred}, maximum ${range.maximum}`;
  const pattern = new RegExp(
    `${label}\\s*:\\s*minimum\\s+\\d+\\s*,\\s*preferred\\s+\\d+\\s*,\\s*maximum\\s+\\d+`,
    "i",
  );
  return pattern.test(prompt)
    ? prompt.replace(pattern, replacement)
    : `${prompt}\n${replacement}`;
}

function explicitPlanningContract(input = {}, prompt = "") {
  const projectId = text(input.metadata?.creative_project_id).trim();
  const singleContinuous = jsonBooleanFromPrompt(prompt, [
    "single_continuous_shot",
    "singleContinuousShot",
  ]) === true;
  const sceneCount = singleContinuous
    ? 1
    : jsonNumberFromPrompt(prompt, [
        "scene_count",
        "sceneCount",
      ]);
  const shotCount = singleContinuous
    ? 1
    : jsonNumberFromPrompt(prompt, [
        "shot_count",
        "shotCount",
      ]);

  if (projectId) {
    if (shotCount) explicitShotCountByProject.set(projectId, shotCount);
    else if (singleContinuous) explicitShotCountByProject.set(projectId, 1);
    else explicitShotCountByProject.delete(projectId);
  }

  return {
    project_id: projectId || null,
    single_continuous_shot: singleContinuous,
    scene_count: sceneCount,
    shot_count: shotCount,
  };
}

function governedInput(input = {}) {
  if (
    String(input.category || "").toUpperCase() !== "CREATIVE_DIRECTION" ||
    input.service_id !== "ai.reasoning.execute"
  ) return input;

  const operation = String(input.metadata?.operation || "").toUpperCase();
  const prompt = text(input.input?.prompt);
  const projectId = text(input.metadata?.creative_project_id).trim();
  let governedPrompt = prompt;
  let contract = null;

  if (operation === "TEMPORAL_SCENE_ARCHITECTURE_V1") {
    const duration = durationFromPrompt(prompt, "MASTER DURATION");
    const explicit = explicitPlanningContract(input, prompt);
    const range = exactRange(explicit.scene_count) || sceneRange(duration);
    governedPrompt = replaceCount(prompt, "SCENE COUNT", range);
    if (range) {
      contract = {
        contract: "SHORT_FORM_TEMPORAL_SCALE_V2",
        master_duration_seconds: duration,
        scene_count: range,
        explicit_project_constraint: Boolean(explicit.scene_count),
        single_continuous_shot: explicit.single_continuous_shot,
      };
    }
  }

  if (operation === "TEMPORAL_SCENE_SHOT_DIRECTION_V1") {
    const duration = durationFromPrompt(prompt, "EXACT SHOT DURATION SUM");
    const explicitShotCount = projectId
      ? explicitShotCountByProject.get(projectId) || null
      : null;
    const range = exactRange(explicitShotCount) || shotRange(duration);
    governedPrompt = replaceCount(prompt, "SHOT COUNT", range);
    if (range) {
      contract = {
        contract: "SHORT_FORM_TEMPORAL_SCALE_V2",
        scene_duration_seconds: duration,
        shot_count: range,
        explicit_project_constraint: Boolean(explicitShotCount),
        single_continuous_shot: explicitShotCount === 1,
      };
    }
  }

  if (!contract || governedPrompt === prompt) return input;
  return {
    ...input,
    input: {
      ...(input.input || {}),
      prompt: governedPrompt,
    },
    metadata: {
      ...(input.metadata || {}),
      short_form_temporal_scale: contract,
    },
  };
}

export function installCreativeShortFormTemporalPlanningRuntime() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;
  const executeWithoutShortFormScale = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithShortFormScale(input = {}) {
    return executeWithoutShortFormScale(governedInput(input));
  };
}

installCreativeShortFormTemporalPlanningRuntime();

export const CreativeShortFormTemporalPlanningRuntime = {
  installed: true,
  governedInput,
};
