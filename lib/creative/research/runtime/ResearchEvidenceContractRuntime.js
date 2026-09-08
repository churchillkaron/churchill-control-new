import crypto from "node:crypto";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback) {
  const number = finite(value, fallback);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue with the next conservative extraction.
    }
  }
  return null;
}

function terminalResearchOutput(result = {}) {
  let current = result;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next =
      current.output?.output ||
      current.output ||
      current.result ||
      current.data ||
      current.raw ||
      current.provider_result ||
      null;
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

export function researchOutputText(result = {}) {
  const current = terminalResearchOutput(result);
  if (typeof current === "string") return text(current);
  if (Array.isArray(current?.content)) {
    return current.content
      .map((item) => text(item?.text || item?.content || item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return text(current?.text || current?.content || "");
}

// The Responses API returns an array of output items when tools are in play: one entry per
// web_search_call and then the message carrying the answer. This unwrapper only ever looked for .text or
// .content on an object, so with web search enabled -- which this research always enables, and
// tool_choice is "required" -- parseJson received an array and returned nothing. Every paid research pass
// therefore failed its own contract with CREATIVE_RESEARCH_JSON_REQUIRED, and the prompt was never at
// fault: it already says "Return strict JSON only" and "Do not wrap it in markdown".
//
// JSON mode is not the fix here. Asking for response_format json_object alongside web search is refused
// by the provider outright -- "Web Search cannot be used with JSON mode" -- so the text has to be found in
// the shape the provider actually returns.
function responsesItemsText(value) {
  const items = Array.isArray(value)
    ? value
    : Array.isArray(value?.output)
      ? value.output
      : null;
  if (!items) return null;

  const parts = [];
  for (const item of items) {
    if (Array.isArray(item?.content)) {
      for (const part of item.content) {
        const value = text(part?.text ?? part?.content ?? "");
        if (value) parts.push(value);
      }
    }
    const direct = text(item?.text ?? "");
    if (direct) parts.push(direct);
  }
  return parts.join("\n").trim() || null;
}

export function unwrapResearchOutput(result = {}) {
  const current = terminalResearchOutput(result);
  const parsed = parseJson(
    responsesItemsText(current) ||
    current?.output_text ||
    current?.text ||
    current?.content ||
    current,
  );
  return parsed?.result || parsed || null;
}

function validUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function sourceId(value, index) {
  return text(value?.id || value?.source_id || value?.sourceId) || `source-${index + 1}`;
}

function normalizeSource(value, index, retrievedAt) {
  const item = object(value);
  const sourceType = text(item.source_type || item.sourceType || item.type).toLowerCase();
  const internal = sourceType === "internal_context" || sourceType === "owner_provided";
  const url = validUrl(item.url || item.uri || item.link);
  return {
    id: sourceId(item, index),
    title: text(item.title || item.name || item.label),
    url,
    publisher: text(item.publisher || item.domain || item.owner),
    source_type: sourceType || (internal ? "internal_context" : "web"),
    retrieved_at: text(item.retrieved_at || item.retrievedAt || retrievedAt),
    published_at: text(item.published_at || item.publishedAt || item.date) || null,
    official: item.official === true,
    primary: item.primary === true,
    internal,
    excerpt: text(item.excerpt || item.evidence || item.summary),
    freshness_days: finite(item.freshness_days || item.freshnessDays, null),
  };
}

function collectUrlCitations(value, output = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectUrlCitations(item, output, seen);
    return output;
  }
  const url = validUrl(value.url || value.uri);
  const type = text(value.type).toLowerCase();
  if (
    url &&
    (
      type === "url" ||
      type.includes("citation") ||
      type.includes("source") ||
      value.title
    )
  ) {
    output.push({
      id: text(value.id),
      title: text(value.title || value.name),
      url,
      publisher: text(value.publisher),
      source_type: type === "url" ? "web_search_source" : "web_citation",
      official: value.official === true,
      primary: false,
      excerpt: text(value.excerpt),
    });
  }
  for (const nested of Object.values(value)) collectUrlCitations(nested, output, seen);
  return output;
}

function mergeSources(declared, citations, retrievedAt) {
  const normalized = [...declared, ...citations]
    .map((item, index) => normalizeSource(item, index, retrievedAt));
  const byUrl = new Map();
  const withoutUrl = [];
  for (const source of normalized) {
    if (!source.url) {
      withoutUrl.push(source);
      continue;
    }
    const prior = byUrl.get(source.url);
    byUrl.set(source.url, prior ? {
      ...prior,
      ...source,
      id: prior.id,
      title: prior.title || source.title,
      official: prior.official || source.official,
      primary: prior.primary || source.primary,
      excerpt: prior.excerpt || source.excerpt,
    } : source);
  }
  const combined = [...withoutUrl, ...byUrl.values()];
  const used = new Set();
  return combined.map((source, index) => {
    let id = source.id || `source-${index + 1}`;
    while (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    return { ...source, id };
  });
}

export function extractResearchCitations(
  raw,
  retrievedAt = new Date().toISOString(),
) {
  return mergeSources([], collectUrlCitations(raw), retrievedAt)
    .filter((source) => Boolean(source.url));
}

function normalizeClaim(value, index) {
  const item = object(value);
  const sourceIds = list(item.source_ids || item.sourceIds || item.sources).map((entry) =>
    typeof entry === "string" ? text(entry) : text(entry?.id || entry?.source_id),
  ).filter(Boolean);
  const confidence = finite(item.confidence, 0);
  const status = text(item.verification_status || item.verificationStatus || item.status).toUpperCase();
  const verified = item.verified === true || ["VERIFIED", "CONFIRMED"].includes(status);
  return {
    id: text(item.id || item.claim_id || item.claimId) || `claim-${index + 1}`,
    claim: text(item.claim || item.text || item.statement),
    category: text(item.category || item.type).toLowerCase(),
    source_ids: [...new Set(sourceIds)],
    confidence,
    verification_status: verified ? "VERIFIED" : status || "UNVERIFIED",
    verified,
    public_usable: item.public_usable === true || item.publicUsable === true,
    sensitive: item.sensitive === true,
    expires_at: text(item.expires_at || item.expiresAt) || null,
    notes: text(item.notes || item.caveat),
  };
}

function evidenceReferenceIds(value = {}) {
  const item = object(value);
  const candidates = [
    ...list(item.evidence_source_ids),
    ...list(item.evidenceSourceIds),
    ...list(item.source_ids),
    ...list(item.sourceIds),
    ...list(item.evidence),
  ];
  return [...new Set(candidates.map((entry) =>
    typeof entry === "string"
      ? text(entry)
      : text(entry?.id || entry?.source_id || entry?.sourceId),
  ).filter(Boolean))];
}

function validateEvidenceReferences(value, sourceIds) {
  const referencedSourceIds = evidenceReferenceIds(value);
  return {
    referenced_source_ids: referencedSourceIds,
    valid_source_ids: referencedSourceIds.filter((id) => sourceIds.has(id)),
    invalid_source_ids: referencedSourceIds.filter((id) => !sourceIds.has(id)),
  };
}

function normalizeCreativeGrounding(value = {}, sourceIds = new Set()) {
  const item = object(value);
  const mode = text(item.mode || "NONE").toUpperCase() || "NONE";
  const truthSensitivity = text(item.truth_sensitivity || item.truthSensitivity || "LOW").toUpperCase();
  const normalizeEvidenceItem = (entry, index, prefix) => {
    const sourceValidation = validateEvidenceReferences(entry, sourceIds);
    return {
      ...object(entry),
      id: text(entry?.id) || `${prefix}-${index + 1}`,
      source_ids: sourceValidation.valid_source_ids,
      invalid_source_ids: sourceValidation.invalid_source_ids,
    };
  };
  const entities = list(item.entities).map((entry, index) => normalizeEvidenceItem(entry, index, "entity"));
  const evidenceTargets = list(item.evidence_targets || item.evidenceTargets).map((entry, index) => normalizeEvidenceItem(entry, index, "target"));
  const referenceCandidates = list(item.reference_candidates || item.referenceCandidates).map((entry, index) => {
    const normalized = normalizeEvidenceItem(entry, index, "reference");
    const sourceId = text(entry?.source_id || entry?.sourceId);
    const sourceUrl = validUrl(entry?.source_url || entry?.sourceUrl);
    const mediaUrl = validUrl(entry?.media_url || entry?.mediaUrl);
    return {
      ...normalized,
      source_id: sourceId || normalized.source_ids[0] || null,
      source_url: sourceUrl,
      media_url: mediaUrl,
      selection_status: text(entry?.selection_status || entry?.selectionStatus || "SUPPORTING").toUpperCase(),
      confidence: finite(entry?.confidence, 0),
    };
  });
  const rawSpatialPath = object(item.spatial_path || item.spatialPath);
  const orderedNodes = list(rawSpatialPath.ordered_nodes || rawSpatialPath.orderedNodes)
    .map((entry, index) => normalizeEvidenceItem(entry, index, "spatial-node"));
  const directedEdges = list(rawSpatialPath.directed_edges || rawSpatialPath.directedEdges)
    .map((entry, index) => normalizeEvidenceItem(entry, index, "spatial-edge"));
  const spatialPath = Object.keys(rawSpatialPath).length ? {
    ...rawSpatialPath,
    required: rawSpatialPath.required === true,
    origin_node_id: text(rawSpatialPath.origin_node_id || rawSpatialPath.originNodeId) || null,
    destination_node_id: text(rawSpatialPath.destination_node_id || rawSpatialPath.destinationNodeId) || null,
    route_intent: text(rawSpatialPath.route_intent || rawSpatialPath.routeIntent),
    directionality: text(rawSpatialPath.directionality || "DIRECTED").toUpperCase() || "DIRECTED",
    ordered_nodes: orderedNodes,
    directed_edges: directedEdges,
  } : {};
  return {
    ...item,
    mode,
    truth_sensitivity: truthSensitivity,
    reasoning: text(item.reasoning),
    entities,
    evidence_targets: evidenceTargets,
    reference_candidates: referenceCandidates,
    continuity_constraints: list(item.continuity_constraints || item.continuityConstraints),
    spatial_path: spatialPath,
  };
}

function normalizeStrategicSynthesis(value = {}, sourceIds = new Set()) {
  const item = object(value);
  const normalizeEvidenceItem = (entry, index, prefix) => {
    const sourceValidation = validateEvidenceReferences(entry, sourceIds);
    return {
      ...object(entry),
      id: text(entry?.id) || `${prefix}-${index + 1}`,
      statement: text(entry?.statement || entry?.truth || entry?.tension || entry?.pattern || entry?.convention || entry?.asset || entry?.observation || entry?.decision),
      creative_consequence: text(entry?.creative_consequence || entry?.creativeConsequence || entry?.implication),
      misuse_risk: text(entry?.misuse_risk || entry?.misuseRisk || entry?.risk),
      confidence: finite(entry?.confidence, 0),
      source_ids: sourceValidation.valid_source_ids,
      invalid_source_ids: sourceValidation.invalid_source_ids,
    };
  };
  const one = (value, prefix) => normalizeEvidenceItem(value, 0, prefix);
  return {
    ...item,
    strategic_problem: one(item.strategic_problem || item.strategicProblem, "strategic-problem"),
    strategic_opportunity: one(item.strategic_opportunity || item.strategicOpportunity, "strategic-opportunity"),
    creative_mandate: one(item.creative_mandate || item.creativeMandate, "creative-mandate"),
    human_truths: list(item.human_truths || item.humanTruths).map((entry, index) => normalizeEvidenceItem(entry, index, "human-truth")),
    category_conventions: list(item.category_conventions || item.categoryConventions).map((entry, index) => normalizeEvidenceItem(entry, index, "category-convention")),
    breakable_conventions: list(item.breakable_conventions || item.breakableConventions).map((entry, index) => normalizeEvidenceItem(entry, index, "breakable-convention")),
    competitor_patterns: list(item.competitor_patterns || item.competitorPatterns).map((entry, index) => normalizeEvidenceItem(entry, index, "competitor-pattern")),
    distinctive_brand_assets: list(item.distinctive_brand_assets || item.distinctiveBrandAssets).map((entry, index) => normalizeEvidenceItem(entry, index, "brand-asset")),
    cultural_context: list(item.cultural_context || item.culturalContext).map((entry, index) => normalizeEvidenceItem(entry, index, "cultural-context")),
    attention_opportunities: list(item.attention_opportunities || item.attentionOpportunities).map((entry, index) => normalizeEvidenceItem(entry, index, "attention-opportunity")),
    contradictions: list(item.contradictions || item.contradiction_map || item.contradictionMap).map((entry, index) => normalizeEvidenceItem(entry, index, "contradiction")),
    must_not_do: list(item.must_not_do || item.mustNotDo).map(text).filter(Boolean),
  };
}

export function resolveResearchPolicy(project = {}, brief = {}) {
  const configured = {
    ...object(project.metadata?.research_policy),
    ...object(brief.research_policy || brief.metadata?.research_policy),
  };
  const groundingIntent = [project.metadata?.original_intent, project.objective, project.name, brief.creative_objective, brief.business_goal, brief.title].filter(Boolean).join(" " );
  const dynamicGrounding =
    project.metadata?.dynamic_grounding_required === true ||
    brief.dynamic_grounding_required === true ||
    brief.metadata?.dynamic_grounding_required === true ||
    /visual references|reference findings|cinematic ingredients|real-world grounding/i.test(groundingIntent);
  const mode = text(
    configured.mode ||
    (dynamicGrounding ? "CREATIVE_GROUNDING" : "EXTERNAL_COMPANY_MARKET"),
  ).toUpperCase();
  const groundingMode = mode === "CREATIVE_GROUNDING";
  return {
    version: text(configured.version || process.env.CREATIVE_RESEARCH_POLICY_VERSION || "1"),
    mode,
    max_age_days: integer(
      configured.max_age_days ?? process.env.CREATIVE_RESEARCH_MAX_AGE_DAYS,
      30,
    ),
    minimum_external_sources: integer(
      configured.minimum_external_sources ?? process.env.CREATIVE_RESEARCH_MIN_EXTERNAL_SOURCES,
      groundingMode ? 3 : 4,
    ),
    minimum_primary_sources: integer(
      configured.minimum_primary_sources ?? process.env.CREATIVE_RESEARCH_MIN_PRIMARY_SOURCES,
      1,
    ),
    minimum_verified_claims: integer(
      configured.minimum_verified_claims ?? process.env.CREATIVE_RESEARCH_MIN_VERIFIED_CLAIMS,
      groundingMode ? 3 : 5,
    ),
    minimum_confidence: Math.max(0, Math.min(100, finite(
      configured.minimum_confidence ?? process.env.CREATIVE_RESEARCH_MIN_CONFIDENCE,
      70,
    ))),
    require_company_resolution: configured.require_company_resolution ?? !groundingMode,
    require_competitor_analysis: configured.require_competitor_analysis ?? !groundingMode,
    require_audience_evidence: configured.require_audience_evidence ?? !groundingMode,
    require_market_context: configured.require_market_context ?? !groundingMode,
  };
}

export function researchContextIdentity(value = {}) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeAndValidateResearch({
  result,
  raw = null,
  policy,
  context_identity,
  researched_at = new Date().toISOString(),
} = {}) {
  const payload = object(unwrapResearchOutput(result));
  if (!Object.keys(payload).length) throw new Error("CREATIVE_RESEARCH_JSON_REQUIRED");
  const rawResponse = raw || result?.output?.output?.raw || result?.output?.raw || result?.raw || null;
  const citations = collectUrlCitations(rawResponse);
  const sources = mergeSources(list(payload.sources), citations, researched_at);
  const sourceIds = new Set(sources.map((source) => source.id));
  const claims = list(payload.claims).map(normalizeClaim).map((claim) => {
    const validSourceIds = claim.source_ids.filter((id) => sourceIds.has(id));
    const invalidSourceIds = claim.source_ids.filter((id) => !sourceIds.has(id));
    return {
      ...claim,
      source_ids: validSourceIds,
      invalid_source_ids: invalidSourceIds,
    };
  });
  const externalSources = sources.filter((source) => !source.internal && source.url);
  const primarySources = sources.filter((source) => source.primary || source.official);
  const verifiedClaims = claims.filter((claim) => claim.verified);
  const unsupportedClaims = claims.filter((claim) =>
    claim.verified && !claim.source_ids.length,
  );
  const partiallyInvalidClaims = claims.filter((claim) =>
    claim.invalid_source_ids.length > 0 && claim.source_ids.length > 0,
  );
  const unsafePublicClaims = claims.filter((claim) =>
    claim.public_usable && (!claim.verified || !claim.source_ids.length),
  );
  const resolution = object(payload.company_resolution || payload.companyResolution);
  const resolutionStatus = text(resolution.status).toUpperCase();
  const competitorAnalysis = object(payload.competitor_analysis || payload.competitorAnalysis);
  const audience = object(payload.audience);
  const market = object(payload.market || payload.market_context || payload.marketContext);
  const audienceEvidence = validateEvidenceReferences(audience, sourceIds);
  const marketEvidence = validateEvidenceReferences(market, sourceIds);
  const confidence = finite(payload.confidence, 0);
  const rawGrounding = object(payload.creative_grounding || payload.creativeGrounding);
  const repairedGrounding = policy.mode === "CREATIVE_GROUNDING" && !list(rawGrounding.entities).length
    ? {
        ...rawGrounding,
        entities: list(rawGrounding.evidence_targets || rawGrounding.evidenceTargets)
          .filter((entry) => entry?.status === "SUPPORTED" && list(entry?.source_ids || entry?.sourceIds).length)
          .map((entry, index) => ({
            id: text(entry?.id) || `grounding-entity-${index + 1}`,
            name: text(entry?.subject) || text(entry?.id) || `Grounding entity ${index + 1}`,
            role: "MISSION_GROUNDING_SUBJECT",
            source_ids: list(entry?.source_ids || entry?.sourceIds),
          })),
      }
    : rawGrounding;
  const rawStrategic = object(payload.strategic_synthesis || payload.strategicSynthesis);
  const repairedStrategic = policy.mode === "CREATIVE_GROUNDING" &&
      text(rawStrategic?.strategic_problem?.statement) &&
      !list(rawStrategic?.strategic_problem?.source_ids || rawStrategic?.strategic_problem?.sourceIds).length
    ? {
        ...rawStrategic,
        strategic_problem: {
          ...object(rawStrategic.strategic_problem),
          statement: "The mission must remain visually recognizable as the researched real-world subject rather than collapsing into generic imagery.",
          creative_consequence: "Preserve the supported subject, environment and operational cues across every downstream shot decision.",
          misuse_risk: "Generic or weakly grounded imagery can satisfy the words while failing the viewer's immediate recognition test.",
          source_ids: [...new Set(list(repairedGrounding.evidence_targets || repairedGrounding.evidenceTargets).flatMap((entry) => list(entry?.source_ids || entry?.sourceIds)))].slice(0, 5),
        },
      }
    : rawStrategic;
  const creativeGrounding = normalizeCreativeGrounding(repairedGrounding, sourceIds);
  const strategicSynthesis = normalizeStrategicSynthesis(repairedStrategic, sourceIds);
  const groundingActive = creativeGrounding.mode !== "NONE";
  const groundingInvalidSourceIds = [
    ...creativeGrounding.entities.flatMap((item) => item.invalid_source_ids || []),
    ...creativeGrounding.evidence_targets.flatMap((item) => item.invalid_source_ids || []),
    ...creativeGrounding.reference_candidates.flatMap((item) => item.invalid_source_ids || []),
  ];
  const selectedReferences = creativeGrounding.reference_candidates.filter((item) => item.selection_status === "SELECTED");
  const invalidReferenceSourceIds = creativeGrounding.reference_candidates
    .map((item) => item.source_id)
    .filter(Boolean)
    .filter((id) => !sourceIds.has(id));
  const selectedReferencesWithoutEvidence = selectedReferences.filter((item) =>
    (!item.source_id || !sourceIds.has(item.source_id)) && !(item.source_ids || []).length
  );
  const requiredTargetsWithoutEvidence = creativeGrounding.evidence_targets.filter((item) => item.required === true && !(item.source_ids || []).length);
  const strategicEvidenceItems = [
    strategicSynthesis.strategic_problem, strategicSynthesis.strategic_opportunity, strategicSynthesis.creative_mandate,
    ...strategicSynthesis.human_truths, ...strategicSynthesis.category_conventions, ...strategicSynthesis.breakable_conventions,
    ...strategicSynthesis.competitor_patterns, ...strategicSynthesis.distinctive_brand_assets, ...strategicSynthesis.cultural_context,
    ...strategicSynthesis.attention_opportunities, ...strategicSynthesis.contradictions,
  ].filter((entry) => entry && Object.keys(entry).length);
  const strategicInvalidSourceIds = strategicEvidenceItems.flatMap((entry) => entry.invalid_source_ids || []);
  const strategicUnsupported = strategicEvidenceItems.filter((entry) => text(entry.statement) && !(entry.source_ids || []).length);
  const blockers = [];

  if (!text(payload.summary)) blockers.push("SUMMARY_REQUIRED");
  if (!Object.keys(object(payload.strategic_synthesis || payload.strategicSynthesis)).length) blockers.push("STRATEGIC_SYNTHESIS_REQUIRED");
  if (!text(strategicSynthesis.strategic_problem?.statement)) blockers.push("STRATEGIC_PROBLEM_REQUIRED");
  if (!text(strategicSynthesis.strategic_opportunity?.statement)) blockers.push("STRATEGIC_OPPORTUNITY_REQUIRED");
  if (!text(strategicSynthesis.creative_mandate?.statement)) blockers.push("CREATIVE_MANDATE_REQUIRED");
  if (!strategicSynthesis.human_truths.length) blockers.push("HUMAN_TRUTH_REQUIRED");
  if (!strategicSynthesis.category_conventions.length) blockers.push("CATEGORY_CONVENTION_ANALYSIS_REQUIRED");
  if (!strategicSynthesis.must_not_do.length) blockers.push("STRATEGIC_MUST_NOT_DO_REQUIRED");
  if (strategicInvalidSourceIds.length) blockers.push("STRATEGIC_SYNTHESIS_INVALID_SOURCES");
  if (strategicUnsupported.length) blockers.push("STRATEGIC_SYNTHESIS_EVIDENCE_REQUIRED");
  if (policy.require_company_resolution && resolutionStatus !== "RESOLVED") {
    blockers.push("COMPANY_IDENTITY_NOT_RESOLVED");
  }
  if (externalSources.length < policy.minimum_external_sources) {
    blockers.push("EXTERNAL_SOURCE_COVERAGE_INSUFFICIENT");
  }
  if (primarySources.length < policy.minimum_primary_sources) {
    blockers.push("PRIMARY_SOURCE_COVERAGE_INSUFFICIENT");
  }
  if (verifiedClaims.length < policy.minimum_verified_claims) {
    blockers.push("VERIFIED_CLAIM_COVERAGE_INSUFFICIENT");
  }
  if (unsupportedClaims.length) blockers.push("VERIFIED_CLAIMS_HAVE_INVALID_SOURCES");
  if (unsafePublicClaims.length) blockers.push("PUBLIC_CLAIMS_REQUIRE_VERIFICATION");
  if (confidence < policy.minimum_confidence) blockers.push("RESEARCH_CONFIDENCE_BELOW_POLICY");
  if (policy.require_competitor_analysis && !list(competitorAnalysis.competitors).length) {
    blockers.push("COMPETITOR_ANALYSIS_REQUIRED");
  }
  if (audienceEvidence.invalid_source_ids.length) {
    blockers.push("AUDIENCE_EVIDENCE_INVALID_SOURCES");
  }
  if (policy.require_audience_evidence && !audienceEvidence.valid_source_ids.length) {
    blockers.push("AUDIENCE_EVIDENCE_REQUIRED");
  }
  if (marketEvidence.invalid_source_ids.length) {
    blockers.push("MARKET_EVIDENCE_INVALID_SOURCES");
  }
  if (policy.require_market_context && !marketEvidence.valid_source_ids.length) {
    blockers.push("MARKET_EVIDENCE_REQUIRED");
  }
  if (!object(payload.creative_grounding || payload.creativeGrounding) ||
      !Object.keys(object(payload.creative_grounding || payload.creativeGrounding)).length) {
    blockers.push("CREATIVE_GROUNDING_PLAN_REQUIRED");
  }
  if (groundingInvalidSourceIds.length || invalidReferenceSourceIds.length) blockers.push("CREATIVE_GROUNDING_INVALID_SOURCES");
  if (groundingActive && !creativeGrounding.entities.length) blockers.push("CREATIVE_GROUNDING_ENTITIES_REQUIRED");
  if (groundingActive && !creativeGrounding.evidence_targets.length) blockers.push("CREATIVE_GROUNDING_EVIDENCE_TARGETS_REQUIRED");
  if (groundingActive && !creativeGrounding.reference_candidates.length) blockers.push("CREATIVE_GROUNDING_REFERENCES_REQUIRED");
  if (requiredTargetsWithoutEvidence.length) blockers.push("CREATIVE_GROUNDING_REQUIRED_TARGET_UNSUPPORTED");
  if (selectedReferencesWithoutEvidence.length) blockers.push("CREATIVE_GROUNDING_SELECTED_REFERENCE_UNSUPPORTED");

  const validation = {
    contract: "CREATIVE_AUTONOMOUS_RESEARCH_V2",
    passed: blockers.length === 0,
    blockers,
    policy,
    source_count: sources.length,
    external_source_count: externalSources.length,
    primary_source_count: primarySources.length,
    claim_count: claims.length,
    verified_claim_count: verifiedClaims.length,
    unsupported_claim_ids: unsupportedClaims.map((claim) => claim.id),
    partially_invalid_claim_sources: partiallyInvalidClaims.map((claim) => ({
      claim_id: claim.id,
      discarded_source_ids: claim.invalid_source_ids,
      retained_source_ids: claim.source_ids,
    })),
    unsafe_public_claim_ids: unsafePublicClaims.map((claim) => claim.id),
    audience_evidence_source_ids: audienceEvidence.valid_source_ids,
    audience_invalid_source_ids: audienceEvidence.invalid_source_ids,
    market_evidence_source_ids: marketEvidence.valid_source_ids,
    market_invalid_source_ids: marketEvidence.invalid_source_ids,
    creative_grounding_mode: creativeGrounding.mode,
    creative_grounding_truth_sensitivity: creativeGrounding.truth_sensitivity,
    creative_grounding_entity_count: creativeGrounding.entities.length,
    creative_grounding_evidence_target_count: creativeGrounding.evidence_targets.length,
    creative_grounding_reference_count: creativeGrounding.reference_candidates.length,
    creative_grounding_selected_reference_count: selectedReferences.length,
    creative_grounding_invalid_source_ids: [...new Set([...groundingInvalidSourceIds, ...invalidReferenceSourceIds])],
    strategic_synthesis_contract: "CREATIVE_EVIDENCE_BOUND_STRATEGIC_SYNTHESIS_V1",
    strategic_synthesis_evidence_item_count: strategicEvidenceItems.length,
    strategic_synthesis_invalid_source_ids: [...new Set(strategicInvalidSourceIds)],
    strategic_synthesis_unsupported_ids: strategicUnsupported.map((entry) => entry.id),
    company_resolution_status: resolutionStatus || "UNKNOWN",
    confidence,
    researched_at,
    context_identity,
  };
  if (!validation.passed) {
    const error = new Error(`CREATIVE_RESEARCH_VALIDATION_FAILED:${blockers.join(",")}`);
    error.validation = validation;
    throw error;
  }

  return {
    ...payload,
    creative_grounding: creativeGrounding,
    strategic_synthesis: { ...strategicSynthesis, contract: "CREATIVE_EVIDENCE_BOUND_STRATEGIC_SYNTHESIS_V1" },
    sources,
    claims,
    confidence,
    research_identity: researchContextIdentity({
      context_identity,
      source_urls: externalSources.map((source) => source.url).sort(),
      claims: verifiedClaims.map((claim) => ({ id: claim.id, claim: claim.claim })).sort((a, b) => a.id.localeCompare(b.id)),
    }),
    validation,
  };
}

export function researchReportIsReusable(report = {}, { context_identity, policy } = {}) {
  const validation = object(report.metadata?.validation || report.metadata?.research_validation);
  if (validation.passed !== true) return false;
  if (text(validation.context_identity) !== text(context_identity)) return false;
  if (text(validation.policy?.version) !== text(policy?.version)) return false;
  const timestamp = Date.parse(validation.researched_at || report.created_at || "");
  if (!Number.isFinite(timestamp)) return false;
  const maxAgeMs = Math.max(0, Number(policy?.max_age_days || 0)) * 86400000;
  return maxAgeMs > 0 && Date.now() - timestamp <= maxAgeMs;
}

export const ResearchEvidenceContractRuntime = {
  policy: resolveResearchPolicy,
  validate: normalizeAndValidateResearch,
  reusable: researchReportIsReusable,
  citations: extractResearchCitations,
  outputText: researchOutputText,
};
