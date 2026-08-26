import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  observeVerifiedExecutionFailure,
  observeVerifiedExecutionSuccess,
} from "@/lib/operator/runtime/IntelligenceFailureLearningPolicy";
import {
  inspectAvantiqoEvidenceGraph,
} from "@/lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime";

export const AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT =
  "AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_V1";

const MEMORY_TABLE = "intelligence_memories";
const PROVISIONAL_SCOPE = "platform_provisional_knowledge";
const OUTCOME_SCOPE = "platform_learning_provisional_shadow_outcomes";
const EVALUATION_SCOPE = "platform_learning_provisional_shadow_evaluations";
const MAX_PROVISIONAL_ROWS = 500;
const MAX_SHADOW_MATCHES = 5;
const MAX_OUTCOME_ROWS = 20000;
const MIN_RELEVANCE = 0.26;
const MIN_SHADOW_OBSERVATIONS = 20;
const MIN_SHADOW_DAYS = 7;
const MIN_SHADOW_CAPABILITIES = 1;
const MIN_STABLE_SMOOTHED_SUCCESS = 0.8;
const OUTCOME_RETENTION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, fallback = 0, minimum = 0, maximum = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function learningScopeId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function sha(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
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

function lexicalRelevance(queryTokens, row) {
  if (!queryTokens.length) return 0;
  const metadata = object(row.metadata);
  const haystack = new Set(tokens([
    row.subject,
    row.content,
    metadata.root_topic_key,
    metadata.knowledge_domain,
    metadata.epistemic_state,
  ].join(" ")));
  let matched = 0;
  for (const token of queryTokens.slice(0, 32)) {
    if (haystack.has(token)) matched += 1;
  }
  const denominator = Math.min(32, queryTokens.length);
  const lexical = denominator ? matched / denominator : 0;
  const topicHit = queryTokens.includes(text(metadata.root_topic_key, 240).toLowerCase()) ? 0.08 : 0;
  return Math.min(1, lexical + topicHit);
}

function safeCandidate(row, relevance) {
  const metadata = object(row.metadata);
  const fingerprint = text(metadata.hypothesis_fingerprint, 128);
  if (!fingerprint) return null;
  return {
    hypothesis_fingerprint: fingerprint,
    root_topic_key: text(metadata.root_topic_key || row.subject, 240) || null,
    synthesis_fingerprint: text(metadata.synthesis_fingerprint, 128) || null,
    relevance: Number(relevance.toFixed(4)),
    epistemic_state: text(metadata.epistemic_state, 80) || "PROVISIONAL_NOT_CANONICAL",
    reviewed_at: text(metadata.reviewed_at, 80) || null,
    next_epistemic_review_at: text(metadata.next_epistemic_review_at, 80) || null,
    provisional_scope_only: true,
    content_exposed_to_live_answer: false,
    live_answer_influence: false,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
  };
}

function eligibleProvisional(row, nowMs = Date.now()) {
  const metadata = object(row.metadata);
  if (row.active !== true) return false;
  if (text(metadata.status, 120) !== "PROVISIONAL_SHADOW_ONLY") return false;
  if (text(metadata.epistemic_state, 120) !== "PROVISIONAL_NOT_CANONICAL") return false;
  if (metadata.shadow_reuse_only !== true) return false;
  if (metadata.reusable_platform_knowledge !== false) return false;
  if (metadata.knowledge_router_reuse_allowed !== false) return false;
  if (metadata.automatic_knowledge_promotion !== false) return false;
  if (metadata.customer_private_content_included === true) return false;
  if (metadata.raw_reasoning_persisted === true) return false;
  const validUntil = Date.parse(text(row.valid_until, 100));
  if (Number.isFinite(validUntil) && validUntil <= nowMs) return false;
  return true;
}

export async function inspectAvantiqoProvisionalKnowledgeShadow({
  query,
  domain = null,
  limit = MAX_SHADOW_MATCHES,
} = {}) {
  const organizationId = learningScopeId();
  const question = text(query, 4000);
  if (!question) {
    return {
      contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
      checked: false,
      reason: "QUERY_REQUIRED",
      matched: false,
      candidates: [],
    };
  }
  if (!organizationId) {
    return {
      contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
      checked: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      matched: false,
      candidates: [],
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,content,active,valid_until,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", PROVISIONAL_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_PROVISIONAL_ROWS);
  if (result.error) throw result.error;

  const queryTokens = tokens(question);
  const requestedDomain = text(domain, 120).toLowerCase();
  const candidates = list(result.data)
    .filter((row) => eligibleProvisional(row))
    .map((row) => {
      const metadata = object(row.metadata);
      const domainBoost = requestedDomain &&
        text(metadata.knowledge_domain, 120).toLowerCase() === requestedDomain
        ? 0.12
        : 0;
      const relevance = Math.min(1, lexicalRelevance(queryTokens, row) + domainBoost);
      return { row, relevance };
    })
    .filter((entry) => entry.relevance >= MIN_RELEVANCE)
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, Math.max(1, Math.min(Number(limit) || MAX_SHADOW_MATCHES, MAX_SHADOW_MATCHES)))
    .map((entry) => safeCandidate(entry.row, entry.relevance))
    .filter(Boolean);

  return {
    contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
    checked: true,
    matched: candidates.length > 0,
    matched_candidate_count: candidates.length,
    candidates,
    live_answer_influence: false,
    candidate_content_exposed: false,
    reusable_knowledge_effect: "NONE",
    authorization_effect: "NONE",
    governance: {
      provisional_scope_read_only: true,
      customer_query_persisted: false,
      candidate_content_exposed_to_live_answer: false,
      candidate_changes_live_answer: false,
      candidate_authorizes_actions: false,
      automatic_knowledge_promotion: false,
    },
  };
}

function verifiedOutcome(execution = {}) {
  const success = observeVerifiedExecutionSuccess(execution);
  if (success) {
    return {
      outcome: "VERIFIED_SUCCESS",
      capability_key: text(success.capability_key, 300),
      verification_mode: text(success.verification_mode, 120) || "verified_success",
      failure_fingerprint: null,
    };
  }
  const failure = observeVerifiedExecutionFailure(execution);
  if (failure) {
    return {
      outcome: "VERIFIED_FAILURE",
      capability_key: text(failure.capability_key, 300),
      verification_mode: "observed_execution_failure",
      failure_fingerprint: text(failure.fingerprint, 120) || null,
    };
  }
  return null;
}

function collectShadowReceipts(value, found, depth = 0) {
  if (!value || typeof value !== "object" || depth > 7) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) collectShadowReceipts(item, found, depth + 1);
    return;
  }
  const node = object(value);
  const shadow = object(node.provisional_shadow);
  if (
    shadow.checked === true &&
    shadow.live_answer_influence === false &&
    shadow.candidate_content_exposed === false
  ) {
    for (const candidate of list(shadow.candidates).slice(0, MAX_SHADOW_MATCHES)) {
      const item = object(candidate);
      const fingerprint = text(item.hypothesis_fingerprint, 128);
      if (!fingerprint || item.live_answer_influence !== false) continue;
      found.set(fingerprint, {
        hypothesis_fingerprint: fingerprint,
        root_topic_key: text(item.root_topic_key, 240) || null,
        synthesis_fingerprint: text(item.synthesis_fingerprint, 128) || null,
        relevance: bounded(item.relevance, 0),
      });
    }
  }
  for (const [key, child] of Object.entries(node)) {
    if (["content", "answer", "messages", "raw_reasoning", "reasoning_trace", "chain_of_thought"].includes(key)) {
      continue;
    }
    if (child && typeof child === "object") collectShadowReceipts(child, found, depth + 1);
  }
}

