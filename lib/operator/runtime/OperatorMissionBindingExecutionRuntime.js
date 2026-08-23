import { AsyncLocalStorage } from "node:async_hooks";

import { loadCapability } from "@/lib/ubte/runtime/loaders/CapabilityLoader";
import {
  OPERATOR_MISSION_BINDING_CONTRACT,
  applyMissionBindings,
  captureMissionBindingValue,
  missionBindingValueKey,
  normalizeMissionBindings,
} from "./OperatorMissionBindingRuntime";

export const OPERATOR_MISSION_BINDING_EXECUTION_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_BINDING_EXECUTION_V1";

const MISSION_KEY = "platform.operator_mission.execute";
const VALID_MODES = new Set(["read", "draft", "write", "approve"]);
const storage = new AsyncLocalStorage();

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function parseCapabilityKey(value) {
  const parts = text(value).split(".");
  if (parts.length !== 3 || parts.some((part) => !text(part))) return null;
  return { domain: parts[0], capability: parts[1], action: parts[2] };
}

function operatorMode(manifest = {}, target = {}) {
  const explicit = text(manifest.operatorMode || manifest.operator_mode).toLowerCase();
  if (VALID_MODES.has(explicit)) return explicit;
  const key = `${target.capability || ""}.${target.action || ""}`.toLowerCase();
  if (/^(get|list|read|find|search|view|summarize|analyse|analyze|report)/.test(key)) {
    return "read";
  }
  if (/(approve|post|close|delete|archive|pay|release|refund|reversal|lock|reopen)/.test(key)) {
    return "approve";
  }
  return "write";
}

function pathParts(value) {
  return text(value).split(".").map(text).filter(Boolean);
}

function deleteAtPath(target, path) {
  const parts = pathParts(path);
  if (!parts.length) return;
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    current = current[parts[index]];
  }
  if (current && typeof current === "object" && !Array.isArray(current)) {
    delete current[parts.at(-1)];
  }
}

function replaceObject(target, next) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
}

function bindingList(byStep) {
  const output = [];
  for (const bindings of byStep.values()) output.push(...bindings);
  return output;
}

function publicBinding(binding) {
  return {
    source_step_id: binding.source_step_id,
    source: binding.source,
    source_path: binding.source_path,
    target_path: binding.target_path,
    required: binding.required !== false,
  };
}

async function resolveStepModes(steps) {
  const modes = {};
  for (const step of steps) {
    const target = parseCapabilityKey(step.capability_key);
    if (!target) throw new Error("OPERATOR_MISSION_BINDING_CAPABILITY_KEY_INVALID");
    const loaded = await loadCapability(target);
    modes[step.id] = operatorMode(loaded.manifest || {}, target);
  }
  return modes;
}

function trustedResumeState({ payload, context, bindings }) {
  if (context?.metadata?.operatorMissionResume !== true) {
    return { values: {} };
  }

  const resume = object(payload.resume);
  const state = object(resume.binding_state);
  if (!Object.keys(state).length) return { values: {} };
  if (text(state.contract) !== OPERATOR_MISSION_BINDING_EXECUTION_CONTRACT) {
    throw new Error("OPERATOR_MISSION_BINDING_RESUME_CONTRACT_INVALID");
  }

  const allowed = new Set(bindings.map(missionBindingValueKey));
  const values = object(state.values);
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) {
      throw new Error("OPERATOR_MISSION_BINDING_RESUME_VALUE_INVALID");
    }
  }

  const completed = new Set(list(resume.completed_step_ids).map(text).filter(Boolean));
  for (const binding of bindings) {
    if (
      binding.required !== false &&
      completed.has(binding.source_step_id) &&
      !Object.prototype.hasOwnProperty.call(values, missionBindingValueKey(binding))
    ) {
      throw new Error("OPERATOR_MISSION_BINDING_RESUME_VALUE_REQUIRED");
    }
  }

  return { values: structuredClone(values) };
}

function validateSourceContracts({ bindings, stepById, sourceModes }) {
  for (const binding of bindings) {
    const sourceMode = text(sourceModes[binding.source_step_id]).toLowerCase();
    const sourceStep = stepById.get(binding.source_step_id);
    if (!VALID_MODES.has(sourceMode) || !sourceStep) {
      throw new Error("OPERATOR_MISSION_BINDING_SOURCE_STEP_INVALID");
    }
    if (sourceMode === "read" && binding.source !== "result") {
      throw new Error("OPERATOR_MISSION_BINDING_READ_REQUIRES_RESULT_SOURCE");
    }
    if (sourceMode !== "read" && binding.source !== "verification") {
      throw new Error("OPERATOR_MISSION_BINDING_WRITE_REQUIRES_VERIFICATION_SOURCE");
    }
    if (
      sourceMode !== "read" &&
      !text(sourceStep?.verify_after?.capability_key)
    ) {
      throw new Error("OPERATOR_MISSION_BINDING_WRITE_VERIFICATION_REQUIRED");
    }
  }
}

function refreshTarget(session, targetStepId) {
  const step = session.stepById.get(targetStepId);
  const bindings = session.bindingsByStep.get(targetStepId) || [];
  if (!step || !bindings.length) return;

  const applicable = bindings.filter((binding) =>
    Object.prototype.hasOwnProperty.call(
      session.values,
      missionBindingValueKey(binding),
    ) || binding.required === false,
  );
  if (!applicable.length) return;

  const next = applyMissionBindings({
    payload: step.payload,
    bindings: applicable,
    values: session.values,
  });
  replaceObject(step.payload, next);
}

