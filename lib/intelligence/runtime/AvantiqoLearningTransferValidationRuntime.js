import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT =
  "AVANTIQO_LEARNING_TRANSFER_VALIDATION_V1";

const TRANSFER_CONTRACT = "AVANTIQO_LEARNING_TRANSFER_V1";
const MEMORY_TABLE = "intelligence_memories";
const HYPOTHESIS_SCOPE = "platform_learning_transfer_hypotheses";
const EXPERIMENT_SCOPE = "platform_learning_transfer_experiment_proposals";
const RESULT_SCOPE = "platform_learning_transfer_experiment_results";
const VALIDATION_SCOPE = "platform_learning_transfer_validations";
export const AVANTIQO_NEGATIVE_TRANSFER_MEMORY_SCOPE =
  "platform_learning_negative_transfer_memory";
const MAX_ROWS = 2000;
const MIN_MATURE_RESULTS = 2;
const MIN_INDEPENDENT_REPLICATIONS = 2;
const MIN_VERIFICATION_METHODS = 2;
const MIN_BOUNDARY_CONTEXTS = 2;
const NEGATIVE_TRANSFER_REVIEW_DAYS = 30;
const NEGATIVE_TRANSFER_VALIDITY_DAYS = 180;
const RESULT_VALIDITY_DAYS = 180;
const OUTCOMES = new Set([
  "SUPPORTS_TRANSFER",
  "LIMITS_TRANSFER",
  "REFUTES_TRANSFER",
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

function uniqueText(values, limit = 20) {
  return [...new Set(
    list(values).map((value) => text(value, 2000)).filter(Boolean),
  )].slice(0, limit);
}

function normalizedSet(values) {
  return new Set(uniqueText(values, 100).map((value) => value.toLowerCase()));
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function fingerprint(value, code) {
  const normalized = text(value, 160).toLowerCase();
  if (!/^[a-f0-9]{16,128}$/.test(normalized)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_${code}_INVALID`);
  }
  return normalized;
}

function datePlusDays(value, days) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString();
}

function validIso(value, code) {
  const normalized = text(value, 120);
  const parsed = new Date(normalized);
  if (!normalized || !Number.isFinite(parsed.getTime())) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_${code}_INVALID`);
  }
  if (parsed.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_${code}_FUTURE`);
  }
  return parsed.toISOString();
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = text(row.valid_until, 120);
  if (!validUntil) return true;
  const parsed = Date.parse(validUntil);
  return !Number.isFinite(parsed) || parsed > nowMs;
}

function transferFingerprintOf(row) {
  return text(object(row.metadata).transfer_fingerprint, 128).toLowerCase();
}

function mechanismScopeKey(row) {
  const metadata = object(row.metadata);
  const sourceTopic = text(metadata.source_topic_key, 240).toLowerCase();
  const targetTopic = text(metadata.target_topic_key, 240).toLowerCase();
  const mechanismFingerprint = text(metadata.mechanism_fingerprint, 128).toLowerCase();
  if (!sourceTopic || !targetTopic || !mechanismFingerprint) return "";
  return [sourceTopic, targetTopic, mechanismFingerprint].join("|");
}

function experimentFingerprintForProposal(transferFingerprint, proposal) {
  const metadata = object(proposal.metadata);
  const existing = text(metadata.experiment_fingerprint, 128).toLowerCase();
  if (existing) return existing;
  const index = Math.max(0, Number(metadata.experiment_index || 1) - 1);
  return digest(
    "transfer-experiment",
    transferFingerprint,
    index,
    proposal.content,
  );
}

function resultMetadataEligible(row) {
  const metadata = object(row.metadata);
  return Boolean(
    activeAndUnexpired(row) &&
      text(metadata.contract, 160) === AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT &&
      metadata.governed_experiment_result === true &&
      metadata.independent_verifier_attested === true &&
      metadata.customer_private_content_used === false &&
      metadata.customer_identifiers_used === false &&
      metadata.reusable_platform_knowledge === false &&
      metadata.knowledge_router_reuse_allowed === false &&
      metadata.automatic_knowledge_promotion === false &&
      OUTCOMES.has(text(metadata.outcome, 80)) &&
      text(metadata.result_fingerprint, 128) &&
      text(metadata.replication_fingerprint, 128) &&
      text(metadata.verification_method_fingerprint, 128) &&
      text(metadata.boundary_context_fingerprint, 128)
  );
}

function latestEvidenceIso(rows, fallback) {
  let latest = Date.parse(fallback);
  for (const row of rows) {
    const metadata = object(row.metadata);
    const candidate = Date.parse(
      text(metadata.executed_at, 120) ||
      text(row.updated_at, 120) ||
      text(row.created_at, 120),
    );
    if (Number.isFinite(candidate) && (!Number.isFinite(latest) || candidate > latest)) {
      latest = candidate;
    }
  }
  return Number.isFinite(latest) ? new Date(latest).toISOString() : fallback;
}

function countOutcomeReplications(rows, outcome) {
  return new Set(
    rows
      .filter((row) => text(object(row.metadata).outcome, 80) === outcome)
      .map((row) => text(object(row.metadata).replication_fingerprint, 128))
      .filter(Boolean),
  ).size;
}

function countOutcomeMethods(rows, outcome) {
  return new Set(
    rows
      .filter((row) => text(object(row.metadata).outcome, 80) === outcome)
      .map((row) => text(object(row.metadata).verification_method_fingerprint, 128))
      .filter(Boolean),
  ).size;
}

export function classifyAvantiqoTransferEvidence(inputRows = []) {
  const rows = list(inputRows).filter(resultMetadataEligible);
  const resultFingerprints = new Set();
  const deduped = [];
  for (const row of rows) {
    const resultFingerprint = text(object(row.metadata).result_fingerprint, 128);
    if (!resultFingerprint || resultFingerprints.has(resultFingerprint)) continue;
    resultFingerprints.add(resultFingerprint);
    deduped.push(row);
  }

  const replicationFingerprints = new Set(
    deduped.map((row) => text(object(row.metadata).replication_fingerprint, 128)).filter(Boolean),
  );
  const verificationMethods = new Set(
    deduped.map((row) => text(object(row.metadata).verification_method_fingerprint, 128)).filter(Boolean),
  );
  const boundaryContexts = new Set(
    deduped.map((row) => text(object(row.metadata).boundary_context_fingerprint, 128)).filter(Boolean),
  );
  const falsifiersTriggered = new Set(
    deduped.flatMap((row) => uniqueText(object(row.metadata).falsifiers_triggered, 40)),
  );
  const supportingReplications = countOutcomeReplications(deduped, "SUPPORTS_TRANSFER");
  const limitingReplications = countOutcomeReplications(deduped, "LIMITS_TRANSFER");
  const refutingReplications = countOutcomeReplications(deduped, "REFUTES_TRANSFER");
  const supportingMethods = countOutcomeMethods(deduped, "SUPPORTS_TRANSFER");
  const refutingMethods = countOutcomeMethods(deduped, "REFUTES_TRANSFER");
  const matureBase = Boolean(
    deduped.length >= MIN_MATURE_RESULTS &&
      replicationFingerprints.size >= MIN_INDEPENDENT_REPLICATIONS &&
      verificationMethods.size >= MIN_VERIFICATION_METHODS &&
      boundaryContexts.size >= MIN_BOUNDARY_CONTEXTS
  );

  let classification = "INCONCLUSIVE";
  if (
    matureBase &&
    supportingReplications >= 1 &&
    (limitingReplications >= 1 || refutingReplications >= 1)
  ) {
    classification = "BOUNDARY_LIMITED";
  } else if (
    matureBase &&
    refutingReplications >= MIN_INDEPENDENT_REPLICATIONS &&
    refutingMethods >= MIN_VERIFICATION_METHODS &&
    falsifiersTriggered.size >= 1 &&
    supportingReplications === 0
  ) {
    classification = "REFUTED";
  } else if (
    matureBase &&
    supportingReplications >= MIN_INDEPENDENT_REPLICATIONS &&
    supportingMethods >= MIN_VERIFICATION_METHODS &&
    limitingReplications === 0 &&
    refutingReplications === 0
  ) {
    classification = "SUPPORTED";
  }

  return {
    classification,
    result_count: deduped.length,
    independent_replication_count: replicationFingerprints.size,
    verification_method_count: verificationMethods.size,
    boundary_context_count: boundaryContexts.size,
    supporting_replication_count: supportingReplications,
    limiting_replication_count: limitingReplications,
    refuting_replication_count: refutingReplications,
    supporting_verification_method_count: supportingMethods,
    refuting_verification_method_count: refutingMethods,
    falsifier_evidence_count: falsifiersTriggered.size,
    one_experiment_can_prove_transfer: false,
    minimum_mature_results: MIN_MATURE_RESULTS,
    minimum_independent_replications: MIN_INDEPENDENT_REPLICATIONS,
    minimum_verification_methods: MIN_VERIFICATION_METHODS,
    minimum_boundary_contexts: MIN_BOUNDARY_CONTEXTS,
  };
}

async function loadHypothesis(organizationId, transferFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", HYPOTHESIS_SCOPE)
    .eq("metadata->>transfer_fingerprint", transferFingerprint)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadExistingResult(organizationId, resultFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", RESULT_SCOPE)
    .eq("metadata->>result_fingerprint", resultFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadProposals(organizationId, transferFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", EXPERIMENT_SCOPE)
    .eq("metadata->>transfer_fingerprint", transferFingerprint)
    .eq("active", true)
    .limit(100);
  if (result.error) throw result.error;
  return list(result.data);
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

async function updateRowMetadata(row, metadata, nowIso) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata, updated_at: nowIso })
    .eq("id", row.id)
    .select("id")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function assertAvantiqoTransferMechanismNotNegativelyRemembered({
  organization_id,
  source_topic_key,
  target_topic_key,
  mechanism_fingerprint,
} = {}) {
  const organizationId = text(organization_id, 160) || learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const sourceTopic = text(source_topic_key, 240);
  const targetTopic = text(target_topic_key, 240);
  const mechanismFingerprint = fingerprint(mechanism_fingerprint, "MECHANISM_FINGERPRINT");
  if (!sourceTopic || !targetTopic) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_SOURCE_TARGET_REQUIRED`);
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_NEGATIVE_TRANSFER_MEMORY_SCOPE)
    .eq("metadata->>source_topic_key", sourceTopic)
    .eq("metadata->>target_topic_key", targetTopic)
    .eq("metadata->>mechanism_fingerprint", mechanismFingerprint)
    .eq("active", true)
    .limit(20);
  if (result.error) throw result.error;
  const blocking = list(result.data).find((row) => activeAndUnexpired(row));
  if (blocking) {
    throw new Error(
      `${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_ACTIVE_NEGATIVE_TRANSFER_MEMORY_BLOCKS_MECHANISM`,
    );
  }
  return {
    allowed: true,
    contract: AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
    same_mechanism_negative_transfer_memory_found: false,
    pair_wide_block_applied: false,
  };
}

export async function recordAvantiqoTransferExperimentResult({
  transfer_fingerprint,
  experiment_fingerprint,
  result_fingerprint,
  evidence_fingerprint,
  replication_fingerprint,
  boundary_context_fingerprint,
  verification_method,
  execution_contract,
  outcome,
  tested_boundary_conditions,
  falsifiers_triggered,
  executed_at,
  independent_verifier,
  customer_private_content_used = false,
  customer_identifiers_used = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const transferFingerprint = fingerprint(transfer_fingerprint, "TRANSFER_FINGERPRINT");
  const experimentFingerprint = fingerprint(experiment_fingerprint, "EXPERIMENT_FINGERPRINT");
  const resultFingerprint = fingerprint(result_fingerprint, "RESULT_FINGERPRINT");
  const evidenceFingerprint = fingerprint(evidence_fingerprint, "EVIDENCE_FINGERPRINT");
  const replicationFingerprint = fingerprint(replication_fingerprint, "REPLICATION_FINGERPRINT");
  const boundaryContextFingerprint = fingerprint(
    boundary_context_fingerprint,
    "BOUNDARY_CONTEXT_FINGERPRINT",
  );
  const verificationMethod = text(verification_method, 240);
  const executionContract = text(execution_contract, 240);
  const normalizedOutcome = text(outcome, 80).toUpperCase();
  const executedAt = validIso(executed_at, "EXECUTED_AT");
  const testedBoundaries = uniqueText(tested_boundary_conditions, 20);
  const triggeredFalsifiers = uniqueText(falsifiers_triggered, 20);

  if (!OUTCOMES.has(normalizedOutcome)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_OUTCOME_INVALID`);
  }
  if (!verificationMethod || !executionContract) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_GOVERNED_EXECUTION_EVIDENCE_REQUIRED`);
  }
  if (independent_verifier !== true) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_INDEPENDENT_VERIFIER_REQUIRED`);
  }
  if (customer_private_content_used === true || customer_identifiers_used === true) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_CUSTOMER_PRIVATE_EVIDENCE_FORBIDDEN`);
  }
  if (testedBoundaries.length < 1) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_TESTED_BOUNDARY_REQUIRED`);
  }

  const hypothesis = await loadHypothesis(organizationId, transferFingerprint);
  if (!hypothesis) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_TRANSFER_HYPOTHESIS_NOT_FOUND`);
  }
  const hypothesisMetadata = object(hypothesis.metadata);
  if (
    text(hypothesisMetadata.contract, 160) !== TRANSFER_CONTRACT ||
    hypothesisMetadata.cross_domain_verified !== true ||
    hypothesisMetadata.mechanism_mapping_verified !== true ||
    hypothesisMetadata.automatic_knowledge_promotion !== false
  ) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_TRANSFER_HYPOTHESIS_NOT_GOVERNED`);
  }

  const proposals = await loadProposals(organizationId, transferFingerprint);
  const proposal = proposals.find(
    (row) => experimentFingerprintForProposal(transferFingerprint, row) === experimentFingerprint,
  );
  if (!proposal) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_PROPOSED_EXPERIMENT_NOT_FOUND`);
  }
  const proposalMetadata = object(proposal.metadata);
  if (
    ![
      "PROPOSED_GOVERNED_TRANSFER_EXPERIMENT",
      "TRANSFER_EXPERIMENT_RESULT_RECORDED",
    ].includes(text(proposalMetadata.status, 160)) ||
    proposalMetadata.automatic_execution !== false ||
    proposalMetadata.reusable_platform_knowledge !== false
  ) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_PROPOSED_EXPERIMENT_NOT_GOVERNED`);
  }

  const knownBoundaries = normalizedSet(hypothesisMetadata.boundary_conditions);
  for (const boundary of testedBoundaries) {
    if (!knownBoundaries.has(boundary.toLowerCase())) {
      throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_UNREGISTERED_BOUNDARY_CONDITION`);
    }
  }
  const knownFalsifiers = normalizedSet(hypothesisMetadata.falsifiers);
  for (const falsifier of triggeredFalsifiers) {
    if (!knownFalsifiers.has(falsifier.toLowerCase())) {
      throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_UNREGISTERED_FALSIFIER`);
    }
  }
  if (normalizedOutcome === "REFUTES_TRANSFER" && triggeredFalsifiers.length < 1) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_REFUTATION_REQUIRES_FALSIFIER`);
  }

  const existingResult = await loadExistingResult(organizationId, resultFingerprint);
  if (existingResult) {
    const existingMetadata = object(existingResult.metadata);
    const immutableMatch = Boolean(
      text(existingMetadata.transfer_fingerprint, 128) === transferFingerprint &&
        text(existingMetadata.experiment_fingerprint, 128) === experimentFingerprint &&
        text(existingMetadata.evidence_fingerprint, 128) === evidenceFingerprint &&
        text(existingMetadata.replication_fingerprint, 128) === replicationFingerprint &&
        text(existingMetadata.boundary_context_fingerprint, 128) === boundaryContextFingerprint &&
        text(existingMetadata.outcome, 80) === normalizedOutcome
    );
    if (!immutableMatch) {
      throw new Error(
        `${AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT}_RESULT_FINGERPRINT_COLLISION`,
      );
    }
    return {
      success: true,
      contract: AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
      status: "TRANSFER_EXPERIMENT_RESULT_ALREADY_RECORDED",
      result: existingResult,
      idempotent: true,
      governance: {
        immutable_result_fingerprint: true,
        platform_knowledge_written: false,
        automatic_knowledge_promotion: false,
        automatic_training_started: false,
        authorization_effect: "NONE",
      },
    };
  }

  const nowIso = new Date().toISOString();
  const verificationMethodFingerprint = digest(
    "transfer-verification-method",
    verificationMethod,
  );
  const resultRow = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: RESULT_SCOPE,
    memory_key: `transfer-result:${resultFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Transfer experiment result ${transferFingerprint.slice(0, 16)}`,
    content: "Governed cross-domain transfer experiment evidence. Raw reasoning, customer-private content and customer identifiers are not persisted here.",
    importance: 0.94,
    confidence: 1,
    source: "governed_cross_domain_transfer_experiment_result",
    active: true,
    valid_until: datePlusDays(executedAt, RESULT_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
      transfer_contract: TRANSFER_CONTRACT,
      status: "GOVERNED_TRANSFER_EXPERIMENT_RESULT_RECORDED",
      governed_experiment_result: true,
      transfer_fingerprint: transferFingerprint,
      experiment_fingerprint: experimentFingerprint,
      experiment_proposal_memory_key: proposal.memory_key,
      mechanism_fingerprint: text(hypothesisMetadata.mechanism_fingerprint, 128),
      hypothesis_fingerprint: text(hypothesisMetadata.hypothesis_fingerprint, 128),
      source_topic_key: text(hypothesisMetadata.source_topic_key, 240),
      source_domain: text(hypothesisMetadata.source_domain, 120),
      target_topic_key: text(hypothesisMetadata.target_topic_key, 240),
      target_domain: text(hypothesisMetadata.target_domain, 120),
      result_fingerprint: resultFingerprint,
      evidence_fingerprint: evidenceFingerprint,
      replication_fingerprint: replicationFingerprint,
      boundary_context_fingerprint: boundaryContextFingerprint,
      verification_method: verificationMethod,
      verification_method_fingerprint: verificationMethodFingerprint,
      execution_contract: executionContract,
      outcome: normalizedOutcome,
      tested_boundary_conditions: testedBoundaries,
      falsifiers_triggered: triggeredFalsifiers,
      independent_verifier_attested: true,
      one_experiment_can_prove_transfer: false,
      replication_required_for_mature_transfer_status: true,
      multiple_verification_methods_required_for_mature_transfer_status: true,
      multiple_boundary_contexts_required_for_mature_transfer_status: true,
      result_is_transfer_evidence_only: true,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      experiment_executed_by_this_runtime: false,
      provider_execution_performed_by_this_runtime: false,
      runpod_job_submitted_by_this_runtime: false,
      customer_private_content_used: false,
      customer_identifiers_used: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      executed_at: executedAt,
      recorded_at: nowIso,
    },
    updated_at: nowIso,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(resultRow)
    .select("id,memory_key,metadata")
    .single();
  if (written.error) throw written.error;

  await updateRowMetadata(
    proposal,
    {
      ...proposalMetadata,
      experiment_fingerprint: experimentFingerprint,
      status: "TRANSFER_EXPERIMENT_RESULT_RECORDED",
      execution_performed: true,
      execution_performed_by_this_runtime: false,
      result_recorded: true,
      latest_result_fingerprint: resultFingerprint,
      latest_result_recorded_at: nowIso,
      transfer_success_proven: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
    },
    nowIso,
  );

  const reconciliation = await reconcileAvantiqoLearningTransferValidation({
    persist: true,
    transfer_fingerprint: transferFingerprint,
  });

  return {
    success: true,
    contract: AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
    status: "TRANSFER_EXPERIMENT_RESULT_RECORDED",
    result: written.data,
    reconciliation,
    governance: {
      experiment_execution_performed_by_this_runtime: false,
      provider_execution_performed_by_this_runtime: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      platform_knowledge_written: false,
      reusable_platform_knowledge_created: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

async function loadValidationState(organizationId) {
  const [hypotheses, results, negatives] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", HYPOTHESIS_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", RESULT_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", AVANTIQO_NEGATIVE_TRANSFER_MEMORY_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
  ]);
  if (hypotheses.error) throw hypotheses.error;
  if (results.error) throw results.error;
  if (negatives.error) throw negatives.error;
  return {
    hypotheses: list(hypotheses.data),
    results: list(results.data),
    negatives: list(negatives.data),
  };
}

