import { runOperatorTurn as runGovernedOperatorTurn } from "./OperatorTurnRuntimeGoverned.js";
import { needsOwnedCognitiveBrief } from "./OperatorOwnedCognitiveBriefPolicy.js";
import { shouldUseOwnedFastFirst } from "./OperatorFastFirstPolicy.js";
import { listOperatorCapabilities } from "./OperatorCapabilityCatalog.js";
import { classifyPendingOperatorReply } from "./OperatorHumanDecisionClassifier.js";
import {
  buildAvantiqoSelfEngineeringMessage,
  isAvantiqoSelfEngineeringRequest,
  resolveAvantiqoSelfEngineeringCapabilityKey,
} from "./OperatorSelfEngineeringPolicy.js";
import {
  evaluateOperatorIntelligenceExecutionGuard,
  runWithOperatorIntelligenceExecutionGuard,
} from "./OperatorIntelligenceExecutionGuardRuntime.js";
import {
  operatorPublicError,
  shouldSanitizeOperatorRuntimeError,
} from "./OperatorPublicErrorPolicy.js";
import { resolveOperatorInstantGreeting } from "./OperatorInstantGreetingPolicy.js";
import { runFastConversationTurn } from "./OperatorFastConversationRuntime.js";
import { runOperatorReadOnlyCodeInspectionTurn } from "./OperatorReadOnlyCodeInspectionTurnRuntime.js";
import { semanticClarificationTurn } from "./OperatorSemanticClarificationRuntime.js";
import {
  executionMemoryVerificationState,
} from "./IntelligenceExecutionMemoryPolicy.js";
import {
  operatorRecommendationFromAgreementState,
  operatorRecommendationMatchesPendingExecution,
} from "@/lib/operator/contracts/OperatorRecommendationState";
import {
  agreementWithAutonomousRun,
  autonomousRunFromAgreementState,
  transitionOperatorAutonomousRun,
} from "@/lib/operator/contracts/OperatorAutonomousRun";
import {
  findCodeAICustomerArtifact,
  renderCodeAICustomerArtifactText,
} from "../../code/runtime/CodeAICustomerArtifactRuntime.js";
import {
  withOperatorCodeExecutionEvidence,
} from "./OperatorCodeExecutionEvidenceRuntime.js";
import {
  deterministicBusinessEffectProof as deterministicBusinessEffectProofRuntime,
} from "./OperatorDeterministicBusinessEffectRuntime.js";
import {
  buildBusinessPartnerRecoveryReplayBinding,
} from "./BusinessPartnerRecoveryReplayBinding.js";
import {
  assessOperatorIntelligenceDecisionValidity,
} from "./OperatorIntelligenceDecisionValidityRuntime.js";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import {
  operatorRecommendationEvidenceFingerprint,
} from "./OperatorRecommendationEvidenceFingerprintRuntime.js";
import {
  settleOperatorRecommendationOutcomeLearning,
} from "./OperatorRecommendationOutcomeLearningRuntime.js";

const OWNED_DEEP_FAST_DEGRADATION_CONTRACT =
  "AVANTIQO_OPERATOR_OWNED_DEEP_FAST_DEGRADATION_V1";
const VERIFIED_MUTATION_OUTCOME_CONTRACT =
  "AVANTIQO_OPERATOR_VERIFIED_MUTATION_OUTCOME_V3";
const OWNED_DEEP_UNAVAILABLE_PATTERN =
  /No priced executable provider available for ai\.reasoning\.execute/i;
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const INTERNALLY_VERIFIED_RECOMMENDATION_CAPABILITIES = new Set([
  "platform.product_engineering_cycle.execute",
]);
function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function safeFailureCode(error) {
  const explicit = text(error?.code, 120).toUpperCase();
  if (/^[A-Z][A-Z0-9_.:-]{1,119}$/.test(explicit)) return explicit;
  const messagePrefix = text(error?.message, 160).toUpperCase().match(/^([A-Z][A-Z0-9_.:-]{2,119})(?::|\s|$)/)?.[1];
  if (messagePrefix) return messagePrefix;
  const candidate = text(error?.name, 120).toUpperCase();
  return /^[A-Z][A-Z0-9_.:-]{1,119}$/.test(candidate) ? candidate : "RUNTIME_FAILURE";
}