export async function recordAvantiqoProvisionalShadowOutcome({
  decision = {},
  evidence = {},
  execution = {},
} = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    return {
      contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
      written: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
    };
  }
  const outcome = verifiedOutcome(execution);
  if (!outcome) {
    return {
      contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
      written: false,
      reason: "VERIFIED_EXECUTION_OUTCOME_REQUIRED",
    };
  }

  const candidates = new Map();
  collectShadowReceipts(decision, candidates);
  collectShadowReceipts(evidence, candidates);
  collectShadowReceipts(execution, candidates);
  if (!candidates.size) {
    return {
      contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
      written: false,
      reason: "EXPLICIT_NON_INFLUENCING_SHADOW_MATCH_REQUIRED",
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const validUntil = new Date(now.getTime() + OUTCOME_RETENTION_DAYS * DAY_MS).toISOString();
  const rows = [...candidates.values()].map((candidate) => ({
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: OUTCOME_SCOPE,
    memory_key: `provisional-shadow-outcome:${randomUUID()}`,
    memory_type: outcome.outcome === "VERIFIED_SUCCESS" ? "completed_step" : "blocker",
    subject: candidate.root_topic_key || candidate.hypothesis_fingerprint,
    content: `Observed ${outcome.outcome.toLowerCase()} in a context where a provisional knowledge candidate matched in non-influencing shadow mode.`,
    importance: outcome.outcome === "VERIFIED_FAILURE" ? 0.8 : 0.58,
    confidence: 1,
    source: "provisional_knowledge_shadow_outcome",
    active: true,
    valid_until: validUntil,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
      hypothesis_fingerprint: candidate.hypothesis_fingerprint,
      root_topic_key: candidate.root_topic_key,
      synthesis_fingerprint: candidate.synthesis_fingerprint,
      shadow_relevance: candidate.relevance,
      outcome: outcome.outcome,
      capability_key: outcome.capability_key,
      verification_mode: outcome.verification_mode,
      failure_fingerprint: outcome.failure_fingerprint,
      observed_at: nowIso,
      live_answer_influence: false,
      candidate_content_exposed: false,
      observational_context_only: true,
      incremental_utility_proven: false,
      causal_attribution_allowed: false,
      customer_private_content_included: false,
      source_customer_identifiers_persisted: false,
      raw_decision_persisted: false,
      raw_evidence_persisted: false,
      raw_execution_payload_persisted: false,
      raw_output_persisted: false,
      raw_reasoning_persisted: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      authorization_value: "none",
    },
    updated_at: nowIso,
  }));

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(rows)
    .select("id");
  if (written.error) throw written.error;

  return {
    contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
    written: list(written.data).length > 0,
    observation_count: list(written.data).length,
    outcome: outcome.outcome,
    governance: {
      live_answer_influence: false,
      candidate_content_exposed: false,
      observational_context_only: true,
      incremental_utility_proven: false,
      causal_attribution_allowed: false,
      automatic_knowledge_promotion: false,
      customer_private_content_promoted: false,
      customer_scope_identifiers_persisted: false,
      raw_reasoning_persisted: false,
    },
  };
}

