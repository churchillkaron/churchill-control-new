export const OPERATOR_MISSION_BINDING_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_BINDING_V1";

const MAX_BINDINGS_PER_STEP = 12;
const MAX_PATH_DEPTH = 8;
const MAX_STRING_VALUE = 4000;
const PROTECTED_ROOTS = new Set([
  "organizationid",
  "organization_id",
  "entityid",
  "entity_id",
  "periodid",
  "period_id",
  "partyid",
  "party_id",
  "actor",
  "actor_id",
  "permissions",
  "authorization",
  "approval",
  "approval_request_id",
  "capability_key",
  "domain",
  "capability",
  "action",
]);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function pathParts(value) {
  const source = text(value);
  if (!source) return [];
  const parts = source.split(".").map(text).filter(Boolean);
  if (
    !parts.length ||
    parts.length > MAX_PATH_DEPTH ||
    parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    return [];
  }
  return parts;
}

function scalar(value) {
  if (value === null) return true;
  return ["string", "number", "boolean"].includes(typeof value);
}

function boundedScalar(value) {
  if (!scalar(value)) {
    throw new Error("OPERATOR_MISSION_BINDING_SCALAR_REQUIRED");
  }
  if (typeof value === "string" && value.length > MAX_STRING_VALUE) {
    throw new Error("OPERATOR_MISSION_BINDING_STRING_TOO_LONG");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("OPERATOR_MISSION_BINDING_FINITE_NUMBER_REQUIRED");
  }
  return value;
}

function valueAtPath(value, parts) {
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return { found: false, value: null };
    }
    if (!Object.prototype.hasOwnProperty.call(current, part)) {
      return { found: false, value: null };
    }
    current = current[part];
  }
  return { found: true, value: current };
}

function setAtPath(target, parts, value) {
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const existing = current[part];
    if (existing !== undefined && (existing === null || typeof existing !== "object" || Array.isArray(existing))) {
      throw new Error("OPERATOR_MISSION_BINDING_TARGET_COLLISION");
    }
    current[part] = existing || {};
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

function normalizeBinding(binding = {}, targetStepId, priorStepIds) {
  const targetPath = pathParts(binding.target_path || binding.targetPath);
  const sourcePath = pathParts(binding.source_path || binding.sourcePath);
  const sourceStepId = text(binding.source_step_id || binding.sourceStepId);
  const source = text(binding.source || "result").toLowerCase();

  if (!targetPath.length) {
    throw new Error("OPERATOR_MISSION_BINDING_TARGET_PATH_INVALID");
  }
  if (PROTECTED_ROOTS.has(targetPath[0].toLowerCase())) {
    throw new Error("OPERATOR_MISSION_BINDING_PROTECTED_TARGET_BLOCKED");
  }
  if (!sourcePath.length) {
    throw new Error("OPERATOR_MISSION_BINDING_SOURCE_PATH_INVALID");
  }
  if (!sourceStepId || !priorStepIds.has(sourceStepId)) {
    throw new Error("OPERATOR_MISSION_BINDING_PRIOR_STEP_REQUIRED");
  }
  if (!["result", "verification"].includes(source)) {
    throw new Error("OPERATOR_MISSION_BINDING_SOURCE_INVALID");
  }

  return Object.freeze({
    contract: OPERATOR_MISSION_BINDING_CONTRACT,
    target_step_id: targetStepId,
    target_path: targetPath.join("."),
    source_step_id: sourceStepId,
    source,
    source_path: sourcePath.join("."),
    required: binding.required !== false,
  });
}

export function normalizeMissionBindings(steps = []) {
  const priorStepIds = new Set();
  const byStep = new Map();

  for (const step of list(steps)) {
    const stepId = text(step?.id);
    if (!stepId) throw new Error("OPERATOR_MISSION_BINDING_STEP_ID_REQUIRED");
    const requested = list(step?.bindings);
    if (requested.length > MAX_BINDINGS_PER_STEP) {
      throw new Error("OPERATOR_MISSION_BINDING_LIMIT_EXCEEDED");
    }

    const normalized = requested.map((binding) =>
      normalizeBinding(binding, stepId, priorStepIds),
    );
    const targets = new Set();
    for (const binding of normalized) {
      if (targets.has(binding.target_path)) {
        throw new Error("OPERATOR_MISSION_BINDING_DUPLICATE_TARGET");
      }
      targets.add(binding.target_path);
    }
    byStep.set(stepId, normalized);
    priorStepIds.add(stepId);
  }

  return byStep;
}

export function captureMissionBindingValue({
  binding,
  sourceStepMode,
  result = null,
  verification = null,
} = {}) {
  const normalizedBinding = object(binding);
  const mode = text(sourceStepMode).toLowerCase();
  const source = text(normalizedBinding.source).toLowerCase();

  // A mutating step may only export values after its registered verification has
  // succeeded. This prevents an unverified write response from becoming authority
  // for a later action.
  if (mode !== "read" && source !== "verification") {
    throw new Error("OPERATOR_MISSION_BINDING_WRITE_REQUIRES_VERIFICATION_SOURCE");
  }

  const sourceObject = source === "verification" ? verification : result;
  const parts = pathParts(normalizedBinding.source_path);
  const resolved = valueAtPath(sourceObject, parts);
  if (!resolved.found) {
    if (normalizedBinding.required !== false) {
      throw new Error("OPERATOR_MISSION_BINDING_SOURCE_VALUE_REQUIRED");
    }
    return { captured: false, value: null };
  }

  return {
    captured: true,
    value: boundedScalar(resolved.value),
  };
}

export function applyMissionBindings({ payload = {}, bindings = [], values = {} } = {}) {
  const output = structuredClone(object(payload));
  const captured = object(values);

  for (const binding of list(bindings)) {
    const key = `${binding.source_step_id}:${binding.source}:${binding.source_path}`;
    if (!Object.prototype.hasOwnProperty.call(captured, key)) {
      if (binding.required !== false) {
        throw new Error("OPERATOR_MISSION_BINDING_VALUE_NOT_CAPTURED");
      }
      continue;
    }
    const targetPath = pathParts(binding.target_path);
    if (!targetPath.length || PROTECTED_ROOTS.has(targetPath[0].toLowerCase())) {
      throw new Error("OPERATOR_MISSION_BINDING_PROTECTED_TARGET_BLOCKED");
    }
    setAtPath(output, targetPath, boundedScalar(captured[key]));
  }

  return output;
}

export function missionBindingValueKey(binding = {}) {
  return `${text(binding.source_step_id)}:${text(binding.source).toLowerCase()}:${text(binding.source_path)}`;
}

export const OperatorMissionBindingRuntime = Object.freeze({
  contract: OPERATOR_MISSION_BINDING_CONTRACT,
  normalize: normalizeMissionBindings,
  capture: captureMissionBindingValue,
  apply: applyMissionBindings,
  valueKey: missionBindingValueKey,
});

export default OperatorMissionBindingRuntime;
