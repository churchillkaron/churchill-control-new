import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_EVIDENCE_GRAPH_CONTRACT =
  "AVANTIQO_EVIDENCE_GRAPH_V1";

const MEMORY_TABLE = "intelligence_memories";
const EVIDENCE_SCOPE = "platform_evidence_graph";
const DEFAULT_MAX_ROWS = 300;
const MAX_GRAPH_CLAIMS = 12;
const MAX_GRAPH_SOURCES = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
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

function bounded(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function normalizedUrl(value) {
  try {
    const url = new URL(text(value, 2000));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sourceSummary(source = {}) {
  const item = object(source);
  const url = normalizedUrl(item.url);
  if (!url) return null;
  return {
    id: text(item.id, 160) || null,
    url,
    title: text(item.title, 500) || null,
    publisher: text(item.publisher, 300) || null,
    source_type: text(item.source_type || item.sourceType, 120) || null,
    published_at: text(item.published_at || item.publishedAt, 120) || null,
    retrieved_at: text(item.retrieved_at || item.retrievedAt, 120) || null,
    official: item.official === true,
    primary: item.primary === true,
  };
}

function tokens(value) {
  return [...new Set(
    text(value, 16000)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]/g, " ")
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 2),
  )].slice(0, 100);
}

function claimFingerprint(claim) {
  const normalized = tokens(claim).sort().join(" ");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 40);
}

function topicMemoryKey(topicKey) {
  return `evidence-graph:${createHash("sha256")
    .update(text(topicKey, 500).toLowerCase())
    .digest("hex")
    .slice(0, 40)}`;
}

function sourceHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeAssessment(value = {}) {
  const item = object(value);
  return {
    source_id: text(item.source_id || item.sourceId, 160) || null,
    authority: bounded(item.authority, 0),
    freshness: bounded(item.freshness, 0),
    relevance: bounded(item.relevance, 0),
    independence: bounded(item.independence, 0),
    notes: text(item.notes, 300) || null,
  };
}

function normalizeClaim(value = {}, sourceById = new Map()) {
  const item = object(value);
  const claim = text(item.claim, 2200);
  if (!claim) return null;
  const supportIds = [...new Set(list(item.support_source_ids)
    .map((id) => text(id, 160))
    .filter(Boolean))];
  const contradictIds = [...new Set(list(item.contradict_source_ids)
    .map((id) => text(id, 160))
    .filter(Boolean))];
  const supportSources = supportIds
    .map((id) => sourceById.get(id))
    .filter(Boolean);
  const contradictSources = contradictIds
    .map((id) => sourceById.get(id))
    .filter(Boolean);
  const status = ["SUPPORTED", "CONFLICTED", "INSUFFICIENT"].includes(
    text(item.status, 40).toUpperCase(),
  )
    ? text(item.status, 40).toUpperCase()
    : contradictSources.length
      ? "CONFLICTED"
      : supportSources.length
        ? "SUPPORTED"
        : "INSUFFICIENT";
  const independentHosts = new Set(
    [...supportSources, ...contradictSources]
      .map((source) => sourceHost(source.url))
      .filter(Boolean),
  );
  return {
    fingerprint: claimFingerprint(claim),
    claim,
    status,
    confidence: bounded(item.confidence, 0),
    support_source_ids: supportIds,
    contradict_source_ids: contradictIds,
    support_sources: supportSources,
    contradict_sources: contradictSources,
    support_count: supportSources.length,
    contradict_count: contradictSources.length,
    independent_host_count: independentHosts.size,
    official_primary_support: supportSources.some(
      (source) => source.official === true && source.primary === true,
    ),
  };
}

function graphStatus(claims) {
  const conflicted = claims.filter((claim) => claim.status === "CONFLICTED");
  const supported = claims.filter((claim) => claim.status === "SUPPORTED");
  const insufficient = claims.filter((claim) => claim.status === "INSUFFICIENT");
  if (conflicted.length) return "CONFLICT_PRESENT";
  if (supported.length && !insufficient.length) return "CONSENSUS_SUPPORTED";
  if (supported.length) return "PARTIAL_SUPPORT";
  return "INSUFFICIENT_EVIDENCE";
}

function graphContent({ topicKey, status, claims }) {
  const supported = claims.filter((claim) => claim.status === "SUPPORTED").length;
  const conflicted = claims.filter((claim) => claim.status === "CONFLICTED").length;
  const insufficient = claims.filter((claim) => claim.status === "INSUFFICIENT").length;
  return `Evidence graph for ${topicKey}: ${status}; supported=${supported}; conflicted=${conflicted}; insufficient=${insufficient}.`;
}

function rowFresh(row, freshnessDays, nowMs = Date.now()) {
  const metadata = object(row?.metadata);
  const observed = Date.parse(
    text(metadata.generated_at || metadata.verified_at || row?.updated_at || row?.created_at, 120),
  );
  if (!Number.isFinite(observed)) return false;
  return nowMs - observed <= freshnessDays * DAY_MS;
}

