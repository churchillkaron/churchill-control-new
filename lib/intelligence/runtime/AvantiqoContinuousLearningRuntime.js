import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  collectAvantiqoOwnedWebEvidence,
} from "@/lib/intelligence/runtime/AvantiqoOwnedWebEvidenceRuntime";
import {
  compareOperatorResearchEvidence,
} from "@/lib/platform/research/runtime/OperatorResearchEvidenceComparisonRuntime";

export const AVANTIQO_CONTINUOUS_LEARNING_CONTRACT =
  "AVANTIQO_CONTINUOUS_LEARNING_V1";
export const AVANTIQO_KNOWLEDGE_RECALL_CONTRACT =
  "AVANTIQO_PLATFORM_KNOWLEDGE_RECALL_V1";
export const AVANTIQO_KNOWLEDGE_AWARE_RESEARCH_CONTRACT =
  "AVANTIQO_KNOWLEDGE_AWARE_RESEARCH_V1";
export const AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_CONTRACT =
  "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1";

const MEMORY_TABLE = "intelligence_memories";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates";
const AGENDA_SCOPE = "platform_learning_agenda";
const RUN_SCOPE = "platform_learning_runs";
const MAX_KNOWLEDGE_CANDIDATES = 160;
const MAX_RECALL = 8;
const MAX_FOLLOW_UPS_PER_RUN = 3;
const DEFAULT_DAILY_MAX_RUNS = 8;
const MAX_DAILY_MAX_RUNS = 48;
const DEFAULT_BATCH_LIMIT = 1;
const MAX_BATCH_LIMIT = 3;
const LEASE_MINUTES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_FOUNDATION_TOPICS = Object.freeze([
  {
    key: "enterprise-finance-core",
    domain: "finance",
    query:
      "What business objects, required information, lifecycle states, controls, row actions, drill-downs, document previews and audit evidence should a modern enterprise finance system provide for customer invoices, vendor bills, journals, general ledger, accounts receivable and accounts payable? Prefer authoritative accounting standards, government guidance where relevant, and established enterprise software documentation.",
    priority: 0.99,
    stability: "stable",
    freshness_days: 365,
    review_interval_days: 120,
  },
  {
    key: "enterprise-product-ux",
    domain: "product-design",
    query:
      "What current evidence-backed enterprise UX and accessibility principles should govern dense business forms, data tables, row actions, approval workflows, document previews, errors, responsive behavior and keyboard interaction in professional ERP software? Prefer official accessibility standards and primary design-system guidance.",
    priority: 0.96,
    stability: "mutable",
    freshness_days: 90,
    review_interval_days: 60,
    preferred_domains: ["w3.org"],
  },
  {
    key: "enterprise-supply-chain-core",
    domain: "supply-chain",
    query:
      "What canonical business objects, workflows, controls, documents, exception states and audit evidence should a modern procurement, receiving, inventory, warehouse and supplier-management system support? Prefer standards bodies and established enterprise documentation.",
    priority: 0.91,
    stability: "stable",
    freshness_days: 365,
    review_interval_days: 150,
  },
  {
    key: "enterprise-commercial-crm-core",
    domain: "commercial",
    query:
      "What canonical customer, lead, opportunity, quotation, order, contract, communication and revenue workflows should modern CRM and commercial business software support, including permissions, lifecycle actions, auditability and useful operator views?",
    priority: 0.86,
    stability: "stable",
    freshness_days: 365,
    review_interval_days: 180,
  },
  {
    key: "enterprise-people-workforce-core",
    domain: "people",
    query:
      "What jurisdiction-neutral workforce and HR business objects, workflows, approvals, records, permissions and audit controls should modern enterprise software support for people, roles, schedules, time, leave, performance and workforce administration? Separate universal product patterns from jurisdiction-specific legal requirements.",
    priority: 0.83,
    stability: "stable",
    freshness_days: 365,
    review_interval_days: 180,
  },
  {
    key: "enterprise-projects-core",
    domain: "projects",
    query:
      "What canonical project, workstream, milestone, task, dependency, resource, budget, risk, issue, change and delivery workflows should modern enterprise project software support, including controls, status transitions and audit evidence?",
    priority: 0.8,
    stability: "stable",
    freshness_days: 365,
    review_interval_days: 180,
  },
  {
    key: "enterprise-integration-standards",
    domain: "integrations",
    query:
      "What current standards and best practices should enterprise software follow for APIs, webhooks, idempotency, retries, pagination, OAuth, event delivery, observability and integration security? Prefer current primary standards and official documentation.",
    priority: 0.88,
    stability: "mutable",
    freshness_days: 45,
    review_interval_days: 30,
  },
  {
    key: "autonomous-agent-reliability",
    domain: "intelligence",
    query:
      "What current primary research, standards and engineering guidance support reliable autonomous software agents that plan, use tools, retrieve evidence, verify outcomes, preserve provenance, manage memory, detect stale knowledge and avoid acting on untrusted instructions?",
    priority: 0.94,
    stability: "mutable",
    freshness_days: 30,
    review_interval_days: 21,
  },
]);

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

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function boundedScore(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function hashKey(prefix, ...values) {
  const digest = createHash("sha256")
    .update(values.map((value) => text(value, 5000).toLowerCase()).join("|"))
    .digest("hex")
    .slice(0, 40);
  return `${prefix}:${digest}`;
}

function tokens(value) {
  return [...new Set(
    text(value, 16000)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]/g, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 2),
  )].slice(0, 100);
}

