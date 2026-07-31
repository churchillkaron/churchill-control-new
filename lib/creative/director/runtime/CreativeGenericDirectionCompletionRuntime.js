import {
  CreativeMasterPlanCompletionRuntimeV2,
} from "./CreativeMasterPlanCompletionRuntimeV2";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.generic-direction-completion.v1",
);

const GENERIC_RULES = Object.freeze([
  ["SCENE_LABEL", /^scene\s+\d+$/i],
  ["SHOT_LABEL", /^shot\s+\d+$/i],
  ["CHOICE_PLACEHOLDER", /choose .* to support/i],
  ["SCENE_SELECTION_PLACEHOLDER", /selected per scene/i],
  ["PREMIUM_PLACEHOLDER", /premium and authentic/i],
  ["PRODUCTION_PLACEHOLDER", /compelling original production/i],
  ["PROFESSIONAL_ADJECTIVE", /professional$/i],
  ["NATURAL_ADJECTIVE", /natural$/i],
  ["SOFT_ADJECTIVE", /soft$/i],
  ["CINEMATIC_ADJECTIVE", /cinematic$/i],
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function genericRule(value) {
  const current = text(value);
  return GENERIC_RULES.find(([, pattern]) => pattern.test(current))?.[0] || null;
}

function readablePath(path = "direction") {
  return text(path)
    .replace(/\[(\d+)\]/g, " $1 ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "direction";
}

function concreteDirection(value, path, rule) {
  const current = text(value);
  const field = readablePath(path);

  if (rule === "SCENE_LABEL") {
    return `${current}: establish one verified context, introduce distinct visual evidence and create a causal state change that motivates the following scene.`;
  }
  if (rule === "SHOT_LABEL") {
    return `${current}: show the exact verified subject completing one readable action with motivated framing, stable continuity and a visibly changed closing state.`;
  }
  if ([
    "CHOICE_PLACEHOLDER",
    "SCENE_SELECTION_PLACEHOLDER",
    "PREMIUM_PLACEHOLDER",
    "PRODUCTION_PLACEHOLDER",
  ].includes(rule)) {
    return `Specify ${field} through the exact verified subject, visible action, environmental evidence, motivated camera and lighting decision, continuity requirement and resulting audience understanding.`;
  }

  return `${current} treatment anchored to the exact verified subject, physical environment, motivated light source, readable action timing, stable spatial continuity and the intended story-state change.`;
}

function sanitize(value, path, repairedPaths) {
  if (typeof value === "string") {
    const rule = genericRule(value);
    if (!rule) return value;
    repairedPaths.push(path || "direction");
    return concreteDirection(value, path, rule);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitize(item, `${path}[${index}]`, repairedPaths));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sanitize(item, path ? `${path}.${key}` : key, repairedPaths),
    ]),
  );
}

function install() {
  if (CreativeMasterPlanCompletionRuntimeV2[INSTALL_FLAG]) return;
  const completeWithoutGenericSanitization =
    CreativeMasterPlanCompletionRuntimeV2.complete.bind(
      CreativeMasterPlanCompletionRuntimeV2,
    );

  Object.defineProperty(CreativeMasterPlanCompletionRuntimeV2, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanCompletionRuntimeV2.complete =
    function completeWithConcreteDirection(input = {}) {
      const completed = completeWithoutGenericSanitization(input);
      const repairedPaths = [];
      const sanitized = sanitize(completed, "", repairedPaths);
      if (!repairedPaths.length) return sanitized;

      const completion = object(sanitized.completion);
      const previousFields = Array.isArray(completion.repaired_fields)
        ? completion.repaired_fields
        : [];
      const repairedFields = unique([
        ...previousFields,
        ...repairedPaths,
      ]);

      sanitized.completion = {
        ...completion,
        contract: completion.contract ||
          "CREATIVE_MASTER_PLAN_COMPLETION_V2",
        generic_direction_completion: true,
        repaired_field_count: repairedFields.length,
        repaired_fields: repairedFields,
      };
      return sanitized;
    };
}

install();

export const CreativeGenericDirectionCompletionRuntime = {
  installed: true,
  sanitize,
};
