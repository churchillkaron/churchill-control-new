import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  runKnowledgeAwareWebResearch,
} from "@/lib/intelligence/runtime/AvantiqoContinuousLearningRuntime";
import {
  inspectAvantiqoEvidenceGraph,
} from "@/lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime";

export const AVANTIQO_KNOWLEDGE_ROUTER_CONTRACT =
  "AVANTIQO_KNOWLEDGE_ROUTER_V2";

const MEMORY_TABLE = "intelligence_memories";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const INTERNAL_SOURCE = "avantiqo_canonical_product_knowledge";
const INTERNAL_AUTHORITY = "AVANTIQO_CANONICAL_PRODUCT";
const MAX_ROWS = 500;
const MAX_RESULTS = 10;

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

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function tokens(value) {
  return [...new Set(
    text(value, 12000)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]/g, " ")
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 2),
  )].slice(0, 80);
}

function productStateQuery(query) {
  const source = text(query, 4000).toLowerCase();
  const explicitlyAvantiqo = /\bavantiqo\b|\bour (?:platform|system|product|software|intelligence)\b/.test(source);
  const productObject = /\b(workspace|workspaces|registry|capability|capabilities|form|forms|action|actions|route|routes|renderer|document|documents|domain|domains|solution|solutions|architecture|product constitution|product|platform)\b/.test(source);
  const implementationIntent = /\b(current|currently|have|has|support|supports|implemented|available|exist|exists|built|configured|registered|canonical|inside|in the system|in our system|our)\b/.test(source);
  return explicitlyAvantiqo && (productObject || implementationIntent);
}

function lexicalScore(row, queryTokens) {
  if (!queryTokens.length) return 0;
  const metadata = object(row?.metadata);
  const haystack = [
    row?.subject,
    row?.content,
    metadata.knowledge_domain,
    metadata.workspace_id,
    metadata.workspace_name,
    metadata.group_name,
    metadata.route,
    metadata.document,
    metadata.create_form,
    metadata.product_object_type,
    metadata.internal_reference,
  ].map((entry) => text(entry, 14000).toLowerCase()).join(" ");
  let hits = 0;
  for (const token of queryTokens.slice(0, 24)) {
    if (haystack.includes(token)) hits += 1;
  }
  return hits / Math.min(queryTokens.length, 24);
}

async function recallCanonicalProductKnowledge(query) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      available: false,
      sufficient: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      knowledge: [],
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,importance,confidence,source,active,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("source", INTERNAL_SOURCE)
    .eq("active", true)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_ROWS);
  if (result.error) throw result.error;

  const queryTokens = tokens(query);
  const ranked = list(result.data)
    .map((row) => {
      const metadata = object(row.metadata);
      const canonical = Boolean(
        metadata.internal_authoritative === true &&
        text(metadata.authority, 120) === INTERNAL_AUTHORITY,
      );
      const lexical = lexicalScore(row, queryTokens);
      const domainTokenHit = queryTokens.includes(text(metadata.knowledge_domain, 120).toLowerCase());
      const score = lexical + (domainTokenHit ? 0.12 : 0) + (canonical ? 0.08 : 0);
      return { row, metadata, canonical, score };
    })
    .filter((entry) => entry.canonical && entry.score >= 0.18)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_RESULTS);

  const knowledge = ranked.map((entry) => ({
    id: entry.row.id,
    subject: entry.row.subject,
    content: text(entry.row.content, 5000),
    relevance: Number(entry.score.toFixed(4)),
    confidence: Number(entry.row.confidence || 0),
    importance: Number(entry.row.importance || 0),
    updated_at: entry.row.updated_at || null,
    domain: text(entry.metadata.knowledge_domain, 120) || null,
    product_object_type: text(entry.metadata.product_object_type, 160) || null,
    internal_reference: text(entry.metadata.internal_reference, 500) || null,
    authority: INTERNAL_AUTHORITY,
  }));

  return {
    available: true,
    sufficient: Boolean(knowledge.length && knowledge[0].relevance >= 0.3),
    reason: knowledge.length && knowledge[0].relevance >= 0.3
      ? "CANONICAL_AVANTIQO_PRODUCT_KNOWLEDGE"
      : "CANONICAL_PRODUCT_KNOWLEDGE_INSUFFICIENT",
    knowledge,
  };
}