function delegatedFailureTurn(options, error) {
  const statusCode = Number(error?.status || error?.statusCode || 0);
  const safeStatus = Number.isFinite(statusCode) && statusCode >= 400 && statusCode <= 599
    ? statusCode
    : null;
  const errorCode = safeFailureCode(error);
  const failedCapability = object(error?.operatorCapability);
  const failedPayload = object(error?.operatorExecutionPayload);
  const recoveryState = Object.keys(failedCapability).length
    ? {
        contract: "AVANTIQO_BUSINESS_PARTNER_RECOVERY_STATE_V1",
        status: "FAILED_ACTION_CAPTURED",
        original_goal: text(options.message, 4000) || null,
        capability: failedCapability,
        payload: failedPayload,
        replay_binding: buildBusinessPartnerRecoveryReplayBinding({
          organizationId: options.organizationId,
          entityId: options.entityId,
          periodId: options.periodId,
          partyId: options.partyId,
          capabilityKey: failedCapability.key,
          payload: failedPayload,
        }),
        authorization_effect: "SAME_ACTION_ONLY",
        code_engineering_authorized: false,
        resume_authorized: false,
      }
    : null;
  const agreementState = recoveryState
    ? { ...object(options.agreementState), business_partner_recovery: recoveryState }
    : object(options.agreementState);
  console.error("OPERATOR_DELEGATED_EXECUTION_FAILED", {
    error_code: errorCode,
    status_code: safeStatus,
    internal_error: text(error?.message || error, 1200),
    raw_error_returned_to_user: false,
    original_goal_preserved: true,
    capability_key: text(failedCapability.key, 300) || null,
  });
  return {
    success: true,
    decision: {
      response_text: "I hit a problem while carrying out that business action. I kept your original goal intact and moved the failure into Avantiqo's recovery path instead of treating the job as finished.",
      response_language: text(options.locale, 80) || null,
      intent: "answer",
      confidence: 1,
      agreement_state: object(options.agreementState),
      project_state: object(options.projectState),
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: "OPERATOR_DELEGATED_EXECUTION_FAILED" },
      plan: [],
    },
    agreement_state: agreementState,
    provider_evidence: null,
    navigation: null,
    execution: {
      status: "failed",
      reason: "OPERATOR_DELEGATED_EXECUTION_FAILED",
      capability: Object.keys(failedCapability).length ? failedCapability : null,
      failure_evidence: {
        contract: "AVANTIQO_OPERATOR_DELEGATED_FAILURE_EVIDENCE_V1",
        capability_key: text(failedCapability.key, 300) || null,
        error_code: errorCode,
        error_class: text(error?.constructor?.name, 120) || null,
        status_code: safeStatus,
        raw_error_exposed: false,
        original_goal: text(options.message, 4000) || null,
        exact_action_bound: Boolean(recoveryState),
      },
    },
    operator_catalog: { delegated_failure_captured: true, recovery_supervision_required: true },
  };
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizePermission(value) {
  return text(value, 300).toLowerCase();
}

function permissionMatches(granted, required) {
  const actual = normalizePermission(granted);
  const needed = normalizePermission(required);
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) return needed.startsWith(actual.slice(0, -1));
  return false;
}

function canUseCapability(capability, permissions = [], role = null) {
  if (FULL_ACCESS_ROLES.has(text(role, 120).toUpperCase())) return true;
  const required = Array.isArray(capability?.permissions)
    ? capability.permissions.filter(Boolean)
    : [];
  if (!required.length) return capability?.mode === "read";
  return required.every((permission) =>
    permissions.some((granted) => permissionMatches(granted, permission)),
  );
}

function deterministicBusinessEffectProof(execution = {}) {
  return deterministicBusinessEffectProofRuntime(execution);
}

function withDeterministicVerificationReceipt(result, proof) {
  const source = object(result);
  const execution = object(source.execution);
  const verification = object(execution.post_action_verification);
  if (!Object.keys(verification).length) return result;

  return {
    ...source,
    execution: {
      ...execution,
      business_effect_verified: proof.passed === true,
      post_action_verification: {
        ...verification,
        business_effect_verified: proof.passed === true,
        assertion: {
          ...object(verification.assertion),
          passed: proof.passed === true,
          method: proof.method,
          reason: proof.reason,
          matched_identity: proof.matched_identity,
        },
      },
    },
    operator_catalog: {
      ...object(source.operator_catalog),
      deterministic_business_effect_verification: true,
      deterministic_business_effect_verified: proof.passed === true,
      deterministic_business_effect_verification_method: proof.method,
    },
  };
}

export function isOwnedDeepReasoningUnavailable(error) {
  return OWNED_DEEP_UNAVAILABLE_PATTERN.test(
    text(error?.message || error, 4000),
  );
}

function boundedOwnerConstraints(projectState = {}) {
  const source = Array.isArray(projectState?.constraints) ? projectState.constraints : [];
  return [...new Set(source.map((item) => text(item, 500)).filter(Boolean))].slice(-8);
}

function selfEngineeringOptions(options = {}) {
  if (!isAvantiqoSelfEngineeringRequest(options)) return options;
  const ownerConstraints = boundedOwnerConstraints(options.projectState);

  return {
    ...options,
    message: buildAvantiqoSelfEngineeringMessage(options),
    selfEngineeringRequest: {
      detected: true,
      original_message: text(options.message, 4000),
      capability_key: resolveAvantiqoSelfEngineeringCapabilityKey(options),
      owner_constraints: ownerConstraints,
      policy: "AVANTIQO_SELF_ENGINEERING_REPOSITORY_OWNERSHIP_V1",
    },
  };
}

function instantGreetingTurn(options, responseText) {
  const agreementState = object(options.agreementState);
  const projectState = object(options.projectState);
  return {
    success: true,
    decision: {
      response_text: responseText,
      response_language: text(options.locale, 80) || null,
      intent: "answer",
      confidence: 1,
      agreement_state: agreementState,
      project_state: projectState,
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: agreementState,
    navigation: null,
    execution: null,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "operator-instant-greeting-v1",
      usage_id: null,
    },
    operator_catalog: {
      instant_response: true,
      intelligence_lease_required: false,
      provider_request_performed: false,
      mutation_executed: false,
    },
  };
}

