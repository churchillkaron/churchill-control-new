import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  inspectAvantiqoEvidenceGraph,
} from "@/lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime";

export const AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_CONTRACT =
  "AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_V1";

const MEMORY_TABLE = "intelligence_memories";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const INTERNAL_SOURCE = "avantiqo_canonical_product_knowledge";
const FINAL_RELEASE_SOURCE = "avantiqo_explicit_final_knowledge_release";
const MAX_CANDIDATES = 500;
const MAX_RESULTS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const CONCEPT_FAMILIES = Object.freeze({
  accounts_receivable: [
    "accounts receivable", "account receivable", "receivables", "ar", "customer debt",
    "customer balance", "debtor", "debtors", "customer invoice", "customer invoices",
  ],
  accounts_payable: [
    "accounts payable", "account payable", "payables", "ap", "supplier debt",
    "vendor debt", "creditor", "creditors", "vendor bill", "supplier bill",
  ],
  general_ledger: [
    "general ledger", "ledger", "gl", "book of accounts", "journal", "journals",
    "journal entry", "journal entries", "posting", "postings",
  ],
  cash_liquidity: [
    "cash", "bank cash", "liquidity", "cash flow", "bank balance", "bank balances",
    "working capital", "treasury",
  ],
  revenue_sales: [
    "revenue", "sales", "turnover", "income", "commercial revenue", "top line",
  ],
  expense_cost: [
    "expense", "expenses", "cost", "costs", "spend", "spending", "opex",
    "operating expense", "operating expenses",
  ],
  procurement: [
    "procurement", "purchasing", "purchase", "sourcing", "buying", "purchase order",
    "purchase orders", "po", "supplier sourcing",
  ],
  inventory: [
    "inventory", "stock", "on hand", "stock on hand", "materials", "goods",
    "inventory balance", "inventory balances",
  ],
  warehouse: [
    "warehouse", "warehousing", "storage", "bin", "bins", "location", "locations",
    "put away", "picking", "pick pack",
  ],
  supplier_vendor: [
    "supplier", "suppliers", "vendor", "vendors", "creditor", "creditors",
  ],
  customer_client: [
    "customer", "customers", "client", "clients", "account", "accounts",
    "buyer", "buyers",
  ],
  lead_prospect: [
    "lead", "leads", "prospect", "prospects", "potential customer", "potential customers",
  ],
  opportunity_deal: [
    "opportunity", "opportunities", "deal", "deals", "pipeline", "sales pipeline",
  ],
  employee_workforce: [
    "employee", "employees", "staff", "workforce", "personnel", "worker", "workers",
    "team member", "team members",
  ],
  payroll_compensation: [
    "payroll", "salary", "salaries", "wage", "wages", "compensation", "pay run",
    "pay runs",
  ],
  leave_absence: [
    "leave", "absence", "time off", "vacation", "holiday request", "leave request",
  ],
  project_program: [
    "project", "projects", "program", "programme", "programs", "programmes",
    "initiative", "initiatives", "workstream", "workstreams",
  ],
  task_work_item: [
    "task", "tasks", "work item", "work items", "action item", "action items",
    "todo", "to do",
  ],
  milestone_deliverable: [
    "milestone", "milestones", "deliverable", "deliverables", "checkpoint", "checkpoints",
  ],
  api_integration: [
    "api", "apis", "integration", "integrations", "interface", "interfaces",
    "service endpoint", "service endpoints", "endpoint", "endpoints",
  ],
  webhook_event: [
    "webhook", "webhooks", "callback", "callbacks", "event delivery", "event deliveries",
    "event notification", "event notifications",
  ],
  authentication_identity: [
    "authentication", "auth", "login", "sign in", "signin", "identity", "oauth", "sso",
    "single sign on", "single-sign-on",
  ],
  authorization_permission: [
    "authorization", "permission", "permissions", "access control", "role", "roles",
    "privilege", "privileges", "approval authority",
  ],
  artificial_intelligence: [
    "artificial intelligence", "ai", "intelligence", "model", "models", "agent", "agents",
    "reasoning", "cognition",
  ],
  memory_knowledge: [
    "memory", "memories", "knowledge", "recall", "retrieval", "remember", "remembering",
    "knowledge base", "knowledge bases",
  ],
  research_evidence: [
    "research", "evidence", "source", "sources", "citation", "citations", "provenance",
    "verification", "verify", "validated", "validation",
  ],
  contradiction_conflict: [
    "contradiction", "contradictions", "contradictory", "conflict", "conflicts", "conflicting",
    "disagree", "disagreement", "inconsistent", "inconsistency", "contested",
  ],
  workflow_process: [
    "workflow", "workflows", "process", "processes", "procedure", "procedures",
    "business process", "business processes",
  ],
  approval: [
    "approval", "approvals", "approve", "approved", "review", "sign off", "signoff",
  ],
  document_record: [
    "document", "documents", "record", "records", "form", "forms", "file", "files",
  ],
  report_analytics: [
    "report", "reports", "analytics", "analysis", "dashboard", "dashboards", "insight",
    "insights", "kpi", "kpis", "metric", "metrics",
  ],
  create_action: [
    "create", "new", "add", "insert", "register", "open new", "make",
  ],
  update_action: [
    "update", "edit", "change", "modify", "revise", "adjust", "amend",
  ],
  delete_action: [
    "delete", "remove", "purge", "archive", "deactivate", "retire",
  ],
  current_freshness: [
    "current", "currently", "latest", "today", "recent", "newest", "up to date",
    "up-to-date", "fresh",
  ],
});