function validUntil(row, nowMs = Date.now()) {
  if (row?.active !== true || row?.forgotten_at || row?.superseded_at || row?.superseded_by) {
    return false;
  }
  if (!row?.valid_until) return true;
  const expiry = Date.parse(row.valid_until);
  return !Number.isFinite(expiry) || expiry > nowMs;
}

function dateAgeDays(value, nowMs = Date.now()) {
  const parsed = Date.parse(text(value, 120));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / DAY_MS);
}

function queryLooksCurrent(query) {
  return /\b(current|currently|latest|today|newest|recent|version|regulation|regulatory|law|legal|tax|rate|price|pricing|api|standard|specification|requirement)\b/i.test(
    text(query, 12000),
  );
}

function lexicalScore(row, queryTokens) {
  if (!queryTokens.length) return 0;
  const metadata = object(row?.metadata);
  const haystack = [
    row?.subject,
    row?.content,
    metadata.knowledge_domain,
    metadata.jurisdiction,
    metadata.topic_key,
  ].map((item) => text(item, 5000).toLowerCase()).join(" ");
  let hits = 0;
  for (const token of queryTokens.slice(0, 20)) {
    if (haystack.includes(token)) hits += 1;
  }
  return hits / Math.min(queryTokens.length, 20);
}

function sourceSummary(source = {}) {
  const item = object(source);
  const url = text(item.url, 2000);
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    id: text(item.id, 120) || null,
    url,
    title: text(item.title, 500) || null,
    publisher: text(item.publisher, 300) || null,
    published_at: text(item.published_at, 120) || null,
    official: item.official === true,
    primary: item.primary === true,
  };
}

function aggregateSources(knowledge) {
  const byUrl = new Map();
  for (const item of knowledge) {
    for (const source of list(item?.sources)) {
      const normalized = sourceSummary(source);
      if (!normalized) continue;
      byUrl.set(normalized.url, { ...(byUrl.get(normalized.url) || {}), ...normalized });
    }
  }
  return [...byUrl.values()];
}

