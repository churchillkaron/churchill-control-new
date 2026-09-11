import {
  AvantiqoStructuredIntelligenceSupervisorRuntime,
} from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import { OperatorIntelligencePlanningToolRuntime } from "./OperatorIntelligencePlanningToolRuntime";
import { assessOperatorRepairLiveReadEvidence } from "./OperatorRepairLiveReadEvidenceRuntime.js";
import { resolveBusinessPartnerDiagnosis } from "./BusinessPartnerDiagnosisResolutionPolicy.mjs";
import {
  classifyOperatorFailureRecovery,
  evaluateOperatorRepairSupervision,
  operatorRepairFailureReason,
} from "./OperatorRepairSupervisionPolicy";

const CONTRACT = "AVANTIQO_OPERATOR_REPAIR_SUPERVISION_V4";

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

function boundedExecution(result = {}) {
  const execution = object(result.execution);
  const capability = object(execution.capability);
  const verification = object(execution.post_action_verification);
  return {
    status: text(execution.status, 80) || null,
    reason: operatorRepairFailureReason(result) || null,
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
    "You are Avantiqo Intelligence supervising a failed, blocked, or independently unverified governed Operator attempt.",
    "Diagnose only from the supplied observed execution evidence, durable project context, deterministic recovery classification, and any current evidence obtained with operator_live_read.",
    "Respect recovery_classification as a routing guard: HUMAN_GATE requires the human/governance path; DATA_OR_CLARIFICATION asks only for missing truth; CONFIGURATION_OR_EXTERNAL resolves configuration/dependency state; TRANSIENT_RUNTIME may be safely reinspected/retried; DIAGNOSIS_REQUIRED must gather current read-only evidence before choosing a recovery class; PRODUCT_DEFECT_CANDIDATE may recommend governed Product Engineering after evidence supports a real Avantiqo defect.",
    "A completed write whose post-action verification failed is not a successful completed business outcome. Never replay the write merely because verification failed.",
    "For post-action verification failures, prefer re-reading or repairing the verification path before considering any new mutation.",
    "Use operator_live_read when it can distinguish plausible causes or verify whether the blocker still exists.",
    "For PRODUCT_DEFECT_CANDIDATE, perform at least one successful operator_live_read against current business/server truth before setting repairable=true. If current evidence cannot still support the defect, set repairable=false and require reinspection instead of escalating to Code.",
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
  const eligibility = evaluateOperatorRepairSupervision(result);
  const recoveryClassification = classifyOperatorFailureRecovery(result);
  const reason = eligibility.failure_reason || "";

  if (!eligibility.applicable) {
    return {
      contract: CONTRACT,
      applicable: false,
      reason: eligibility.reason,
      repair: null,
      execution_failed: eligibility.execution_failed === true,
      verification_failed: eligibility.verification_failed === true,
      recovery_classification: recoveryClassification.classification,
      code_engineering_candidate: recoveryClassification.code_engineering_candidate === true,
    };
  }

  const payload = {
    user_goal: text(message, 8000),
    supervision_reason: eligibility.reason,
    recovery_classification: recoveryClassification.classification,
    code_engineering_candidate: recoveryClassification.code_engineering_candidate === true,
    execution: boundedExecution(result),
    project_state: object(project_state),
    durable_context: list(memories).slice(0, 10).map((memory) => ({
      type: text(memory?.type, 80) || null,
      subject: text(memory?.subject, 240) || null,
      content: text(memory?.content, 900),
      requires_live_read: memory?.requires_live_read === true,
    })),
  };

  const serverLiveReadReceipts = [];
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
    onReadReceipt: (receipt) => {
      if (receipt && typeof receipt === "object") serverLiveReadReceipts.push(receipt);
    },
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
        supervision_reason: eligibility.reason,
        recovery_classification: recoveryClassification.classification,
        code_engineering_candidate:
          recoveryClassification.code_engineering_candidate === true,
        execution_failed: eligibility.execution_failed === true,
        verification_failed: eligibility.verification_failed === true,
        planning_tool_count: tools.length,
        raw_reasoning_persisted: false,
      },
      mode: "deep",
      critique_instructions: [
        "Audit the repair proposal for unsupported diagnosis, unsafe retry behavior, governance bypass, accidental write replay, and assumptions not supported by supplied or live-read evidence.",
        "If the action completed but independent verification failed, do not recommend replaying the mutation unless fresh evidence proves the action itself did not occur and normal authorization still permits a new action.",
        "If another registered live read can safely resolve uncertainty, use it. If proposing a different action, validate it with operator_action_candidate.",
        "Correct the JSON without changing its keys. If the cause still cannot be known from evidence, require reinspection instead of guessing.",
      ].join(" "),
      max_output_tokens: 850,
    });

    const liveReadEvidence = assessOperatorRepairLiveReadEvidence(
      supervised,
      result,
      serverLiveReadReceipts,
      { organization_id, entity_id, period_id, party_id },
    );
    const parsedRepair = object(supervised.parsed);
    const diagnosisResolution = resolveBusinessPartnerDiagnosis({
      initial_classification: recoveryClassification.classification,
      repair: parsedRepair,
      relevant_live_read_evidence_observed: liveReadEvidence.relevant_observed,
      exact_business_identity_evidence_matched: liveReadEvidence.identity_matched,
    });
    const resolvedRecoveryClassification =
      diagnosisResolution.status === "RESOLVED"
        ? diagnosisResolution.resolved_classification
        : recoveryClassification.classification;
    const currentDefectEvidenceConfirmed =
      resolvedRecoveryClassification === "PRODUCT_DEFECT_CANDIDATE" &&
      (recoveryClassification.code_engineering_candidate === true || diagnosisResolution.code_engineering_candidate === true) &&
      liveReadEvidence.relevant_observed &&
      liveReadEvidence.identity_matched &&
      parsedRepair.repairable === true;
    return {
      contract: CONTRACT,
      applicable: true,
      reason: eligibility.reason,
      execution_failed: eligibility.execution_failed === true,
      verification_failed: eligibility.verification_failed === true,
      recovery_classification: resolvedRecoveryClassification,
      initial_recovery_classification: recoveryClassification.classification,
      diagnosis_resolution: diagnosisResolution,
      code_engineering_candidate: currentDefectEvidenceConfirmed,
      current_defect_evidence_confirmed: currentDefectEvidenceConfirmed,
      live_read_evidence_observed: liveReadEvidence.observed,
      relevant_live_read_evidence_observed: liveReadEvidence.relevant_observed,
      exact_business_identity_evidence_required: liveReadEvidence.identity_required,
      exact_business_identity_evidence_matched: liveReadEvidence.identity_matched,
      successful_live_read_count: liveReadEvidence.successful_call_count,
      relevant_successful_live_read_count: liveReadEvidence.relevant_successful_call_count,
      failed_capability_surface: liveReadEvidence.failed_capability_surface,
      verification_capability_key: liveReadEvidence.verification_capability_key,
      repair: parsedRepair,
    };
  } catch (error) {
    console.error("OPERATOR_REPAIR_SUPERVISOR_FAILED", {
      contract: CONTRACT,
      supervision_reason: eligibility.reason,
      recovery_classification: recoveryClassification.classification,
      code_engineering_candidate:
        recoveryClassification.code_engineering_candidate === true,
      internal_error: text(error?.message || error, 800),
      raw_error_returned_to_user: false,
      mutation_executed: false,
    });

    return {
      contract: CONTRACT,
      applicable: true,
      reason: "REPAIR_SUPERVISOR_UNAVAILABLE",
      execution_failed: eligibility.execution_failed === true,
      verification_failed: eligibility.verification_failed === true,
      recovery_classification: recoveryClassification.classification,
      code_engineering_candidate: recoveryClassification.code_engineering_candidate === true,
      repair: null,
      retry_policy: "safe_reinspect_then_retry",
      raw_error_exposed: false,
    };
  }
}

export const OperatorRepairSupervisionRuntime = Object.freeze({
  contract: CONTRACT,
  supervise: superviseOperatorFailure,
});