function cognitiveMutationBlockedTurn(options, guard, result = null) {
  const priorAgreementState = object(options.agreementState);
  const priorProjectState = object(options.projectState);
  const priorDecision = object(result?.decision);
  const capability = object(result?.execution?.capability);
  const reason = text(guard?.reason, 160) || "COGNITIVE_PLAN_NOT_VALIDATED";

  return {
    ...object(result),
    success: true,
    decision: {
      ...priorDecision,
      response_text:
        "I can continue with reasoning, research and read-only checks, but I will not stage or execute a business mutation until the required owned cognitive plan is valid.",
      response_language: priorDecision.response_language || text(options.locale, 80) || null,
      intent: "plan",
      confidence: Number(priorDecision.confidence || 1),
      agreement_state: priorAgreementState,
      project_state: Object.keys(object(priorDecision.project_state)).length
        ? object(priorDecision.project_state)
        : priorProjectState,
      clarification: {
        required: false,
        question: null,
        options: [],
      },
      navigation: object(priorDecision.navigation),
      execution: {
        capability_key: null,
        payload: {},
        reason,
      },
      plan: Array.isArray(priorDecision.plan) ? priorDecision.plan : [],
    },
    agreement_state: priorAgreementState,
    navigation: result?.navigation || null,
    execution: {
      status: "blocked",
      reason,
      capability: Object.keys(capability).length ? capability : null,
      cognitive_plan_required: true,
      cognitive_brief_available: guard?.cognitive_brief_available === true,
      cognitive_plan_valid: guard?.cognitive_plan_valid === true,
      execution_guidance_allowed: guard?.execution_guidance_allowed === true,
      mutation_executed: false,
      pending_execution_created: false,
    },
    operator_catalog: {
      ...object(result?.operator_catalog),
      cognitive_mutation_guard: true,
      cognitive_mutation_guard_contract: guard?.contract || null,
      cognitive_mutation_block_reason: reason,
      execution_authorized: false,
    },
  };
}

function providerRuntimeBlockedTurn(options, error) {
  const priorAgreementState = object(options.agreementState);
  const priorProjectState = object(options.projectState);
  const publicError = operatorPublicError(error);

  console.error("OPERATOR_PROVIDER_RUNTIME_FAILED", {
    public_code: publicError.code,
    internal_error: text(error?.message || error, 1200),
    raw_error_returned_to_user: false,
    mutation_executed: false,
  });

  return {
    success: true,
    decision: {
      response_text: publicError.message,
      response_language: text(options.locale, 80) || null,
      intent: "runtime_unavailable",
      confidence: 1,
      agreement_state: priorAgreementState,
      project_state: priorProjectState,
      clarification: {
        required: false,
        question: null,
        options: [],
      },
      navigation: {},
      execution: {
        capability_key: null,
        payload: {},
        reason: publicError.code,
      },
      plan: [],
    },
    agreement_state: priorAgreementState,
    navigation: null,
    execution: {
      status: "blocked",
      reason: publicError.code,
      capability: null,
      retryable: publicError.retryable === true,
      mutation_executed: false,
      pending_execution_created: false,
    },
    provider_evidence: {
      public_error_code: publicError.code,
      raw_provider_error_exposed: false,
    },
  };
}

function rollbackUnverifiedProjectProgress(decision = {}, priorProjectState = {}) {
  const currentDecision = object(decision);
  const currentProjectState = object(currentDecision.project_state);
  const prior = object(priorProjectState);

  return {
    ...currentDecision,
    project_state: {
      ...currentProjectState,
      completed_steps: Array.isArray(prior.completed_steps)
        ? prior.completed_steps
        : [],
      progress_summary: prior.progress_summary ?? null,
      next_step: prior.next_step ?? null,
    },
  };
}

function exactSelectedRecommendationBinding(agreementState = {}) {
  const recommendation = operatorRecommendationFromAgreementState(
    agreementState,
  );
  return Boolean(
    recommendation?.selection_state === "SELECTED" &&
      operatorRecommendationMatchesPendingExecution(
        agreementState,
        recommendation,
      ),
  );
}

function blockedAgreementAfterMissingVerification(
  resultAgreementState = {},
  priorAgreementState = {},
  verificationReason,
) {
  const current = { ...object(resultAgreementState) };
  delete current.pending_execution;

  const priorRun = autonomousRunFromAgreementState(priorAgreementState);
  if (!priorRun) return current;

  const blockedRun = transitionOperatorAutonomousRun(priorRun, {
    status: "blocked",
    currentStepId: "requested_action",
    stepId: "requested_action",
    stepStatus: "completed",
    blocker: verificationReason,
  });
  return agreementWithAutonomousRun(current, blockedRun);
}

