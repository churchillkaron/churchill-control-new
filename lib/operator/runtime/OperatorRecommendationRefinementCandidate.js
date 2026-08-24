function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function createRecommendationCandidateFromRefinementRevalidation({
  revalidation = null,
  capability = null,
  proposal = null,
} = {}) {
  const validated = object(revalidation);
  const currentCapability = object(capability);
  const capabilityKey = text(currentCapability.key, 240);
  if (
    validated.ready_for_governed_recommendation !== true ||
    validated.current_capability_revalidated !== true ||
    validated.requires_fresh_recommendation_binding !== true ||
    validated.authorization_effect !== "NONE" ||
    validated.execution_authorized !== false ||
    validated.pending_execution_created !== false ||
    validated.autonomous_run_created !== false ||
    validated.old_payload_reused !== false ||
    !capabilityKey ||
    capabilityKey !== text(validated.capability_key, 240)
  ) {
    return null;
  }

  const proposalText = text(proposal?.proposal_text, 4000);
  const description =
    proposalText ||
    text(currentCapability.description, 800) ||
    text(currentCapability.name, 400) ||
    "Refined governed action";
  const payload = { ...object(validated.payload) };

  return {
    candidate_kind: "refinement_revalidated_recommendation_candidate",
    capability_key: capabilityKey,
    description: description.slice(0, 800),
    payload,
    reason: proposalText
      ? `Selected refinement was revalidated against the current registered capability and current schema: ${proposalText}`.slice(0, 1000)
      : "Selected refinement was revalidated against the current registered capability and current schema.",
    objective: proposalText || description.slice(0, 800),
    original_message: proposalText || null,
    source: "selected_refinement_current_capability_revalidation",
    authorization_effect: "NONE",
    execution_authorized: false,
    recommendation_binding_created: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
    requires_fresh_recommendation_binding: true,
  };
}

export default createRecommendationCandidateFromRefinementRevalidation;