export async function recallAvantiqoLearnedKnowledge({
  query,
  domain = null,
  jurisdiction = null,
  freshness_days = null,
  minimum_sources = 2,
  limit = MAX_RECALL,
} = {}) {
  const organizationId = learningOrganizationId();
  const question = text(query, 4000);
  if (!question) throw new Error("AVANTIQO_KNOWLEDGE_QUERY_REQUIRED");
  if (!organizationId) {
    return {
      contract: AVANTIQO_KNOWLEDGE_RECALL_CONTRACT,
      available: false,
      sufficient: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      query: question,
      knowledge: [],
      sources: [],
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select(
      "id,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at",
    )
    .eq("organization_id", organizationId)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("active", true)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_KNOWLEDGE_CANDIDATES);
  if (result.error) throw result.error;

  const nowMs = Date.now();
  const queryTokens = tokens(question);
  const requestedDomain = text(domain, 120).toLowerCase();
  const requestedJurisdiction = text(jurisdiction, 120).toLowerCase();
  const explicitFreshness = freshness_days === null || freshness_days === undefined
    ? null
    : boundedInteger(freshness_days, 30, 0, 3650);
  const currentQuestion = queryLooksCurrent(question);
  const requiredFreshnessDays = explicitFreshness ?? (currentQuestion ? 7 : null);

  const ranked = list(result.data)
    .filter((row) => validUntil(row, nowMs))
    .map((row) => {
      const metadata = object(row.metadata);
      const verifiedAt = text(metadata.verified_at, 120) || row.updated_at || row.created_at;
      const ageDays = dateAgeDays(verifiedAt, nowMs);
      const rowDomain = text(metadata.knowledge_domain, 120).toLowerCase();
      const rowJurisdiction = text(metadata.jurisdiction, 120).toLowerCase();
      const lexical = lexicalScore(row, queryTokens);
      const domainBoost = requestedDomain && rowDomain === requestedDomain ? 0.14 : 0;
      const jurisdictionBoost = requestedJurisdiction && rowJurisdiction === requestedJurisdiction
        ? 0.1
        : 0;
      const confidence = boundedScore(row.confidence);
      const importance = boundedScore(row.importance);
      const freshness = Math.max(0, 1 - ageDays / 730);
      const score =
        lexical * 0.55 +
        confidence * 0.14 +
        importance * 0.1 +
        freshness * 0.07 +
        domainBoost +
        jurisdictionBoost;
      return { row, metadata, verifiedAt, ageDays, score };
    })
    .filter((entry) => entry.score >= 0.26 && boundedScore(entry.row.confidence) >= 0.72)
    .filter((entry) =>
      requiredFreshnessDays === null || entry.ageDays <= requiredFreshnessDays,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(MAX_RECALL, Number(limit) || MAX_RECALL)));

  const knowledge = ranked.map((entry) => ({
    id: entry.row.id,
    type: entry.row.memory_type,
    subject: entry.row.subject,
    content: text(entry.row.content, 1600),
    confidence: boundedScore(entry.row.confidence),
    importance: boundedScore(entry.row.importance),
    verified_at: entry.verifiedAt,
    valid_until: entry.row.valid_until || null,
    age_days: Number(entry.ageDays.toFixed(2)),
    relevance: Number(entry.score.toFixed(4)),
    domain: text(entry.metadata.knowledge_domain, 120) || null,
    jurisdiction: text(entry.metadata.jurisdiction, 120) || null,
    stability: text(entry.metadata.stability, 80) || null,
    sources: list(entry.metadata.sources).map(sourceSummary).filter(Boolean),
    provenance: {
      source: entry.row.source,
      topic_key: text(entry.metadata.topic_key, 180) || null,
      evidence_comparison_contract:
        text(entry.metadata.evidence_comparison_contract, 180) || null,
    },
    authorization_effect: "NONE",
  }));
  const sources = aggregateSources(knowledge);
  const minimumSourceCount = boundedInteger(minimum_sources, 2, 1, 8);
  const hasFreshMutableEvidence = knowledge.some((item) =>
    item.type === "fact" &&
    (requiredFreshnessDays === null || item.age_days <= requiredFreshnessDays),
  );
  const sufficient = Boolean(
    knowledge.length &&
    knowledge[0].relevance >= 0.34 &&
    sources.length >= minimumSourceCount &&
    (!currentQuestion || hasFreshMutableEvidence),
  );

  return {
    contract: AVANTIQO_KNOWLEDGE_RECALL_CONTRACT,
    available: true,
    sufficient,
    reason: sufficient ? "VERIFIED_PLATFORM_KNOWLEDGE_REUSABLE" : "FRESH_RESEARCH_REQUIRED",
    query: question,
    freshness_days: requiredFreshnessDays,
    knowledge,
    sources,
    governance: {
      source: "AVANTIQO_VERIFIED_PLATFORM_KNOWLEDGE",
      customer_private_memory_reused: false,
      authorization_effect: "NONE",
      stale_knowledge_may_suppress_research: false,
    },
  };
}

