import {
  AvantiqoStructuredIntelligenceSupervisorRuntime,
} from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import { OperatorIntelligencePlanningToolRuntime } from "./OperatorIntelligencePlanningToolRuntime";

const CONTRACT = "AVANTIQO_OPERATOR_REPAIR_SUPERVISION_V3";
const HUMAN_GATES = new Set([
  "CONFIRMATION_REQUIRED",
  "VOICE_CONFIRMATION_REQUIRED",
  "APPROVAL_REQUIRED",
  "APPROVAL_PENDING",
  "APPROVAL_REQUESTED",
  "APPROVAL_REJECTED",
  "INSUFFICIENT_WALLET_BALANCE",
  "OPERATOR_ENTITY_CONTEXT_REQUIRED",
  "ENTITY_CONTEXT_REQUIRED",
  "PERMISSION_REQUIRED",
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

function text(value, limit = 4000) {
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

function failureReason(result = {}) {
  const execution = object(result.execution);
  return text(
    execution.reason ||
      execution.error ||
      execution.result?.reason ||
      execution.result?.error ||
      result.error,
    1200,
  );
}

function executionFailed(result = {}) {
  const status = text(result?.execution?.status, 80).toLowerCase();
  return ["failed", "blocked"].includes(status);
}

function isHumanGate(reason) {
  const normalized = text(reason, 300).toUpperCase();
  if (!normalized) return false;
  if (HUMAN_GATES.has(normalized)) return true;
  return [
    "CONFIRMATION",
    "APPROVAL",
    "PERMISSION",
    "AUTHORIZATION",
    "WALLET",
    "BALANCE",
    "ENTITY_CONTEXT",
  ].some((token) => normalized.includes(token));
}

function boundedExecution(result = {}) {
  const execution = object(result.execution);
  const capability = object(execution.capability);
  const verification = object(execution.post_action_verification);
  return {
    status: text(execution.status, 80) || null,
    reason: failureReason(result) || null,
    capability: {
      key: text(capability.key, 300) || null,
      domain: text(capability.domain, 120) || null,
      capability: text(capability.capability, 120) || null,
      action: text(capability.action, 120) || null,
      mode: text(capability.mode, 80) || null,
    },
    verification: {
      status: text(verification.status, 80) || null,
      reason: text(verification.reason || verification.error, 800) || null,
    },
  };
}

function systemInstructions() {
  return [
    "You are Avantiqo Intelligence supervising a failed or blocked governed Operator attempt.",
    "Diagnose only from the supplied observed execution evidence, durable project context, and any current evidence obtained with operator_live_read.",
    "Use operator_live_read when it can distinguish plausible causes or verify whether the blocker still exists.",
    "If recommending a different registered business action, validate it first with operator_action_candidate. That tool is candidate-only and never executes or persists the action.",
    "Do not claim the issue is fixed. Do not retry or execute writes in this phase.",
    "Never recommend bypassing permissions, confirmation, approval, wallet, entity scope, verification, or other governance.",
    "Prefer the smallest safe repair or replan. If more current evidence is required, say what must be inspected next rather than inventing it.",
    "Return exactly one JSON object with keys: diagnosis, observed_evidence, repairable, proposed_next_step, evidence_needed, retry_policy, needs_human, question.",
    "observed_evidence must contain only facts actually returned by live tools in this phase; otherwise use an empty array.",
    "retry_policy must be one of: no_retry, safe_reinspect_then_retry, replan_required.",
  ].join("\n");
}

export async function superviseOperatorFailure({
  organization_id,
  party_id = null,
  entity_id = null,
  period_id = null,
  actor = {},
  permissions = [],
  caller_request = null,
  result = {},
  message = "",
  project_state = {},
  memories = [],
} = {}) {
  const reason = failureReason(result);
  if (!executionFailed(result) || isHumanGate(reason)) {
    return {
      contract: CONTRACT,
      applicable: false,
      reason: isHumanGate(reason) ? "HUMAN_GOVERNANCE_GATE" : "NO_REPAIRABLE_FAILURE",
      repair: null,
    };
  }

  const payload = {
    user_goal: text(message, 8000),
    execution: boundedExecution(result),
    project_state: object(project_state),
    durable_context: list(memories).slice(0, 10).map((memory) => ({
      type: text(memory?.type, 80) || null,
      subject: text(memory?.subject, 240) || null,
      content: text(memory?.content, 900),
      requires_live_read: memory?.requires_live_read === true,
    })),
  };

  const tools = await OperatorIntelligencePlanningToolRuntime.createTools({
    organizationId: organization_id,
    entityId: entity_id,
    periodId: period_id,
    partyId: party_id,
    actor: object(actor),
    permissions: list(permissions),
    callerRequest: caller_request,
    message: [message, reason, payload.execution?.capability?.key].filter(Boolean).join(" "),
    maxTools: 10,
    maxActions: 8,
  });

  try {
    const supervised = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
      organization_id,
      party_id,
      entity_id,
      system: systemInstructions(),
      messages: [{ role: "user", content: JSON.stringify(payload) }],
      tools,
      authorization: { allow_mutating_tools: false },
      metadata: {
        module: "OPERATOR",
        operation: "FAILURE_REPAIR_SUPERVISION",
        repair_contract: CONTRACT,
        planning_tool_count: tools.length,
        raw_reasoning_persisted: false,
      },
      mode: "deep",
      critique_instructions: [
        "Audit the repair proposal for unsupported diagnosis, unsafe retry behavior, governance bypass, and assumptions not supported by supplied or live-read evidence.",
        "If another registered live read can safely resolve uncertainty, use it. If proposing a different action, validate it with operator_action_candidate.",
        "Correct the JSON without changing its keys. If the cause still cannot be known from evidence, require reinspection instead of guessing.",
      ].join(" "),
      max_output_tokens: 850,
    });

    return {
      contract: CONTRACT,
      applicable: true,
      reason: "TECHNICAL_OR_BUSINESS_FAILURE",
      repair: object(supervised.parsed),
    };
  } catch (error) {
    return {
      contract: CONTRACT,
      applicable: true,
      reason: "REPAIR_SUPERVISOR_UNAVAILABLE",
      repair: null,
      error: text(error?.message || error, 800),
    };
  }
}

export const OperatorRepairSupervisionRuntime = Object.freeze({
  contract: CONTRACT,
  supervise: superviseOperatorFailure,
});
