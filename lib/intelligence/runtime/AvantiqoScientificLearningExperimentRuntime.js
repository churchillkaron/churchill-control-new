import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT =
  "AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_V1";

const SYNTHESIS_CONTRACT = "AVANTIQO_LEARNING_MECHANISM_SYNTHESIS_V1";
const MEMORY_TABLE = "intelligence_memories";
const SYNTHESIS_SCOPE = "platform_learning_discovery_syntheses";
const HYPOTHESIS_SCOPE = "platform_learning_hypotheses";
const EXPERIMENT_SCOPE = "platform_learning_experiments";
const RESULT_SCOPE = "platform_learning_experiment_results";
const CANDIDATE_SCOPE = "platform_learning_experimental_knowledge_candidates";
const DEFAULT_SYNTHESIS_LIMIT = 500;
const MAX_SYNTHESIS_LIMIT = 3000;
const DEFAULT_RESULT_LIMIT = 10000;
const MAX_RESULT_LIMIT = 30000;
const MIN_PROVISIONAL_RESULTS = 3;
const MIN_PROVISIONAL_REPLICATIONS = 2;
const MIN_KNOWLEDGE_RESULTS = 5;
const MIN_KNOWLEDGE_REPLICATIONS = 3;
const MIN_KNOWLEDGE_VERIFICATION_METHODS = 2;
const RESULT_RETENTION_DAYS = 730;
const DAY_MS = 24 * 60 * 60 * 1000;

const RESULT_OUTCOMES = new Set([
  "SUPPORTS_HYPOTHESIS",
  "REFUTES_HYPOTHESIS",
  "INCONCLUSIVE",
]);

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

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function learningScopeId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function digest(...values) {
  return createHash("sha256")
    .update(values.map((value) => text(value, 20000).toLowerCase()).join("|"))
    .digest("hex");
}

function unique(values) {
  return [...new Set(values.map((value) => text(value, 1000)).filter(Boolean))];
}

function normalizedSynthesis(row) {
  const metadata = object(row?.metadata);
  if (text(metadata.contract, 180) !== SYNTHESIS_CONTRACT) return null;
  if (metadata.experiments_are_proposals_only !== true) return null;
  if (metadata.experiment_execution_performed === true) return null;
  if (metadata.customer_private_content_included === true) return null;
  const synthesis = object(metadata.synthesis);
  const rootTopicKey = text(metadata.root_topic_key || row?.subject, 240);
  const synthesisFingerprint = text(metadata.synthesis_fingerprint, 128);
  if (!rootTopicKey || !synthesisFingerprint) return null;
  return {
    row,
    metadata,
    synthesis,
    root_topic_key: rootTopicKey,
    synthesis_fingerprint: synthesisFingerprint,
    research_mode: text(metadata.research_mode, 40) || null,
  };
}

function hypothesisFrom(source, index) {
  const item = object(source);
  const statement = text(item.hypothesis || item.statement, 3000);
  const predicts = text(item.predicts, 3000);
  const falsifiedBy = text(item.falsified_by, 3000);
  const evidenceBasis = text(item.evidence_basis, 4000);
  if (!statement || !falsifiedBy) return null;
  return {
    ordinal: index + 1,
    statement,
    predicts: predicts || null,
    falsified_by: falsifiedBy,
    evidence_basis: evidenceBasis || null,
  };
}

function experimentFrom(source, index) {
  const item = object(source);
  const experiment = text(item.experiment || item.test, 3000);
  const measures = text(item.measures, 3000);
  const distinguishesBetween = text(item.distinguishes_between, 3000);
  const successSignal = text(item.success_signal, 3000);
  const failureSignal = text(item.failure_signal, 3000);
  if (!experiment || !measures || !distinguishesBetween || !successSignal || !failureSignal) {
    return null;
  }
  return {
    ordinal: index + 1,
    experiment,
    measures,
    distinguishes_between: distinguishesBetween,
    success_signal: successSignal,
    failure_signal: failureSignal,
    execution_requires_separate_governance:
      item.execution_requires_separate_governance !== false,
  };
}

function hypothesisFingerprint(synthesis, hypothesis) {
  return digest(
    "hypothesis",
    synthesis.root_topic_key,
    synthesis.synthesis_fingerprint,
    hypothesis.statement,
    hypothesis.predicts,
    hypothesis.falsified_by,
  );
}

function experimentFingerprint(synthesis, experiment) {
  return digest(
    "experiment",
    synthesis.root_topic_key,
    synthesis.synthesis_fingerprint,
    experiment.experiment,
    experiment.measures,
    experiment.distinguishes_between,
    experiment.success_signal,
    experiment.failure_signal,
  );
}