export async function runKnowledgeAwareWebResearch({ context = {}, payload = {} } = {}) {
  const query = text(payload.query, 4000);
  if (!query) throw new Error("WEB_RESEARCH_QUERY_REQUIRED");

  const recall = await recallAvantiqoLearnedKnowledge({
    query,
    domain: payload.domain || null,
    jurisdiction: payload.jurisdiction || null,
    freshness_days: payload.freshness_days,
    minimum_sources: payload.minimum_sources,
    limit: 8,
  });

  if (recall.sufficient && payload.force_refresh !== true) {
    return {
      contract: AVANTIQO_KNOWLEDGE_AWARE_RESEARCH_CONTRACT,
      status: "KNOWLEDGE_REUSED",
      query,
      objective: text(payload.objective, 2000) || null,
      answer: recall.knowledge.map((item) => item.content).join("\n"),
      claims: recall.knowledge.map((item, index) => ({
        id: `knowledge-${index + 1}`,
        claim: item.content,
        source_urls: item.sources.map((source) => source.url),
        confidence: item.confidence,
        verification_status: "VERIFIED_PLATFORM_KNOWLEDGE",
      })),
      sources: recall.sources,
      uncertainty: [],
      follow_up_queries: [],
      evidence: {
        provider: "avantiqo-platform-knowledge",
        web_search_observed: false,
        internet_search_performed: false,
        returned_source_count: recall.sources.length,
        knowledge_reused: true,
        retrieved_at: new Date().toISOString(),
      },
      knowledge_reuse: recall,
      governance: {
        external_evidence_only: false,
        platform_knowledge_reused: true,
        authorization_effect: "NONE",
        permission_effect: "NONE",
        scope_effect: "NONE",
        execution_effect: "NONE",
        customer_private_memory_reused: false,
      },
    };
  }

  const research = await collectAvantiqoOwnedWebEvidence({ context, payload });
  const sources = comparisonSources(research);
  const comparison = await compareOperatorResearchEvidence({
    context,
    payload: {
      question: query,
      sources,
    },
  });
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const claims = list(comparison?.analysis?.claims).map((claim, index) => ({
    id: text(claim?.id, 120) || `claim-${index + 1}`,
    claim: text(claim?.claim, 2_000),
    source_urls: list(claim?.support_source_ids)
      .map((id) => sourceById.get(text(id, 120))?.url)
      .filter(Boolean),
    confidence: boundedScore(claim?.confidence),
    verification_status: text(claim?.status, 80) || "INSUFFICIENT",
  })).filter((claim) => claim.claim);
  return {
    ...research,
    contract: AVANTIQO_KNOWLEDGE_AWARE_RESEARCH_CONTRACT,
    answer: text(comparison?.analysis?.conclusion, 12_000) || research.answer,
    claims,
    comparison: {
      contract: comparison.contract,
      owned_intelligence: true,
    },
    knowledge_reuse: {
      attempted: true,
      reused: false,
      reason: recall.reason,
      matched_knowledge_count: recall.knowledge.length,
    },
  };
}

function agendaRow(topic, organizationId, nowIso, source = "continuous_learning_seed") {
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: hashKey("agenda", topic.key),
    memory_type: "goal",
    subject: topic.key,
    content: text(topic.query, 4000),
    importance: boundedScore(topic.priority, 0.7),
    confidence: 1,
    source,
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      continuous_learning: true,
      topic_key: topic.key,
      knowledge_domain: topic.domain || null,
      jurisdiction: topic.jurisdiction || null,
      stability: topic.stability || "stable",
      freshness_days: boundedInteger(topic.freshness_days, 180, 1, 3650),
      review_interval_days: boundedInteger(topic.review_interval_days, 120, 1, 3650),
      preferred_domains: list(topic.preferred_domains).map((item) => text(item, 200)).filter(Boolean).slice(0, 10),
      status: "READY",
      next_research_at: nowIso,
      failure_count: 0,
      lease_token: null,
      lease_expires_at: null,
      parent_topic_key: topic.parent_topic_key || null,
      created_by: source,
    },
    updated_at: nowIso,
  };
}

async function ensureFoundationAgenda(organizationId) {
  const existing = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("memory_key")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AGENDA_SCOPE)
    .limit(500);
  if (existing.error) throw existing.error;
  const keys = new Set(list(existing.data).map((row) => text(row.memory_key, 120)));
  const nowIso = new Date().toISOString();
  const missing = DEFAULT_FOUNDATION_TOPICS
    .map((topic) => agendaRow(topic, organizationId, nowIso))
    .filter((row) => !keys.has(row.memory_key));
  if (!missing.length) return 0;
  const inserted = await supabaseAdmin.from(MEMORY_TABLE).insert(missing).select("id");
  if (inserted.error) throw inserted.error;
  return list(inserted.data).length;
}

function startOfUtcDayIso(now = new Date()) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  )).toISOString();
}