function selectedRecommendationVerificationBlockedTurn(options, reason) {
  const recommendation = operatorRecommendationFromAgreementState(
    options.agreementState,
  );
  return {
    success: false,
    decision: {
      response_text:
        reason === "POST_ACTION_VERIFICATION_NOT_REGISTERED"
          ? "I will not execute this selected business action because it has no registered independent verification read. The exact selection is preserved, but no mutation ran."
          : "I will not execute this selected business action because its registered verification read is not available in your current access context. The exact selection is preserved, but no mutation ran.",
      response_language: text(options.locale, 80) || null,
      intent: "verification_required",
      confidence: 1,
      agreement_state: agreementState,
      project_state: object(options.projectState),
      clarification: {
        required: false,
        question: null,
        options: [],
      },
      navigation: { target_id: null },
      execution: {
        capability_key: null,
        payload: {},
        reason,
      },
      plan: [],
    },
    agreement_state: object(options.agreementState),
    navigation: null,
    execution: {
      status: "blocked",
      reason,
      capability_key: recommendation?.capability_key || null,
      mutation_executed: false,
      verification_required_before_mutation: true,
    },
    operator_catalog: {
      selected_recommendation_execution: true,
      verification_preflight_required: true,
      verification_preflight_passed: false,
      mutation_executed: false,
      execution_authorized: false,
      completion_claim_allowed: false,
    },
  };
}

function agreementWithInvalidatedRecommendation(agreementState, recommendation, assessment) {
  const current = { ...object(agreementState) };
  delete current.recommended_action;
  delete current.pending_execution;
  delete current.autonomous_run;
  return {
    ...current,
    recommendation_invalidation: {
      contract: "AVANTIQO_OPERATOR_RECOMMENDATION_INVALIDATION_V1",
      recommendation_id: text(recommendation?.recommendation_id, 160) || null,
      description: text(recommendation?.description, 700) || null,
      proof: object(recommendation?.proof),
      validity_status: text(assessment?.status, 120) || "INVALIDATED_BY_VERIFIED_CHANGE",
      changed_condition_ids: Array.isArray(assessment?.verified_changed_condition_ids)
        ? assessment.verified_changed_condition_ids.slice(0, 16)
        : [],
      invalidated_at: new Date().toISOString(),
      old_action_disarmed: true,
      authorization_effect: "NONE",
    },
  };
}

function recommendationFreshnessBlockedTurn(options, assessment, reason = "RECOMMENDATION_REVALIDATION_REQUIRED") {
  const recommendation = operatorRecommendationFromAgreementState(options.agreementState);
  const status = text(assessment?.status, 120) || reason;
  const invalidatedByChange = status === "INVALIDATED_BY_VERIFIED_CHANGE";
  const agreementState = invalidatedByChange
    ? agreementWithInvalidatedRecommendation(options.agreementState, recommendation, assessment)
    : object(options.agreementState);
  const proof = object(recommendation?.proof);
  const strongestAlternative = text(proof.strongest_alternative, 700);
  return {
    success: false,
    decision: {
      response_text:
        invalidatedByChange
          ? `I stopped before executing because the evidence supporting this recommendation materially changed. I disarmed the old pending action instead of retrying it.${strongestAlternative ? ` The strongest previously recorded alternative was ${strongestAlternative}.` : ""} Continue and I will reassess from the current evidence before anything mutates.`
          : "I stopped before executing because the evidence supporting this recommendation is no longer current enough to rely on safely. I could not refresh every required dependency, so no mutation ran.",
      response_language: text(options.locale, 80) || null,
      intent: "verification_required",
      confidence: 1,
      agreement_state: agreementState,
      project_state: object(options.projectState),
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: status },
      plan: [],
    },
    agreement_state: agreementState,
    navigation: null,
    execution: {
      status: "blocked",
      reason: status,
      capability_key: recommendation?.capability_key || null,
      mutation_executed: false,
      recommendation_revalidation_required: true,
      recommendation_validity: assessment || null,
    },
    operator_catalog: {
      selected_recommendation_execution: true,
      recommendation_freshness_preflight_required: true,
      recommendation_freshness_preflight_passed: false,
      mutation_executed: false,
      execution_authorized: false,
      completion_claim_allowed: false,
    },
  };
}

function recommendationValidityAssessment(recommendation) {
  const proof = object(recommendation?.proof);
  const dependencies = Array.isArray(proof.evidence_dependencies)
    ? proof.evidence_dependencies
    : [];
  const conditions = Array.isArray(proof.validity_conditions)
    ? proof.validity_conditions
    : [];
  return assessOperatorIntelligenceDecisionValidity({
    decision: {
      candidate_id: text(recommendation?.recommendation_id, 160) || null,
      status: text(recommendation?.selection_state, 40) || null,
      decided_at: text(recommendation?.created_at, 120) || null,
    },
    evidence_dependencies: dependencies,
    validity_conditions: conditions,
  });
}

function agreementWithRefreshedRecommendationProof(agreementState, proof) {
  const current = object(agreementState);
  const recommendation = object(current.recommended_action);
  const pending = object(current.pending_execution);
  return {
    ...current,
    recommended_action: { ...recommendation, proof },
    ...(Object.keys(pending).length
      ? { pending_execution: { ...pending, recommendation_proof: proof } }
      : {}),
  };
}

