import {
  continueRecommendationRefinementPreparationFromMessage,
  prepareRecommendationRefinement,
} from "./OperatorRecommendationRefinementPreparationRuntime.js";

const PREPARATION_KEY = "recommendation_refinement_preparation";

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

function proposalMatchesPreparation(preparation, proposal) {
  const state = object(preparation);
  const current = object(proposal);
  const stateId = text(state.proposal_id, 160);
  const proposalId = text(current.proposal_id, 160);
  const stateText = text(state.proposal_text, 4000);
  const proposalText = text(current.proposal_text, 4000);
  if (stateId && stateId !== proposalId) return false;
  if (stateText && stateText !== proposalText) return false;
  return Boolean(stateId || stateText) && Boolean(proposalId || proposalText);
}

function capabilityKeyFromPreparation(result) {
  return (
    text(result?.capability?.key, 240) ||
    text(result?.plan?.capability?.key, 240) ||
    text(result?.input_state?.capability_key, 240) ||
    null
  );
}

function clarificationFromResult(result) {
  const clarification = object(result?.clarification);
  return Object.keys(clarification).length ? clarification : null;
}

function authorityFreeState(result, proposal) {
  return {
    stage: text(result?.stage, 120) || "PREPARATION_REQUIRED",
    proposal_id: text(proposal?.proposal_id, 160) || null,
    proposal_text: text(proposal?.proposal_text, 4000) || null,
    capability_key: capabilityKeyFromPreparation(result),
    input_state: result?.input_state ? object(result.input_state) : null,
    clarification: clarificationFromResult(result),
    authorization_effect: "NONE",
    execution_authorized: false,
    recommendation_binding_created: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
    updated_at: new Date().toISOString(),
  };
}

export function recommendationRefinementPreparationFromAgreementState(
  agreementState = {},
  proposal = null,
) {
  const preparation = object(object(agreementState)[PREPARATION_KEY]);
  if (!Object.keys(preparation).length) return null;
  if (!proposalMatchesPreparation(preparation, proposal)) return null;
  if (
    preparation.execution_authorized !== false ||
    preparation.pending_execution_created !== false ||
    preparation.autonomous_run_created !== false ||
    preparation.old_payload_reused !== false
  ) {
    return null;
  }
  return preparation;
}

export function clearRecommendationRefinementPreparation(agreementState = {}) {
  const current = { ...object(agreementState) };
  delete current[PREPARATION_KEY];
  return current;
}

export function agreementWithRecommendationRefinementPreparation(
  agreementState = {},
  result = null,
  proposal = null,
) {
  const current = clearRecommendationRefinementPreparation(agreementState);
  if (result?.ready_for_governed_binding === true) return current;
  return {
    ...current,
    [PREPARATION_KEY]: authorityFreeState(result, proposal),
  };
}

export function prepareSelectedRefinementForGovernedBinding({
  proposal = null,
  capabilities = [],
  context = null,
  permissions = [],
  role = null,
} = {}) {
  return prepareRecommendationRefinement({
    proposal,
    capabilities,
    context,
    permissions,
    role,
  });
}

export function continueSelectedRefinementPreparationFromMessage({
  proposal = null,
  preparation = null,
  capabilities = [],
  message = null,
  context = null,
  permissions = [],
  role = null,
} = {}) {
  const current = object(preparation);
  if (!proposalMatchesPreparation(current, proposal)) {
    return {
      stage: "PREPARATION_PROPOSAL_MISMATCH",
      ready_for_governed_binding: false,
      authorization_effect: "NONE",
      execution_authorized: false,
      recommendation_binding_created: false,
      pending_execution_created: false,
      autonomous_run_created: false,
      old_payload_reused: false,
      clear_preparation: true,
    };
  }

  if (text(current.stage, 120) === "CAPABILITY_CLARIFICATION_REQUIRED") {
    return prepareRecommendationRefinement({
      proposal: {
        ...object(proposal),
        capability_resolution_text: text(message, 4000),
      },
      capabilities,
      context,
      permissions,
      role,
    });
  }

  const capabilityKey =
    text(current.capability_key, 240) ||
    text(current.input_state?.capability_key, 240);
  const capability = list(capabilities).find(
    (item) => text(item?.key, 240) === capabilityKey,
  ) || null;
  if (!capability) {
    return {
      stage: "CAPABILITY_UNAVAILABLE_DURING_CLARIFICATION",
      ready_for_governed_binding: false,
      authorization_effect: "NONE",
      execution_authorized: false,
      recommendation_binding_created: false,
      pending_execution_created: false,
      autonomous_run_created: false,
      old_payload_reused: false,
      clear_preparation: true,
    };
  }

  const result = continueRecommendationRefinementPreparationFromMessage({
    proposal,
    inputState: current.input_state,
    capability,
    clarification: current.clarification,
    message,
    context,
    permissions,
    role,
  });

  const hardFailure = [
    "REFINEMENT_INPUT_SCHEMA_CHANGED",
    "ACTOR_POLICY_CHANGED_DURING_CLARIFICATION",
    "BINDING_PREFLIGHT_FAILED_CLOSED",
    "REVALIDATION_REQUIRED_OR_FAILED",
    "CANDIDATE_CREATION_FAILED_CLOSED",
  ].includes(
    text(result?.answer_result?.reason || result?.stage, 160),
  );

  return hardFailure
    ? { ...result, clear_preparation: true }
    : result;
}

export default {
  agreementWithRecommendationRefinementPreparation,
  clearRecommendationRefinementPreparation,
  continueSelectedRefinementPreparationFromMessage,
  prepareSelectedRefinementForGovernedBinding,
  recommendationRefinementPreparationFromAgreementState,
};