async function runCountToday(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("memory_scope", RUN_SCOPE)
    .gte("created_at", startOfUtcDayIso());
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

function dueAgendaRow(row, nowMs) {
  if (!validUntil(row, nowMs)) return false;
  const metadata = object(row.metadata);
  const leaseExpiresAt = Date.parse(text(metadata.lease_expires_at, 120));
  if (
    text(metadata.status, 40).toUpperCase() === "RUNNING" &&
    Number.isFinite(leaseExpiresAt) &&
    leaseExpiresAt > nowMs
  ) {
    return false;
  }
  const next = Date.parse(text(metadata.next_research_at, 120));
  return !Number.isFinite(next) || next <= nowMs;
}

async function loadDueAgenda(organizationId, limit) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select(
      "id,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at",
    )
    .eq("organization_id", organizationId)
    .eq("memory_scope", AGENDA_SCOPE)
    .eq("active", true)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(100);
  if (result.error) throw result.error;
  const nowMs = Date.now();
  return list(result.data)
    .filter((row) => dueAgendaRow(row, nowMs))
    .slice(0, Math.max(1, Math.min(MAX_BATCH_LIMIT, limit)));
}

async function claimAgendaRow(organizationId, row) {
  const now = new Date();
  const nowIso = now.toISOString();
  const token = randomUUID();
  const metadata = object(row.metadata);
  const nextMetadata = {
    ...metadata,
    status: "RUNNING",
    lease_token: token,
    lease_expires_at: new Date(now.getTime() + LEASE_MINUTES * 60 * 1000).toISOString(),
    last_started_at: nowIso,
  };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata: nextMetadata, updated_at: nowIso })
    .eq("organization_id", organizationId)
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id,metadata,updated_at")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) return null;
  return { token, row: { ...row, metadata: nextMetadata, updated_at: result.data.updated_at } };
}

function comparisonSources(research) {
  return list(research.sources).map((source, index) => ({
    id: `source-${index + 1}`,
    url: source?.url,
    title: source?.title,
    publisher: source?.publisher,
    source_type: source?.source_type,
    published_at: source?.published_at,
    retrieved_at: research?.evidence?.retrieved_at || null,
    official: source?.official === true,
    primary: source?.primary === true,
    evidence: text(source?.excerpt || source?.title || source?.url, 5000),
  }));
}

function supportedClaims(comparison, sources) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return list(comparison?.analysis?.claims)
    .map((claim) => {
      const supportIds = list(claim?.support_source_ids)
        .map((id) => text(id, 120))
        .filter((id) => sourceById.has(id));
      const supportSources = supportIds.map((id) => sourceById.get(id));
      const officialPrimary = supportSources.some(
        (source) => source?.official === true && source?.primary === true,
      );
      return {
        claim: text(claim?.claim, 1600),
        status: text(claim?.status, 40).toUpperCase(),
        confidence: boundedScore(claim?.confidence),
        support_sources: supportSources,
        support_count: supportSources.length,
        official_primary: officialPrimary,
      };
    })
    .filter((claim) =>
      claim.claim &&
      claim.status === "SUPPORTED" &&
      claim.confidence >= 0.72 &&
      (claim.support_count >= 2 || claim.official_primary),
    )
    .slice(0, 12);
}

function topicFromRow(row) {
  const metadata = object(row.metadata);
  return {
    id: row.id,
    key: text(metadata.topic_key || row.subject, 180),
    domain: text(metadata.knowledge_domain, 120) || null,
    jurisdiction: text(metadata.jurisdiction, 120) || null,
    query: text(row.content, 4000),
    priority: boundedScore(row.importance, 0.7),
    stability: ["stable", "mutable"].includes(text(metadata.stability, 40).toLowerCase())
      ? text(metadata.stability, 40).toLowerCase()
      : "stable",
    freshness_days: boundedInteger(metadata.freshness_days, 180, 1, 3650),
    review_interval_days: boundedInteger(metadata.review_interval_days, 120, 1, 3650),
    preferred_domains: list(metadata.preferred_domains)
      .map((item) => text(item, 200))
      .filter(Boolean)
      .slice(0, 10),
    failure_count: Math.max(0, Number(metadata.failure_count || 0)),
    metadata,
  };
}