function captureForSource(session, { stepId, source, result }) {
  const sourceMode = text(session.sourceModes[stepId]).toLowerCase();
  const touchedTargets = new Set();

  for (const binding of session.bindings) {
    if (binding.source_step_id !== stepId || binding.source !== source) continue;
    const captured = captureMissionBindingValue({
      binding,
      sourceStepMode: sourceMode,
      result: source === "result" ? result : null,
      verification: source === "verification" ? result : null,
    });
    if (!captured.captured) continue;
    const key = missionBindingValueKey(binding);
    session.values[key] = captured.value;
    session.evidence.push({
      key,
      source_step_id: binding.source_step_id,
      source: binding.source,
      source_path: binding.source_path,
      target_step_id: binding.target_step_id,
      target_path: binding.target_path,
      captured_at: new Date().toISOString(),
    });
    touchedTargets.add(binding.target_step_id);
  }

  for (const targetStepId of touchedTargets) refreshTarget(session, targetStepId);
}

export function hasMissionBindings(payload = {}) {
  return list(payload.steps).some((step) => list(step?.bindings).length > 0);
}

export async function prepareMissionBindingExecution({ payload = {}, context = {} } = {}) {
  const steps = list(payload.steps).map((rawStep, index) => {
    const step = object(rawStep);
    return {
      ...step,
      id: text(step.id) || `step_${index + 1}`,
      payload: structuredClone(object(step.payload)),
      bindings: list(step.bindings).map((binding) => ({ ...object(binding) })),
    };
  });
  const bindingsByStep = normalizeMissionBindings(steps);
  const bindings = bindingList(bindingsByStep);
  const executionSteps = steps.map(({ bindings: _bindings, ...step }) => step);
  const stepById = new Map(executionSteps.map((step) => [step.id, step]));
  const sourceModes = await resolveStepModes(executionSteps);

  validateSourceContracts({ bindings, stepById, sourceModes });

  for (const binding of bindings) {
    const target = stepById.get(binding.target_step_id);
    if (target) deleteAtPath(target.payload, binding.target_path);
  }

  const resume = trustedResumeState({ payload, context, bindings });
  const session = {
    contract: OPERATOR_MISSION_BINDING_EXECUTION_CONTRACT,
    bindingsByStep,
    bindings,
    stepById,
    sourceModes,
    values: resume.values,
    evidence: [],
  };

  for (const step of executionSteps) refreshTarget(session, step.id);

  return {
    session,
    payload: {
      ...object(payload),
      steps: executionSteps,
    },
  };
}

export async function runMissionBindingExecution(prepared, callback) {
  if (!prepared?.session || typeof callback !== "function") {
    throw new Error("OPERATOR_MISSION_BINDING_EXECUTION_CONTEXT_REQUIRED");
  }
  return storage.run(prepared.session, callback);
}

export async function observeOperatorMissionBindingResult({
  metadata = {},
  mode = null,
  result = null,
} = {}) {
  const session = storage.getStore();
  if (!session) return;

  const current = object(metadata);
  const parent = text(current.parentCapabilityKey);
  const source = text(current.source);
  const stepId = text(current.missionStepId);
  if (parent !== MISSION_KEY || !stepId) return;

  const expectedMode = text(session.sourceModes[stepId]).toLowerCase();
  if (
    expectedMode &&
    text(mode).toLowerCase() !== expectedMode &&
    source !== "AVANTIQO_OPERATOR_MISSION_VERIFY"
  ) {
    throw new Error("OPERATOR_MISSION_BINDING_SOURCE_MODE_MISMATCH");
  }

  if (source === "AVANTIQO_OPERATOR_MISSION" && expectedMode === "read") {
    captureForSource(session, { stepId, source: "result", result });
  } else if (source === "AVANTIQO_OPERATOR_MISSION_VERIFY" && expectedMode !== "read") {
    captureForSource(session, { stepId, source: "verification", result });
  }
}

export function attachMissionBindingState(result = {}, prepared = {}) {
  const session = prepared.session;
  if (!session) return result;

  const state = {
    contract: OPERATOR_MISSION_BINDING_EXECUTION_CONTRACT,
    binding_contract: OPERATOR_MISSION_BINDING_CONTRACT,
    declared_count: session.bindings.length,
    captured_count: Object.keys(session.values).length,
    values: structuredClone(session.values),
    evidence: session.evidence.map((item) => ({ ...item })),
  };

  const output = {
    ...object(result),
    binding_state: state,
  };

  const resumePayload = object(result?.resume_payload);
  if (Object.keys(resumePayload).length) {
    output.resume_payload = {
      ...resumePayload,
      steps: list(resumePayload.steps).map((step) => {
        const original = session.stepById.get(text(step?.id));
        const bindings = original ? session.bindingsByStep.get(original.id) || [] : [];
        return {
          ...object(step),
          ...(bindings.length ? { bindings: bindings.map(publicBinding) } : {}),
        };
      }),
      resume: {
        ...object(resumePayload.resume),
        binding_state: state,
      },
    };
  }

  return output;
}

export const OperatorMissionBindingExecutionRuntime = Object.freeze({
  contract: OPERATOR_MISSION_BINDING_EXECUTION_CONTRACT,
  hasBindings: hasMissionBindings,
  prepare: prepareMissionBindingExecution,
  run: runMissionBindingExecution,
  observe: observeOperatorMissionBindingResult,
  attach: attachMissionBindingState,
});

export default OperatorMissionBindingExecutionRuntime;