const DOMAIN_SIGNALS = Object.freeze({
  finance: [
    "accounts_receivable", "accounts_payable", "general_ledger", "cash_liquidity",
    "revenue_sales", "expense_cost",
  ],
  "supply-chain": ["procurement", "inventory", "warehouse", "supplier_vendor"],
  commercial: ["customer_client", "lead_prospect", "opportunity_deal", "revenue_sales"],
  people: ["employee_workforce", "payroll_compensation", "leave_absence"],
  projects: ["project_program", "task_work_item", "milestone_deliverable"],
  integrations: ["api_integration", "webhook_event", "authentication_identity"],
  intelligence: [
    "artificial_intelligence", "memory_knowledge", "research_evidence",
    "contradiction_conflict",
  ],
});

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

function normalize(value) {
  return text(value, 24000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token) {
  const value = text(token, 80).toLowerCase();
  if (value.length <= 4) return value;
  if (value.endsWith("ies") && value.length > 5) return `${value.slice(0, -3)}y`;
  if (value.endsWith("ing") && value.length > 6) return value.slice(0, -3);
  if (value.endsWith("ed") && value.length > 5) return value.slice(0, -2);
  if (value.endsWith("es") && value.length > 5) return value.slice(0, -2);
  if (value.endsWith("s") && value.length > 4 && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function tokens(value) {
  return [...new Set(
    normalize(value)
      .split(/\s+/)
      .map((entry) => stem(entry))
      .filter((entry) => entry.length > 1),
  )].slice(0, 160);
}

function phraseSet(value) {
  const source = normalize(value);
  const words = source.split(/\s+/).filter(Boolean).slice(0, 160);
  const phrases = new Set();
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      phrases.add(words.slice(index, index + size).join(" "));
    }
  }
  return phrases;
}

function trigrams(value) {
  const source = `  ${normalize(value).slice(0, 1200)}  `;
  const grams = new Set();
  for (let index = 0; index + 3 <= source.length; index += 1) {
    grams.add(source.slice(index, index + 3));
  }
  return grams;
}

function dice(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  return (2 * intersection) / (left.size + right.size);
}

function conceptKeys(value) {
  const source = ` ${normalize(value)} `;
  const tokenSet = new Set(tokens(source));
  const found = new Set();
  for (const [key, aliases] of Object.entries(CONCEPT_FAMILIES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);
      if (!normalizedAlias) continue;
      if (normalizedAlias.includes(" ")) {
        if (source.includes(` ${normalizedAlias} `)) {
          found.add(key);
          break;
        }
      } else if (tokenSet.has(stem(normalizedAlias))) {
        found.add(key);
        break;
      }
    }
  }
  return found;
}

