import {
  recallAvantiqoHybridKnowledge,
} from "../../intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js";

export const OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT =
  "AVANTIQO_OPERATOR_VERIFIED_LEARNING_CONTEXT_V1";

const FINAL_RELEASE_SOURCE = "avantiqo_explicit_final_knowledge_release";
const MAX_QUERY_CHARS = 4000;
const MAX_ITEMS = 4;
const MAX_ITEM_CHARS = 900;
const MAX_CONTEXT_CHARS = 2600;

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

function uniqueText(values = [], limit = 8) {
  return [...new Set(list(values).map((value) => text(value, 500)).filter(Boolean))]
    .slice(-limit);
}

function emptyContext(reason, extra = {}) {
  return {
    contract: OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT,
    status: "NONE",
    route: null,
    knowledge: [],
    knowledge_count: 0,
    context_chars: 0,
    freshness_checked: false,
    evidence_graph_checked: false,
    retrieval_only: true,
    internet_search_performed: false,
    fresh_research_performed: false,
    external_intelligence_provider_used: false,
    external_embedding_provider_used: false,
    database_write_performed: false,
    knowledge_promotion_performed: false,
    advisory_only: true,
    current_business_state_proven: false,
    authorization_effect: "NONE",
    execution_effect: "NONE",
    customer_private_memory_reused: false,
    platform_learning_organization_only: true,
    reason,
    ...extra,
  };
}

export function buildOperatorVerifiedLearningQuery({
  message,
  projectState = {},
  currentScreen = null,
} = {}) {
  const state = object(projectState);
  const screen = object(currentScreen);
  return [
    text(message, 1800),
    text(state.objective, 900),
    ...uniqueText(state.constraints, 4),
    ...uniqueText(state.decisions, 4),
    text(state.progress_summary, 700),
    text(state.next_step, 500),
    text(state.blocker, 500),
    text(screen.name || screen.title || screen.workspace_name, 300),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_QUERY_CHARS);
}

function safeKnowledgeItem(entry = {}) {
  const item = object(entry);
  const provenance = object(item.provenance);
  if (
    text(provenance.source, 200) !== FINAL_RELEASE_SOURCE ||
    text(item.authorization_effect, 80) !== "NONE"
  ) {
    return null;
  }

  const content = text(item.content, MAX_ITEM_CHARS);
  if (!content) return null;

  return {
    id: text(item.id, 240) || null,
    subject: text(item.subject, 300) || null,
    content,
    confidence: Number.isFinite(Number(item.confidence))
      ? Math.max(0, Math.min(1, Number(item.confidence)))
      : null,
    relevance: Number.isFinite(Number(item.relevance))
      ? Math.max(0, Math.min(1, Number(item.relevance)))
      : null,
    verified_at: text(item.verified_at, 120) || null,
    valid_until: text(item.valid_until, 120) || null,
    domain: text(item.domain, 120) || null,
    jurisdiction: text(item.jurisdiction, 120) || null,
    provenance: {
      source: FINAL_RELEASE_SOURCE,
      topic_key: text(provenance.topic_key, 240) || null,
    },
    source_count: list(item.sources).length,
    verification_status: "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE",
    reusable: true,
    authorization_effect: "NONE",
  };
}

export function buildOperatorVerifiedLearningContext(recall = {}) {
  const result = object(recall);
  const retrieval = object(result.retrieval);
  const governance = object(result.governance);
  const evidenceGraph = object(result.evidence_graph);

  const safeGovernance = Boolean(
    result.available === true &&
      result.sufficient === true &&
      text(result.reason, 160) === "HYBRID_VERIFIED_KNOWLEDGE_REUSABLE" &&
      retrieval.explicit_final_release_only === true &&
      governance.deterministic_pre_model_retrieval === true &&
      governance.external_embedding_provider_used === false &&
      governance.external_intelligence_provider_used === false &&
      governance.evidence_graph_checked === true &&
      governance.conflict_can_block_reuse === true &&
      governance.stale_current_knowledge_can_block_reuse === true &&
      governance.expired_valid_until_blocks_reuse === true &&
      governance.legacy_pre_epistemic_platform_knowledge_reused === false &&
      governance.explicit_final_release_required_for_general_knowledge_reuse === true &&
      governance.memory_never_authorizes_actions === true &&
      governance.raw_reasoning_persisted === false &&
      evidenceGraph.block_knowledge_reuse === false,
  );

  const safeKnowledge = list(result.knowledge)
    .map(safeKnowledgeItem)
    .filter(Boolean)
    .slice(0, MAX_ITEMS);

  const selected = [];
  let contextChars = 0;
  for (const item of safeKnowledge) {
    if (contextChars + item.content.length > MAX_CONTEXT_CHARS) break;
    selected.push(item);
    contextChars += item.content.length;
  }

  const available = Boolean(safeGovernance && selected.length);
  if (!available) {
    return emptyContext(
      text(result.reason, 200) || "NO_SAFE_VERIFIED_LEARNING_CONTEXT",
      {
        freshness_checked: result.available === true,
        evidence_graph_checked: governance.evidence_graph_checked === true,
      },
    );
  }

  return {
    contract: OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT,
    status: "AVAILABLE",
    route: "HYBRID_EXPLICIT_FINAL_RELEASE",
    knowledge: selected,
    knowledge_count: selected.length,
    context_chars: contextChars,
    freshness_checked: true,
    evidence_graph_checked: true,
    retrieval_only: true,
    internet_search_performed: false,
    fresh_research_performed: false,
    external_intelligence_provider_used: false,
    external_embedding_provider_used: false,
    database_write_performed: false,
    knowledge_promotion_performed: false,
    advisory_only: true,
    current_business_state_proven: false,
    authorization_effect: "NONE",
    execution_effect: "NONE",
    customer_private_memory_reused: false,
    platform_learning_organization_only: true,
    source_requirement_met: retrieval.source_requirement_met === true,
    minimum_source_count: Number(retrieval.minimum_source_count || 0),
  };
}

export async function loadOperatorVerifiedLearningContext({
  message,
  projectState = {},
  currentScreen = null,
} = {}) {
  const query = buildOperatorVerifiedLearningQuery({
    message,
    projectState,
    currentScreen,
  });
  if (!query) return emptyContext("EMPTY_QUERY");

  try {
    const recall = await recallAvantiqoHybridKnowledge({
      query,
      minimum_sources: 2,
      limit: MAX_ITEMS,
    });
    return {
      ...buildOperatorVerifiedLearningContext(recall),
      query,
    };
  } catch (error) {
    return emptyContext("VERIFIED_LEARNING_CONTEXT_READ_FAILED", {
      query,
      error: text(error?.message || error, 500),
    });
  }
}

export const OperatorVerifiedLearningContextRuntime = Object.freeze({
  contract: OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT,
  buildQuery: buildOperatorVerifiedLearningQuery,
  buildContext: buildOperatorVerifiedLearningContext,
  load: loadOperatorVerifiedLearningContext,
});
