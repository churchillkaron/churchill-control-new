export const AVANTIQO_RESEARCH_MARGINAL_UTILITY_CONTRACT =
  "AVANTIQO_RESEARCH_MARGINAL_UTILITY_V1";

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

function count(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(1000, Math.floor(number));
}

function normalizedUrl(value) {
  try {
    const parsed = new URL(text(value, 4000));
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function sourceHost(value) {
  const url = normalizedUrl(value);
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function normalizedClaimKey(claim = {}) {
  return text(claim?.claim || claim?.text || claim?.statement, 4000)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim() || null;
}

function sourceBackedClaim(claim = {}) {
  const verificationStatus = text(claim?.verification_status, 120).toUpperCase();
  return list(claim?.source_urls || claim?.sourceUrls || claim?.sources).length > 0 ||
    verificationStatus === "SOURCE_BACKED" ||
    verificationStatus === "AVANTIQO_CANONICAL_PRODUCT" ||
    verificationStatus.startsWith("HYBRID_VERIFIED");
}

function conflictCount(payload = {}) {
  const source = object(payload);
  const graph = object(source.evidence_graph);
  const claims = list(source.claims);
  const conflictedClaims = claims.filter(
    (claim) => text(claim?.status, 120).toUpperCase() === "CONFLICTED",
  ).length;
  return Math.max(
    conflictedClaims,
    count(graph.conflicted_claim_count),
    count(graph.relevant_conflict_count),
  );
}

function providerSourceCount(payload = {}) {
  const evidence = object(object(payload).evidence);
  return Math.max(
    count(evidence.provider_source_count),
    count(evidence.returned_source_count),
  );
}

function researchMaterial(result = {}) {
  const envelope = object(result);
  if (envelope.ok !== true) return null;
  const payload = object(envelope.result);
  const sources = list(payload.sources);
  const claims = list(payload.claims);
  const uncertainty = list(payload.uncertainty);
  const followUps = list(payload.follow_up_queries || payload.followUpQueries);
  const mechanismQuality = object(payload.mechanism_quality);
  const knowledgeReuse = object(payload.knowledge_reuse);
  const evidenceGraph = object(payload.evidence_graph);
  const governance = object(payload.governance);
  const evidence = object(payload.evidence);
  const canonicalAuthority =
    governance.canonical_internal_product_authority === true ||
    text(evidence.authority, 160).toUpperCase() === "AVANTIQO_CANONICAL_PRODUCT" ||
    text(payload.status, 160).toUpperCase() === "CANONICAL_PRODUCT_KNOWLEDGE_REUSED";
  const verifiedKnowledgeReuse =
    text(payload.status, 160).toUpperCase() === "HYBRID_VERIFIED_KNOWLEDGE_REUSED" ||
    knowledgeReuse.reused === true;
  const hasResearchShape = Boolean(
    sources.length ||
    claims.length ||
    uncertainty.length ||
    followUps.length ||
    Object.keys(mechanismQuality).length ||
    Object.keys(knowledgeReuse).length ||
    Object.keys(evidenceGraph).length ||
    canonicalAuthority ||
    verifiedKnowledgeReuse,
  );
  if (!hasResearchShape) return null;

  const sourceKeys = sources
    .map((source) => normalizedUrl(source?.url || source?.source_url || source?.final_url))
    .filter(Boolean);
  const independentHosts = sourceKeys.map(sourceHost).filter(Boolean);
  const sourceBackedClaimKeys = claims
    .filter(sourceBackedClaim)
    .map(normalizedClaimKey)
    .filter(Boolean);
  const reportedSourceCount = Math.max(sources.length, providerSourceCount(payload));
  const completeComparableMaterial = Boolean(
    reportedSourceCount === sources.length &&
    sourceKeys.length === sources.length &&
    new Set(sourceKeys).size === sourceKeys.length &&
    sourceBackedClaimKeys.length === claims.filter(sourceBackedClaim).length,
  );

  return {
    source_keys: sourceKeys,
    independent_hosts: independentHosts,
    source_backed_claim_keys: sourceBackedClaimKeys,
    unresolved_uncertainty_count: count(uncertainty.length),
    follow_up_query_count: count(followUps.length),
    conflict_count: count(conflictCount(payload)),
    complete_comparable_material: completeComparableMaterial,
  };
}

export function createAvantiqoResearchMarginalUtilityTracker() {
  const seenSources = new Set();
  const seenHosts = new Set();
  const seenSourceBackedClaims = new Set();
  let rounds = 0;
  let previousComparable = false;
  let previousUncertaintyCount = null;
  let previousFollowUpCount = null;
  let previousConflictCount = null;

  return Object.freeze({
    observe(result = {}) {
      const material = researchMaterial(result);
      if (!material) return null;

      rounds += 1;
      const comparisonAvailable = rounds > 1 &&
        previousComparable === true &&
        material.complete_comparable_material === true;
      const newSourceCount = comparisonAvailable
        ? material.source_keys.filter((key) => !seenSources.has(key)).length
        : 0;
      const newIndependentSourceCount = comparisonAvailable
        ? [...new Set(material.independent_hosts)].filter((key) => !seenHosts.has(key)).length
        : 0;
      const newSourceBackedClaimCount = comparisonAvailable
        ? [...new Set(material.source_backed_claim_keys)]
            .filter((key) => !seenSourceBackedClaims.has(key)).length
        : 0;
      const uncertaintyReductionCount = comparisonAvailable
        ? Math.max(0, Number(previousUncertaintyCount || 0) - material.unresolved_uncertainty_count)
        : 0;
      const followUpReductionCount = comparisonAvailable
        ? Math.max(0, Number(previousFollowUpCount || 0) - material.follow_up_query_count)
        : 0;
      const conflictReductionCount = comparisonAvailable
        ? Math.max(0, Number(previousConflictCount || 0) - material.conflict_count)
        : 0;

      material.source_keys.forEach((key) => seenSources.add(key));
      material.independent_hosts.forEach((key) => seenHosts.add(key));
      material.source_backed_claim_keys.forEach((key) => seenSourceBackedClaims.add(key));
      previousComparable = material.complete_comparable_material === true;
      previousUncertaintyCount = material.unresolved_uncertainty_count;
      previousFollowUpCount = material.follow_up_query_count;
      previousConflictCount = material.conflict_count;

      return Object.freeze({
        marginal_utility_contract: AVANTIQO_RESEARCH_MARGINAL_UTILITY_CONTRACT,
        research_round: rounds,
        marginal_comparison_available: comparisonAvailable,
        marginal_new_source_count: count(newSourceCount),
        marginal_new_independent_source_count: count(newIndependentSourceCount),
        marginal_new_source_backed_claim_count: count(newSourceBackedClaimCount),
        marginal_uncertainty_reduction_count: count(uncertaintyReductionCount),
        marginal_follow_up_reduction_count: count(followUpReductionCount),
        marginal_conflict_reduction_count: count(conflictReductionCount),
        raw_research_persisted: false,
      });
    },
  });
}

export const AvantiqoResearchMarginalUtilityRuntime = Object.freeze({
  contract: AVANTIQO_RESEARCH_MARGINAL_UTILITY_CONTRACT,
  createTracker: createAvantiqoResearchMarginalUtilityTracker,
});
