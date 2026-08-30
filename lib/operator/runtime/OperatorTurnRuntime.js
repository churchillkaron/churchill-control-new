import { runOperatorTurn as runGovernedOperatorTurn } from "./OperatorTurnRuntimeGoverned.js";
import { needsOwnedCognitiveBrief } from "./OperatorOwnedCognitiveBriefPolicy.js";
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

const OWNED_DEEP_FAST_DEGRADATION_CONTRACT =
  "AVANTIQO_OPERATOR_OWNED_DEEP_FAST_DEGRADATION_V1";
const OWNED_DEEP_UNAVAILABLE_PATTERN =
  /No priced executable provider available for ai\.reasoning\.execute/i;

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

  return runWithOperatorIntelligenceExecutionGuard(guard, async () => {
    try {
      const result = await runGovernedOperatorTurn(effectiveOptions);
      return stagedMutationRequiresCognitiveBlock(result, guard)
        ? cognitiveMutationBlockedTurn(effectiveOptions, guard, result)
        : result;
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