function overlapScore(queryTokens, value) {
  if (!queryTokens.length) return 0;
  const haystack = new Set(tokens(value));
  let matched = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) matched += 1;
  }
  return matched / Math.min(24, queryTokens.length);
}

function graphRelevance(row, queryTokens, domain, jurisdiction) {
  const metadata = object(row?.metadata);
  const claims = list(metadata.claims);
  const haystack = [
    row?.subject,
    row?.content,
    metadata.topic_key,
    metadata.query,
    metadata.domain,
    metadata.jurisdiction,
    ...claims.map((claim) => claim?.claim),
  ].join(" ");
  const lexical = overlapScore(queryTokens, haystack);
  const domainBoost = domain && text(metadata.domain, 120).toLowerCase() === domain ? 0.14 : 0;
  const jurisdictionBoost = jurisdiction &&
    text(metadata.jurisdiction, 120).toLowerCase() === jurisdiction
    ? 0.1
    : 0;
  return Math.min(1, lexical * 0.76 + domainBoost + jurisdictionBoost);
}

function relevantConflictClaims(row, queryTokens) {
  const metadata = object(row?.metadata);
  return list(metadata.claims)
    .filter((claim) => text(claim?.status, 40) === "CONFLICTED")
    .map((claim) => ({
      ...claim,
      query_overlap: overlapScore(queryTokens, claim?.claim),
    }))
    .filter((claim) => claim.query_overlap >= 0.18)
    .sort((left, right) => right.query_overlap - left.query_overlap)
    .slice(0, 6);
}

export async function persistAvantiqoEvidenceGraphSnapshot({
  organizationId = null,
  topic = {},
  research = {},
  comparison = {},
  sources = [],
} = {}) {
  const organization = text(organizationId, 160) || learningOrganizationId();
  if (!organization) {
    return {
      success: true,
      contract: AVANTIQO_EVIDENCE_GRAPH_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      persisted: false,
    };
  }

  const topicObject = object(topic);
  const topicKey = text(topicObject.key || topicObject.topic_key, 240);
  if (!topicKey) throw new Error("AVANTIQO_EVIDENCE_GRAPH_TOPIC_KEY_REQUIRED");

  const sourceRows = list(sources)
    .map(sourceSummary)
    .filter(Boolean)
    .slice(0, MAX_GRAPH_SOURCES);
  const sourceById = new Map(sourceRows
    .filter((source) => source.id)
    .map((source) => [source.id, source]));
  const analysis = object(comparison?.analysis);
  const claims = list(analysis.claims)
    .map((claim) => normalizeClaim(claim, sourceById))
    .filter(Boolean)
    .slice(0, MAX_GRAPH_CLAIMS);
  const assessments = list(analysis.source_assessment)
    .map(normalizeAssessment)
    .filter((assessment) => assessment.source_id)
    .slice(0, MAX_GRAPH_SOURCES);
  const status = graphStatus(claims);
  const now = new Date();
  const nowIso = now.toISOString();
  const stability = text(topicObject.stability, 40).toLowerCase() === "mutable"
    ? "mutable"
    : "stable";
  const reviewDays = boundedInteger(topicObject.review_interval_days, stability === "mutable" ? 45 : 150, 1, 3650);
  const validityDays = stability === "mutable"
    ? Math.min(90, reviewDays)
    : Math.min(730, Math.max(180, reviewDays * 2));
  const validUntil = new Date(now.getTime() + validityDays * DAY_MS).toISOString();

  const retired = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ active: false, superseded_at: nowIso, updated_at: nowIso })
    .eq("organization_id", organization)
    .eq("memory_scope", EVIDENCE_SCOPE)
    .eq("subject", `evidence:${topicKey}`)
    .eq("active", true);
  if (retired.error) throw retired.error;

  const row = {
    organization_id: organization,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EVIDENCE_SCOPE,
    memory_key: topicMemoryKey(topicKey),
    memory_type: "evidence",
    subject: `evidence:${topicKey}`,
    content: graphContent({ topicKey, status, claims }),
    importance: Math.max(0.55, bounded(topicObject.priority, 0.7)),
    confidence: claims.length
      ? Number((claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length).toFixed(4))
      : 0,
    source: "avantiqo_evidence_graph",
    active: true,
    valid_until: validUntil,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      evidence_graph: true,
      evidence_graph_contract: AVANTIQO_EVIDENCE_GRAPH_CONTRACT,
      topic_key: topicKey,
      query: text(topicObject.query || research?.query, 4000) || null,
      domain: text(topicObject.domain, 120) || null,
      jurisdiction: text(topicObject.jurisdiction, 120) || null,
      stability,
      generated_at: nowIso,
      graph_status: status,
      claim_count: claims.length,
      supported_claim_count: claims.filter((claim) => claim.status === "SUPPORTED").length,
      conflicted_claim_count: claims.filter((claim) => claim.status === "CONFLICTED").length,
      insufficient_claim_count: claims.filter((claim) => claim.status === "INSUFFICIENT").length,
      claims,
      sources: sourceRows,
      source_assessment: assessments,
      comparison_contract: text(comparison?.contract, 180) || null,
      research_contract: text(research?.contract, 180) || null,
      source_diversity: new Set(sourceRows.map((source) => sourceHost(source.url)).filter(Boolean)).size,
      official_primary_source_count: sourceRows.filter((source) => source.official && source.primary).length,
      authorization_value: "none",
      raw_reasoning_persisted: false,
    },
    updated_at: nowIso,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,subject,content,confidence,valid_until,metadata")
    .single();
  if (written.error) throw written.error;

  return {
    success: true,
    contract: AVANTIQO_EVIDENCE_GRAPH_CONTRACT,
    status,
    persisted: true,
    topic_key: topicKey,
    claim_count: claims.length,
    supported_claim_count: row.metadata.supported_claim_count,
    conflicted_claim_count: row.metadata.conflicted_claim_count,
    insufficient_claim_count: row.metadata.insufficient_claim_count,
    source_count: sourceRows.length,
    valid_until: validUntil,
    governance: {
      conflicted_claims_never_promoted_as_consensus: true,
      evidence_never_authorizes_actions: true,
      raw_reasoning_persisted: false,
    },
  };
}