function inferredDomain(concepts) {
  let best = null;
  let bestCount = 0;
  for (const [domain, signals] of Object.entries(DOMAIN_SIGNALS)) {
    const count = signals.filter((signal) => concepts.has(signal)).length;
    if (count > bestCount) {
      best = domain;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : null;
}

function queryLooksCurrent(query) {
  return /\b(current|currently|latest|today|newest|recent|version|regulation|regulatory|law|legal|tax|rate|price|pricing|api|standard|specification|requirement|availability)\b/i.test(
    text(query, 12000),
  );
}

function dateAgeDays(value, nowMs = Date.now()) {
  const parsed = Date.parse(text(value, 120));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / DAY_MS);
}

function sourceSummary(source = {}) {
  const item = object(source);
  const url = text(item.url, 2000);
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    id: text(item.id, 160) || null,
    url,
    title: text(item.title, 500) || null,
    publisher: text(item.publisher, 300) || null,
    published_at: text(item.published_at, 120) || null,
    official: item.official === true,
    primary: item.primary === true,
  };
}

function rowText(row) {
  const metadata = object(row?.metadata);
  return [
    row?.subject,
    row?.content,
    metadata.knowledge_domain,
    metadata.jurisdiction,
    metadata.topic_key,
    metadata.workspace_id,
    metadata.workspace_name,
    metadata.group_name,
    metadata.route,
    metadata.document,
    metadata.create_form,
    metadata.product_object_type,
    metadata.internal_reference,
    ...list(metadata.semantic_terms),
    ...list(metadata.aliases),
    ...list(metadata.keywords),
  ].map((entry) => text(entry, 8000)).filter(Boolean).join(" ");
}

function tokenCoverage(queryTokens, candidateTokens) {
  if (!queryTokens.size || !candidateTokens.size) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) hits += 1;
  }
  return hits / queryTokens.size;
}

function conceptCoverage(queryConcepts, candidateConcepts) {
  if (!queryConcepts.size || !candidateConcepts.size) return 0;
  let hits = 0;
  for (const concept of queryConcepts) {
    if (candidateConcepts.has(concept)) hits += 1;
  }
  return hits / queryConcepts.size;
}

function phraseCoverage(queryPhrases, candidateNormalized) {
  if (!queryPhrases.size || !candidateNormalized) return 0;
  let hits = 0;
  let considered = 0;
  for (const phrase of queryPhrases) {
    if (phrase.length < 7) continue;
    considered += 1;
    if (candidateNormalized.includes(phrase)) hits += 1;
    if (considered >= 20) break;
  }
  return considered ? hits / considered : 0;
}

function aliasCoverage(queryTokens, aliases) {
  const aliasTokens = new Set(tokens(list(aliases).join(" ")));
  if (!aliasTokens.size || !queryTokens.size) return 0;
  let hits = 0;
  for (const token of aliasTokens) {
    if (queryTokens.has(token)) hits += 1;
  }
  return hits / aliasTokens.size;
}

