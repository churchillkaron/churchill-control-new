import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

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

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

const EXECUTION_SCOPE_PAYLOAD_KEYS = new Set([
  "organizationId", "organization_id", "entityId", "entity_id",
  "periodId", "period_id", "partyId", "party_id",
]);

function mutationPayloadFingerprint(value = {}) {
  const source = object(value);
  const payload = Object.fromEntries(
    Object.entries(source).filter(([key]) => !EXECUTION_SCOPE_PAYLOAD_KEYS.has(key)),
  );
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(payload)))
    .digest("hex");
}

function normalizedExecutionScope(value = {}) {
  const source = object(value);
  return {
    organization_id: text(source.organization_id || source.organizationId, 160) || null,
    entity_id: text(source.entity_id || source.entityId, 160) || null,
    period_id: text(source.period_id || source.periodId, 160) || null,
    party_id: text(source.party_id || source.partyId, 160) || null,
  };
}

function executionScopeMatches(expected = {}, actual = {}) {
  const left = normalizedExecutionScope(expected);
  const right = normalizedExecutionScope(actual);
  return (
    left.organization_id === right.organization_id &&
    left.entity_id === right.entity_id &&
    left.period_id === right.period_id &&
    left.party_id === right.party_id
  );
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

function validatedMutationBindings(brief = {}) {
  const governedPlan = object(brief?.governed_plan);
  if (governedPlan.valid !== true) return [];

  return list(governedPlan.steps)
    .filter((step) => step?.mutates === true)
    .map((step) => ({
      step_id: text(step?.id, 120) || null,
      capability_key: text(step?.capability_key, 300) || null,
      payload_fingerprint: text(step?.payload_fingerprint, 128) || null,
    }))
    .filter((binding) => binding.capability_key && binding.payload_fingerprint);
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
  const mutationBindings = planValid ? validatedMutationBindings(brief) : [];
  const allowedMutationCapabilityKeys = [...new Set(
    mutationBindings.map((binding) => binding.capability_key),
  )];
  const expectedExecutionScope = normalizedExecutionScope(governedPlan.execution_scope);
  const scopeBound = Boolean(expectedExecutionScope.organization_id);

  let reason = null;
  if (briefRequired && !briefAvailable) {
    reason = "COGNITIVE_BRIEF_REQUIRED_UNAVAILABLE";
  } else if (briefRequired && !planValid) {
    reason = "COGNITIVE_PLAN_NOT_VALIDATED";
  } else if (briefRequired && mutationBindings.length === 0) {
    reason = "COGNITIVE_PLAN_MUTATION_NOT_VALIDATED";
  } else if (briefRequired && !scopeBound) {
    reason = "COGNITIVE_PLAN_EXECUTION_SCOPE_NOT_BOUND";
  }

  return Object.freeze({
    contract: OPERATOR_INTELLIGENCE_EXECUTION_GUARD_CONTRACT,
    required: briefRequired,
    cognitive_brief_available: briefAvailable,
    cognitive_plan_valid: planValid,
    execution_guidance_allowed:
      briefAvailable && brief?.execution_guidance_allowed === true,
    mutating_execution_allowed:
      !briefRequired || (planValid && mutationBindings.length > 0 && scopeBound),
    allowed_mutation_capability_keys: Object.freeze([...allowedMutationCapabilityKeys]),
    allowed_mutation_bindings: Object.freeze(
      mutationBindings.map((binding) => Object.freeze({ ...binding })),
    ),
    expected_execution_scope: Object.freeze({ ...expectedExecutionScope }),
    cognitive_plan_capability_binding_enforced: true,
    cognitive_plan_scope_binding_enforced: true,
    cognitive_plan_payload_binding_enforced: true,
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

export function operatorIntelligenceMutationBlock(capability, execution = {}) {
  const mode = text(capability?.mode, 80).toLowerCase();
  if (!mode || mode === "read") return null;

  const guard = currentOperatorIntelligenceExecutionGuard();
  if (!guard || guard.required !== true) return null;

  const capabilityKey = text(capability?.key, 300);
  const allowedMutationCapabilityKeys = list(guard.allowed_mutation_capability_keys)
    .map((key) => text(key, 300))
    .filter(Boolean);
  const mutationBindings = list(guard.allowed_mutation_bindings).map((binding) => ({
    step_id: text(binding?.step_id, 120) || null,
    capability_key: text(binding?.capability_key, 300) || null,
    payload_fingerprint: text(binding?.payload_fingerprint, 128) || null,
  }));
  const planAndGuidanceValid = Boolean(
    guard.contract === OPERATOR_INTELLIGENCE_EXECUTION_GUARD_CONTRACT &&
      guard.cognitive_plan_valid === true &&
      guard.execution_guidance_allowed === true,
  );
  const exactCapabilityBound = Boolean(
    capabilityKey && allowedMutationCapabilityKeys.includes(capabilityKey),
  );
  const scopeMatched = executionScopeMatches(
    guard.expected_execution_scope,
    execution,
  );
  const actualPayloadFingerprint = mutationPayloadFingerprint(execution?.payload);
  const payloadMatched = mutationBindings.some(
    (binding) =>
      binding.capability_key === capabilityKey &&
      binding.payload_fingerprint === actualPayloadFingerprint,
  );

  if (
    planAndGuidanceValid &&
    guard.mutating_execution_allowed === true &&
    exactCapabilityBound &&
    scopeMatched &&
    payloadMatched
  ) {
    return null;
  }

  let reason = text(guard.reason, 160) || "COGNITIVE_PLAN_NOT_VALIDATED";
  if (planAndGuidanceValid) {
    if (!capabilityKey) {
      reason = "COGNITIVE_PLAN_CAPABILITY_KEY_REQUIRED";
    } else if (!allowedMutationCapabilityKeys.length) {
      reason = "COGNITIVE_PLAN_MUTATION_NOT_VALIDATED";
    } else if (!exactCapabilityBound) {
      reason = "COGNITIVE_PLAN_CAPABILITY_BINDING_MISMATCH";
    } else if (!scopeMatched) {
      reason = "COGNITIVE_PLAN_EXECUTION_SCOPE_BINDING_MISMATCH";
    } else if (!payloadMatched) {
      reason = "COGNITIVE_PLAN_MUTATION_PAYLOAD_BINDING_MISMATCH";
    }
  }

  return {
    contract: OPERATOR_INTELLIGENCE_EXECUTION_GUARD_CONTRACT,
    blocked: true,
    reason,
    capability_key: capabilityKey || null,
    capability_mode: mode,
    required: true,
    cognitive_brief_available: guard.cognitive_brief_available === true,
    cognitive_plan_valid: guard.cognitive_plan_valid === true,
    execution_guidance_allowed: guard.execution_guidance_allowed === true,
    mutating_execution_allowed: false,
    exact_cognitive_plan_capability_binding_required: true,
    exact_cognitive_plan_capability_binding_matched: exactCapabilityBound,
    exact_cognitive_plan_scope_binding_required: true,
    exact_cognitive_plan_scope_binding_matched: scopeMatched,
    exact_cognitive_plan_payload_binding_required: true,
    exact_cognitive_plan_payload_binding_matched: payloadMatched,
    expected_execution_scope: guard.expected_execution_scope || null,
    actual_execution_scope: normalizedExecutionScope(execution),
    authorization_effect: "NONE",
  };
}

export function enforceOperatorIntelligenceMutationGuard(capability, execution = {}) {
  const blocked = operatorIntelligenceMutationBlock(capability, execution);
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