async function stageTopicKnowledgeEvidenceCandidates({ organizationId, topic, claims, comparison }) {
  if (!claims.length) return [];
  const now = new Date();
  const nowIso = now.toISOString();
  const subject = `knowledge-evidence:${topic.key}`;
  const ttlDays = topic.stability === "mutable"
    ? Math.min(topic.review_interval_days, 90)
    : Math.min(Math.max(topic.review_interval_days * 2, 180), 730);
  const validUntilIso = new Date(now.getTime() + ttlDays * DAY_MS).toISOString();
  const rows = claims.map((claim) => ({
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EVIDENCE_CANDIDATE_SCOPE,
    memory_key: hashKey("knowledge-evidence-candidate", topic.key, claim.claim),
    memory_type: "evidence",
    subject,
    content: claim.claim,
    importance: Math.min(1, 0.72 + topic.priority * 0.22),
    confidence: claim.confidence,
    source: "continuous_learning_evidence_candidate",
    active: true,
    valid_until: validUntilIso,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_CONTRACT,
      epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED",
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      explicit_final_promotion_required: true,
      non_destructive_reconciliation: true,
      prior_released_knowledge_retired: false,
      requires_epistemic_promotion_pipeline: true,
      customer_private_memory: false,
      knowledge_domain: topic.domain,
      jurisdiction: topic.jurisdiction,
      topic_key: topic.key,
      stability: topic.stability,
      verified_at: nowIso,
      source_count: claim.support_count,
      sources: claim.support_sources.map(sourceSummary).filter(Boolean),
      evidence_comparison_contract: comparison.contract,
      evidence_status: "SUPPORTED",
      authorization_value: "none",
      raw_reasoning_persisted: false,
    },
    updated_at: nowIso,
  }));

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,content,confidence,valid_until");
  if (written.error) throw written.error;
  return list(written.data);
}

function followUpQueries(research, comparison) {
  const fromComparison = list(comparison?.analysis?.recommended_next_research)
    .map((item) => (typeof item === "string" ? item : item?.query || item?.question || item?.gap));
  const combined = [
    ...fromComparison,
    ...list(research?.follow_up_queries),
  ]
    .map((item) => text(item, 3000))
    .filter(Boolean);
  return [...new Set(combined.map((item) => item.toLowerCase()))]
    .map((lower) => combined.find((item) => item.toLowerCase() === lower))
    .filter(Boolean)
    .slice(0, MAX_FOLLOW_UPS_PER_RUN);
}

async function enqueueFollowUps({ organizationId, topic, research, comparison }) {
  const queries = followUpQueries(research, comparison);
  if (!queries.length) return 0;
  const now = new Date();
  const dueAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  const rows = queries.map((query) => {
    const key = `followup-${hashKey("q", topic.domain, query).split(":")[1].slice(0, 20)}`;
    const row = agendaRow({
      key,
      domain: topic.domain,
      jurisdiction: topic.jurisdiction,
      query,
      priority: Math.max(0.45, topic.priority - 0.12),
      stability: topic.stability,
      freshness_days: topic.freshness_days,
      review_interval_days: topic.review_interval_days,
      preferred_domains: topic.preferred_domains,
      parent_topic_key: topic.key,
    }, organizationId, now.toISOString(), "continuous_learning_follow_up");
    return {
      ...row,
      metadata: {
        ...row.metadata,
        next_research_at: dueAt,
      },
    };
  });
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, {
      onConflict: "organization_id,memory_scope,memory_key",
      ignoreDuplicates: true,
    })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

async function updateAgendaAfterRun({
  organizationId,
  row,
  status,
  claimCount,
  sourceCount,
  uncertaintyCount,
  error = null,
}) {
  const now = new Date();
  const topic = topicFromRow(row);
  const failed = status === "ERROR";
  const failureCount = failed ? topic.failure_count + 1 : 0;
  const retryHours = Math.min(96, 6 * 2 ** Math.min(failureCount, 4));
  const nextResearchAt = failed
    ? new Date(now.getTime() + retryHours * 60 * 60 * 1000)
    : new Date(now.getTime() + topic.review_interval_days * DAY_MS);
  const metadata = {
    ...topic.metadata,
    status,
    lease_token: null,
    lease_expires_at: null,
    failure_count: failureCount,
    last_researched_at: now.toISOString(),
    next_research_at: nextResearchAt.toISOString(),
    last_claim_count: Number(claimCount || 0),
    last_source_count: Number(sourceCount || 0),
    last_uncertainty_count: Number(uncertaintyCount || 0),
    last_error: error ? text(error, 800) : null,
  };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata, updated_at: now.toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", row.id);
  if (result.error) throw result.error;
}