async function refreshLiveRecommendationEvidence(options, recommendation) {
  const proof = object(recommendation?.proof);
  const dependencies = Array.isArray(proof.evidence_dependencies)
    ? proof.evidence_dependencies
    : [];
  if (!dependencies.length) return null;
  const steps = dependencies.map((dependency, index) => ({
    id: text(dependency?.id, 160) || `recommendation_revalidation_${index + 1}`,
    label: `Refresh recommendation evidence ${index + 1}`,
    capability_key: text(dependency?.capability_key, 300),
    payload: object(dependency?.payload),
  }));
  if (steps.some((step) => !step.capability_key)) return null;

  const chainExecution = await executeUbteCapability({
    organizationId: options.organizationId,
    domain: "platform",
    capability: "operator_read_chain",
    action: "execute",
    payload: { steps },
    actor: object(options.actor),
    runtime: {
      entityId: options.entityId || null,
      periodId: options.periodId || null,
      permissions: Array.isArray(options.permissions) ? options.permissions : [],
      callerRequest: options.callerRequest || null,
      metadata: {
        source: "AVANTIQO_RECOMMENDATION_REVALIDATION",
        channel: text(options.source, 40) || "text",
        partyId: text(options.partyId, 160) || null,
        conversationId: text(options.conversationId, 200) || null,
        recommendationId: text(recommendation?.recommendation_id, 160) || null,
        authority_effect: "NONE",
      },
    },
  });
  const readResult = object(chainExecution?.result);
  const results = Array.isArray(readResult.steps) ? readResult.steps : [];
  if (!results.length || results.some((step) => text(step?.status, 40).toLowerCase() !== "completed")) {
    return null;
  }
  const refreshedAt = new Date().toISOString();
  const byId = new Map(results.map((step) => [text(step?.id, 160), step]));
  const changedDependencyIds = [];
  const refreshedDependencies = dependencies.map((dependency) => {
    const observed = byId.get(text(dependency?.id, 160));
    if (!observed) return { ...object(dependency), verified: false, current: false };
    const nextFingerprint = operatorRecommendationEvidenceFingerprint(observed?.evidence ?? null);
    const previousFingerprint = text(dependency?.result_fingerprint, 128);
    if (previousFingerprint && nextFingerprint !== previousFingerprint) {
      changedDependencyIds.push(text(dependency?.id, 160));
    }
    return {
      ...object(dependency),
      result_fingerprint: nextFingerprint,
      verified: true,
      current: true,
      superseded: false,
      observed_at: refreshedAt,
    };
  });
  const changedConditions = changedDependencyIds.map((id) => ({
    id: `evidence_changed:${id}`,
    title: `Recommendation evidence changed: ${id}`,
    required: true,
    verified: true,
    status: "changed",
    volatility: "dynamic",
    observed_at: refreshedAt,
  }));
  const refreshedProof = {
    ...proof,
    evidence_dependencies: refreshedDependencies,
    validity_conditions: [
      ...(Array.isArray(proof.validity_conditions) ? proof.validity_conditions : []),
      ...changedConditions,
    ].slice(-16),
    as_of: refreshedAt,
    requires_revalidation: true,
    execution_proof: false,
    authority_effect: "NONE",
  };
  const agreementState = agreementWithRefreshedRecommendationProof(
    options.agreementState,
    refreshedProof,
  );
  const refreshedRecommendation = {
    ...recommendation,
    proof: refreshedProof,
  };
  return {
    agreementState,
    assessment: recommendationValidityAssessment(refreshedRecommendation),
  };
}

async function preflightSelectedRecommendationFreshness(options = {}) {
  if (!exactSelectedRecommendationBinding(options.agreementState)) return null;
  const recommendation = operatorRecommendationFromAgreementState(options.agreementState);
  const reply = classifyPendingOperatorReply({
    message: options.message,
    pending: true,
    recommendation: true,
  });
  if (reply !== "execute") return null;
  const proof = object(recommendation?.proof);
  if (text(proof.evidence_class, 80) !== "LIVE_EVIDENCE_BACKED") return null;

  const initial = recommendationValidityAssessment(recommendation);
  if (initial.decision_valid_now === true) {
    return { agreementState: object(options.agreementState), assessment: initial };
  }
  if (initial.requires_replan === true) {
    return { blockedTurn: recommendationFreshnessBlockedTurn(options, initial) };
  }

  let refreshed = null;
  try {
    refreshed = await refreshLiveRecommendationEvidence(options, recommendation);
  } catch (error) {
    console.error("OPERATOR_RECOMMENDATION_REVALIDATION_FAILED", {
      recommendation_id: text(recommendation?.recommendation_id, 160),
      reason: text(error?.message || error, 500),
      mutation_executed: false,
    });
  }
  if (!refreshed || refreshed.assessment?.decision_valid_now !== true) {
    return {
      blockedTurn: recommendationFreshnessBlockedTurn(
        { ...options, agreementState: refreshed?.agreementState || options.agreementState },
        refreshed?.assessment || initial,
      ),
    };
  }
  return refreshed;
}