function resultsForHypothesis(results, fingerprint) {
  return results.filter((row) =>
    list(object(row.metadata).hypothesis_fingerprints).includes(fingerprint),
  );
}

function evaluateHypothesis(resultRows) {
  const rows = resultRows.filter((row) => object(row.metadata).verified_result === true);
  const support = rows.filter((row) => object(row.metadata).outcome === "SUPPORTS_HYPOTHESIS");
  const refute = rows.filter((row) => object(row.metadata).outcome === "REFUTES_HYPOTHESIS");
  const inconclusive = rows.filter((row) => object(row.metadata).outcome === "INCONCLUSIVE");
  const replicationKeys = unique(rows.map((row) => object(row.metadata).replication_key));
  const verificationMethods = unique(rows.map((row) => object(row.metadata).verification_method));
  const evidenceFingerprints = unique(rows.map((row) => object(row.metadata).evidence_fingerprint));
  const decisive = support.length + refute.length;
  const supportRate = decisive ? support.length / decisive : 0;
  const refuteRate = decisive ? refute.length / decisive : 0;

  let status = "PROPOSED_UNTESTED";
  if (rows.length > 0) status = "TESTING_MORE_REPLICATION_REQUIRED";
  if (
    rows.length >= MIN_PROVISIONAL_RESULTS &&
    replicationKeys.length >= MIN_PROVISIONAL_REPLICATIONS
  ) {
    if (support.length >= 3 && refute.length === 0 && supportRate >= 0.8) {
      status = "PROVISIONALLY_SUPPORTED";
    } else if (refute.length >= 2 && refuteRate >= 0.67) {
      status = "PROVISIONALLY_REFUTED";
    } else if (support.length > 0 && refute.length > 0) {
      status = "CONFLICTED_MORE_EXPERIMENTS_REQUIRED";
    } else {
      status = "INCONCLUSIVE_MORE_EXPERIMENTS_REQUIRED";
    }
  }

  const knowledgePromotionReady = Boolean(
    rows.length >= MIN_KNOWLEDGE_RESULTS &&
      replicationKeys.length >= MIN_KNOWLEDGE_REPLICATIONS &&
      verificationMethods.length >= MIN_KNOWLEDGE_VERIFICATION_METHODS &&
      support.length >= 4 &&
      refute.length === 0 &&
      supportRate >= 0.8 &&
      evidenceFingerprints.length >= MIN_KNOWLEDGE_REPLICATIONS
  );

  return {
    status,
    verified_result_count: rows.length,
    support_count: support.length,
    refute_count: refute.length,
    inconclusive_count: inconclusive.length,
    decisive_result_count: decisive,
    support_rate: Number(supportRate.toFixed(4)),
    refute_rate: Number(refuteRate.toFixed(4)),
    independent_replication_count: replicationKeys.length,
    verification_method_count: verificationMethods.length,
    distinct_evidence_count: evidenceFingerprints.length,
    knowledge_promotion_ready: knowledgePromotionReady,
  };
}

