import {
  evaluateAvantiqoReusableKnowledge,
} from "../../intelligence/runtime/AvantiqoKnowledgeRouterRuntime.js";

export const OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT =
  "AVANTIQO_OPERATOR_VERIFIED_LEARNING_CONTEXT_V1";

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
  if (
    item.reusable !== true ||
    text(item.verification_status, 160) !== "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE" ||
    text(item.authorization_effect, 80) !== "NONE" ||
    text(item.freshness, 120) === "STALE"
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
    verified_at: text(item.verified_at, 120) || null,
    valid_until: text(item.valid_until, 120) || null,
    provenance: {
      source: text(item.provenance?.source, 200) || null,
      topic_key: text(item.provenance?.topic_key, 240) || null,
    },
    source_count: list(item.sources).length,
    authorization_effect: "NONE",
  };
}

export function buildOperatorVerifiedLearningContext(evaluation = {}) {
  const result = object(evaluation);
  const learned = object(result.learned_knowledge);
  const governance = object(result.governance);
  const safeRoute = text(result.route, 160) === "HYBRID_EXPLICIT_FINAL_RELEASE";
  const safeGovernance = Boolean(
    governance.platform_learning_organization_only === true &&
      governance.customer_organization_used_for_platform_knowledge === false &&
      governance.customer_private_memory_reused === false &&
      governance.explicit_final_release_only === true &&
      governance.evidence_graph_checked === true &&
      governance.internet_search_performed === false &&
      governance.fresh_research_performed === false &&
      governance.database_write_performed === false &&
      governance.knowledge_promotion_performed === false &&
      text(governance.authorization_effect, 80) === "NONE" &&
      text(governance.execution_effect, 80) === "NONE",
  );
  const safeKnowledge = list(learned.knowledge)
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

  const available = Boolean(
    result.success === true &&
      result.status === "REUSED_VERIFIED_KNOWLEDGE" &&
      learned.status === "REUSED_VERIFIED_KNOWLEDGE" &&
      learned.freshness_checked === true &&
      learned.evidence_graph_checked === true &&
      learned.fresh_research_performed === false &&
      learned.stale_knowledge_reused === false &&
      learned.knowledge_authorizes_execution === false &&
      safeRoute &&
      safeGovernance &&
      selected.length,
  );

  return {
    contract: OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT,
    status: available ? "AVAILABLE" : "NONE",
    route: available ? "HYBRID_EXPLICIT_FINAL_RELEASE" : null,
    knowledge: available ? selected : [],
    knowledge_count: available ? selected.length : 0,
    context_chars: available ? contextChars : 0,
    freshness_checked: true,
    evidence_graph_checked: available,
    advisory_only: true,
    current_business_state_proven: false,
    authorization_effect: "NONE",
    execution_effect: "NONE",
    customer_private_memory_reused: false,
    platform_learning_organization_only: true,
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
  if (!query) {
    return {
      contract: OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT,
      status: "NONE",
      route: null,
      knowledge: [],
      knowledge_count: 0,
      context_chars: 0,
      freshness_checked: false,
      evidence_graph_checked: false,
      advisory_only: true,
      current_business_state_proven: false,
      authorization_effect: "NONE",
      execution_effect: "NONE",
      customer_private_memory_reused: false,
      platform_learning_organization_only: true,
      reason: "EMPTY_QUERY",
    };
  }

  try {
    const evaluation = await evaluateAvantiqoReusableKnowledge({
      payload: {
        query,
        minimum_sources: 2,
      },
    });
    return {
      ...buildOperatorVerifiedLearningContext(evaluation),
      query,
    };
  } catch (error) {
    return {
      contract: OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT,
      status: "NONE",
      route: null,
      knowledge: [],
      knowledge_count: 0,
      context_chars: 0,
      freshness_checked: false,
      evidence_graph_checked: false,
      advisory_only: true,
      current_business_state_proven: false,
      authorization_effect: "NONE",
      execution_effect: "NONE",
      customer_private_memory_reused: false,
      platform_learning_organization_only: true,
      query,
      reason: "VERIFIED_LEARNING_CONTEXT_READ_FAILED",
      error: text(error?.message || error, 500),
    };
  }
}

export const OperatorVerifiedLearningContextRuntime = Object.freeze({
  contract: OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT,
  buildQuery: buildOperatorVerifiedLearningQuery,
  buildContext: buildOperatorVerifiedLearningContext,
  load: loadOperatorVerifiedLearningContext,
});