function day(value) {
  return text(value, 40).slice(0, 10);
}

function summarizeRows(rows) {
  const ordered = rows.slice().sort((a, b) =>
    String(b?.created_at || "").localeCompare(String(a?.created_at || "")),
  );
  const first = object(ordered[0]?.metadata);
  const successes = ordered.filter((row) => object(row.metadata).outcome === "VERIFIED_SUCCESS");
  const failures = ordered.filter((row) => object(row.metadata).outcome === "VERIFIED_FAILURE");
  const total = successes.length + failures.length;
  const distinctDays = new Set(ordered.map((row) => day(object(row.metadata).observed_at || row.created_at)).filter(Boolean));
  const capabilities = new Set(ordered.map((row) => text(object(row.metadata).capability_key, 300)).filter(Boolean));
  const smoothedSuccess = (successes.length + 2) / (total + 4);
  const observationGate = Boolean(
    total >= MIN_SHADOW_OBSERVATIONS &&
    distinctDays.size >= MIN_SHADOW_DAYS &&
    capabilities.size >= MIN_SHADOW_CAPABILITIES
  );
  return {
    hypothesis_fingerprint: text(first.hypothesis_fingerprint, 128),
    root_topic_key: text(first.root_topic_key || ordered[0]?.subject, 240) || null,
    synthesis_fingerprint: text(first.synthesis_fingerprint, 128) || null,
    total_observations: total,
    verified_success_count: successes.length,
    verified_failure_count: failures.length,
    distinct_observation_days: distinctDays.size,
    distinct_capability_count: capabilities.size,
    smoothed_context_success_rate: Number(smoothedSuccess.toFixed(4)),
    observation_gate_passed: observationGate,
    stable_context_observed: observationGate && smoothedSuccess >= MIN_STABLE_SMOOTHED_SUCCESS,
    incremental_utility_proven: false,
    causal_attribution_allowed: false,
  };
}

async function loadShadowState(organizationId) {
  const [provisional, outcomes] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,content,active,valid_until,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", PROVISIONAL_SCOPE)
      .eq("active", true)
      .limit(MAX_PROVISIONAL_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,active,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", OUTCOME_SCOPE)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(MAX_OUTCOME_ROWS),
  ]);
  if (provisional.error) throw provisional.error;
  if (outcomes.error) throw outcomes.error;
  return {
    provisional: list(provisional.data).filter((row) => eligibleProvisional(row)),
    outcomes: list(outcomes.data),
  };
}