function sourceQuality(metadata) {
  const sources = list(metadata.sources).map(sourceSummary).filter(Boolean);
  if (!sources.length) return { score: 0, sources: [], diversity: 0, officialPrimary: false };
  const hosts = new Set();
  for (const source of sources) {
    try {
      hosts.add(new URL(source.url).hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      // Invalid URLs were already filtered by sourceSummary.
    }
  }
  const officialPrimary = sources.some((source) => source.official && source.primary);
  const diversity = hosts.size;
  const score = Math.min(1, diversity / 4) * 0.58 +
    (officialPrimary ? 0.32 : 0) +
    Math.min(0.1, sources.length * 0.02);
  return { score: bounded(score), sources, diversity, officialPrimary };
}

function rowFreshness(row, currentQuestion, requestedFreshnessDays, nowMs) {
  const metadata = object(row?.metadata);
  const verifiedAt = text(metadata.verified_at, 120) || row?.updated_at || row?.created_at;
  const ageDays = dateAgeDays(verifiedAt, nowMs);
  const requiredDays = requestedFreshnessDays ?? (currentQuestion ? 7 : null);
  if (requiredDays !== null && ageDays > requiredDays) {
    return { ageDays, verifiedAt, requiredDays, valid: false, score: 0 };
  }
  const validUntil = Date.parse(text(row?.valid_until, 120));
  if (Number.isFinite(validUntil) && validUntil <= nowMs) {
    return { ageDays, verifiedAt, requiredDays, valid: false, score: 0 };
  }
  const decayWindow = currentQuestion ? Math.max(14, (requiredDays || 7) * 2) : 730;
  return {
    ageDays,
    verifiedAt,
    requiredDays,
    valid: true,
    score: bounded(1 - ageDays / decayWindow),
  };
}

export function rankAvantiqoKnowledgeRows({
  rows = [],
  query,
  domain = null,
  jurisdiction = null,
  freshness_days = null,
  include_internal = false,
  now_ms = Date.now(),
  limit = MAX_RESULTS,
} = {}) {
  const question = text(query, 4000);
  if (!question) throw new Error("AVANTIQO_HYBRID_KNOWLEDGE_QUERY_REQUIRED");

  const queryTokenSet = new Set(tokens(question));
  const queryPhrases = phraseSet(question);
  const queryConcepts = conceptKeys(question);
  const inferredQueryDomain = inferredDomain(queryConcepts);
  const requestedDomain = text(domain, 120).toLowerCase() || inferredQueryDomain || "";
  const requestedJurisdiction = text(jurisdiction, 120).toLowerCase();
  const requestedFreshnessDays = freshness_days === null || freshness_days === undefined
    ? null
    : boundedInteger(freshness_days, 30, 0, 3650);
  const currentQuestion = queryLooksCurrent(question);
  const queryTrigrams = trigrams(question);

  const ranked = list(rows)
    .filter((row) => row?.active === true)
    .filter((row) => include_internal || row?.source !== INTERNAL_SOURCE)
    .filter((row) => !row?.forgotten_at && !row?.superseded_at && !row?.superseded_by)
    .map((row) => {
      const metadata = object(row.metadata);
      const candidateText = rowText(row);
      const candidateNormalized = normalize(candidateText);
      const candidateTokens = new Set(tokens(candidateText));
      const candidateConcepts = conceptKeys(candidateText);
      const lexical = tokenCoverage(queryTokenSet, candidateTokens);
      const concepts = conceptCoverage(queryConcepts, candidateConcepts);
      const phrases = phraseCoverage(queryPhrases, candidateNormalized);
      const aliases = aliasCoverage(queryTokenSet, metadata.aliases);
      const fuzzy = dice(queryTrigrams, trigrams([
        row?.subject,
        metadata.knowledge_domain,
        metadata.topic_key,
        metadata.workspace_name,
        row?.content,
      ].join(" ")));
      const rowDomain = text(metadata.knowledge_domain, 120).toLowerCase();
      const rowJurisdiction = text(metadata.jurisdiction, 120).toLowerCase();
      const domainMatch = requestedDomain && rowDomain === requestedDomain ? 1 : 0;
      const jurisdictionMatch = requestedJurisdiction && rowJurisdiction === requestedJurisdiction ? 1 : 0;
      const confidence = bounded(row.confidence, 0);
      const importance = bounded(row.importance, 0);
      const freshness = rowFreshness(row, currentQuestion, requestedFreshnessDays, now_ms);
      const sources = sourceQuality(metadata);
      const semanticBridge = lexical < 0.2 && concepts >= 0.5;
      const score =
        lexical * 0.29 +
        concepts * 0.24 +
        phrases * 0.1 +
        aliases * 0.08 +
        fuzzy * 0.09 +
        domainMatch * 0.08 +
        jurisdictionMatch * 0.05 +
        confidence * 0.06 +
        sources.score * 0.04 +
        freshness.score * 0.03 +
        importance * 0.02 +
        (semanticBridge ? 0.05 : 0);

      return {
        row,
        metadata,
        score: bounded(score),
        signals: {
          lexical: bounded(lexical),
          concepts: bounded(concepts),
          phrases: bounded(phrases),
          alias_match: bounded(aliases),
          fuzzy: bounded(fuzzy),
          domain_match: domainMatch === 1,
          jurisdiction_match: jurisdictionMatch === 1,
          semantic_bridge: semanticBridge,
          confidence,
          importance,
          source_quality: sources.score,
          source_diversity: sources.diversity,
          official_primary_source: sources.officialPrimary,
          freshness: freshness.score,
          age_days: Number.isFinite(freshness.ageDays)
            ? Number(freshness.ageDays.toFixed(2))
            : null,
          freshness_valid: freshness.valid,
        },
        sources: sources.sources,
        verifiedAt: freshness.verifiedAt,
        requiredFreshnessDays: freshness.requiredDays,
      };
    })
    .filter((entry) => entry.signals.freshness_valid)
    .filter((entry) => entry.signals.confidence >= 0.68)
    .filter((entry) =>
      entry.score >= 0.28 &&
      (entry.signals.lexical >= 0.12 ||
        entry.signals.concepts >= 0.34 ||
        entry.signals.alias_match >= 0.5 ||
        entry.signals.fuzzy >= 0.44 ||
        entry.signals.domain_match),
    )
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.signals.confidence !== left.signals.confidence) {
        return right.signals.confidence - left.signals.confidence;
      }
      return right.signals.source_quality - left.signals.source_quality;
    })
    .slice(0, Math.max(1, Math.min(MAX_RESULTS, Number(limit) || MAX_RESULTS)));

  return {
    contract: AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_CONTRACT,
    query: question,
    inferred_domain: inferredQueryDomain,
    requested_domain: requestedDomain || null,
    requested_jurisdiction: requestedJurisdiction || null,
    current_question: currentQuestion,
    query_concepts: [...queryConcepts],
    ranked,
  };
}

