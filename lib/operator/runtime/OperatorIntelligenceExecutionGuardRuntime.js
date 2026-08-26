import { AsyncLocalStorage } from "node:async_hooks";

export const OPERATOR_INTELLIGENCE_EXECUTION_GUARD_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_EXECUTION_GUARD_V1";

const COGNITIVE_BRIEF_MARKER = "AVANTIQO_OWNED_COGNITIVE_BRIEF_V4";
const executionGuardStorage = new AsyncLocalStorage();

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function latestServerCognitiveBrief(conversation = []) {
  const messages = list(conversation);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = object(messages[index]);
    if (text(message.role, 40).toLowerCase() !== "assistant") continue;
    const content = text(message.content, 24000);
    if (!content.startsWith(COGNITIVE_BRIEF_MARKER)) continue;

    const jsonBoundary = content.lastIndexOf("\n{");
    if (jsonBoundary < 0) return null;
    try {
      return object(JSON.parse(content.slice(jsonBoundary + 1)));
    } catch {
      return null;
    }
  }
  return null;
}

export function evaluateOperatorIntelligenceExecutionGuard({
  required = false,
  conversation = [],
} = {}) {
  const briefRequired = required === true;
  const brief = latestServerCognitiveBrief(conversation);
  const briefAvailable = Boolean(brief && Object.keys(brief).length);
  const cognitivePlan = object(brief?.cognitive_plan);
  const governedPlan = object(brief?.governed_plan);
  const planValid = Boolean(
    briefAvailable &&
      brief?.planning_complete === true &&
      brief?.execution_guidance_allowed === true &&
      governedPlan.valid === true &&
      text(cognitivePlan.status, 120) === "PLAN_VALIDATED",
  );

  let reason = null;
  if (briefRequired && !briefAvailable) {
    reason = "COGNITIVE_BRIEF_REQUIRED_UNAVAILABLE";
  } else if (briefRequired && !planValid) {
    reason = "COGNITIVE_PLAN_NOT_VALIDATED";
  }

  return Object.freeze({
    contract: OPERATOR_INTELLIGENCE_EXECUTION_GUARD_CONTRACT,
    required: briefRequired,
    cognitive_brief_available: briefAvailable,
    cognitive_plan_valid: planValid,
    execution_guidance_allowed:
      briefAvailable && brief?.execution_guidance_allowed === true,
    mutating_execution_allowed: !briefRequired || planValid,
    reason,
    read_execution_allowed: true,
    answer_execution_allowed: true,
    navigation_allowed: true,
    memory_authorization_value: "NONE",
  });
}

export function runWithOperatorIntelligenceExecutionGuard(guard, callback) {
  if (typeof callback !== "function") {
    throw new Error("OPERATOR_INTELLIGENCE_EXECUTION_GUARD_CALLBACK_REQUIRED");
  }
  return executionGuardStorage.run(object(guard), callback);
}

export function currentOperatorIntelligenceExecutionGuard() {
  const guard = object(executionGuardStorage.getStore());
  return Object.keys(guard).length ? guard : null;
}

export function operatorIntelligenceMutationBlock(capability) {
  const mode = text(capability?.mode, 80).toLowerCase();
  if (!mode || mode === "read") return null;

  const guard = currentOperatorIntelligenceExecutionGuard();
  if (!guard || guard.required !== true) return null;
  if (
    guard.contract === OPERATOR_INTELLIGENCE_EXECUTION_GUARD_CONTRACT &&
    guard.mutating_execution_allowed === true &&
    guard.cognitive_plan_valid === true &&
    guard.execution_guidance_allowed === true
  ) {
    return null;
  }

  return {
    contract: OPERATOR_INTELLIGENCE_EXECUTION_GUARD_CONTRACT,
    blocked: true,
    reason: text(guard.reason, 160) || "COGNITIVE_PLAN_NOT_VALIDATED",
    capability_key: text(capability?.key, 300) || null,
    capability_mode: mode,
    required: true,
    cognitive_brief_available: guard.cognitive_brief_available === true,
    cognitive_plan_valid: guard.cognitive_plan_valid === true,
    execution_guidance_allowed: guard.execution_guidance_allowed === true,
    mutating_execution_allowed: false,
    authorization_effect: "NONE",
  };
}

export function enforceOperatorIntelligenceMutationGuard(capability) {
  const blocked = operatorIntelligenceMutationBlock(capability);
  if (!blocked) return null;

  const error = new Error(blocked.reason);
  error.code = blocked.reason;
  error.operatorIntelligenceGuard = blocked;
  throw error;
}

export const OperatorIntelligenceExecutionGuardRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_EXECUTION_GUARD_CONTRACT,
  evaluate: evaluateOperatorIntelligenceExecutionGuard,
  run: runWithOperatorIntelligenceExecutionGuard,
  current: currentOperatorIntelligenceExecutionGuard,
  block: operatorIntelligenceMutationBlock,
  enforce: enforceOperatorIntelligenceMutationGuard,
});
