import {
  planRecommendationRefinementMaterialization,
} from "./OperatorRecommendationRefinementMaterializationPlanner.js";
import {
  buildRecommendationRefinementClarification,
} from "./OperatorRecommendationRefinementClarification.js";
import {
  applyRecommendationRefinementInputAnswers,
  createRecommendationRefinementInputState,
} from "./OperatorRecommendationRefinementInputState.js";
import {
  extractRecommendationRefinementInputAnswers,
} from "./OperatorRecommendationRefinementAnswerExtractor.js";
import {
  evaluateRecommendationRefinementCapabilityForActor,
  filterRecommendationRefinementCapabilitiesForActor,
} from "./OperatorRecommendationRefinementCapabilityPolicy.js";
import {
  revalidateRecommendationRefinementInputs,
} from "./OperatorRecommendationRefinementRevalidation.js";
import {
  createRecommendationCandidateFromRefinementRevalidation,
} from "./OperatorRecommendationRefinementCandidate.js";
import {
  preflightRecommendationRefinementBinding,
} from "./OperatorRecommendationRefinementBindingPreflight.js";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function authorityFree(stage, extra = {}) {
  return {
    stage,
    authorization_effect: "NONE",
    execution_authorized: false,
    recommendation_binding_created: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
    ...extra,
  };
}

function readyStateFromPlan(proposal, plan) {
  const capabilityKey = text(plan?.capability?.key, 240);
  if (!capabilityKey || plan?.ready !== true) return null;
  return {
    status: "READY_FOR_CAPABILITY_REVALIDATION",
    proposal_id: text(proposal?.proposal_id, 160) || null,
    proposal_text: text(proposal?.proposal_text, 4000) || null,
    capability_key: capabilityKey,
    partial_payload: { ...object(plan.payload) },
    missing_required_fields: [],
    answered_fields: [],
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
    requires_capability_revalidation: true,
    created_at: new Date().toISOString(),
  };
}

function finalizePreparation({
  proposal,
  capability,
  inputState,
  context,
  permissions,
  role,
}) {
  const revalidation = revalidateRecommendationRefinementInputs({
    state: inputState,
    capability,
    context,
  });
  if (revalidation.ready_for_governed_recommendation !== true) {
    return authorityFree("REVALIDATION_REQUIRED_OR_FAILED", {
      proposal,
      capability,
      input_state: inputState,
      revalidation,
      candidate: null,
      binding_preflight: null,
      ready_for_governed_binding: false,
    });
  }

  const candidate = createRecommendationCandidateFromRefinementRevalidation({
    revalidation,
    capability,
    proposal,
  });
  if (!candidate) {
    return authorityFree("CANDIDATE_CREATION_FAILED_CLOSED", {
      proposal,
      capability,
      input_state: inputState,
      revalidation,
      candidate: null,
      binding_preflight: null,
      ready_for_governed_binding: false,
    });
  }

  const bindingPreflight = preflightRecommendationRefinementBinding({
    candidate,
    capability,
    context,
    permissions,
    role,
  });
  if (bindingPreflight.ready_for_governed_binding !== true) {
    return authorityFree("BINDING_PREFLIGHT_FAILED_CLOSED", {
      proposal,
      capability,
      input_state: inputState,
      revalidation,
      candidate,
      binding_preflight: bindingPreflight,
      ready_for_governed_binding: false,
    });
  }

  return authorityFree("READY_FOR_GOVERNED_BINDING", {
    proposal,
    capability,
    input_state: inputState,
    revalidation,
    candidate,
    binding_preflight: bindingPreflight,
    recommendation: bindingPreflight.recommendation,
    ready_for_governed_binding: true,
  });
}

export function prepareRecommendationRefinement({
  proposal = null,
  capabilities = [],
  context = null,
  permissions = [],
  role = null,
} = {}) {
  const eligibleCapabilities = filterRecommendationRefinementCapabilitiesForActor({
    capabilities,
    permissions,
    role,
    context,
  });
  const plan = planRecommendationRefinementMaterialization({
    proposal,
    capabilities: eligibleCapabilities,
  });
  const clarification = buildRecommendationRefinementClarification({ plan });

  if (!plan.capability) {
    return authorityFree("CAPABILITY_CLARIFICATION_REQUIRED", {
      proposal,
      plan,
      clarification,
      input_state: null,
      actor_policy_filtered_capability_count: eligibleCapabilities.length,
      ready_for_governed_binding: false,
    });
  }

  if (plan.ready !== true) {
    const inputState = createRecommendationRefinementInputState({
      proposal,
      plan,
    });
    return authorityFree("INPUT_CLARIFICATION_REQUIRED", {
      proposal,
      plan,
      clarification,
      input_state: inputState,
      actor_policy_filtered_capability_count: eligibleCapabilities.length,
      ready_for_governed_binding: false,
    });
  }

  return {
    ...finalizePreparation({
      proposal,
      capability: plan.capability,
      inputState: readyStateFromPlan(proposal, plan),
      context,
      permissions,
      role,
    }),
    plan,
    clarification,
    actor_policy_filtered_capability_count: eligibleCapabilities.length,
  };
}

export function continueRecommendationRefinementPreparation({
  proposal = null,
  inputState = null,
  capability = null,
  answers = null,
  context = null,
  permissions = [],
  role = null,
} = {}) {
  const actorPolicy = evaluateRecommendationRefinementCapabilityForActor({
    capability,
    permissions,
    role,
    context,
  });
  if (actorPolicy.allowed !== true) {
    return authorityFree("ACTOR_POLICY_CHANGED_DURING_CLARIFICATION", {
      proposal,
      capability,
      input_state: inputState,
      actor_policy: actorPolicy,
      answer_result: null,
      clarification: null,
      ready_for_governed_binding: false,
    });
  }

  const answerResult = applyRecommendationRefinementInputAnswers({
    state: inputState,
    proposal,
    capability,
    answers,
  });
  if (answerResult.complete !== true) {
    const continuationPlan = {
      capability,
      payload: object(answerResult.state?.partial_payload),
      missing_required_fields: answerResult.state?.missing_required_fields || [],
    };
    return authorityFree("INPUT_CLARIFICATION_REQUIRED", {
      proposal,
      answer_result: answerResult,
      input_state: answerResult.state,
      actor_policy: actorPolicy,
      clarification: buildRecommendationRefinementClarification({
        plan: continuationPlan,
      }),
      ready_for_governed_binding: false,
    });
  }

  return {
    ...finalizePreparation({
      proposal,
      capability,
      inputState: answerResult.state,
      context,
      permissions,
      role,
    }),
    actor_policy: actorPolicy,
    answer_result: answerResult,
  };
}

export function continueRecommendationRefinementPreparationFromMessage({
  proposal = null,
  inputState = null,
  capability = null,
  clarification = null,
  message = null,
  context = null,
  permissions = [],
  role = null,
} = {}) {
  const extraction = extractRecommendationRefinementInputAnswers({
    message,
    clarification,
    capability,
  });
  if (extraction.accepted !== true) {
    return authorityFree("INPUT_ANSWER_CLARIFICATION_REQUIRED", {
      proposal,
      extraction,
      input_state: inputState,
      clarification,
      ready_for_governed_binding: false,
    });
  }

  return {
    ...continueRecommendationRefinementPreparation({
      proposal,
      inputState,
      capability,
      answers: extraction.answers,
      context,
      permissions,
      role,
    }),
    extraction,
  };
}

export default {
  prepareRecommendationRefinement,
  continueRecommendationRefinementPreparation,
  continueRecommendationRefinementPreparationFromMessage,
};