function hypothesisRow({ organizationId, synthesis, hypothesis, evaluation, nowIso }) {
  const fingerprint = hypothesisFingerprint(synthesis, hypothesis);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: HYPOTHESIS_SCOPE,
    memory_key: `learning-hypothesis:${fingerprint.slice(0, 40)}`,
    memory_type: evaluation.status.includes("REFUTED") ? "lesson" : "goal",
    subject: synthesis.root_topic_key,
    content: hypothesis.statement,
    importance: evaluation.knowledge_promotion_ready ? 0.9 : 0.72,
    confidence: evaluation.knowledge_promotion_ready
      ? 0.9
      : evaluation.status === "PROVISIONALLY_SUPPORTED"
        ? 0.78
        : 0.6,
    source: "scientific_learning_hypothesis_registry",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT,
      hypothesis_fingerprint: fingerprint,
      synthesis_fingerprint: synthesis.synthesis_fingerprint,
      root_topic_key: synthesis.root_topic_key,
      research_mode: synthesis.research_mode,
      ordinal: hypothesis.ordinal,
      predicts: hypothesis.predicts,
      falsified_by: hypothesis.falsified_by,
      evidence_basis: hypothesis.evidence_basis,
      ...evaluation,
      epistemic_state: "HYPOTHESIS_NOT_FACT",
      one_experiment_may_establish_truth: false,
      negative_results_retained: true,
      inconclusive_results_retained: true,
      replication_required: true,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      authorization_value: "none",
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      updated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function experimentRow({ organizationId, synthesis, experiment, nowIso }) {
  const fingerprint = experimentFingerprint(synthesis, experiment);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EXPERIMENT_SCOPE,
    memory_key: `learning-experiment:${fingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: synthesis.root_topic_key,
    content: experiment.experiment,
    importance: 0.7,
    confidence: 1,
    source: "scientific_learning_experiment_registry",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT,
      experiment_fingerprint: fingerprint,
      synthesis_fingerprint: synthesis.synthesis_fingerprint,
      root_topic_key: synthesis.root_topic_key,
      research_mode: synthesis.research_mode,
      ordinal: experiment.ordinal,
      measures: experiment.measures,
      distinguishes_between: experiment.distinguishes_between,
      success_signal: experiment.success_signal,
      failure_signal: experiment.failure_signal,
      status: "PROPOSED_AWAITING_GOVERNANCE",
      execution_requires_separate_governance: true,
      execution_requested: false,
      execution_performed: false,
      experiment_result_may_promote_knowledge_directly: false,
      experiment_result_may_start_training: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      updated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function candidateRow({ organizationId, hypothesisRowValue, nowIso }) {
  const metadata = object(hypothesisRowValue.metadata);
  const fingerprint = text(metadata.hypothesis_fingerprint, 128);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: CANDIDATE_SCOPE,
    memory_key: `experimental-knowledge:${fingerprint.slice(0, 40)}`,
    memory_type: "lesson",
    subject: hypothesisRowValue.subject,
    content: hypothesisRowValue.content,
    importance: 0.9,
    confidence: bounded(hypothesisRowValue.confidence, 0.85),
    source: "replicated_experimental_knowledge_candidate",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT,
      hypothesis_fingerprint: fingerprint,
      root_topic_key: metadata.root_topic_key,
      synthesis_fingerprint: metadata.synthesis_fingerprint,
      status: "READY_FOR_EPISTEMIC_KNOWLEDGE_REVIEW",
      verified_result_count: metadata.verified_result_count,
      support_count: metadata.support_count,
      refute_count: metadata.refute_count,
      independent_replication_count: metadata.independent_replication_count,
      verification_method_count: metadata.verification_method_count,
      distinct_evidence_count: metadata.distinct_evidence_count,
      automatic_knowledge_promotion: false,
      reusable_platform_knowledge: false,
      training_ready: false,
      automatic_training_effect: "NONE",
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      authorization_value: "none",
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      updated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function loadScientificState(organizationId, { synthesisLimit, resultLimit }) {
  const [syntheses, results] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,content,importance,confidence,active,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", SYNTHESIS_SCOPE)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(synthesisLimit),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,content,confidence,active,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", RESULT_SCOPE)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(resultLimit),
  ]);
  if (syntheses.error) throw syntheses.error;
  if (results.error) throw results.error;
  return {
    syntheses: list(syntheses.data).map(normalizedSynthesis).filter(Boolean),
    results: list(results.data),
  };
}

async function writeRows(rows) {
  let count = 0;
  for (let index = 0; index < rows.length; index += 150) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(rows.slice(index, index + 150), {
        onConflict: "organization_id,memory_scope,memory_key",
      })
      .select("id");
    if (result.error) throw result.error;
    count += list(result.data).length;
  }
  return count;
}

export async function reconcileAvantiqoScientificLearningExperiments({
  synthesisLimit = DEFAULT_SYNTHESIS_LIMIT,
  resultLimit = DEFAULT_RESULT_LIMIT,
  persist = true,
} = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      hypothesis_count: 0,
      experiment_count: 0,
    };
  }

  const state = await loadScientificState(organizationId, {
    synthesisLimit: boundedInteger(synthesisLimit, DEFAULT_SYNTHESIS_LIMIT, 1, MAX_SYNTHESIS_LIMIT),
    resultLimit: boundedInteger(resultLimit, DEFAULT_RESULT_LIMIT, 1, MAX_RESULT_LIMIT),
  });
  const nowIso = new Date().toISOString();
  const hypotheses = [];
  const experiments = [];

  for (const synthesis of state.syntheses) {
    for (const [index, source] of list(synthesis.synthesis.hypotheses).entries()) {
      const hypothesis = hypothesisFrom(source, index);
      if (!hypothesis) continue;
      const fingerprint = hypothesisFingerprint(synthesis, hypothesis);
      hypotheses.push(hypothesisRow({
        organizationId,
        synthesis,
        hypothesis,
        evaluation: evaluateHypothesis(resultsForHypothesis(state.results, fingerprint)),
        nowIso,
      }));
    }
    for (const [index, source] of list(synthesis.synthesis.experiments).entries()) {
      const experiment = experimentFrom(source, index);
      if (!experiment) continue;
      experiments.push(experimentRow({ organizationId, synthesis, experiment, nowIso }));
    }
  }

  const candidates = hypotheses
    .filter((row) => object(row.metadata).knowledge_promotion_ready === true)
    .map((row) => candidateRow({ organizationId, hypothesisRowValue: row, nowIso }));

  let hypothesisWrites = 0;
  let experimentWrites = 0;
  let candidateWrites = 0;
  if (persist) {
    hypothesisWrites = await writeRows(hypotheses);
    experimentWrites = await writeRows(experiments);
    candidateWrites = await writeRows(candidates);
  }

  const statusCounts = hypotheses.reduce((accumulator, row) => {
    const status = text(object(row.metadata).status, 120) || "UNKNOWN";
    accumulator[status] = (accumulator[status] || 0) + 1;
    return accumulator;
  }, {});

  return {
    success: true,
    contract: AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT,
    status: hypotheses.length ? "SCIENTIFIC_EXPERIMENT_REGISTRY_READY" : "NO_SYNTHESIS_AVAILABLE",
    synthesis_count: state.syntheses.length,
    hypothesis_count: hypotheses.length,
    experiment_count: experiments.length,
    verified_result_count: state.results.length,
    experimental_knowledge_candidate_count: candidates.length,
    hypothesis_write_count: hypothesisWrites,
    experiment_write_count: experimentWrites,
    candidate_write_count: candidateWrites,
    hypothesis_status_counts: statusCounts,
    epistemic_policy: {
      one_experiment_may_establish_truth: false,
      negative_results_retained: true,
      inconclusive_results_retained: true,
      minimum_provisional_results: MIN_PROVISIONAL_RESULTS,
      minimum_provisional_independent_replications: MIN_PROVISIONAL_REPLICATIONS,
      minimum_knowledge_results: MIN_KNOWLEDGE_RESULTS,
      minimum_knowledge_independent_replications: MIN_KNOWLEDGE_REPLICATIONS,
      minimum_knowledge_verification_methods: MIN_KNOWLEDGE_VERIFICATION_METHODS,
      experimental_candidate_is_reusable_knowledge: false,
      automatic_knowledge_promotion: false,
    },
    governance: {
      provider_free: true,
      experiment_execution_performed: false,
      automatic_experiment_execution: false,
      automatic_runpod_submission: false,
      runpod_endpoint_mutated: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      authorization_effect: "NONE",
    },
  };
}

function requireFingerprint(value, name) {
  const normalized = text(value, 160).toLowerCase();
  if (!/^[a-f0-9]{16,128}$/.test(normalized)) {
    throw new Error(`${AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT}_${name}_INVALID`);
  }
  return normalized;
}

export async function recordAvantiqoScientificExperimentResult({
  experiment_fingerprint,
  hypothesis_fingerprints = [],
  outcome,
  replication_key,
  evidence_fingerprint,
  verification_method,
  measurement_fingerprint,
} = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const experimentFingerprintValue = requireFingerprint(
    experiment_fingerprint,
    "EXPERIMENT_FINGERPRINT",
  );
  const hypothesisFingerprints = unique(hypothesis_fingerprints)
    .map((value) => requireFingerprint(value, "HYPOTHESIS_FINGERPRINT"))
    .slice(0, 12);
  if (!hypothesisFingerprints.length) {
    throw new Error(`${AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT}_HYPOTHESIS_FINGERPRINT_REQUIRED`);
  }
  const normalizedOutcome = text(outcome, 80).toUpperCase();
  if (!RESULT_OUTCOMES.has(normalizedOutcome)) {
    throw new Error(`${AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT}_OUTCOME_INVALID`);
  }
  const replicationKey = text(replication_key, 240);
  const verificationMethod = text(verification_method, 160);
  if (!replicationKey) {
    throw new Error(`${AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT}_REPLICATION_KEY_REQUIRED`);
  }
  if (!verificationMethod) {
    throw new Error(`${AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT}_VERIFICATION_METHOD_REQUIRED`);
  }
  const evidenceFingerprint = requireFingerprint(evidence_fingerprint, "EVIDENCE_FINGERPRINT");
  const measurementFingerprint = requireFingerprint(
    measurement_fingerprint,
    "MEASUREMENT_FINGERPRINT",
  );

  const [experiment, hypotheses] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,metadata")
      .eq("organization_id", organizationId)
      .eq("memory_scope", EXPERIMENT_SCOPE)
      .eq("metadata->>experiment_fingerprint", experimentFingerprintValue)
      .eq("active", true)
      .maybeSingle(),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,metadata")
      .eq("organization_id", organizationId)
      .eq("memory_scope", HYPOTHESIS_SCOPE)
      .in("metadata->>hypothesis_fingerprint", hypothesisFingerprints)
      .eq("active", true),
  ]);
  if (experiment.error) throw experiment.error;
  if (hypotheses.error) throw hypotheses.error;
  if (!experiment.data?.id) {
    throw new Error(`${AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT}_EXPERIMENT_NOT_REGISTERED`);
  }
  if (list(hypotheses.data).length !== hypothesisFingerprints.length) {
    throw new Error(`${AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT}_HYPOTHESIS_NOT_REGISTERED`);
  }

  const experimentMetadata = object(experiment.data.metadata);
  const synthesisFingerprintValue = text(experimentMetadata.synthesis_fingerprint, 128);
  const rootTopicKey = text(experimentMetadata.root_topic_key || experiment.data.subject, 240);
  for (const hypothesis of list(hypotheses.data)) {
    const metadata = object(hypothesis.metadata);
    if (
      text(metadata.synthesis_fingerprint, 128) !== synthesisFingerprintValue ||
      text(metadata.root_topic_key || hypothesis.subject, 240) !== rootTopicKey
    ) {
      throw new Error(`${AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT}_CROSS_PROGRAM_RESULT_FORBIDDEN`);
    }
  }

  const resultIdentity = digest(
    "verified-experiment-result",
    experimentFingerprintValue,
    hypothesisFingerprints.slice().sort().join(","),
    normalizedOutcome,
    replicationKey,
    evidenceFingerprint,
    measurementFingerprint,
    verificationMethod,
  );
  const now = new Date();
  const nowIso = now.toISOString();
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: RESULT_SCOPE,
    memory_key: `experiment-result:${resultIdentity.slice(0, 40)}`,
    memory_type: normalizedOutcome === "REFUTES_HYPOTHESIS" ? "lesson" : "completed_step",
    subject: rootTopicKey,
    content: `Verified structural experiment result: ${normalizedOutcome}.`,
    importance: normalizedOutcome === "INCONCLUSIVE" ? 0.62 : 0.8,
    confidence: 1,
    source: "verified_scientific_experiment_result",
    active: true,
    valid_until: new Date(now.getTime() + RESULT_RETENTION_DAYS * DAY_MS).toISOString(),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT,
      verified_result: true,
      experiment_fingerprint: experimentFingerprintValue,
      hypothesis_fingerprints: hypothesisFingerprints,
      synthesis_fingerprint: synthesisFingerprintValue,
      root_topic_key: rootTopicKey,
      outcome: normalizedOutcome,
      replication_key: replicationKey,
      evidence_fingerprint: evidenceFingerprint,
      measurement_fingerprint: measurementFingerprint,
      verification_method: verificationMethod,
      observed_at: nowIso,
      structural_result_only: true,
      result_text_persisted: false,
      raw_measurements_persisted: false,
      customer_private_content_included: false,
      customer_identifiers_included: false,
      raw_reasoning_persisted: false,
      result_authorizes_action: false,
      result_promotes_knowledge_directly: false,
      result_starts_training: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, {
      onConflict: "organization_id,memory_scope,memory_key",
      ignoreDuplicates: true,
    })
    .select("id,memory_key")
    .maybeSingle();
  if (written.error) throw written.error;

  return {
    success: true,
    contract: AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT,
    written: Boolean(written.data?.id),
    outcome: normalizedOutcome,
    experiment_fingerprint: experimentFingerprintValue,
    hypothesis_count: hypothesisFingerprints.length,
    governance: {
      structural_result_only: true,
      one_result_promotes_knowledge: false,
      automatic_experiment_execution: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoScientificLearningExperimentRuntime = Object.freeze({
  contract: AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_CONTRACT,
  reconcile: reconcileAvantiqoScientificLearningExperiments,
  recordResult: recordAvantiqoScientificExperimentResult,
  result_outcomes: [...RESULT_OUTCOMES],
  epistemic_thresholds: Object.freeze({
    minimum_provisional_results: MIN_PROVISIONAL_RESULTS,
    minimum_provisional_replications: MIN_PROVISIONAL_REPLICATIONS,
    minimum_knowledge_results: MIN_KNOWLEDGE_RESULTS,
    minimum_knowledge_replications: MIN_KNOWLEDGE_REPLICATIONS,
    minimum_knowledge_verification_methods: MIN_KNOWLEDGE_VERIFICATION_METHODS,
  }),
});