export async function inspectAvantiqoEvidenceGraph({
  organizationId = null,
  query,
  domain = null,
  jurisdiction = null,
  freshnessDays = 180,
  limit = 8,
} = {}) {
  const organization = text(organizationId, 160) || learningOrganizationId();
  const question = text(query, 4000);
  if (!question) throw new Error("AVANTIQO_EVIDENCE_GRAPH_QUERY_REQUIRED");
  if (!organization) {
    return {
      contract: AVANTIQO_EVIDENCE_GRAPH_CONTRACT,
      available: false,
      block_knowledge_reuse: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      matches: [],
      conflicts: [],
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,content,confidence,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organization)
    .eq("memory_scope", EVIDENCE_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(DEFAULT_MAX_ROWS);
  if (result.error) throw result.error;

  const queryTokens = tokens(question);
  const requestedDomain = text(domain, 120).toLowerCase();
  const requestedJurisdiction = text(jurisdiction, 120).toLowerCase();
  const freshness = boundedInteger(freshnessDays, 180, 1, 3650);
  const nowMs = Date.now();

  const matches = list(result.data)
    .map((row) => ({
      row,
      relevance: graphRelevance(row, queryTokens, requestedDomain, requestedJurisdiction),
      fresh: rowFresh(row, freshness, nowMs),
      conflicts: relevantConflictClaims(row, queryTokens),
    }))
    .filter((entry) => entry.relevance >= 0.16)
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)));

  const conflicts = matches
    .flatMap((entry) => entry.conflicts.map((claim) => ({
      topic_key: text(object(entry.row.metadata).topic_key, 240) || null,
      graph_relevance: Number(entry.relevance.toFixed(4)),
      graph_fresh: entry.fresh,
      claim,
    })))
    .sort((left, right) =>
      (right.graph_relevance + right.claim.query_overlap) -
      (left.graph_relevance + left.claim.query_overlap),
    )
    .slice(0, 8);

  const strongConflict = conflicts.some((entry) =>
    entry.graph_relevance >= 0.24 &&
    entry.claim.query_overlap >= 0.22 &&
    entry.claim.confidence >= 0.55,
  );
  const staleRelevantGraph = matches.some((entry) => entry.relevance >= 0.32 && !entry.fresh);
  const blockKnowledgeReuse = strongConflict || staleRelevantGraph;

  return {
    contract: AVANTIQO_EVIDENCE_GRAPH_CONTRACT,
    available: true,
    block_knowledge_reuse: blockKnowledgeReuse,
    reason: strongConflict
      ? "UNRESOLVED_RELEVANT_EVIDENCE_CONFLICT"
      : staleRelevantGraph
        ? "RELEVANT_EVIDENCE_GRAPH_STALE"
        : matches.length
          ? "EVIDENCE_GRAPH_COMPATIBLE_WITH_REUSE"
          : "NO_RELEVANT_EVIDENCE_GRAPH",
    query: question,
    matches: matches.map((entry) => ({
      id: entry.row.id,
      topic_key: text(object(entry.row.metadata).topic_key, 240) || null,
      status: text(object(entry.row.metadata).graph_status, 80) || null,
      relevance: Number(entry.relevance.toFixed(4)),
      fresh: entry.fresh,
      confidence: bounded(entry.row.confidence, 0),
      source_diversity: Number(object(entry.row.metadata).source_diversity || 0),
      official_primary_source_count: Number(object(entry.row.metadata).official_primary_source_count || 0),
      generated_at: object(entry.row.metadata).generated_at || entry.row.updated_at || null,
      conflict_count: entry.conflicts.length,
    })),
    conflicts,
    governance: {
      conflict_can_block_stale_memory_reuse: true,
      evidence_never_authorizes_actions: true,
      customer_private_memory_reused: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const AvantiqoEvidenceGraphRuntime = Object.freeze({
  contract: AVANTIQO_EVIDENCE_GRAPH_CONTRACT,
  persist: persistAvantiqoEvidenceGraphSnapshot,
  inspect: inspectAvantiqoEvidenceGraph,
});
