import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  observeVerifiedExecutionFailure,
  observeVerifiedExecutionSuccess,
} from "@/lib/operator/runtime/IntelligenceFailureLearningPolicy";

export const AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT =
  "AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_V1";

const MEMORY_TABLE = "intelligence_memories";
const UTILITY_SCOPE = "platform_learning_knowledge_utility";
const DEFAULT_LOOKBACK_DAYS = 180;
const MAX_LOOKBACK_DAYS = 730;
const DEFAULT_LIMIT = 10000;
const MAX_LIMIT = 30000;
const RETENTION_DAYS = 365;
const MIN_SIGNAL_OBSERVATIONS = 8;
const MIN_SIGNAL_DAYS = 3;
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

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function learningScopeId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function sha(value, length = 32) {
  return createHash("sha256").update(text(value, 24000)).digest("hex").slice(0, length);
}

function capabilityKey(execution = {}) {
  return text(
    execution?.capability?.key ||
      execution?.capability_key ||
      execution?.requested_capability_key,
    300,
  );
}

function verifiedOutcome(execution = {}) {
  const success = observeVerifiedExecutionSuccess(execution);
  if (success) {
    return {
      outcome: "VERIFIED_SUCCESS",
      capability_key: success.capability_key,
      verification_mode: success.verification_mode,
      failure_fingerprint: null,
    };
  }
  const failure = observeVerifiedExecutionFailure(execution);
  if (failure) {
    return {
      outcome: "VERIFIED_FAILURE",
      capability_key: failure.capability_key,
      verification_mode: "observed_execution_failure",
      failure_fingerprint: text(failure.fingerprint, 120) || null,
    };
  }
  return null;
}

function safeKnowledgeEntry(entry = {}) {
  const value = object(entry);
  const provenance = object(value.provenance);
  const id = text(value.id, 160) || null;
  const topicKey = text(
    provenance.topic_key || value.topic_key || object(value.metadata).topic_key,
    240,
  ) || null;
  const authority = text(value.authority || provenance.authority, 160) || null;
  const internalReference = text(
    value.internal_reference || provenance.internal_reference,
    500,
  ) || null;
  const sourceKind = authority === "AVANTIQO_CANONICAL_PRODUCT"
    ? "CANONICAL_PRODUCT"
    : "VERIFIED_PLATFORM_KNOWLEDGE";
  if (!id && !topicKey && !internalReference) return null;
  return {
    reference_fingerprint: sha([id, topicKey, internalReference, authority].join("|"), 40),
    topic_key: topicKey,
    authority,
    source_kind: sourceKind,
  };
}

function sourceFingerprint(url) {
  const normalized = text(url, 2000).toLowerCase();
  return normalized ? sha(normalized, 32) : null;
}