function canonicalResponse({ query, objective, recall }) {
  const claims = recall.knowledge.map((entry, index) => ({
    id: `canonical-product-${index + 1}`,
    claim: entry.content,
    source_urls: [],
    confidence: 1,
    verification_status: "AVANTIQO_CANONICAL_PRODUCT",
    internal_reference: entry.internal_reference,
  }));

  return {
    contract: AVANTIQO_KNOWLEDGE_ROUTER_CONTRACT,
    status: "CANONICAL_PRODUCT_KNOWLEDGE_REUSED",
    query,
    objective: text(objective, 2000) || null,
    answer: recall.knowledge.map((entry) => entry.content).join("\n"),
    claims,
    sources: [],
    uncertainty: [],
    follow_up_queries: [],
    evidence: {
      provider: "avantiqo-canonical-product-knowledge",
      authority: INTERNAL_AUTHORITY,
      internet_search_performed: false,
      web_search_observed: false,
      returned_source_count: 0,
      canonical_product_knowledge_reused: true,
      retrieved_at: new Date().toISOString(),
    },
    knowledge_reuse: {
      attempted: true,
      reused: true,
      reason: recall.reason,
      matched_knowledge_count: recall.knowledge.length,
      knowledge: recall.knowledge,
    },
    evidence_graph: {
      checked: false,
      reason: "CANONICAL_INTERNAL_PRODUCT_AUTHORITY",
      block_knowledge_reuse: false,
    },
    governance: {
      canonical_internal_product_authority: true,
      appropriate_only_for_avantiqo_product_state: true,
      external_general_knowledge_authority: false,
      customer_private_memory_reused: false,
      mutable_customer_business_state_proven: false,
      authorization_effect: "NONE",
      permission_effect: "NONE",
      scope_effect: "NONE",
      execution_effect: "NONE",
      raw_reasoning_persisted: false,
    },
  };
}

export async function runAvantiqoKnowledgeAwareResearch({ context = {}, payload = {} } = {}) {
  const query = text(payload.query, 4000);
  if (!query) throw new Error("WEB_RESEARCH_QUERY_REQUIRED");

  const internalProductState = productStateQuery(query);
  if (payload.force_refresh !== true && internalProductState) {
    const recall = await recallCanonicalProductKnowledge(query);
    if (recall.sufficient) {
      return canonicalResponse({
        query,
        objective: payload.objective,
        recall,
      });
    }
  }

  const evidenceGraph = await inspectAvantiqoEvidenceGraph({
    organizationId: context.organizationId || context.organization_id || null,
    query,
    domain: payload.domain || null,
    jurisdiction: payload.jurisdiction || null,
    freshnessDays: payload.freshness_days ?? 180,
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

  const forceRefresh = payload.force_refresh === true || evidenceGraph.block_knowledge_reuse === true;
  const result = await runKnowledgeAwareWebResearch({
    context,
    payload: {
      ...payload,
      force_refresh: forceRefresh,
    },
  });
  return {
    ...result,
    knowledge_router_contract: AVANTIQO_KNOWLEDGE_ROUTER_CONTRACT,
    canonical_product_recall_attempted: internalProductState,
    evidence_graph: {
      checked: true,
      available: evidenceGraph.available === true,
      block_knowledge_reuse: evidenceGraph.block_knowledge_reuse === true,
      reason: evidenceGraph.reason || null,
      relevant_graph_count: list(evidenceGraph.matches).length,
      relevant_conflict_count: list(evidenceGraph.conflicts).length,
      forced_fresh_research: forceRefresh && payload.force_refresh !== true,
    },
  };
}

export const AvantiqoKnowledgeRouterRuntime = Object.freeze({
  contract: AVANTIQO_KNOWLEDGE_ROUTER_CONTRACT,
  research: runAvantiqoKnowledgeAwareResearch,
});
