import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT =
  "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1";

const SCIENTIFIC_CONTRACT = "AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_V1";
const TRANSFER_CONTRACT = "AVANTIQO_LEARNING_TRANSFER_V1";
const TRANSFER_VALIDATION_CONTRACT = "AVANTIQO_LEARNING_TRANSFER_VALIDATION_V1";
const MEMORY_TABLE = "intelligence_memories";
const SCIENTIFIC_EXPERIMENT_SCOPE = "platform_learning_experiments";
const SCIENTIFIC_HYPOTHESIS_SCOPE = "platform_learning_hypotheses";
const SCIENTIFIC_RESULT_SCOPE = "platform_learning_experiment_results";
const TRANSFER_EXPERIMENT_SCOPE = "platform_learning_transfer_experiment_proposals";
const TRANSFER_RESULT_SCOPE = "platform_learning_transfer_experiment_results";
const TRANSFER_VALIDATION_SCOPE = "platform_learning_transfer_validations";
const NEGATIVE_TRANSFER_SCOPE = "platform_learning_negative_transfer_memory";
const ESTIMATE_REQUEST_SCOPE = "platform_learning_experiment_information_estimate_requests";
const ESTIMATE_SCOPE = "platform_learning_experiment_information_estimates";
const SELECTION_SCOPE = "platform_learning_active_experiment_selections";
const MAX_ROWS = 3000;
const MIN_INDEPENDENT_ESTIMATES = 2;
const MIN_ESTIMATION_METHODS = 2;
const MAX_SELECTIONS_PER_CYCLE = 3;
const MAX_ESTIMATE_REQUESTS_PER_CYCLE = 12;
const ESTIMATE_VALIDITY_DAYS = 30;
const SELECTION_VALIDITY_MINUTES = 70;
const MIN_POSITIVE_INFORMATION_GAIN_BITS = 0.000001;
const SCIENTIFIC_TARGET_REPLICATIONS = 3;
const SCIENTIFIC_TARGET_METHODS = 2;
const TRANSFER_TARGET_REPLICATIONS = 2;
const TRANSFER_TARGET_METHODS = 2;
const TRANSFER_TARGET_BOUNDARY_CONTEXTS = 2;
const FAMILIES = new Set(["SCIENTIFIC", "TRANSFER"]);
const MATURE_TRANSFER_STATES = new Set([
  "SUPPORTED",
  "BOUNDARY_LIMITED",
  "REFUTED",
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

function normalized(value) {
  return text(value, 4000).toLowerCase();
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function fingerprint(value, code) {
  const candidate = normalized(value);
  if (!/^[a-f0-9]{16,128}$/.test(candidate)) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_${code}_INVALID`);
  }
  return candidate;
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function plusDays(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function plusMinutes(value, minutes) {
  const date = new Date(value);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function validIso(value, code) {
  const candidate = text(value, 120);
  const parsed = Date.parse(candidate);
  if (!candidate || !Number.isFinite(parsed)) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_${code}_INVALID`);
  }
  if (parsed > Date.now() + 5 * 60 * 1000) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_${code}_FUTURE`);
  }
  return new Date(parsed).toISOString();
}

function boundedNumber(value, code, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_${code}_INVALID`);
  }
  return number;
}