async function recordLearningRun({ organizationId, topic, status, claimCount, sourceCount, error = null }) {
  const now = new Date();
  const successful = status === "COMPLETED";
  const result = await supabaseAdmin.from(MEMORY_TABLE).insert({
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: RUN_SCOPE,
    memory_key: `run:${randomUUID()}`,
    memory_type: successful ? "completed_step" : "blocker",
    subject: topic.key,
    content: successful
      ? `Continuous learning staged ${claimCount} evidence candidate(s) for ${topic.key} from ${sourceCount} source(s); no reusable platform knowledge was released.`
      : `Continuous learning could not complete ${topic.key}: ${text(error, 700)}`,
    importance: successful ? 0.6 : 0.55,
    confidence: successful ? 1 : 0.8,
    source: "continuous_learning_runtime",
    active: true,
    valid_until: new Date(now.getTime() + 90 * DAY_MS).toISOString(),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      continuous_learning_run: true,
      topic_key: topic.key,
      knowledge_domain: topic.domain,
      status,
      claim_count: Number(claimCount || 0),
      evidence_candidate_count: Number(claimCount || 0),
      reusable_platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      source_count: Number(sourceCount || 0),
      error: error ? text(error, 800) : null,
      authorization_value: "none",
    },
    updated_at: now.toISOString(),
  });
  if (result.error) throw result.error;
}

async function processAgendaRow({ organizationId, row }) {
  const claimed = await claimAgendaRow(organizationId, row);
  if (!claimed) {
    return {
      status: "SKIPPED_CONCURRENT_CLAIM",
      topic_key: text(row?.subject, 180),
      claim_count: 0,
      source_count: 0,
    };
  }

  const topic = topicFromRow(claimed.row);
  try {
    const context = {
      organizationId,
      partyId: null,
      entityId: null,
      metadata: {
        source: "AVANTIQO_CONTINUOUS_LEARNING",
        continuous_learning: true,
        readOnly: true,
      },
    };
    const research = await collectAvantiqoOwnedWebEvidence({
      context,
      payload: {
        query: topic.query,
        objective:
          "Collect current public evidence that can be staged as non-reusable evidence candidates for Avantiqo learning. Do not promote claims to reusable knowledge here, and do not collect customer-specific or private information.",
        preferred_domains: topic.preferred_domains,
        domain: topic.domain,
        freshness_days: topic.freshness_days,
        minimum_sources: 2,
        max_sources: 8,
        search_context_size: "high",
      },
    });
    const sources = comparisonSources(research);
    const comparison = await compareOperatorResearchEvidence({
      context,
      payload: {
        question: topic.query,
        sources,
      },
    });
    const supported = supportedClaims(comparison, sources);
    const staged = await stageTopicKnowledgeEvidenceCandidates({
      organizationId,
      topic,
      claims: supported,
      comparison,
    });
    const followUps = await enqueueFollowUps({
      organizationId,
      topic,
      research,
      comparison,
    });
    const status = staged.length ? "EVIDENCE_CANDIDATES_STAGED" : "INSUFFICIENT_EVIDENCE";
    await updateAgendaAfterRun({
      organizationId,
      row: claimed.row,
      status,
      claimCount: staged.length,
      sourceCount: sources.length,
      uncertaintyCount: list(research.uncertainty).length,
    });
    await recordLearningRun({
      organizationId,
      topic,
      status: "COMPLETED",
      claimCount: staged.length,
      sourceCount: sources.length,
    });
    return {
      status,
      topic_key: topic.key,
      domain: topic.domain,
      claim_count: staged.length,
      evidence_candidate_count: staged.length,
      reusable_platform_knowledge_written: false,
      prior_released_knowledge_retired: false,
      source_count: sources.length,
      follow_up_topics_enqueued: followUps,
      research_contract: research.contract,
      comparison_contract: comparison.contract,
    };
  } catch (error) {
    const message = text(error?.message || error, 800) || "CONTINUOUS_LEARNING_FAILED";
    await updateAgendaAfterRun({
      organizationId,
      row: claimed.row,
      status: "ERROR",
      claimCount: 0,
      sourceCount: 0,
      uncertaintyCount: 0,
      error: message,
    }).catch((updateError) =>
      console.error("AVANTIQO_CONTINUOUS_LEARNING_AGENDA_FAILURE_UPDATE_FAILED", updateError),
    );
    await recordLearningRun({
      organizationId,
      topic,
      status: "ERROR",
      claimCount: 0,
      sourceCount: 0,
      error: message,
    }).catch((recordError) =>
      console.error("AVANTIQO_CONTINUOUS_LEARNING_RUN_RECORD_FAILED", recordError),
    );
    return {
      status: "ERROR",
      topic_key: topic.key,
      domain: topic.domain,
      claim_count: 0,
      source_count: 0,
      error: message,
    };
  }
}

