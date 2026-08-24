import {
  revalidateRecommendationRefinementInputs,
} from "./OperatorRecommendationRefinementRevalidation.js";
import {
  evaluateRecommendationRefinementCapabilityForActor,
} from "./OperatorRecommendationRefinementCapabilityPolicy.js";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function preflightRecommendationRefinementBinding({
  candidate = null,
  capability = null,
  context = null,
  permissions = [],
  role = null,
} = {}) {
  const current = object(candidate);
  const capabilityKey = text(capability?.key, 240);
  const base = {
    ready_for_governed_binding: false,
    authorization_effect: "NONE",
    execution_authorized: false,
    recommendation_binding_created: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
  };

  if (
    current.candidate_kind !== "refinement_revalidated_recommendation_candidate" ||
    current.authorization_effect !== "NONE" ||
    current.execution_authorized !== false ||
    current.recommendation_binding_created !== false ||
    current.pending_execution_created !== false ||
    current.autonomous_run_created !== false ||
    current.old_payload_reused !== false ||
    current.requires_fresh_recommendation_binding !== true ||
    !capabilityKey ||
    capabilityKey !== text(current.capability_key, 240)
  ) {
    return {
      ...base,
      reason: "REFINEMENT_CANDIDATE_NOT_SAFE_FOR_BINDING",
      recommendation: null,
      actor_policy: null,
      revalidation: null,
    };
  }

  const actorPolicy = evaluateRecommendationRefinementCapabilityForActor({
    capability,
    permissions,
    role,
    context,
  });
  if (actorPolicy.allowed !== true) {
    return {
      ...base,
      reason: "REFINEMENT_ACTOR_CAPABILITY_POLICY_CHANGED",
      recommendation: null,
      actor_policy: actorPolicy,
      revalidation: null,
    };
  }

  const revalidation = revalidateRecommendationRefinementInputs({
    state: {
      status: "READY_FOR_CAPABILITY_REVALIDATION",
      capability_key: capabilityKey,
      partial_payload: { ...object(current.payload) },
      missing_required_fields: [],
      authorization_effect: "NONE",
      execution_authorized: false,
      pending_execution_created: false,
      autonomous_run_created: false,
      old_payload_reused: false,
      requires_capability_revalidation: true,
    },
    capability,
    context,
  });

  if (
    revalidation.ready_for_governed_recommendation !== true ||
    revalidation.current_capability_revalidated !== true ||
    revalidation.authorization_effect !== "NONE" ||
    revalidation.execution_authorized !== false ||
    revalidation.old_payload_reused !== false
  ) {
    return {
      ...base,
      reason: "REFINEMENT_CANDIDATE_STALE_BEFORE_BINDING",
      recommendation: null,
      actor_policy: actorPolicy,
      revalidation,
    };
  }

  return {
    ...base,
    ready_for_governed_binding: true,
    reason: null,
    recommendation: {
      capability_key: capabilityKey,
      description:
        text(current.description, 800) ||
        text(capability?.description, 800) ||
        text(capability?.name, 400) ||
        "Refined governed action",
      payload: { ...object(revalidation.payload) },
      reason: text(current.reason, 1000) || null,
      original_message: text(current.original_message, 4000) || null,
      objective: text(current.objective, 1200) || null,
      source: "selected_refinement_binding_preflight",
    },
    actor_policy: actorPolicy,
    revalidation,
  };
}

export default preflightRecommendationRefinementBinding;