function boundedInteger(value, code, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_${code}_INVALID`);
  }
  return number;
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 2000)).filter(Boolean))];
}

function uniqueMetadataValues(rows, field) {
  return unique(rows.map((row) => object(row.metadata)[field]));
}

function min(values, fallback = 0) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : fallback;
}

function max(values, fallback = 0) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : fallback;
}

function experimentVersionFingerprint(family, row) {
  const metadata = object(row.metadata);
  if (family === "SCIENTIFIC") {
    return digest(
      "active-experiment-version",
      family,
      metadata.experiment_fingerprint,
      metadata.synthesis_fingerprint,
      row.content,
      metadata.measures,
      metadata.distinguishes_between,
      metadata.success_signal,
      metadata.failure_signal,
    );
  }
  return digest(
    "active-experiment-version",
    family,
    metadata.experiment_fingerprint,
    metadata.transfer_fingerprint,
    metadata.mechanism_fingerprint,
    row.content,
    JSON.stringify(list(metadata.boundary_conditions)),
    JSON.stringify(list(metadata.falsifiers)),
  );
}

function selectionGroupKey(candidate) {
  return candidate.family === "SCIENTIFIC"
    ? `scientific:${candidate.synthesis_fingerprint}`
    : `transfer:${candidate.transfer_fingerprint}`;
}

function estimateEligible(row, candidate, nowMs = Date.now()) {
  const metadata = object(row.metadata);
  return Boolean(
    activeAndUnexpired(row, nowMs) &&
      text(metadata.contract, 180) === AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT &&
      text(metadata.status, 160) === "GOVERNED_INFORMATION_GAIN_ESTIMATE_RECORDED" &&
      text(metadata.candidate_family, 40) === candidate.family &&
      text(metadata.experiment_fingerprint, 128) === candidate.experiment_fingerprint &&
      text(metadata.experiment_version_fingerprint, 128) ===
        candidate.experiment_version_fingerprint &&
      metadata.independent_estimator_attested === true &&
      metadata.customer_private_content_used === false &&
      metadata.customer_identifiers_used === false &&
      metadata.execution_authorized === false &&
      metadata.automatic_experiment_execution === false &&
      metadata.reusable_platform_knowledge === false &&
      Number.isFinite(Number(metadata.estimated_information_gain_bits)) &&
      Number.isFinite(Number(metadata.estimated_cost_units)) &&
      Number(metadata.estimated_cost_units) > 0
  );
}

function summarizeEstimates(candidate, estimateRows) {
  const deduped = [];
  const fingerprints = new Set();
  for (const row of estimateRows.filter((item) => estimateEligible(item, candidate))) {
    const metadata = object(row.metadata);
    const estimateFingerprint = text(metadata.estimate_fingerprint, 128);
    if (!estimateFingerprint || fingerprints.has(estimateFingerprint)) continue;
    fingerprints.add(estimateFingerprint);
    deduped.push(row);
  }

  const estimatorFingerprints = uniqueMetadataValues(deduped, "estimator_fingerprint");
  const methodFingerprints = uniqueMetadataValues(deduped, "estimation_method_fingerprint");
  const qualified = Boolean(
    estimatorFingerprints.length >= MIN_INDEPENDENT_ESTIMATES &&
      methodFingerprints.length >= MIN_ESTIMATION_METHODS
  );
  if (!qualified) {
    return {
      qualified: false,
      estimate_count: deduped.length,
      independent_estimator_count: estimatorFingerprints.length,
      estimation_method_count: methodFingerprints.length,
      missing_independent_estimate_count: Math.max(
        0,
        MIN_INDEPENDENT_ESTIMATES - estimatorFingerprints.length,
      ),
      missing_estimation_method_count: Math.max(
        0,
        MIN_ESTIMATION_METHODS - methodFingerprints.length,
      ),
      rows: deduped,
    };
  }

  const metadataRows = deduped.map((row) => object(row.metadata));
  const conservativeInformationGainBits = min(
    metadataRows.map((metadata) => metadata.estimated_information_gain_bits),
  );
  const conservativeCostUnits = max(
    metadataRows.map((metadata) => metadata.estimated_cost_units),
  );
  const conservativeExecutionRisk = max(
    metadataRows.map((metadata) => metadata.estimated_execution_risk),
  );
  const conservativeEvidenceDiversityGain = min(
    metadataRows.map((metadata) => metadata.expected_evidence_diversity_gain),
  );
  const conservativeReplicationGapClosure = min(
    metadataRows.map((metadata) => metadata.expected_replication_gap_closure),
  );
  const conservativeFalsifierDiscriminationGain = min(
    metadataRows.map((metadata) => metadata.expected_falsifier_discrimination_gain),
  );
  const conservativeDependencyUnlockCount = min(
    metadataRows.map((metadata) => metadata.expected_dependency_unlock_count),
  );
  const conservativeDurationMinutes = max(
    metadataRows.map((metadata) => metadata.estimated_duration_minutes),
  );
  const riskAdjustedInformationGainBits =
    conservativeInformationGainBits * Math.max(0, 1 - conservativeExecutionRisk);
  const informationGainPerCost = conservativeCostUnits > 0
    ? riskAdjustedInformationGainBits / conservativeCostUnits
    : 0;

  return {
    qualified: true,
    estimate_count: deduped.length,
    independent_estimator_count: estimatorFingerprints.length,
    estimation_method_count: methodFingerprints.length,
    estimate_fingerprints: metadataRows
      .map((metadata) => text(metadata.estimate_fingerprint, 128))
      .filter(Boolean),
    estimator_fingerprints: estimatorFingerprints,
    estimation_method_fingerprints: methodFingerprints,
    conservative_information_gain_bits: conservativeInformationGainBits,
    conservative_cost_units: conservativeCostUnits,
    conservative_execution_risk: conservativeExecutionRisk,
    conservative_evidence_diversity_gain: conservativeEvidenceDiversityGain,
    conservative_replication_gap_closure: conservativeReplicationGapClosure,
    conservative_falsifier_discrimination_gain:
      conservativeFalsifierDiscriminationGain,
    conservative_dependency_unlock_count: conservativeDependencyUnlockCount,
    conservative_duration_minutes: conservativeDurationMinutes,
    risk_adjusted_information_gain_bits: riskAdjustedInformationGainBits,
    risk_adjusted_information_gain_per_cost: informationGainPerCost,
    positive_information_gain: Boolean(
      conservativeInformationGainBits >= MIN_POSITIVE_INFORMATION_GAIN_BITS
    ),
    rows: deduped,
  };
}

function scientificCandidate(row, state, nowMs) {
  const metadata = object(row.metadata);
  if (
    !activeAndUnexpired(row, nowMs) ||
    text(metadata.contract, 180) !== SCIENTIFIC_CONTRACT ||
    text(metadata.status, 160) !== "PROPOSED_AWAITING_GOVERNANCE" ||
    metadata.execution_requires_separate_governance !== true ||
    metadata.execution_performed === true ||
    metadata.customer_private_content_included === true
  ) {
    return null;
  }
  const experimentFingerprint = text(metadata.experiment_fingerprint, 128);
  const synthesisFingerprint = text(metadata.synthesis_fingerprint, 128);
  if (!experimentFingerprint || !synthesisFingerprint) return null;

  const hypotheses = state.scientificHypotheses.filter((hypothesis) => {
    const hypothesisMetadata = object(hypothesis.metadata);
    return Boolean(
      activeAndUnexpired(hypothesis, nowMs) &&
        text(hypothesisMetadata.contract, 180) === SCIENTIFIC_CONTRACT &&
        text(hypothesisMetadata.synthesis_fingerprint, 128) === synthesisFingerprint &&
        hypothesisMetadata.knowledge_promotion_ready !== true
    );
  });
  if (!hypotheses.length) return null;

  const results = state.scientificResults.filter((result) => {
    const resultMetadata = object(result.metadata);
    return Boolean(
      activeAndUnexpired(result, nowMs) &&
        resultMetadata.verified_result === true &&
        text(resultMetadata.experiment_fingerprint, 128) === experimentFingerprint
    );
  });
  const replicationCount = uniqueMetadataValues(results, "replication_key").length;
  const methodCount = uniqueMetadataValues(results, "verification_method").length;
  const unresolvedHypothesisFingerprints = hypotheses
    .map((hypothesis) => text(object(hypothesis.metadata).hypothesis_fingerprint, 128))
    .filter(Boolean)
    .sort();

  return {
    family: "SCIENTIFIC",
    source_scope: SCIENTIFIC_EXPERIMENT_SCOPE,
    row,
    experiment_fingerprint: experimentFingerprint,
    experiment_version_fingerprint: experimentVersionFingerprint("SCIENTIFIC", row),
    synthesis_fingerprint: synthesisFingerprint,
    transfer_fingerprint: null,
    uncertainty_target_fingerprint: digest(
      "scientific-uncertainty-target",
      synthesisFingerprint,
      unresolvedHypothesisFingerprints.join("|"),
    ),
    unresolved_hypothesis_fingerprints: unresolvedHypothesisFingerprints,
    observed_result_count: results.length,
    observed_replication_count: replicationCount,
    observed_verification_method_count: methodCount,
    observed_boundary_context_count: 0,
    replication_gap: Math.max(0, SCIENTIFIC_TARGET_REPLICATIONS - replicationCount),
    verification_method_gap: Math.max(0, SCIENTIFIC_TARGET_METHODS - methodCount),
    boundary_context_gap: 0,
    importance: Number(row.importance || 0.7),
    selection_group_key: `scientific:${synthesisFingerprint}`,
  };
}

function activeNegativeTransferMemoryFor(candidate, rows, nowMs) {
  if (candidate.family !== "TRANSFER") return false;
  const metadata = object(candidate.row.metadata);
  return rows.some((row) => {
    const negativeMetadata = object(row.metadata);
    return Boolean(
      activeAndUnexpired(row, nowMs) &&
        negativeMetadata.negative_transfer_exclusion_active === true &&
        text(negativeMetadata.source_topic_key, 240) ===
          text(metadata.source_topic_key, 240) &&
        text(negativeMetadata.target_topic_key, 240) ===
          text(metadata.target_topic_key, 240) &&
        text(negativeMetadata.mechanism_fingerprint, 128) ===
          text(metadata.mechanism_fingerprint, 128)
    );
  });
}

function transferCandidate(row, state, nowMs) {
  const metadata = object(row.metadata);
  const status = text(metadata.status, 160);
  if (
    !activeAndUnexpired(row, nowMs) ||
    text(metadata.contract, 180) !== TRANSFER_CONTRACT ||
    ![
      "PROPOSED_GOVERNED_TRANSFER_EXPERIMENT",
      "TRANSFER_EXPERIMENT_RESULT_RECORDED",
    ].includes(status) ||
    metadata.automatic_execution !== false ||
    metadata.reusable_platform_knowledge !== false ||
    metadata.customer_private_content_allowed === true
  ) {
    return null;
  }
  const experimentFingerprint = text(metadata.experiment_fingerprint, 128);
  const transferFingerprint = text(metadata.transfer_fingerprint, 128);
  if (!experimentFingerprint || !transferFingerprint) return null;

  const validation = state.transferValidations.find((item) => {
    const validationMetadata = object(item.metadata);
    return Boolean(
      activeAndUnexpired(item, nowMs) &&
        text(validationMetadata.contract, 180) === TRANSFER_VALIDATION_CONTRACT &&
        text(validationMetadata.transfer_fingerprint, 128) === transferFingerprint
    );
  });
  const classification = text(object(validation?.metadata).classification, 80);
  if (MATURE_TRANSFER_STATES.has(classification)) return null;

  const results = state.transferResults.filter((result) => {
    const resultMetadata = object(result.metadata);
    return Boolean(
      activeAndUnexpired(result, nowMs) &&
        resultMetadata.governed_experiment_result === true &&
        text(resultMetadata.experiment_fingerprint, 128) === experimentFingerprint &&
        text(resultMetadata.transfer_fingerprint, 128) === transferFingerprint
    );
  });
  const replicationCount = uniqueMetadataValues(results, "replication_fingerprint").length;
  const methodCount = uniqueMetadataValues(
    results,
    "verification_method_fingerprint",
  ).length;
  const boundaryCount = uniqueMetadataValues(
    results,
    "boundary_context_fingerprint",
  ).length;
  const candidate = {
    family: "TRANSFER",
    source_scope: TRANSFER_EXPERIMENT_SCOPE,
    row,
    experiment_fingerprint: experimentFingerprint,
    experiment_version_fingerprint: experimentVersionFingerprint("TRANSFER", row),
    synthesis_fingerprint: null,
    transfer_fingerprint: transferFingerprint,
    uncertainty_target_fingerprint: transferFingerprint,
    unresolved_hypothesis_fingerprints: [],
    observed_result_count: results.length,
    observed_replication_count: replicationCount,
    observed_verification_method_count: methodCount,
    observed_boundary_context_count: boundaryCount,
    replication_gap: Math.max(0, TRANSFER_TARGET_REPLICATIONS - replicationCount),
    verification_method_gap: Math.max(0, TRANSFER_TARGET_METHODS - methodCount),
    boundary_context_gap: Math.max(
      0,
      TRANSFER_TARGET_BOUNDARY_CONTEXTS - boundaryCount,
    ),
    importance: Number(row.importance || 0.82),
    selection_group_key: `transfer:${transferFingerprint}`,
  };
  if (activeNegativeTransferMemoryFor(candidate, state.negativeTransferMemories, nowMs)) {
    return null;
  }
  return candidate;
}

function buildCandidates(state, nowMs = Date.now()) {
  const scientific = state.scientificExperiments
    .map((row) => scientificCandidate(row, state, nowMs))
    .filter(Boolean);
  const transfer = state.transferExperiments
    .map((row) => transferCandidate(row, state, nowMs))
    .filter(Boolean);
  return [...scientific, ...transfer];
}

function candidatePriorityForEstimateRequest(candidate) {
  return (
    candidate.importance * 1000 +
    candidate.replication_gap * 100 +
    candidate.verification_method_gap * 50 +
    candidate.boundary_context_gap * 25
  );
}

function compareRanked(left, right) {
  const leftSummary = left.estimate_summary;
  const rightSummary = right.estimate_summary;
  if (
    rightSummary.risk_adjusted_information_gain_per_cost !==
    leftSummary.risk_adjusted_information_gain_per_cost
  ) {
    return (
      rightSummary.risk_adjusted_information_gain_per_cost -
      leftSummary.risk_adjusted_information_gain_per_cost
    );
  }
  if (
    rightSummary.conservative_information_gain_bits !==
    leftSummary.conservative_information_gain_bits
  ) {
    return (
      rightSummary.conservative_information_gain_bits -
      leftSummary.conservative_information_gain_bits
    );
  }
  if (
    rightSummary.conservative_evidence_diversity_gain !==
    leftSummary.conservative_evidence_diversity_gain
  ) {
    return (
      rightSummary.conservative_evidence_diversity_gain -
      leftSummary.conservative_evidence_diversity_gain
    );
  }
  if (
    rightSummary.conservative_replication_gap_closure !==
    leftSummary.conservative_replication_gap_closure
  ) {
    return (
      rightSummary.conservative_replication_gap_closure -
      leftSummary.conservative_replication_gap_closure
    );
  }
  if (
    rightSummary.conservative_falsifier_discrimination_gain !==
    leftSummary.conservative_falsifier_discrimination_gain
  ) {
    return (
      rightSummary.conservative_falsifier_discrimination_gain -
      leftSummary.conservative_falsifier_discrimination_gain
    );
  }
  if (
    rightSummary.conservative_dependency_unlock_count !==
    leftSummary.conservative_dependency_unlock_count
  ) {
    return (
      rightSummary.conservative_dependency_unlock_count -
      leftSummary.conservative_dependency_unlock_count
    );
  }
  if (leftSummary.conservative_cost_units !== rightSummary.conservative_cost_units) {
    return leftSummary.conservative_cost_units - rightSummary.conservative_cost_units;
  }
  return left.experiment_fingerprint.localeCompare(right.experiment_fingerprint);
}

function estimateRequestRow(organizationId, candidate, summary, nowIso) {
  const requestFingerprint = digest(
    "experiment-information-estimate-request",
    candidate.family,
    candidate.experiment_fingerprint,
    candidate.experiment_version_fingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: ESTIMATE_REQUEST_SCOPE,
    memory_key: `experiment-estimate-request:${requestFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `Independent experiment estimates ${candidate.experiment_fingerprint.slice(0, 16)}`,
    content: "Obtain independent method-diverse estimates of expected uncertainty reduction, execution cost, execution risk, evidence diversity, replication-gap closure, falsifier discrimination and dependency unlock impact for the exact experiment version. Do not execute the experiment and do not infer precise information gain from wording alone.",
    importance: Math.max(0.72, Math.min(0.99, candidate.importance)),
    confidence: 1,
    source: "active_experiment_information_estimate_request",
    active: true,
    valid_until: plusDays(nowIso, ESTIMATE_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT,
      status: "INDEPENDENT_INFORMATION_ESTIMATES_REQUIRED",
      estimate_request_fingerprint: requestFingerprint,
      candidate_family: candidate.family,
      source_scope: candidate.source_scope,
      experiment_fingerprint: candidate.experiment_fingerprint,
      experiment_version_fingerprint: candidate.experiment_version_fingerprint,
      uncertainty_target_fingerprint: candidate.uncertainty_target_fingerprint,
      selection_group_key: candidate.selection_group_key,
      existing_estimate_count: summary.estimate_count,
      existing_independent_estimator_count: summary.independent_estimator_count,
      existing_estimation_method_count: summary.estimation_method_count,
      missing_independent_estimate_count: summary.missing_independent_estimate_count,
      missing_estimation_method_count: summary.missing_estimation_method_count,
      exact_experiment_version_binding_required: true,
      minimum_independent_estimators: MIN_INDEPENDENT_ESTIMATES,
      minimum_estimation_methods: MIN_ESTIMATION_METHODS,
      fake_precision_from_experiment_text_forbidden: true,
      independent_estimator_attestation_required: true,
      experiment_execution_performed_here: false,
      execution_authorized: false,
      spend_authorized: false,
      runpod_job_submitted: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      customer_private_content_allowed: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      requested_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function selectionRow(organizationId, candidate, rank, nowIso, cycleFingerprint) {
  const summary = candidate.estimate_summary;
  const selectionFingerprint = digest(
    "active-experiment-selection",
    cycleFingerprint,
    candidate.family,
    candidate.experiment_fingerprint,
    candidate.experiment_version_fingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: SELECTION_SCOPE,
    memory_key: `active-experiment-selection:${candidate.family.toLowerCase()}:${candidate.experiment_fingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `Active experiment selection #${rank}`,
    content: candidate.row.content,
    importance: Math.max(0.8, Math.min(0.99, candidate.importance)),
    confidence: 1,
    source: "conservative_information_gain_experiment_selector",
    active: true,
    valid_until: plusMinutes(nowIso, SELECTION_VALIDITY_MINUTES),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT,
      status: "SELECTED_FOR_SEPARATE_GOVERNED_EXECUTION_REVIEW",
      selection_fingerprint: selectionFingerprint,
      selection_cycle_fingerprint: cycleFingerprint,
      selection_rank: rank,
      candidate_family: candidate.family,
      source_scope: candidate.source_scope,
      experiment_fingerprint: candidate.experiment_fingerprint,
      experiment_version_fingerprint: candidate.experiment_version_fingerprint,
      uncertainty_target_fingerprint: candidate.uncertainty_target_fingerprint,
      selection_group_key: candidate.selection_group_key,
      transfer_fingerprint: candidate.transfer_fingerprint,
      synthesis_fingerprint: candidate.synthesis_fingerprint,
      unresolved_hypothesis_fingerprints: candidate.unresolved_hypothesis_fingerprints,
      observed_result_count: candidate.observed_result_count,
      observed_replication_count: candidate.observed_replication_count,
      observed_verification_method_count: candidate.observed_verification_method_count,
      observed_boundary_context_count: candidate.observed_boundary_context_count,
      replication_gap: candidate.replication_gap,
      verification_method_gap: candidate.verification_method_gap,
      boundary_context_gap: candidate.boundary_context_gap,
      estimate_fingerprints: summary.estimate_fingerprints,
      independent_estimator_count: summary.independent_estimator_count,
      estimation_method_count: summary.estimation_method_count,
      conservative_expected_information_gain_bits:
        summary.conservative_information_gain_bits,
      conservative_estimated_cost_units: summary.conservative_cost_units,
      conservative_estimated_execution_risk: summary.conservative_execution_risk,
      conservative_expected_evidence_diversity_gain:
        summary.conservative_evidence_diversity_gain,
      conservative_expected_replication_gap_closure:
        summary.conservative_replication_gap_closure,
      conservative_expected_falsifier_discrimination_gain:
        summary.conservative_falsifier_discrimination_gain,
      conservative_expected_dependency_unlock_count:
        summary.conservative_dependency_unlock_count,
      conservative_estimated_duration_minutes:
        summary.conservative_duration_minutes,
      risk_adjusted_information_gain_bits:
        summary.risk_adjusted_information_gain_bits,
      risk_adjusted_information_gain_per_cost:
        summary.risk_adjusted_information_gain_per_cost,
      scoring_uses_lowest_information_gain_estimate: true,
      scoring_uses_highest_cost_estimate: true,
      scoring_uses_highest_execution_risk_estimate: true,
      estimator_disagreement_cannot_improve_score: true,
      one_selection_per_uncertainty_group_per_cycle: true,
      selection_is_not_execution_authorization: true,
      execution_requires_separate_governance: true,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      experiment_execution_performed_here: false,
      result_fabricated: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      authorization_value: "none",
      selected_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function loadState(organizationId) {
  const queries = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,importance,confidence,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", SCIENTIFIC_EXPERIMENT_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,importance,confidence,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", SCIENTIFIC_HYPOTHESIS_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", SCIENTIFIC_RESULT_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,importance,confidence,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", TRANSFER_EXPERIMENT_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", TRANSFER_RESULT_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", TRANSFER_VALIDATION_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", NEGATIVE_TRANSFER_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", ESTIMATE_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
  ]);
  for (const result of queries) {
    if (result.error) throw result.error;
  }
  return {
    scientificExperiments: list(queries[0].data),
    scientificHypotheses: list(queries[1].data),
    scientificResults: list(queries[2].data),
    transferExperiments: list(queries[3].data),
    transferResults: list(queries[4].data),
    transferValidations: list(queries[5].data),
    negativeTransferMemories: list(queries[6].data),
    estimates: list(queries[7].data),
  };
}

async function writeRows(rows) {
  if (!rows.length) return 0;
  let count = 0;
  for (let index = 0; index < rows.length; index += 100) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(rows.slice(index, index + 100), {
        onConflict: "organization_id,memory_scope,memory_key",
      })
      .select("id");
    if (result.error) throw result.error;
    count += list(result.data).length;
  }
  return count;
}

async function retireCurrentSelections(organizationId, nowIso) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      forgotten_at: nowIso,
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("memory_scope", SELECTION_SCOPE)
    .eq("active", true)
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

async function loadExistingEstimate(organizationId, estimateFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata")
    .eq("organization_id", organizationId)
    .eq("memory_scope", ESTIMATE_SCOPE)
    .eq("metadata->>estimate_fingerprint", estimateFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function recordAvantiqoExperimentInformationEstimate({
  candidate_family,
  experiment_fingerprint,
  experiment_version_fingerprint,
  estimate_fingerprint,
  estimator_fingerprint,
  estimation_method,
  estimated_current_uncertainty_bits,
  expected_posterior_uncertainty_bits,
  estimated_cost_units,
  estimated_duration_minutes,
  estimated_execution_risk,
  expected_evidence_diversity_gain,
  expected_replication_gap_closure,
  expected_falsifier_discrimination_gain,
  expected_dependency_unlock_count,
  generated_at,
  independent_estimator = false,
  customer_private_content_used = false,
  customer_identifiers_used = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const family = text(candidate_family, 40).toUpperCase();
  if (!FAMILIES.has(family)) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_CANDIDATE_FAMILY_INVALID`);
  }
  const experimentFingerprint = fingerprint(
    experiment_fingerprint,
    "EXPERIMENT_FINGERPRINT",
  );
  const versionFingerprint = fingerprint(
    experiment_version_fingerprint,
    "EXPERIMENT_VERSION_FINGERPRINT",
  );
  const estimateFingerprint = fingerprint(estimate_fingerprint, "ESTIMATE_FINGERPRINT");
  const estimatorFingerprint = fingerprint(
    estimator_fingerprint,
    "ESTIMATOR_FINGERPRINT",
  );
  const estimationMethod = text(estimation_method, 240);
  if (!estimationMethod) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_ESTIMATION_METHOD_REQUIRED`);
  }
  if (independent_estimator !== true) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_INDEPENDENT_ESTIMATOR_REQUIRED`);
  }
  if (customer_private_content_used === true || customer_identifiers_used === true) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_CUSTOMER_PRIVATE_ESTIMATION_FORBIDDEN`);
  }

  const currentUncertainty = boundedNumber(
    estimated_current_uncertainty_bits,
    "CURRENT_UNCERTAINTY_BITS",
    0,
    64,
  );
  const posteriorUncertainty = boundedNumber(
    expected_posterior_uncertainty_bits,
    "POSTERIOR_UNCERTAINTY_BITS",
    0,
    64,
  );
  if (posteriorUncertainty > currentUncertainty) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_NEGATIVE_INFORMATION_GAIN_ESTIMATE`);
  }
  const costUnits = boundedNumber(estimated_cost_units, "ESTIMATED_COST_UNITS", 0.000001, 1e12);
  const durationMinutes = boundedNumber(
    estimated_duration_minutes,
    "ESTIMATED_DURATION_MINUTES",
    0,
    525600,
  );
  const executionRisk = boundedNumber(
    estimated_execution_risk,
    "ESTIMATED_EXECUTION_RISK",
    0,
    1,
  );
  const evidenceDiversityGain = boundedNumber(
    expected_evidence_diversity_gain,
    "EXPECTED_EVIDENCE_DIVERSITY_GAIN",
    0,
    1,
  );
  const replicationGapClosure = boundedNumber(
    expected_replication_gap_closure,
    "EXPECTED_REPLICATION_GAP_CLOSURE",
    0,
    1,
  );
  const falsifierDiscriminationGain = boundedNumber(
    expected_falsifier_discrimination_gain,
    "EXPECTED_FALSIFIER_DISCRIMINATION_GAIN",
    0,
    1,
  );
  const dependencyUnlockCount = boundedInteger(
    expected_dependency_unlock_count,
    "EXPECTED_DEPENDENCY_UNLOCK_COUNT",
    0,
    1000000,
  );
  const generatedAt = validIso(generated_at, "GENERATED_AT");

  const state = await loadState(organizationId);
  const candidate = buildCandidates(state).find(
    (item) =>
      item.family === family &&
      item.experiment_fingerprint === experimentFingerprint,
  );
  if (!candidate) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_CURRENT_ELIGIBLE_EXPERIMENT_NOT_FOUND`);
  }
  if (candidate.experiment_version_fingerprint !== versionFingerprint) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_STALE_EXPERIMENT_VERSION_ESTIMATE`);
  }

  const informationGainBits = currentUncertainty - posteriorUncertainty;
  const existing = await loadExistingEstimate(organizationId, estimateFingerprint);
  if (existing) {
    const metadata = object(existing.metadata);
    const immutableMatch = Boolean(
      text(metadata.candidate_family, 40) === family &&
        text(metadata.experiment_fingerprint, 128) === experimentFingerprint &&
        text(metadata.experiment_version_fingerprint, 128) === versionFingerprint &&
        text(metadata.estimator_fingerprint, 128) === estimatorFingerprint &&
        Number(metadata.estimated_current_uncertainty_bits) === currentUncertainty &&
        Number(metadata.expected_posterior_uncertainty_bits) === posteriorUncertainty &&
        Number(metadata.estimated_cost_units) === costUnits
    );
    if (!immutableMatch) {
      throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_ESTIMATE_FINGERPRINT_COLLISION`);
    }
    return {
      success: true,
      contract: AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT,
      status: "INFORMATION_GAIN_ESTIMATE_ALREADY_RECORDED",
      estimate: existing,
      idempotent: true,
    };
  }

  const nowIso = new Date().toISOString();
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: ESTIMATE_SCOPE,
    memory_key: `experiment-information-estimate:${estimateFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Experiment information estimate ${experimentFingerprint.slice(0, 16)}`,
    content: "Governed independent estimate for active experiment selection. This estimate is not an experiment result, execution approval, knowledge claim or training signal.",
    importance: 0.88,
    confidence: 1,
    source: "governed_active_experiment_information_estimate",
    active: true,
    valid_until: plusDays(generatedAt, ESTIMATE_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT,
      status: "GOVERNED_INFORMATION_GAIN_ESTIMATE_RECORDED",
      candidate_family: family,
      source_scope: candidate.source_scope,
      experiment_fingerprint: experimentFingerprint,
      experiment_version_fingerprint: versionFingerprint,
      uncertainty_target_fingerprint: candidate.uncertainty_target_fingerprint,
      estimate_fingerprint: estimateFingerprint,
      estimator_fingerprint: estimatorFingerprint,
      estimation_method: estimationMethod,
      estimation_method_fingerprint: digest(
        "active-experiment-estimation-method",
        estimationMethod,
      ),
      estimated_current_uncertainty_bits: currentUncertainty,
      expected_posterior_uncertainty_bits: posteriorUncertainty,
      estimated_information_gain_bits: informationGainBits,
      estimated_cost_units: costUnits,
      estimated_duration_minutes: durationMinutes,
      estimated_execution_risk: executionRisk,
      expected_evidence_diversity_gain: evidenceDiversityGain,
      expected_replication_gap_closure: replicationGapClosure,
      expected_falsifier_discrimination_gain: falsifierDiscriminationGain,
      expected_dependency_unlock_count: dependencyUnlockCount,
      independent_estimator_attested: true,
      estimate_is_not_observed_result: true,
      information_gain_is_estimate_not_truth: true,
      fake_precision_from_experiment_text_forbidden: true,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      automatic_experiment_execution: false,
      experiment_execution_performed_here: false,
      runpod_job_submitted: false,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_used: false,
      customer_identifiers_used: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      generated_at: generatedAt,
      recorded_at: nowIso,
    },
    updated_at: nowIso,
  };
  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,metadata")
    .single();
  if (written.error) throw written.error;
  return {
    success: true,
    contract: AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT,
    status: "GOVERNED_INFORMATION_GAIN_ESTIMATE_RECORDED",
    estimate: written.data,
    governance: {
      experiment_execution_performed: false,
      execution_authorized: false,
      spend_authorized: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      runpod_job_submitted: false,
      authorization_effect: "NONE",
    },
  };
}