export async function runAvantiqoContinuousLearningBatch({ limit = DEFAULT_BATCH_LIMIT } = {}) {
  if (!enabled(process.env.AVANTIQO_CONTINUOUS_LEARNING_ENABLED)) {
    return {
      success: true,
      contract: AVANTIQO_CONTINUOUS_LEARNING_CONTRACT,
      status: "DISABLED",
      reason: "AVANTIQO_CONTINUOUS_LEARNING_ENABLED_NOT_SET",
      processed_count: 0,
      results: [],
    };
  }

  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_CONTINUOUS_LEARNING_CONTRACT,
      status: "DISABLED",
      reason: "AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID_NOT_SET",
      processed_count: 0,
      results: [],
    };
  }

  const seeded = await ensureFoundationAgenda(organizationId);
  const dailyMaximum = boundedInteger(
    process.env.AVANTIQO_CONTINUOUS_LEARNING_DAILY_MAX_RUNS,
    DEFAULT_DAILY_MAX_RUNS,
    1,
    MAX_DAILY_MAX_RUNS,
  );
  const alreadyRun = await runCountToday(organizationId);
  const remainingBudget = Math.max(0, dailyMaximum - alreadyRun);
  if (!remainingBudget) {
    return {
      success: true,
      contract: AVANTIQO_CONTINUOUS_LEARNING_CONTRACT,
      status: "DAILY_BUDGET_EXHAUSTED",
      daily_max_runs: dailyMaximum,
      runs_today: alreadyRun,
      seeded_topics: seeded,
      processed_count: 0,
      results: [],
    };
  }

  const requestedLimit = boundedInteger(limit, DEFAULT_BATCH_LIMIT, 1, MAX_BATCH_LIMIT);
  const batchLimit = Math.min(requestedLimit, remainingBudget);
  const due = await loadDueAgenda(organizationId, batchLimit);
  if (!due.length) {
    return {
      success: true,
      contract: AVANTIQO_CONTINUOUS_LEARNING_CONTRACT,
      status: "NO_DUE_RESEARCH",
      daily_max_runs: dailyMaximum,
      runs_today: alreadyRun,
      seeded_topics: seeded,
      processed_count: 0,
      results: [],
    };
  }

  const results = [];
  for (const row of due) {
    results.push(await processAgendaRow({ organizationId, row }));
  }
  const failedCount = results.filter((result) => result.status === "ERROR").length;
  return {
    success: failedCount === 0,
    contract: AVANTIQO_CONTINUOUS_LEARNING_CONTRACT,
    status: failedCount ? "PARTIAL" : "COMPLETED",
    daily_max_runs: dailyMaximum,
    runs_today_before_batch: alreadyRun,
    seeded_topics: seeded,
    processed_count: results.length,
    failed_count: failedCount,
    results,
    governance: {
      public_web_only: true,
      customer_private_memory_promoted: false,
      evidence_comparison_required: true,
      supported_claims_only: true,
      source_provenance_retained: true,
      stale_knowledge_expires: true,
      research_budget_bounded: true,
      owned_intelligence_only: true,
      external_intelligence_provider_used: false,
      openai_used: false,
      evidence_candidates_only: true,
      reusable_platform_knowledge_written: false,
      prior_released_knowledge_retired: false,
      non_destructive_reconciliation: true,
      automatic_knowledge_promotion: false,
      explicit_final_promotion_required: true,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoContinuousLearningRuntime = Object.freeze({
  contract: AVANTIQO_CONTINUOUS_LEARNING_CONTRACT,
  recall: recallAvantiqoLearnedKnowledge,
  research: runKnowledgeAwareWebResearch,
  runBatch: runAvantiqoContinuousLearningBatch,
});