function collectExplicitKnowledgeProvenance(value, state, depth = 0) {
  if (depth > 7 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) {
      collectExplicitKnowledgeProvenance(item, state, depth + 1);
    }
    return;
  }

  const node = object(value);
  const reuse = object(node.knowledge_reuse);
  if (reuse.reused === true) {
    state.explicit_provenance_observed = true;
    for (const item of list(reuse.knowledge).slice(0, 20)) {
      const safe = safeKnowledgeEntry(item);
      if (safe) state.knowledge.set(safe.reference_fingerprint, safe);
    }
    const reason = text(reuse.reason, 160);
    if (reason) state.reuse_reasons.add(reason);
  }

  const hybrid = object(node.hybrid_retrieval);
  if (hybrid.attempted === true || hybrid.sufficient === true) {
    state.explicit_provenance_observed = true;
    if (hybrid.sufficient === true) state.retrieval_modes.add("HYBRID_VERIFIED_REUSE");
    if (hybrid.semantic_bridge_used === true) state.semantic_bridge_used = true;
    if (hybrid.forced_fresh_research === true) state.retrieval_modes.add("FORCED_FRESH_RESEARCH");
  }

  const graph = object(node.evidence_graph);
  if (graph.checked === true) {
    state.explicit_provenance_observed = true;
    state.evidence_graph_checked = true;
    if (graph.block_knowledge_reuse === true) state.evidence_graph_blocked_reuse = true;
    if (graph.forced_fresh_research === true) state.retrieval_modes.add("FORCED_FRESH_RESEARCH");
  }

  const evidence = object(node.evidence);
  const evidenceProvider = text(evidence.provider, 180);
  if (evidenceProvider) {
    if (evidenceProvider === "avantiqo-canonical-product-knowledge") {
      state.explicit_provenance_observed = true;
      state.retrieval_modes.add("CANONICAL_PRODUCT_REUSE");
    } else if (evidenceProvider === "avantiqo-hybrid-platform-knowledge") {
      state.explicit_provenance_observed = true;
      state.retrieval_modes.add("HYBRID_VERIFIED_REUSE");
    }
  }

  const researchMode = text(node.research_mode, 80).toLowerCase();
  if (["evidence", "mechanism", "invention"].includes(researchMode)) {
    state.explicit_provenance_observed = true;
    state.research_modes.add(researchMode.toUpperCase());
  }

  for (const claim of list(node.claims).slice(0, 24)) {
    const claimValue = object(claim);
    const topicKey = text(claimValue.topic_key, 240);
    if (topicKey) {
      state.explicit_provenance_observed = true;
      state.topic_keys.add(topicKey);
    }
    for (const url of list(claimValue.source_urls).slice(0, 8)) {
      const fingerprint = sourceFingerprint(url);
      if (fingerprint) {
        state.explicit_provenance_observed = true;
        state.source_fingerprints.add(fingerprint);
      }
    }
  }

  for (const source of list(node.sources).slice(0, 20)) {
    const fingerprint = sourceFingerprint(object(source).url);
    if (fingerprint) {
      state.explicit_provenance_observed = true;
      state.source_fingerprints.add(fingerprint);
    }
  }

  for (const [key, child] of Object.entries(node)) {
    if (["raw_reasoning", "reasoning_trace", "chain_of_thought", "messages", "content", "answer"].includes(key)) {
      continue;
    }
    if (child && typeof child === "object") {
      collectExplicitKnowledgeProvenance(child, state, depth + 1);
    }
  }
}

export function deriveAvantiqoKnowledgeUseReceipt({
  decision = {},
  evidence = {},
  execution = {},
} = {}) {
  const outcome = verifiedOutcome(execution);
  if (!outcome) return null;

  const state = {
    explicit_provenance_observed: false,
    knowledge: new Map(),
    topic_keys: new Set(),
    source_fingerprints: new Set(),
    reuse_reasons: new Set(),
    retrieval_modes: new Set(),
    research_modes: new Set(),
    semantic_bridge_used: false,
    evidence_graph_checked: false,
    evidence_graph_blocked_reuse: false,
  };

  collectExplicitKnowledgeProvenance(decision, state);
  collectExplicitKnowledgeProvenance(evidence, state);
  collectExplicitKnowledgeProvenance(execution, state);
  if (!state.explicit_provenance_observed) return null;

  const knowledge = [...state.knowledge.values()].slice(0, 20);
  for (const item of knowledge) {
    if (item.topic_key) state.topic_keys.add(item.topic_key);
  }
  const topicKeys = [...state.topic_keys].sort().slice(0, 20);
  const sourceFingerprints = [...state.source_fingerprints].sort().slice(0, 40);
  const retrievalModes = [...state.retrieval_modes].sort();
  const researchModes = [...state.research_modes].sort();
  const receiptFingerprint = sha(JSON.stringify({
    capability_key: outcome.capability_key,
    knowledge: knowledge.map((item) => item.reference_fingerprint).sort(),
    topic_keys: topicKeys,
    sources: sourceFingerprints,
    retrieval_modes: retrievalModes,
    research_modes: researchModes,
  }), 48);

  return {
    contract: AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
    receipt_fingerprint: receiptFingerprint,
    capability_key: outcome.capability_key || capabilityKey(execution),
    outcome: outcome.outcome,
    verification_mode: outcome.verification_mode,
    failure_fingerprint: outcome.failure_fingerprint,
    knowledge_references: knowledge,
    topic_keys: topicKeys,
    source_fingerprints: sourceFingerprints,
    reuse_reasons: [...state.reuse_reasons].sort().slice(0, 12),
    retrieval_modes: retrievalModes,
    research_modes: researchModes,
    semantic_bridge_used: state.semantic_bridge_used,
    evidence_graph_checked: state.evidence_graph_checked,
    evidence_graph_blocked_reuse: state.evidence_graph_blocked_reuse,
    relationship: "OBSERVATIONAL_ASSOCIATION_ONLY",
    causal_attribution_allowed: false,
  };
}