export async function reconcileAvantiqoActiveExperimentSelection({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      candidate_count: 0,
      selected_count: 0,
    };
  }
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const state = await loadState(organizationId);
  const candidates = buildCandidates(state, nowMs);
  const evaluated = candidates.map((candidate) => {
    const estimateRows = state.estimates.filter((row) => {
      const metadata = object(row.metadata);
      return Boolean(
        text(metadata.candidate_family, 40) === candidate.family &&
          text(metadata.experiment_fingerprint, 128) ===
            candidate.experiment_fingerprint
      );
    });
    return {
      ...candidate,
      estimate_summary: summarizeEstimates(candidate, estimateRows),
    };
  });

  const estimateRequestCandidates = evaluated
    .filter((candidate) => !candidate.estimate_summary.qualified)
    .sort((left, right) =>
      candidatePriorityForEstimateRequest(right) -
      candidatePriorityForEstimateRequest(left),
    )
    .slice(0, MAX_ESTIMATE_REQUESTS_PER_CYCLE);
  const estimateRequests = estimateRequestCandidates.map((candidate) =>
    estimateRequestRow(
      organizationId,
      candidate,
      candidate.estimate_summary,
      nowIso,
    ),
  );

  const ranked = evaluated
    .filter(
      (candidate) =>
        candidate.estimate_summary.qualified &&
        candidate.estimate_summary.positive_information_gain &&
        candidate.estimate_summary.risk_adjusted_information_gain_per_cost > 0,
    )
    .sort(compareRanked);
  const selected = [];
  const usedGroups = new Set();
  for (const candidate of ranked) {
    const groupKey = selectionGroupKey(candidate);
    if (usedGroups.has(groupKey)) continue;
    selected.push(candidate);
    usedGroups.add(groupKey);
    if (selected.length >= MAX_SELECTIONS_PER_CYCLE) break;
  }

  const cycleFingerprint = digest(
    "active-experiment-selection-cycle",
    nowIso.slice(0, 13),
    selected.map((candidate) => candidate.experiment_version_fingerprint).join("|"),
  );
  const selections = selected.map((candidate, index) =>
    selectionRow(organizationId, candidate, index + 1, nowIso, cycleFingerprint),
  );

  let retiredSelectionCount = 0;
  let estimateRequestWriteCount = 0;
  let selectionWriteCount = 0;
  if (persist) {
    retiredSelectionCount = await retireCurrentSelections(organizationId, nowIso);
    [estimateRequestWriteCount, selectionWriteCount] = await Promise.all([
      writeRows(estimateRequests),
      writeRows(selections),
    ]);
  }

  return {
    success: true,
    contract: AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT,
    status: selected.length
      ? "ACTIVE_EXPERIMENT_PORTFOLIO_SELECTED_FOR_GOVERNED_REVIEW"
      : estimateRequests.length
        ? "INDEPENDENT_INFORMATION_ESTIMATES_REQUIRED"
        : "NO_ELIGIBLE_UNRESOLVED_EXPERIMENTS",
    candidate_count: candidates.length,
    estimate_qualified_candidate_count: ranked.length,
    estimate_request_count: estimateRequests.length,
    estimate_request_write_count: estimateRequestWriteCount,
    retired_previous_selection_count: retiredSelectionCount,
    selected_count: selected.length,
    selection_write_count: selectionWriteCount,
    selection_cycle_fingerprint: cycleFingerprint,
    selected_experiments: selected.map((candidate, index) => ({
      rank: index + 1,
      family: candidate.family,
      experiment_fingerprint: candidate.experiment_fingerprint,
      experiment_version_fingerprint: candidate.experiment_version_fingerprint,
      selection_group_key: candidate.selection_group_key,
      risk_adjusted_information_gain_per_cost:
        candidate.estimate_summary.risk_adjusted_information_gain_per_cost,
      conservative_information_gain_bits:
        candidate.estimate_summary.conservative_information_gain_bits,
      conservative_cost_units:
        candidate.estimate_summary.conservative_cost_units,
      conservative_execution_risk:
        candidate.estimate_summary.conservative_execution_risk,
    })),
    selection_policy: {
      minimum_independent_estimators: MIN_INDEPENDENT_ESTIMATES,
      minimum_estimation_methods: MIN_ESTIMATION_METHODS,
      maximum_selections_per_cycle: MAX_SELECTIONS_PER_CYCLE,
      maximum_estimate_requests_per_cycle: MAX_ESTIMATE_REQUESTS_PER_CYCLE,
      exact_experiment_version_binding_required: true,
      mature_transfer_states_are_not_reselected: true,
      active_exact_mechanism_negative_transfer_memory_blocks_selection: true,
      scientific_candidate_requires_unresolved_hypothesis: true,
      one_experiment_per_uncertainty_group_per_cycle: true,
      conservative_information_gain_uses_lowest_estimate: true,
      conservative_cost_uses_highest_estimate: true,
      conservative_execution_risk_uses_highest_estimate: true,
      primary_rank_metric: "RISK_ADJUSTED_INFORMATION_GAIN_PER_COST",
      evidence_diversity_is_tiebreaker: true,
      replication_gap_closure_is_tiebreaker: true,
      falsifier_discrimination_is_tiebreaker: true,
      dependency_unlock_count_is_tiebreaker: true,
      fake_precision_from_experiment_text_forbidden: true,
      selection_is_not_execution_authorization: true,
    },
    governance: {
      provider_free: true,
      web_research_executed_here: false,
      experiment_execution_performed_here: false,
      result_fabricated: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      platform_knowledge_written: false,
      reusable_platform_knowledge_created: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

async function loadSelectionByFingerprint(organizationId, selectionFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,content,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", SELECTION_SCOPE)
    .eq("metadata->>selection_fingerprint", selectionFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function assertAvantiqoExperimentSelectionCurrent({
  selection_fingerprint,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const selectionFingerprint = fingerprint(
    selection_fingerprint,
    "SELECTION_FINGERPRINT",
  );
  const selection = await loadSelectionByFingerprint(
    organizationId,
    selectionFingerprint,
  );
  if (!selection || !activeAndUnexpired(selection)) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_ACTIVE_SELECTION_NOT_FOUND`);
  }
  const metadata = object(selection.metadata);
  if (
    text(metadata.contract, 180) !== AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT ||
    text(metadata.status, 160) !== "SELECTED_FOR_SEPARATE_GOVERNED_EXECUTION_REVIEW" ||
    metadata.selection_is_not_execution_authorization !== true ||
    metadata.execution_authorized !== false ||
    metadata.spend_authorized !== false
  ) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_SELECTION_GOVERNANCE_INVALID`);
  }

  const state = await loadState(organizationId);
  const candidate = buildCandidates(state).find(
    (item) =>
      item.family === text(metadata.candidate_family, 40) &&
      item.experiment_fingerprint === text(metadata.experiment_fingerprint, 128),
  );
  if (!candidate) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_SELECTED_EXPERIMENT_NO_LONGER_ELIGIBLE`);
  }
  if (
    candidate.experiment_version_fingerprint !==
    text(metadata.experiment_version_fingerprint, 128)
  ) {
    throw new Error(`${AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT}_SELECTED_EXPERIMENT_VERSION_CHANGED`);
  }

  return {
    success: true,
    contract: AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT,
    status: "SELECTION_CURRENT_REQUIRES_SEPARATE_EXECUTION_GOVERNANCE",
    selection_fingerprint: selectionFingerprint,
    candidate_family: candidate.family,
    experiment_fingerprint: candidate.experiment_fingerprint,
    experiment_version_fingerprint: candidate.experiment_version_fingerprint,
    allowed_to_enter_execution_governance_review: true,
    execution_authorized: false,
    spend_authorized: false,
    provider_execution_authorized: false,
    runpod_job_submitted: false,
    authorization_effect: "NONE",
  };
}

export const AvantiqoActiveExperimentSelectionRuntime = Object.freeze({
  contract: AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT,
  recordEstimate: recordAvantiqoExperimentInformationEstimate,
  reconcile: reconcileAvantiqoActiveExperimentSelection,
  assertSelectionCurrent: assertAvantiqoExperimentSelectionCurrent,
});