async function preflightSelectedRecommendationVerification(options = {}) {
  if (!exactSelectedRecommendationBinding(options.agreementState)) return null;

  const recommendation = operatorRecommendationFromAgreementState(
    options.agreementState,
  );
  const reply = classifyPendingOperatorReply({
    message: options.message,
    pending: true,
    recommendation: true,
  });
  if (reply !== "execute") return null;

  if (
    INTERNALLY_VERIFIED_RECOMMENDATION_CAPABILITIES.has(
      text(recommendation?.capability_key, 300),
    )
  ) {
    return null;
  }

  const capabilities = await listOperatorCapabilities();
  const actionCapability = capabilities.find((item) => item.key === text(recommendation?.capability_key, 300));
  const verifyAfter = object(recommendation?.verify_after);
  const verificationCapabilityKey = text(verifyAfter.capability_key || object(actionCapability?.operator_verification).capability_key, 300);
  if (!verificationCapabilityKey) {
    return selectedRecommendationVerificationBlockedTurn(
      options,
      "POST_ACTION_VERIFICATION_NOT_REGISTERED",
    );
  }

  const verificationCapability = capabilities.find(
    (item) =>
      item.key === verificationCapabilityKey &&
      item.mode === "read" &&
      canUseCapability(
        item,
        Array.isArray(options.permissions) ? options.permissions : [],
        options.role,
      ),
  );
  if (!verificationCapability) {
    return selectedRecommendationVerificationBlockedTurn(
      options,
      "POST_ACTION_VERIFICATION_CAPABILITY_NOT_AVAILABLE",
    );
  }

  return null;
}

async function withVerifiedMutationOutcome(
  result,
  priorProjectState = {},
  priorAgreementState = {},
) {
  const source = object(result);
  const execution = object(source.execution);
  const verification = object(execution.post_action_verification);
  const state = executionMemoryVerificationState(execution);
  const selectedRecommendationExecution =
    exactSelectedRecommendationBinding(priorAgreementState);

  if (
    !state.completed ||
    !state.mutating ||
    !selectedRecommendationExecution
  ) {
    return result;
  }

  const deterministicProof = deterministicBusinessEffectProof(execution);
  if (state.business_effect_verified && deterministicProof.passed) {
    const verified = withDeterministicVerificationReceipt(result, deterministicProof);
    const recommendation = operatorRecommendationFromAgreementState(priorAgreementState);
    let recommendationLearning = null;
    try {
      recommendationLearning = await settleOperatorRecommendationOutcomeLearning({
        learning: recommendation?.outcome_learning,
        recommendation,
        execution: object(verified?.execution),
      });
    } catch (error) {
      console.error("OPERATOR_RECOMMENDATION_OUTCOME_LEARNING_SETTLEMENT_FAILED", {
        recommendation_id: text(recommendation?.recommendation_id, 160),
        error: text(error?.message || error, 500),
        execution_authority_effect: "NONE",
      });
    }
    return recommendationLearning
      ? {
          ...verified,
          execution: {
            ...object(verified.execution),
            recommendation_outcome_learning: recommendationLearning,
          },
          operator_catalog: {
            ...object(verified.operator_catalog),
            recommendation_outcome_learning_settled: true,
            recommendation_outcome_learning_authority_effect: "NONE",
          },
        }
      : verified;
  }

  const verificationReason = state.verification_present
    ? deterministicProof.reason ||
      text(verification.reason || verification.error, 800) ||
      "POST_ACTION_VERIFICATION_FAILED"
    : "POST_ACTION_VERIFICATION_NOT_REGISTERED";
  const verificationReceipt = state.verification_present
    ? {
        ...verification,
        business_effect_verified: false,
        assertion: {
          ...object(verification.assertion),
          passed: false,
          method: deterministicProof.method,
          reason: verificationReason,
          matched_identity: deterministicProof.matched_identity,
        },
      }
    : {
        status: "missing",
        reason: verificationReason,
        registered: false,
        business_effect_verified: false,
        assertion: {
          passed: false,
          method: "registered_verification_required",
          reason: verificationReason,
          matched_identity: null,
        },
      };
  const resultAgreementState = object(
    source.agreement_state || source?.decision?.agreement_state,
  );
  const safeAgreementState = state.verification_present
    ? resultAgreementState
    : blockedAgreementAfterMissingVerification(
        resultAgreementState,
        priorAgreementState,
        verificationReason,
      );
  const rolledBackDecision = rollbackUnverifiedProjectProgress(
    source.decision,
    priorProjectState,
  );

  return {
    ...source,
    success: false,
    agreement_state: safeAgreementState,
    decision: {
      ...rolledBackDecision,
      response_text: state.verification_present
        ? "The action call returned, but the fresh read-back did not deterministically prove the intended business effect. I will not claim it completed or repeat the mutation automatically. Please review the current record state before retrying."
        : "The action call returned, but this action has no registered independent verification read. I will not claim the business effect completed or repeat the mutation automatically. The run is blocked until the current business state is independently checked.",
      intent: "verification_required",
      agreement_state: safeAgreementState,
      clarification: {
        required: true,
        question:
          "Please review the current business state before deciding whether any follow-up is needed.",
        options: [],
      },
      execution: {
        ...object(rolledBackDecision.execution),
        reason: verificationReason,
      },
    },
    execution: {
      ...execution,
      status: "blocked",
      reason: verificationReason,
      post_action_verification: verificationReceipt,
      action_call_completed: true,
      business_effect_verified: false,
      mutation_replay_allowed: false,
      verification_required_before_completion: true,
    },
    operator_catalog: {
      ...object(source.operator_catalog),
      verified_mutation_outcome_contract: VERIFIED_MUTATION_OUTCOME_CONTRACT,
      selected_recommendation_execution: true,
      deterministic_business_effect_verification: true,
      deterministic_business_effect_verified: false,
      deterministic_business_effect_verification_method: deterministicProof.method,
      action_call_completed: true,
      verification_present: state.verification_present,
      verification_registered: state.verification_present,
      business_effect_verified: false,
      execution_complete: false,
      project_progress_advanced: false,
      mutation_replay_allowed: false,
      completion_claim_allowed: false,
    },
  };
}