function evaluationRow({ organizationId, provisional, summary, graph, nowIso }) {
  const metadata = object(provisional.metadata);
  let status = "SHADOW_OBSERVATION_INSUFFICIENT";
  if (graph.block_knowledge_reuse === true) {
    status = "SHADOW_BLOCKED_BY_CONFLICT";
  } else if (summary.observation_gate_passed && !summary.stable_context_observed) {
    status = "SHADOW_CONTEXT_UNSTABLE";
  } else if (summary.stable_context_observed) {
    status = "READY_FOR_COUNTERFACTUAL_BENCHMARK";
  }
  const fingerprint = summary.hypothesis_fingerprint;
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EVALUATION_SCOPE,
    memory_key: `provisional-shadow-evaluation:${fingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: summary.root_topic_key || provisional.subject,
    content: `Provisional shadow evaluation status: ${status}.`,
    importance: status === "READY_FOR_COUNTERFACTUAL_BENCHMARK" ? 0.9 : 0.72,
    confidence: 1,
    source: "provisional_knowledge_shadow_evaluation",
    active: true,
    valid_until: metadata.next_epistemic_review_at || provisional.valid_until || null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
      status,
      ...summary,
      evidence_graph_contract: graph.contract || null,
      evidence_graph_available: graph.available === true,
      evidence_graph_blocks_reuse: graph.block_knowledge_reuse === true,
      evidence_graph_reason: graph.reason || null,
      shadow_mode_non_influencing: true,
      candidate_content_exposed_to_live_answer: false,
      context_stability_is_not_incremental_utility: true,
      counterfactual_benchmark_required: status === "READY_FOR_COUNTERFACTUAL_BENCHMARK",
      counterfactual_benchmark_completed: false,
      final_promotion_candidate_created: false,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      updated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

export async function reconcileAvantiqoProvisionalKnowledgeShadow({ persist = true } = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      evaluation_count: 0,
    };
  }

  const state = await loadShadowState(organizationId);
  const outcomeGroups = new Map();
  for (const row of state.outcomes) {
    const metadata = object(row.metadata);
    if (
      metadata.live_answer_influence !== false ||
      metadata.candidate_content_exposed !== false ||
      metadata.observational_context_only !== true ||
      metadata.causal_attribution_allowed !== false ||
      metadata.customer_private_content_included === true ||
      metadata.source_customer_identifiers_persisted === true ||
      metadata.raw_reasoning_persisted === true
    ) {
      continue;
    }
    const fingerprint = text(metadata.hypothesis_fingerprint, 128);
    if (!fingerprint) continue;
    const bucket = outcomeGroups.get(fingerprint) || [];
    bucket.push(row);
    outcomeGroups.set(fingerprint, bucket);
  }

  const nowIso = new Date().toISOString();
  const evaluations = [];
  for (const provisional of state.provisional) {
    const metadata = object(provisional.metadata);
    const fingerprint = text(metadata.hypothesis_fingerprint, 128);
    if (!fingerprint) continue;
    const summary = summarizeRows(outcomeGroups.get(fingerprint) || []);
    if (!summary.hypothesis_fingerprint) summary.hypothesis_fingerprint = fingerprint;
    if (!summary.root_topic_key) summary.root_topic_key = text(metadata.root_topic_key || provisional.subject, 240) || null;
    const graph = await inspectAvantiqoEvidenceGraph({
      organizationId,
      query: provisional.content,
      domain: metadata.knowledge_domain || null,
      freshnessDays: 90,
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
    evaluations.push(evaluationRow({ organizationId, provisional, summary, graph, nowIso }));
  }

  let writes = 0;
  if (persist && evaluations.length) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(evaluations, { onConflict: "organization_id,memory_scope,memory_key" })
      .select("id");
    if (result.error) throw result.error;
    writes = list(result.data).length;
  }

  const ready = evaluations.filter((row) =>
    object(row.metadata).status === "READY_FOR_COUNTERFACTUAL_BENCHMARK",
  );
  return {
    success: true,
    contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
    status: ready.length ? "COUNTERFACTUAL_BENCHMARK_CANDIDATES_READY" : "SHADOW_MONITORING_ACTIVE",
    provisional_candidate_count: state.provisional.length,
    shadow_outcome_row_count: state.outcomes.length,
    evaluation_count: evaluations.length,
    evaluation_write_count: writes,
    counterfactual_benchmark_ready_count: ready.length,
    thresholds: {
      minimum_shadow_observations: MIN_SHADOW_OBSERVATIONS,
      minimum_distinct_observation_days: MIN_SHADOW_DAYS,
      minimum_distinct_capabilities: MIN_SHADOW_CAPABILITIES,
      minimum_stable_smoothed_context_success_rate: MIN_STABLE_SMOOTHED_SUCCESS,
    },
    epistemic_policy: {
      shadow_candidate_changes_live_answer: false,
      shadow_candidate_content_exposed: false,
      context_success_proves_incremental_utility: false,
      counterfactual_benchmark_required_before_final_promotion_candidate: true,
      contradiction_blocks_benchmark_readiness: true,
      final_promotion_candidate_created_here: false,
      reusable_platform_knowledge_created_here: false,
      automatic_knowledge_promotion: false,
    },
    governance: {
      provider_free: true,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      customer_private_content_promoted: false,
      source_customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoProvisionalKnowledgeShadowRuntime = Object.freeze({
  contract: AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT,
  inspect: inspectAvantiqoProvisionalKnowledgeShadow,
  recordOutcome: recordAvantiqoProvisionalShadowOutcome,
  reconcile: reconcileAvantiqoProvisionalKnowledgeShadow,
});
