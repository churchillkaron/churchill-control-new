import { runOperatorTurn as runGovernedOperatorTurn } from "./OperatorTurnRuntimeGoverned.js";
import { needsOwnedCognitiveBrief } from "./OperatorOwnedCognitiveBriefPolicy.js";
import { shouldUseOwnedFastFirst } from "./OperatorFastFirstPolicy.js";
import { listOperatorCapabilities } from "./OperatorCapabilityCatalog.js";
import { classifyPendingOperatorReply } from "./OperatorHumanDecisionClassifier.js";
import {
  buildAvantiqoSelfEngineeringMessage,
  isAvantiqoSelfEngineeringRequest,
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
const STABLE_BUSINESS_IDENTITY_KEYS = new Set([
  "id",
  "uuid",
  "invoice_id",
  "bill_id",
  "journal_id",
  "booking_id",
  "reservation_id",
  "work_order_id",
  "order_id",
  "payment_id",
  "receipt_id",
  "customer_id",
  "vendor_id",
  "supplier_id",
  "employee_id",
  "person_id",
  "party_id",
  "asset_id",
  "document_id",
  "record_id",
  "transaction_id",
]);

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
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

function collectStableBusinessIdentities(value, depth = 0, output = new Set()) {
  if (depth > 5 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) {
      collectStableBusinessIdentities(item, depth + 1, output);
    }
    return output;
  }
  if (typeof value !== "object") return output;

  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = text(rawKey, 120).toLowerCase();
    if (STABLE_BUSINESS_IDENTITY_KEYS.has(key)) {
      const normalized = text(rawValue, 500);
      if (normalized) output.add(`${key}:${normalized}`);
    }
    collectStableBusinessIdentities(rawValue, depth + 1, output);
  }
  return output;
}

function deterministicBusinessEffectProof(execution = {}) {
  const current = object(execution);
  const verification = object(current.post_action_verification);
  if (text(verification.status, 80).toLowerCase() !== "completed") {
    return {
      passed: false,
      method: "verification_status",
      reason: "POST_ACTION_VERIFICATION_NOT_COMPLETED",
      matched_identity: null,
    };
  }

  const explicitAssertion = object(verification.assertion);
  if (
    verification.business_effect_verified === true &&
    explicitAssertion.passed === true
  ) {
    return {
      passed: true,
      method: text(explicitAssertion.method, 120) || "server_assertion",
      reason: null,
      matched_identity: text(explicitAssertion.matched_identity, 500) || null,
    };
  }

  const actionIdentities = collectStableBusinessIdentities(current.result);
  const verificationIdentities = collectStableBusinessIdentities(
    verification.result,
  );
  for (const identity of actionIdentities) {
    if (verificationIdentities.has(identity)) {
      return {
        passed: true,
        method: "stable_business_identity_match",
        reason: null,
        matched_identity: identity,
      };
    }
  }

  return {
    passed: false,
    method: "stable_business_identity_match",
    reason: actionIdentities.size
      ? "POST_ACTION_VERIFICATION_ASSERTION_FAILED"
      : "POST_ACTION_VERIFICATION_IDENTITY_NOT_AVAILABLE",
    matched_identity: null,
  };
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

function selfEngineeringOptions(options = {}) {
  if (!isAvantiqoSelfEngineeringRequest(options)) return options;

  return {
    ...options,
    message: buildAvantiqoSelfEngineeringMessage(options),
    selfEngineeringRequest: {
      detected: true,
      original_message: text(options.message, 4000),
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
      agreement_state: object(options.agreementState),
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

  const verifyAfter = object(recommendation?.verify_after);
  const verificationCapabilityKey = text(verifyAfter.capability_key, 300);
  if (!verificationCapabilityKey) {
    return selectedRecommendationVerificationBlockedTurn(
      options,
      "POST_ACTION_VERIFICATION_NOT_REGISTERED",
    );
  }

  const capabilities = await listOperatorCapabilities();
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

function withVerifiedMutationOutcome(
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
    return withDeterministicVerificationReceipt(result, deterministicProof);
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

function withCodeCustomerArtifactReply(result, artifactSource = result) {
  const source = object(result);
  const artifact =
    findCodeAICustomerArtifact(artifactSource) ||
    findCodeAICustomerArtifact(source);
  if (!artifact) return result;
  const responseText = renderCodeAICustomerArtifactText(artifact);
  if (!responseText) return result;
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
  const effectiveOptions = selfEngineeringOptions(options);
  const instantGreeting = resolveOperatorInstantGreeting({
    message: effectiveOptions.message,
    source: effectiveOptions.source,
  });
  if (instantGreeting) return instantGreetingTurn(effectiveOptions, instantGreeting);

  const required = needsOwnedCognitiveBrief({
    source: effectiveOptions.source,
    message: effectiveOptions.message,
  });
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required,
    conversation: effectiveOptions.conversation,
  });
  const fastFirst = shouldUseOwnedFastFirst({
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

      const verificationPreflight =
        await preflightSelectedRecommendationVerification(effectiveOptions);
      if (verificationPreflight) return verificationPreflight;

      const result = await runGovernedOperatorTurn(effectiveOptions);
      const evidencedResult = withOperatorCodeExecutionEvidence(result);
      const verifiedResult = withVerifiedMutationOutcome(
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
      throw error;
    }
  });
}

export default runOperatorTurn;