function stagedMutationRequiresCognitiveBlock(result, guard) {
  if (guard?.required !== true || guard?.mutating_execution_allowed === true) {
    return false;
  }

  const execution = object(result?.execution);
  const capability = object(execution.capability);
  const capabilityMode = text(capability.mode, 80).toLowerCase();
  const pendingCapabilityKey = text(
    result?.agreement_state?.pending_execution?.capability_key,
    300,
  );

  if (capabilityMode && capabilityMode !== "read") return true;
  if (pendingCapabilityKey) return true;
  return false;
}

function verifiedCodeCommitEvidence(result = {}) {
  const source = object(result);
  const execution = object(source.execution);
  const evidence = object(source.code_execution_evidence || execution.code_execution_evidence);
  if (
    text(evidence.kind, 80) !== "commit" ||
    text(evidence.verification_status, 120) !== "VERIFIED_COMMITTED" ||
    !text(evidence.commit_sha, 160)
  ) return null;
  return evidence;
}

function renderVerifiedCodeCommitHandoff(baseText, evidence) {
  if (!evidence) return baseText;
  const commitSha = text(evidence.commit_sha, 160);
  const repository = text(evidence.repository || evidence.repository_url, 500);
  const branch = text(evidence.branch, 80) || "main";
  const previous = text(evidence.previous_commit || evidence.base_commit, 160);
  const fileCount = Number(evidence.file_count || 0);
  const sourceControl = [
    `**Source control:** independently verified persistence on \`${branch}\`.`,
    `**Commit:** \`${commitSha}\``,
    repository ? `**Repository:** ${repository}` : null,
    previous ? `**Previous commit:** \`${previous}\`` : null,
    Number.isFinite(fileCount) ? `**Committed files:** ${fileCount}.` : null,
    "**Persistence verification:** the registered Code commit readback verified the resulting commit and branch binding.",
    "**Production deployment:** not proven by this commit evidence; no deployment is claimed here.",
  ].filter(Boolean).join("\n\n");
  const pattern = /\*\*Source control:\*\*[\s\S]*?(?=\n\n\*\*Remaining blockers:|\n\n\*\*Next:|$)/;
  return pattern.test(baseText)
    ? baseText.replace(pattern, sourceControl)
    : `${baseText}\n\n${sourceControl}`;
}

function withCodeCustomerArtifactReply(result, artifactSource = result) {
  const source = object(result);
  const artifact =
    findCodeAICustomerArtifact(artifactSource) ||
    findCodeAICustomerArtifact(source);
  if (!artifact) return result;
  const artifactText = renderCodeAICustomerArtifactText(artifact);
  if (!artifactText) return result;
  const responseText = renderVerifiedCodeCommitHandoff(
    artifactText,
    verifiedCodeCommitEvidence(source),
  );
  const decision = object(source.decision);
  return {
    ...source,
    decision: {
      ...decision,
      response_text: responseText,
    },
    code_customer_artifact: artifact,
    operator_catalog: {
      ...object(source.operator_catalog),
      code_customer_artifact_returned: true,
      code_customer_artifact_preserved_through_guard:
        artifactSource !== result,
      code_customer_artifact_verified_complete:
        artifact.verified_complete === true,
      code_customer_artifact_commit_ready: artifact.commit_ready === true,
    },
  };
}

async function ownedFastDegradedTurn(options, guard, deepError) {
  console.warn("OPERATOR_OWNED_DEEP_FAST_DEGRADATION", {
    contract: OWNED_DEEP_FAST_DEGRADATION_CONTRACT,
    reason: "DEEP_PROVIDER_UNAVAILABLE",
    from_lane: "deep",
    to_lane: "fast",
    external_fallback_used: false,
    mutation_execution_allowed: false,
    internal_error: text(deepError?.message || deepError, 800),
  });

  const fastResult = await runFastConversationTurn(options);
  const degraded = {
    ...object(fastResult),
    provider_evidence: {
      ...object(fastResult?.provider_evidence),
      owned_lane_degradation: {
        contract: OWNED_DEEP_FAST_DEGRADATION_CONTRACT,
        occurred: true,
        reason: "DEEP_PROVIDER_UNAVAILABLE",
        from_lane: "deep",
        to_lane: "fast",
        owned_provider_only: true,
        external_fallback_used: false,
        mutation_execution_allowed: false,
      },
    },
    operator_catalog: {
      ...object(fastResult?.operator_catalog),
      owned_deep_fast_degradation: true,
      owned_deep_fast_degradation_contract:
        OWNED_DEEP_FAST_DEGRADATION_CONTRACT,
      degraded_lane: "fast",
      external_ai_fallback_used: false,
      degraded_mutation_execution_allowed: false,
    },
  };

  return stagedMutationRequiresCognitiveBlock(degraded, guard)
    ? cognitiveMutationBlockedTurn(options, guard, degraded)
    : degraded;
}