function aggregateSources(entries) {
  const byUrl = new Map();
  for (const entry of entries) {
    for (const source of entry.sources) {
      const previous = byUrl.get(source.url) || {};
      byUrl.set(source.url, { ...previous, ...source });
    }
  }
  return [...byUrl.values()];
}

function resultKnowledge(entry) {
  return {
    id: entry.row.id,
    type: entry.row.memory_type,
    subject: entry.row.subject,
    content: text(entry.row.content, 2400),
    relevance: Number(entry.score.toFixed(4)),
    confidence: bounded(entry.row.confidence, 0),
    importance: bounded(entry.row.importance, 0),
    verified_at: entry.verifiedAt || null,
    valid_until: entry.row.valid_until || null,
    domain: text(entry.metadata.knowledge_domain, 120) || null,
    jurisdiction: text(entry.metadata.jurisdiction, 120) || null,
    stability: text(entry.metadata.stability, 80) || null,
    sources: entry.sources,
    retrieval_signals: entry.signals,
    provenance: {
      source: entry.row.source,
      topic_key: text(entry.metadata.topic_key, 240) || null,
      evidence_comparison_contract:
        text(entry.metadata.evidence_comparison_contract, 180) || null,
    },
    authorization_effect: "NONE",
  };
}

export async function recallAvantiqoHybridKnowledge({
  organizationId = null,
  query,
  domain = null,
  jurisdiction = null,
  freshness_days = null,
  minimum_sources = 2,
  limit = MAX_RESULTS,
} = {}) {
  const organization = text(organizationId, 160) || learningOrganizationId();
  const question = text(query, 4000);
  if (!question) throw new Error("AVANTIQO_HYBRID_KNOWLEDGE_QUERY_REQUIRED");
  if (!organization) {
    return {
      contract: AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_CONTRACT,
      available: false,
      sufficient: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      query: question,
      knowledge: [],
      sources: [],
      evidence_graph: null,
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select(
      "id,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at",
    )
    .eq("organization_id", organization)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("source", FINAL_RELEASE_SOURCE)
    .eq("active", true)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (result.error) throw result.error;

  const ranked = rankAvantiqoKnowledgeRows({
    rows: result.data,
    query: question,
    domain,
    jurisdiction,
    freshness_days,
    include_internal: false,
    limit,
  });

  const evidenceGraph = await inspectAvantiqoEvidenceGraph({
    organizationId: organization,
    query: question,
    domain: domain || ranked.requested_domain,
    jurisdiction,
    freshnessDays: freshness_days ?? (ranked.current_question ? 7 : 180),
    limit: 8,
  }).catch((error) => ({
    contract: "AVANTIQO_EVIDENCE_GRAPH_V1",
    available: false,
    block_knowledge_reuse: true,
    reason: "EVIDENCE_GRAPH_READ_FAILED",
    error: text(error?.message || error, 500),
    matches: [],
    conflicts: [],
  }));

  const knowledge = ranked.ranked.map(resultKnowledge);
  const sources = aggregateSources(ranked.ranked);
  const minimumSourceCount = boundedInteger(minimum_sources, 2, 1, 8);
  const top = ranked.ranked[0] || null;
  const sourceRequirementMet = Boolean(
    sources.length >= minimumSourceCount || top?.signals?.official_primary_source === true,
  );
  const semanticMatch = Boolean(
    top && (
      top.signals.lexical >= 0.2 ||
      top.signals.concepts >= 0.5 ||
      top.signals.alias_match >= 0.5 ||
      top.signals.semantic_bridge === true ||
      top.signals.fuzzy >= 0.55
    ),
  );
  const sufficient = Boolean(
    top &&
    top.score >= 0.4 &&
    top.signals.confidence >= 0.72 &&
    semanticMatch &&
    sourceRequirementMet &&
    evidenceGraph.block_knowledge_reuse !== true,
  );

  return {
    contract: AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_CONTRACT,
    available: true,
    sufficient,
    reason: evidenceGraph.block_knowledge_reuse === true
      ? evidenceGraph.reason || "EVIDENCE_GRAPH_BLOCKED_REUSE"
      : sufficient
        ? "HYBRID_VERIFIED_KNOWLEDGE_REUSABLE"
        : "FRESH_RESEARCH_REQUIRED",
    query: question,
    inferred_domain: ranked.inferred_domain,
    requested_domain: ranked.requested_domain,
    current_question: ranked.current_question,
    query_concepts: ranked.query_concepts,
    knowledge,
    sources,
    evidence_graph: {
      available: evidenceGraph.available === true,
      block_knowledge_reuse: evidenceGraph.block_knowledge_reuse === true,
      reason: evidenceGraph.reason || null,
      relevant_graph_count: list(evidenceGraph.matches).length,
      relevant_conflict_count: list(evidenceGraph.conflicts).length,
    },
    retrieval: {
      candidate_count: list(result.data).length,
      matched_count: ranked.ranked.length,
      top_relevance: top ? Number(top.score.toFixed(4)) : 0,
      semantic_bridge_used: ranked.ranked.some((entry) => entry.signals.semantic_bridge),
      lexical_only: Boolean(
        ranked.ranked.length && ranked.ranked.every((entry) => entry.signals.concepts === 0),
      ),
      source_requirement_met: sourceRequirementMet,
      minimum_source_count: minimumSourceCount,
      explicit_final_release_only: true,
    },
    governance: {
      deterministic_pre_model_retrieval: true,
      external_embedding_provider_used: false,
      external_intelligence_provider_used: false,
      evidence_graph_checked: true,
      conflict_can_block_reuse: true,
      stale_current_knowledge_can_block_reuse: true,
      expired_valid_until_blocks_reuse: true,
      legacy_pre_epistemic_platform_knowledge_reused: false,
      explicit_final_release_required_for_general_knowledge_reuse: true,
      memory_never_authorizes_actions: true,
      raw_reasoning_persisted: false,
    },
  };
}

export const AvantiqoHybridKnowledgeRetrievalRuntime = Object.freeze({
  contract: AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_CONTRACT,
  rank: rankAvantiqoKnowledgeRows,
  recall: recallAvantiqoHybridKnowledge,
});