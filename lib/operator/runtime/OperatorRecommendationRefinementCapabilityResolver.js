import {
  resolveOperatorCapabilityMatch,
} from "./OperatorCapabilityMatcher";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function strongMatch(top, separation) {
  if (!top?.capability) return false;
  return (
    Number(top.phrase_affinity || 0) >= 0.78 ||
    (Number(top.score || 0) >= 0.42 && Number(separation || 0) >= 0.12) ||
    (Number(top.primary_coverage || 0) >= 0.58 && Number(separation || 0) >= 0.09)
  );
}

export function resolveRecommendationRefinementCapability({
  proposal = null,
  capabilities = [],
} = {}) {
  const available = list(capabilities);
  const selectionOrigin = text(proposal?.selection_origin).toUpperCase();
  const restoredOriginal =
    selectionOrigin === "ORIGINAL_RECOMMENDATION_CONTEXT";

  if (restoredOriginal) {
    const previousCapabilityKey = text(proposal?.previous_capability_key);
    const capability = previousCapabilityKey
      ? available.find(
          (item) => text(item?.key) === previousCapabilityKey,
        ) || null
      : null;

    return {
      capability,
      resolution_kind: "RESTORED_ORIGINAL_FRESH_IDENTITY",
      strong_match: Boolean(capability),
      old_capability_identity_reused: Boolean(capability),
      ranked_candidate_count: 0,
      top_score: null,
      top_phrase_affinity: null,
      top_primary_coverage: null,
      separation: null,
    };
  }

  const proposalText = text(proposal?.proposal_text).slice(0, 4000);
  if (!proposalText || !available.length) {
    return {
      capability: null,
      resolution_kind: "FRESH_STRONG_CATALOG_RANKING",
      strong_match: false,
      old_capability_identity_reused: false,
      ranked_candidate_count: 0,
      top_score: null,
      top_phrase_affinity: null,
      top_primary_coverage: null,
      separation: null,
    };
  }

  const resolution = resolveOperatorCapabilityMatch({
    message: proposalText,
    capabilities: available,
    modes: ["draft", "write", "approve"],
    limit: 3,
  });
  const top = resolution?.top || null;
  const separation = Number(resolution?.separation || 0);
  const strong = strongMatch(top, separation);

  return {
    capability: strong ? top.capability : null,
    resolution_kind: "FRESH_STRONG_CATALOG_RANKING",
    strong_match: strong,
    old_capability_identity_reused: false,
    ranked_candidate_count: list(resolution?.ranked).length,
    top_score: top ? Number(top.score || 0) : null,
    top_phrase_affinity: top ? Number(top.phrase_affinity || 0) : null,
    top_primary_coverage: top ? Number(top.primary_coverage || 0) : null,
    separation: top ? separation : null,
  };
}

export default resolveRecommendationRefinementCapability;