async function retireExpiredNegativeMemories(rows, nowIso, persist) {
  const nowMs = Date.parse(nowIso);
  const expired = list(rows).filter((row) => {
    const validUntil = Date.parse(text(row.valid_until, 120));
    return row.active === true && Number.isFinite(validUntil) && validUntil <= nowMs;
  });
  if (!persist || !expired.length) return expired.length;
  for (const row of expired) {
    const metadata = object(row.metadata);
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        active: false,
        forgotten_at: nowIso,
        updated_at: nowIso,
        metadata: {
          ...metadata,
          status: "NEGATIVE_TRANSFER_MEMORY_EXPIRED",
          negative_transfer_exclusion_active: false,
          expired_at: nowIso,
          automatic_restoration_performed: false,
        },
      })
      .eq("id", row.id)
      .select("id")
      .single();
    if (result.error) throw result.error;
  }
  return expired.length;
}

function validationStatus(classification) {
  if (classification === "SUPPORTED") return "TRANSFER_SUPPORTED";
  if (classification === "BOUNDARY_LIMITED") return "TRANSFER_BOUNDARY_LIMITED";
  if (classification === "REFUTED") return "TRANSFER_REFUTED";
  return "TRANSFER_VALIDATION_REPLICATION_REQUIRED";
}

function validationRow(organizationId, hypothesis, rows, summary, nowIso) {
  const metadata = object(hypothesis.metadata);
  const transferFingerprint = transferFingerprintOf(hypothesis);
  const latestEvidence = latestEvidenceIso(rows, nowIso);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: VALIDATION_SCOPE,
    memory_key: `transfer-validation:${transferFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Transfer validation ${text(metadata.source_domain, 120)} -> ${text(metadata.target_domain, 120)}`,
    content: `Cross-domain transfer validation status: ${summary.classification}. This evidence does not create reusable platform knowledge by itself.`,
    importance: summary.classification === "INCONCLUSIVE" ? 0.86 : 0.96,
    confidence: 1,
    source: "cross_domain_transfer_replication_reconciler",
    active: true,
    valid_until: datePlusDays(latestEvidence, RESULT_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
      status: validationStatus(summary.classification),
      classification: summary.classification,
      transfer_fingerprint: transferFingerprint,
      mechanism_fingerprint: text(metadata.mechanism_fingerprint, 128),
      hypothesis_fingerprint: text(metadata.hypothesis_fingerprint, 128),
      source_topic_key: text(metadata.source_topic_key, 240),
      source_domain: text(metadata.source_domain, 120),
      target_topic_key: text(metadata.target_topic_key, 240),
      target_domain: text(metadata.target_domain, 120),
      result_count: summary.result_count,
      independent_replication_count: summary.independent_replication_count,
      verification_method_count: summary.verification_method_count,
      boundary_context_count: summary.boundary_context_count,
      supporting_replication_count: summary.supporting_replication_count,
      limiting_replication_count: summary.limiting_replication_count,
      refuting_replication_count: summary.refuting_replication_count,
      falsifier_evidence_count: summary.falsifier_evidence_count,
      minimum_mature_results: MIN_MATURE_RESULTS,
      minimum_independent_replications: MIN_INDEPENDENT_REPLICATIONS,
      minimum_verification_methods: MIN_VERIFICATION_METHODS,
      minimum_boundary_contexts: MIN_BOUNDARY_CONTEXTS,
      one_experiment_can_prove_transfer: false,
      replications_counted_by_distinct_fingerprint: true,
      verification_methods_counted_independently: true,
      boundary_contexts_counted_independently: true,
      falsifier_evidence_retained: true,
      transfer_success_proven: summary.classification === "SUPPORTED",
      boundary_limited_transfer: summary.classification === "BOUNDARY_LIMITED",
      transfer_refuted: summary.classification === "REFUTED",
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      requires_normal_epistemic_promotion_pipeline: true,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_included: false,
      customer_identifiers_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      latest_evidence_at: latestEvidence,
      reconciled_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function negativeTransferRow(organizationId, representative, refutedEvaluations, nowIso) {
  const hypothesis = representative.hypothesis;
  const metadata = object(hypothesis.metadata);
  const allRows = refutedEvaluations.flatMap((entry) => entry.rows);
  const latestEvidence = latestEvidenceIso(allRows, nowIso);
  const sourceTopic = text(metadata.source_topic_key, 240);
  const targetTopic = text(metadata.target_topic_key, 240);
  const mechanismFingerprint = text(metadata.mechanism_fingerprint, 128);
  const negativeFingerprint = digest(
    "negative-transfer-memory",
    sourceTopic,
    targetTopic,
    mechanismFingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_NEGATIVE_TRANSFER_MEMORY_SCOPE,
    memory_key: `negative-transfer:${negativeFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Negative transfer memory ${text(metadata.source_domain, 120)} -> ${text(metadata.target_domain, 120)}`,
    content: "This exact mechanism has mature replicated refutation evidence for this source-to-target transfer. Future transfer hypotheses for the same mechanism are blocked until review or expiry; other mechanisms between the same domains remain eligible.",
    importance: 0.98,
    confidence: 1,
    source: "cross_domain_negative_transfer_memory",
    active: true,
    valid_until: datePlusDays(latestEvidence, NEGATIVE_TRANSFER_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
      status: "NEGATIVE_TRANSFER_MEMORY_ACTIVE",
      negative_transfer_fingerprint: negativeFingerprint,
      source_topic_key: sourceTopic,
      source_domain: text(metadata.source_domain, 120),
      target_topic_key: targetTopic,
      target_domain: text(metadata.target_domain, 120),
      mechanism_fingerprint: mechanismFingerprint,
      refuted_transfer_fingerprints: refutedEvaluations
        .map((entry) => transferFingerprintOf(entry.hypothesis))
        .filter(Boolean),
      negative_transfer_exclusion_active: true,
      exact_mechanism_only: true,
      exact_source_target_pair_only: true,
      pair_wide_negative_transfer_block: false,
      other_mechanisms_between_same_domains_allowed: true,
      semantic_similarity_blocking_forbidden: true,
      review_required: true,
      review_after: datePlusDays(latestEvidence, NEGATIVE_TRANSFER_REVIEW_DAYS),
      expires_at: datePlusDays(latestEvidence, NEGATIVE_TRANSFER_VALIDITY_DAYS),
      automatic_restoration_allowed: false,
      automatic_knowledge_promotion: false,
      reusable_platform_knowledge: false,
      automatic_training_effect: "NONE",
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      latest_refutation_evidence_at: latestEvidence,
      reconciled_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function retireNegativeMechanismMemory(row, reason, nowIso) {
  const metadata = object(row.metadata);
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      superseded_at: nowIso,
      updated_at: nowIso,
      metadata: {
        ...metadata,
        status: reason,
        negative_transfer_exclusion_active: false,
        automatic_restoration_performed: false,
        retired_at: nowIso,
      },
    })
    .eq("id", row.id)
    .select("id")
    .single();
  if (result.error) throw result.error;
}

export async function reconcileAvantiqoLearningTransferValidation({
  persist = true,
  transfer_fingerprint = null,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      validation_count: 0,
      negative_transfer_memory_count: 0,
    };
  }

  const filterFingerprint = transfer_fingerprint
    ? fingerprint(transfer_fingerprint, "TRANSFER_FINGERPRINT")
    : null;
  const nowIso = new Date().toISOString();
  const state = await loadValidationState(organizationId);
  const expiredNegativeTransferMemoryCount = await retireExpiredNegativeMemories(
    state.negatives,
    nowIso,
    persist,
  );
  const activeNegatives = state.negatives.filter((row) =>
    activeAndUnexpired(row, Date.parse(nowIso)),
  );
  const resultsByTransfer = new Map();
  for (const row of state.results.filter(resultMetadataEligible)) {
    const transferFingerprint = transferFingerprintOf(row);
    if (!transferFingerprint) continue;
    if (filterFingerprint && transferFingerprint !== filterFingerprint) continue;
    const bucket = resultsByTransfer.get(transferFingerprint) || [];
    bucket.push(row);
    resultsByTransfer.set(transferFingerprint, bucket);
  }

  const evaluations = [];
  for (const hypothesis of state.hypotheses) {
    const metadata = object(hypothesis.metadata);
    const transferFingerprint = transferFingerprintOf(hypothesis);
    if (!transferFingerprint) continue;
    if (filterFingerprint && transferFingerprint !== filterFingerprint) continue;
    if (
      text(metadata.contract, 160) !== TRANSFER_CONTRACT ||
      metadata.cross_domain_verified !== true ||
      metadata.mechanism_mapping_verified !== true ||
      metadata.automatic_knowledge_promotion !== false
    ) {
      continue;
    }
    const rows = resultsByTransfer.get(transferFingerprint) || [];
    if (!rows.length) continue;
    evaluations.push({
      hypothesis,
      rows,
      summary: classifyAvantiqoTransferEvidence(rows),
    });
  }

  const validationRows = evaluations.map((entry) =>
    validationRow(organizationId, entry.hypothesis, entry.rows, entry.summary, nowIso),
  );
  const validationWriteCount = persist ? await upsertRows(validationRows) : 0;

  let hypothesisUpdateCount = 0;
  if (persist) {
    for (const entry of evaluations) {
      const metadata = object(entry.hypothesis.metadata);
      await updateRowMetadata(
        entry.hypothesis,
        {
          ...metadata,
          status: validationStatus(entry.summary.classification),
          transfer_validation_status: entry.summary.classification,
          transfer_result_count: entry.summary.result_count,
          independent_replication_count: entry.summary.independent_replication_count,
          verification_method_count: entry.summary.verification_method_count,
          boundary_context_count: entry.summary.boundary_context_count,
          supporting_replication_count: entry.summary.supporting_replication_count,
          limiting_replication_count: entry.summary.limiting_replication_count,
          refuting_replication_count: entry.summary.refuting_replication_count,
          falsifier_evidence_count: entry.summary.falsifier_evidence_count,
          one_experiment_can_prove_transfer: false,
          transfer_success_proven: entry.summary.classification === "SUPPORTED",
          boundary_limited_transfer: entry.summary.classification === "BOUNDARY_LIMITED",
          transfer_refuted: entry.summary.classification === "REFUTED",
          reusable_platform_knowledge: false,
          knowledge_router_reuse_allowed: false,
          requires_normal_epistemic_promotion_pipeline: true,
          automatic_knowledge_promotion: false,
          automatic_training_effect: "NONE",
          last_transfer_validation_at: nowIso,
        },
        nowIso,
      );
      hypothesisUpdateCount += 1;
    }
  }

  const evaluationsByMechanism = new Map();
  for (const entry of evaluations) {
    const key = mechanismScopeKey(entry.hypothesis);
    if (!key) continue;
    const bucket = evaluationsByMechanism.get(key) || [];
    bucket.push(entry);
    evaluationsByMechanism.set(key, bucket);
  }

  const negativeRows = [];
  const retireKeys = new Map();
  for (const [key, group] of evaluationsByMechanism.entries()) {
    const mature = group.filter((entry) => entry.summary.classification !== "INCONCLUSIVE");
    const hasPositiveOrLimited = mature.some((entry) =>
      entry.summary.classification === "SUPPORTED" ||
      entry.summary.classification === "BOUNDARY_LIMITED",
    );
    const refuted = mature.filter((entry) => entry.summary.classification === "REFUTED");
    if (hasPositiveOrLimited) {
      retireKeys.set(
        key,
        "NEGATIVE_TRANSFER_MEMORY_SUPERSEDED_BY_MATURE_BOUNDARY_OR_SUPPORT_EVIDENCE",
      );
      continue;
    }
    if (refuted.length) {
      const representative = [...refuted].sort(
        (left, right) => right.summary.result_count - left.summary.result_count,
      )[0];
      negativeRows.push(
        negativeTransferRow(organizationId, representative, refuted, nowIso),
      );
    }
  }

  let negativeTransferMemoryWriteCount = 0;
  let negativeTransferMemoryRetireCount = 0;
  if (persist) {
    negativeTransferMemoryWriteCount = await upsertRows(negativeRows);
    for (const row of activeNegatives) {
      const key = mechanismScopeKey(row);
      const reason = retireKeys.get(key);
      if (!reason) continue;
      await retireNegativeMechanismMemory(row, reason, nowIso);
      negativeTransferMemoryRetireCount += 1;
    }
  }

  const reviewDueCount = activeNegatives.filter((row) => {
    const reviewAfter = Date.parse(text(object(row.metadata).review_after, 120));
    return Number.isFinite(reviewAfter) && reviewAfter <= Date.parse(nowIso);
  }).length;
  const supportedCount = evaluations.filter(
    (entry) => entry.summary.classification === "SUPPORTED",
  ).length;
  const boundaryLimitedCount = evaluations.filter(
    (entry) => entry.summary.classification === "BOUNDARY_LIMITED",
  ).length;
  const refutedCount = evaluations.filter(
    (entry) => entry.summary.classification === "REFUTED",
  ).length;
  const inconclusiveCount = evaluations.filter(
    (entry) => entry.summary.classification === "INCONCLUSIVE",
  ).length;

  return {
    success: true,
    contract: AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
    status: evaluations.length
      ? "TRANSFER_CAUSAL_VALIDATION_RECONCILED"
      : "NO_TRANSFER_RESULTS_TO_RECONCILE",
    validation_count: evaluations.length,
    validation_write_count: validationWriteCount,
    hypothesis_update_count: hypothesisUpdateCount,
    supported_count: supportedCount,
    boundary_limited_count: boundaryLimitedCount,
    refuted_count: refutedCount,
    inconclusive_count: inconclusiveCount,
    negative_transfer_memory_count: negativeRows.length,
    negative_transfer_memory_write_count: negativeTransferMemoryWriteCount,
    negative_transfer_memory_retire_count: negativeTransferMemoryRetireCount,
    expired_negative_transfer_memory_count: expiredNegativeTransferMemoryCount,
    negative_transfer_review_due_count: reviewDueCount,
    validation_policy: {
      minimum_mature_results: MIN_MATURE_RESULTS,
      minimum_independent_replications: MIN_INDEPENDENT_REPLICATIONS,
      minimum_verification_methods: MIN_VERIFICATION_METHODS,
      minimum_boundary_contexts: MIN_BOUNDARY_CONTEXTS,
      one_experiment_can_prove_transfer: false,
      refutation_requires_registered_falsifier_evidence: true,
      mixed_mature_outcomes_become_boundary_limited: true,
      negative_transfer_memory_is_mechanism_specific: true,
      negative_transfer_pair_wide_block: false,
      negative_transfer_review_days: NEGATIVE_TRANSFER_REVIEW_DAYS,
      negative_transfer_validity_days: NEGATIVE_TRANSFER_VALIDITY_DAYS,
    },
    governance: {
      provider_free: true,
      experiment_execution_performed_here: false,
      web_research_executed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      platform_knowledge_written: false,
      reusable_platform_knowledge_created: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      customer_private_content_promoted: false,
      customer_identifiers_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoLearningTransferValidationRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
  recordExperimentResult: recordAvantiqoTransferExperimentResult,
  reconcile: reconcileAvantiqoLearningTransferValidation,
  classifyEvidence: classifyAvantiqoTransferEvidence,
  assertMechanismNotNegativelyRemembered:
    assertAvantiqoTransferMechanismNotNegativelyRemembered,
});