export async function recordAvantiqoKnowledgeUtilityObservation({
  decision = {},
  evidence = {},
  execution = {},
} = {}) {
  const learningId = learningScopeId();
  if (!learningId) {
    return {
      contract: AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
      written: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
    };
  }

  const receipt = deriveAvantiqoKnowledgeUseReceipt({ decision, evidence, execution });
  if (!receipt) {
    return {
      contract: AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
      written: false,
      reason: "VERIFIED_OUTCOME_WITH_EXPLICIT_KNOWLEDGE_PROVENANCE_REQUIRED",
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const validUntil = new Date(now.getTime() + RETENTION_DAYS * DAY_MS).toISOString();
  const row = {
    organization_id: learningId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: UTILITY_SCOPE,
    memory_key: `knowledge-utility:${randomUUID()}`,
    memory_type: receipt.outcome === "VERIFIED_SUCCESS" ? "completed_step" : "blocker",
    subject: receipt.capability_key,
    content: `Observed ${receipt.outcome.toLowerCase()} for ${receipt.capability_key} with explicit governed knowledge provenance. This is association evidence only, not proof that the knowledge caused the outcome.`,
    importance: receipt.outcome === "VERIFIED_SUCCESS" ? 0.58 : 0.76,
    confidence: 1,
    source: "knowledge_utility_observation",
    active: true,
    valid_until: validUntil,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      ...receipt,
      observed_at: nowIso,
      explicit_knowledge_provenance_required: true,
      structural_receipt_only: true,
      customer_private_content_included: false,
      source_customer_scope_persisted: false,
      source_party_id_persisted: false,
      source_conversation_id_persisted: false,
      raw_decision_persisted: false,
      raw_evidence_persisted: false,
      raw_execution_payload_persisted: false,
      raw_output_persisted: false,
      raw_reasoning_persisted: false,
      training_ready: false,
      automatic_training_effect: "NONE",
      production_model_promotion_effect: "NONE",
      authorization_value: "none",
    },
    updated_at: nowIso,
  };

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,subject,metadata,created_at")
    .single();
  if (result.error) throw result.error;

  return {
    contract: AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
    written: Boolean(result.data?.id),
    outcome: receipt.outcome,
    capability_key: receipt.capability_key,
    receipt_fingerprint: receipt.receipt_fingerprint,
    governance: {
      observational_association_only: true,
      causal_attribution_allowed: false,
      explicit_knowledge_provenance_required: true,
      customer_private_content_promoted: false,
      customer_scope_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
    },
  };
}

function calendarDay(row) {
  return text(object(row.metadata).observed_at || row.created_at, 40).slice(0, 10);
}

function summarizeGroup(rows) {
  const ordered = rows.slice().sort((a, b) =>
    String(b?.created_at || "").localeCompare(String(a?.created_at || "")),
  );
  const firstMetadata = object(ordered[0]?.metadata);
  const successes = ordered.filter((row) => object(row.metadata).outcome === "VERIFIED_SUCCESS");
  const failures = ordered.filter((row) => object(row.metadata).outcome === "VERIFIED_FAILURE");
  const total = successes.length + failures.length;
  const distinctDays = new Set(ordered.map(calendarDay).filter(Boolean)).size;
  const rawSuccessRate = total ? successes.length / total : 0;
  const smoothedSuccessRate = (successes.length + 2) / (total + 4);
  const signalEligible = total >= MIN_SIGNAL_OBSERVATIONS && distinctDays >= MIN_SIGNAL_DAYS;
  let signal = "INSUFFICIENT_OBSERVATIONS";
  if (signalEligible && smoothedSuccessRate >= 0.85) signal = "POSITIVE_ASSOCIATION";
  if (signalEligible && smoothedSuccessRate <= 0.55) signal = "NEGATIVE_ASSOCIATION";
  if (signalEligible && smoothedSuccessRate > 0.55 && smoothedSuccessRate < 0.85) signal = "MIXED_ASSOCIATION";

  return {
    receipt_fingerprint: text(firstMetadata.receipt_fingerprint, 80),
    capability_key: text(firstMetadata.capability_key || ordered[0]?.subject, 300),
    total_observations: total,
    distinct_observation_days: distinctDays,
    verified_success_count: successes.length,
    verified_failure_count: failures.length,
    raw_success_rate: Number(rawSuccessRate.toFixed(4)),
    smoothed_success_rate: Number(smoothedSuccessRate.toFixed(4)),
    signal_eligible: signalEligible,
    signal,
    relationship: "OBSERVATIONAL_ASSOCIATION_ONLY",
    causal_attribution_allowed: false,
    topic_keys: list(firstMetadata.topic_keys).slice(0, 20),
    retrieval_modes: list(firstMetadata.retrieval_modes).slice(0, 12),
    research_modes: list(firstMetadata.research_modes).slice(0, 12),
    knowledge_reference_count: list(firstMetadata.knowledge_references).length,
    source_fingerprint_count: list(firstMetadata.source_fingerprints).length,
    last_observed_at: firstMetadata.observed_at || ordered[0]?.created_at || null,
  };
}

export async function summarizeAvantiqoKnowledgeUtilityAttribution({
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  limit = DEFAULT_LIMIT,
} = {}) {
  const learningId = learningScopeId();
  if (!learningId) {
    return {
      contract: AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
      available: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      summaries: [],
    };
  }

  const lookback = boundedInteger(lookbackDays, DEFAULT_LOOKBACK_DAYS, 1, MAX_LOOKBACK_DAYS);
  const rowLimit = boundedInteger(limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const cutoff = new Date(Date.now() - lookback * DAY_MS).toISOString();
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,metadata,created_at,updated_at")
    .eq("organization_id", learningId)
    .eq("memory_scope", UTILITY_SCOPE)
    .eq("active", true)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(rowLimit);
  if (result.error) throw result.error;

  const groups = new Map();
  for (const row of list(result.data)) {
    const metadata = object(row.metadata);
    if (
      metadata.structural_receipt_only !== true ||
      metadata.relationship !== "OBSERVATIONAL_ASSOCIATION_ONLY" ||
      metadata.causal_attribution_allowed !== false ||
      metadata.customer_private_content_included === true ||
      metadata.source_customer_scope_persisted === true ||
      metadata.raw_reasoning_persisted === true
    ) {
      continue;
    }
    const fingerprint = text(metadata.receipt_fingerprint, 80);
    if (!fingerprint) continue;
    const bucket = groups.get(fingerprint) || [];
    bucket.push(row);
    groups.set(fingerprint, bucket);
  }

  const summaries = [...groups.values()]
    .map(summarizeGroup)
    .sort((a, b) =>
      Number(b.signal_eligible) - Number(a.signal_eligible) ||
      b.total_observations - a.total_observations ||
      a.receipt_fingerprint.localeCompare(b.receipt_fingerprint),
    );

  return {
    contract: AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
    available: true,
    lookback_days: lookback,
    observed_row_count: list(result.data).length,
    receipt_pattern_count: summaries.length,
    eligible_signal_count: summaries.filter((item) => item.signal_eligible).length,
    summaries,
    anti_overfitting: {
      minimum_observations_per_signal: MIN_SIGNAL_OBSERVATIONS,
      minimum_distinct_observation_days: MIN_SIGNAL_DAYS,
      bayesian_smoothing_applied: true,
      single_observation_changes_learning_policy: false,
      causal_claims_permitted: false,
    },
    governance: {
      observational_association_only: true,
      explicit_knowledge_provenance_required: true,
      customer_private_content_reused: false,
      customer_scope_identifiers_reused: false,
      raw_reasoning_reused: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
    },
  };
}

export const AvantiqoKnowledgeUtilityAttributionRuntime = Object.freeze({
  contract: AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
  deriveReceipt: deriveAvantiqoKnowledgeUseReceipt,
  record: recordAvantiqoKnowledgeUtilityObservation,
  summarize: summarizeAvantiqoKnowledgeUtilityAttribution,
});