export async function runOperatorTurn(options = {}) {
  const semanticClarification = semanticClarificationTurn(options);
  if (semanticClarification) return semanticClarification;

  const semanticUnderstanding = options.semanticUnderstanding || {};
  const semanticEngineeringInspectionReport =
    text(semanticUnderstanding.execution_domain, 40).toLowerCase() === "product_engineering" &&
    text(semanticUnderstanding.engineering_mode, 40).toLowerCase() === "inspect" &&
    text(semanticUnderstanding.engineering_deliverable, 40).toLowerCase() === "inspection_report" &&
    semanticUnderstanding.requires_mutation !== true;
  if (semanticEngineeringInspectionReport) {
    return runOperatorReadOnlyCodeInspectionTurn(options);
  }

  let effectiveOptions = selfEngineeringOptions(options);
  const instantGreeting = resolveOperatorInstantGreeting({
    message: effectiveOptions.message,
    source: effectiveOptions.source,
  });
  if (instantGreeting) return instantGreetingTurn(effectiveOptions, instantGreeting);

  const pendingCapabilityKey = text(
    effectiveOptions.agreementState?.pending_execution?.capability_key,
    300,
  );
  const pendingControlDecision = pendingCapabilityKey
    ? classifyPendingOperatorReply({
        message: effectiveOptions.message,
        pending: true,
        recommendation: false,
      })
    : null;
  const semanticRoute = text(effectiveOptions.semanticUnderstanding?.route, 40).toLowerCase();
  const deterministicDeepRequired = needsOwnedCognitiveBrief({
    source: effectiveOptions.source,
    message: effectiveOptions.message,
  });
  const semanticDeepRequested =
    text(effectiveOptions.semanticUnderstanding?.reasoning_depth, 40).toLowerCase() === "deep";
  const semanticDeepRequired =
    semanticDeepRequested &&
    (semanticRoute !== "conversation" || deterministicDeepRequired);
  const semanticGoverned =
    semanticRoute === "governed" ||
    effectiveOptions.semanticUnderstanding?.requires_mutation === true;
  const required = pendingControlDecision
    ? false
    : semanticDeepRequired || deterministicDeepRequired;
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required,
    conversation: effectiveOptions.conversation,
  });
  const fastFirst = semanticGoverned
    ? false
    : shouldUseOwnedFastFirst({
        source: effectiveOptions.source,
        message: effectiveOptions.message,
        deepRequired: required,
        agreementState: effectiveOptions.agreementState,
      });

  return runWithOperatorIntelligenceExecutionGuard(guard, async () => {
    try {
      if (fastFirst) {
        return await runFastConversationTurn(effectiveOptions);
      }

      const freshnessPreflight =
        await preflightSelectedRecommendationFreshness(effectiveOptions);
      if (freshnessPreflight?.blockedTurn) return freshnessPreflight.blockedTurn;
      if (freshnessPreflight?.agreementState) {
        effectiveOptions = {
          ...effectiveOptions,
          agreementState: freshnessPreflight.agreementState,
        };
      }

      const verificationPreflight =
        await preflightSelectedRecommendationVerification(effectiveOptions);
      if (verificationPreflight) return verificationPreflight;

      const result = await runGovernedOperatorTurn(effectiveOptions);
      const evidencedResult = withOperatorCodeExecutionEvidence(result);
      const verifiedResult = await withVerifiedMutationOutcome(
        evidencedResult,
        effectiveOptions.projectState,
        effectiveOptions.agreementState,
      );
      const guarded = stagedMutationRequiresCognitiveBlock(verifiedResult, guard)
        ? cognitiveMutationBlockedTurn(effectiveOptions, guard, verifiedResult)
        : verifiedResult;
      return withCodeCustomerArtifactReply(guarded, verifiedResult);
    } catch (error) {
      if (error?.operatorIntelligenceGuard) {
        return cognitiveMutationBlockedTurn(
          effectiveOptions,
          error.operatorIntelligenceGuard,
        );
      }
      if (isOwnedDeepReasoningUnavailable(error)) {
        try {
          return await ownedFastDegradedTurn(
            effectiveOptions,
            guard,
            error,
          );
        } catch (fastError) {
          console.error("OPERATOR_OWNED_DEEP_FAST_DEGRADATION_FAILED", {
            contract: OWNED_DEEP_FAST_DEGRADATION_CONTRACT,
            deep_error: text(error?.message || error, 800),
            fast_error: text(fastError?.message || fastError, 800),
            external_fallback_used: false,
            mutation_executed: false,
          });
          if (shouldSanitizeOperatorRuntimeError(fastError)) {
            return providerRuntimeBlockedTurn(effectiveOptions, fastError);
          }
          return providerRuntimeBlockedTurn(effectiveOptions, error);
        }
      }
      if (shouldSanitizeOperatorRuntimeError(error)) {
        return providerRuntimeBlockedTurn(effectiveOptions, error);
      }
      return delegatedFailureTurn(effectiveOptions, error);
    }
  });
}

export default runOperatorTurn;
