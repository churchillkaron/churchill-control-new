import {
  resolveRecommendationRefinementPayload,
} from "@/lib/operator/runtime/OperatorRecommendationRefinementPayloadResolver";

const REFINEMENT_KEY = "recommendation_refinement";
const PRODUCT_ENGINEERING_CYCLE_KEY =
  "platform.product_engineering_cycle.execute";
const PRODUCT_ENGINEERING_REFINEMENT_CAPABILITY = Object.freeze({
  key: PRODUCT_ENGINEERING_CYCLE_KEY,
  input_schema: {
    type: "object",
    properties: {
      focus: { type: "string", maxLength: 2000 },
    },
    required: ["focus"],
  },
});

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function normalizeOperatorRecommendationRefinement(value = {}) {
  const candidate = object(value);
  if (text(candidate.capability_key, 240) !== PRODUCT_ENGINEERING_CYCLE_KEY) {
    return null;
  }
  const proposedFocus = text(candidate.proposed_focus, 2000);
  if (!proposedFocus) return null;
  if (candidate.automatic_execution_started !== false) return null;
  if (text(candidate.authorization_effect, 40).toUpperCase() !== "NONE") {
    return null;
  }
  if (candidate.current_main_reassessment_required !== true) return null;
  if (candidate.focus_is_priority_context_only !== true) return null;

  return {
    status: "PROPOSED_PRODUCT_ENGINEERING_REFINEMENT",
    capability_key: PRODUCT_ENGINEERING_CYCLE_KEY,
    proposed_focus: proposedFocus,
    previous_recommendation_id:
      text(candidate.previous_recommendation_id, 160) || null,
    previous_focus: text(candidate.previous_focus, 2000) || null,
    previous_description:
      text(candidate.previous_description, 600) || null,
    automatic_execution_started: false,
    authorization_effect: "NONE",
    current_main_reassessment_required: true,
    focus_is_priority_context_only: true,
    created_at: text(candidate.created_at, 80) || new Date().toISOString(),
  };
}

export function operatorRecommendationRefinementMatchesSourceRecommendation(
  agreementState = {},
  refinement = null,
) {
  const current = object(agreementState);
  const normalized = normalizeOperatorRecommendationRefinement(
    refinement || current[REFINEMENT_KEY],
  );
  if (!normalized) return false;

  const recommendation = object(current.recommended_action);
  if (
    text(recommendation.capability_key, 240) !==
    PRODUCT_ENGINEERING_CYCLE_KEY
  ) {
    return false;
  }

  const previousRecommendationId = text(
    normalized.previous_recommendation_id,
    160,
  );
  const currentRecommendationId = text(
    recommendation.recommendation_id,
    160,
  );
  if (
    !previousRecommendationId ||
    previousRecommendationId !== currentRecommendationId
  ) {
    return false;
  }

  const previousFocus = text(normalized.previous_focus, 2000);
  const currentFocus = text(recommendation.payload?.focus, 2000);
  if (!previousFocus || previousFocus !== currentFocus) return false;

  const previousDescription = text(normalized.previous_description, 600);
  if (
    previousDescription &&
    previousDescription !== text(recommendation.description, 600)
  ) {
    return false;
  }

  return true;
}

export function operatorRecommendationRefinementFromAgreementState(
  agreementState = {},
) {
  const current = object(agreementState);
  const refinement = normalizeOperatorRecommendationRefinement(
    current[REFINEMENT_KEY],
  );
  if (!refinement) return null;
  return operatorRecommendationRefinementMatchesSourceRecommendation(
    current,
    refinement,
  )
    ? refinement
    : null;
}

export function agreementWithProductEngineeringRecommendationRefinement(
  agreementState = {},
  { recommendation = null, proposedFocus = null } = {},
) {
  const current = object(agreementState);
  const sourceRecommendation = object(recommendation);
  if (
    text(sourceRecommendation.capability_key, 240) !==
    PRODUCT_ENGINEERING_CYCLE_KEY
  ) {
    return current;
  }
  const sourceRecommendationId = text(
    sourceRecommendation.recommendation_id,
    160,
  );
  const sourceFocus = text(sourceRecommendation.payload?.focus, 2000);
  const sourceDescription = text(sourceRecommendation.description, 600);
  const focus = text(proposedFocus, 2000);
  if (!sourceRecommendationId || !sourceFocus || !focus) return current;

  return {
    ...current,
    [REFINEMENT_KEY]: {
      status: "PROPOSED_PRODUCT_ENGINEERING_REFINEMENT",
      capability_key: PRODUCT_ENGINEERING_CYCLE_KEY,
      proposed_focus: focus,
      previous_recommendation_id: sourceRecommendationId,
      previous_focus: sourceFocus,
      previous_description: sourceDescription || null,
      automatic_execution_started: false,
      authorization_effect: "NONE",
      current_main_reassessment_required: true,
      focus_is_priority_context_only: true,
      created_at: new Date().toISOString(),
    },
  };
}

export function clearOperatorRecommendationRefinement(agreementState = {}) {
  const next = { ...object(agreementState) };
  delete next[REFINEMENT_KEY];
  return next;
}

export function productEngineeringRecommendationFromRefinement(refinement) {
  const normalized = normalizeOperatorRecommendationRefinement(refinement);
  if (!normalized) return null;
  const focus = normalized.proposed_focus;
  const payloadResolution = resolveRecommendationRefinementPayload({
    proposal: { proposal_text: focus },
    capability: PRODUCT_ENGINEERING_REFINEMENT_CAPABILITY,
  });
  if (
    payloadResolution.ready !== true ||
    payloadResolution.old_payload_reused !== false ||
    text(payloadResolution.payload?.focus, 2000) !== focus
  ) {
    return null;
  }

  return {
    capability_key: PRODUCT_ENGINEERING_CYCLE_KEY,
    description: `Run one fresh Product Engineering Cycle prioritizing: ${focus}`.slice(
      0,
      600,
    ),
    payload: payloadResolution.payload,
    reason:
      `You refined the Product Engineering direction during a thinking-only discussion. This focus is prioritization context only; actual current main must still be reassessed before engineering starts.`.slice(
        0,
        800,
      ),
    original_message: focus,
    objective: focus,
    source: "product_engineering_discussion_refinement",
    payload_resolution_source: payloadResolution.source,
    old_payload_reused: false,
  };
}
