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
  const cleaned = text(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function unwrapResearchOutput(result = {}) {
  let current = result;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next = current.output?.output || current.output || current.result || current.data || null;
    if (!next || next === current) break;
    current = next;
  }
  const parsed = parseJson(current?.text || current?.content || current);
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
  if (url && (type.includes("citation") || type.includes("source") || value.title)) {
    output.push({
      id: text(value.id),
      title: text(value.title || value.name),
      url,
      publisher: text(value.publisher),
      source_type: "web_citation",
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

export function resolveResearchPolicy(project = {}, brief = {}) {
  const configured = {
    ...object(project.metadata?.research_policy),
    ...object(brief.research_policy || brief.metadata?.research_policy),
  };
  return {
    version: text(configured.version || process.env.CREATIVE_RESEARCH_POLICY_VERSION || "1"),
    max_age_days: integer(
      configured.max_age_days ?? process.env.CREATIVE_RESEARCH_MAX_AGE_DAYS,
      30,
    ),
    minimum_external_sources: integer(
      configured.minimum_external_sources ?? process.env.CREATIVE_RESEARCH_MIN_EXTERNAL_SOURCES,
      4,
    ),
    minimum_primary_sources: integer(
      configured.minimum_primary_sources ?? process.env.CREATIVE_RESEARCH_MIN_PRIMARY_SOURCES,
      1,
    ),
    minimum_verified_claims: integer(
      configured.minimum_verified_claims ?? process.env.CREATIVE_RESEARCH_MIN_VERIFIED_CLAIMS,
      5,
    ),
    minimum_confidence: Math.max(0, Math.min(100, finite(
      configured.minimum_confidence ?? process.env.CREATIVE_RESEARCH_MIN_CONFIDENCE,
      70,
    ))),
    require_company_resolution: configured.require_company_resolution !== false,
    require_competitor_analysis: configured.require_competitor_analysis !== false,
    require_audience_evidence: configured.require_audience_evidence !== false,
    require_market_context: configured.require_market_context !== false,
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
  const claims = list(payload.claims).map(normalizeClaim);
  const sourceIds = new Set(sources.map((source) => source.id));
  const externalSources = sources.filter((source) => !source.internal && source.url);
  const primarySources = sources.filter((source) => source.primary || source.official);
  const verifiedClaims = claims.filter((claim) => claim.verified);
  const unsupportedClaims = claims.filter((claim) =>
    claim.verified && (!claim.source_ids.length || claim.source_ids.some((id) => !sourceIds.has(id))),
  );
  const unsafePublicClaims = claims.filter((claim) =>
    claim.public_usable && (!claim.verified || !claim.source_ids.length),
  );
  const resolution = object(payload.company_resolution || payload.companyResolution);
  const resolutionStatus = text(resolution.status).toUpperCase();
  const competitorAnalysis = object(payload.competitor_analysis || payload.competitorAnalysis);
  const audience = object(payload.audience);
  const market = object(payload.market || payload.market_context || payload.marketContext);
  const confidence = finite(payload.confidence, 0);
  const blockers = [];

  if (!text(payload.summary)) blockers.push("SUMMARY_REQUIRED");
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
  if (policy.require_audience_evidence && !list(audience.evidence || audience.source_ids).length) {
    blockers.push("AUDIENCE_EVIDENCE_REQUIRED");
  }
  if (policy.require_market_context && !list(market.evidence || market.source_ids).length) {
    blockers.push("MARKET_EVIDENCE_REQUIRED");
  }

  const validation = {
    contract: "CREATIVE_AUTONOMOUS_RESEARCH_V1",
    passed: blockers.length === 0,
    blockers,
    policy,
    source_count: sources.length,
    external_source_count: externalSources.length,
    primary_source_count: primarySources.length,
    claim_count: claims.length,
    verified_claim_count: verifiedClaims.length,
    unsupported_claim_ids: unsupportedClaims.map((claim) => claim.id),
    unsafe_public_claim_ids: unsafePublicClaims.map((claim) => claim.id),
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
};
