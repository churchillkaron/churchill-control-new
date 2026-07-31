import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.short-form-temporal-planning.v1",
);

function text(value) {
  return String(value ?? "");
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function durationFromPrompt(prompt, label) {
  const pattern = new RegExp(
    `${label}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*seconds?`,
    "i",
  );
  return finite(text(prompt).match(pattern)?.[1]);
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

function governedInput(input = {}) {
  if (
    String(input.category || "").toUpperCase() !== "CREATIVE_DIRECTION" ||
    input.service_id !== "ai.reasoning.execute"
  ) return input;

  const operation = String(input.metadata?.operation || "").toUpperCase();
  const prompt = text(input.input?.prompt);
  let governedPrompt = prompt;
  let contract = null;

  if (operation === "TEMPORAL_SCENE_ARCHITECTURE_V1") {
    const duration = durationFromPrompt(prompt, "MASTER DURATION");
    const range = sceneRange(duration);
    governedPrompt = replaceCount(prompt, "SCENE COUNT", range);
    if (range) {
      contract = {
        contract: "SHORT_FORM_TEMPORAL_SCALE_V1",
        master_duration_seconds: duration,
        scene_count: range,
      };
    }
  }

  if (operation === "TEMPORAL_SCENE_SHOT_DIRECTION_V1") {
    const duration = durationFromPrompt(prompt, "EXACT SHOT DURATION SUM");
    const range = shotRange(duration);
    governedPrompt = replaceCount(prompt, "SHOT COUNT", range);
    if (range) {
      contract = {
        contract: "SHORT_FORM_TEMPORAL_SCALE_V1",
        scene_duration_seconds: duration,
        shot_count: range,
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
