import {
  resolveRecommendationRefinementCapability,
} from "./OperatorRecommendationRefinementCapabilityResolver.js";
import {
  resolveRecommendationRefinementPayload,
} from "./OperatorRecommendationRefinementPayloadResolver.js";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

export function planRecommendationRefinementMaterialization({
  proposal = null,
  capabilities = [],
} = {}) {
  const capabilityResolution = resolveRecommendationRefinementCapability({
    proposal,
    capabilities,
  });
  const capability = capabilityResolution.capability;
  const payloadResolution = capability
    ? resolveRecommendationRefinementPayload({ proposal, capability })
    : {
        payload: {},
        ready: false,
        derived_fields: [],
        context_fields: [],
        missing_required_fields: [],
        old_payload_reused: false,
        guessed_identifiers: false,
        guessed_numbers: false,
        guessed_dates: false,
        guessed_enums: false,
        guessed_booleans: false,
        source: "selected_refinement_schema_safe_payload",
      };

  const ready = Boolean(capability && payloadResolution.ready);
  return {
    ready,
    capability,
    payload: payloadResolution.payload,
    proposal_text: text(proposal?.proposal_text, 4000) || null,
    capability_resolution: {
      kind: capabilityResolution.resolution_kind,
      strong_match: capabilityResolution.strong_match,
      old_capability_identity_reused:
        capabilityResolution.old_capability_identity_reused,
      ranked_candidate_count: capabilityResolution.ranked_candidate_count,
      top_score: capabilityResolution.top_score,
      top_phrase_affinity: capabilityResolution.top_phrase_affinity,
      top_primary_coverage: capabilityResolution.top_primary_coverage,
      separation: capabilityResolution.separation,
    },
    payload_resolution: payloadResolution,
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
    missing_required_fields: payloadResolution.missing_required_fields,
    requires_clarification:
      Boolean(capability) && payloadResolution.ready !== true,
    source: "selected_refinement_materialization_plan",
  };
}

export default planRecommendationRefinementMaterialization;
