import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  recordAvantiqoVerifiedTransferHypothesis,
} from "@/lib/intelligence/runtime/AvantiqoLearningTransferRuntime";

export const AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT =
  "AVANTIQO_LEARNING_TRANSFER_REVISION_V1";

const TRANSFER_CONTRACT = "AVANTIQO_LEARNING_TRANSFER_V1";
const VALIDATION_CONTRACT = "AVANTIQO_LEARNING_TRANSFER_VALIDATION_V1";
const MEMORY_TABLE = "intelligence_memories";
const HYPOTHESIS_SCOPE = "platform_learning_transfer_hypotheses";
const RESULT_SCOPE = "platform_learning_transfer_experiment_results";
const VALIDATION_SCOPE = "platform_learning_transfer_validations";
const CONTRADICTION_SCOPE = "platform_learning_transfer_contradictions";
const REVISION_REQUEST_SCOPE = "platform_learning_transfer_revision_requests";
const REVISION_HYPOTHESIS_SCOPE = "platform_learning_transfer_revision_hypotheses";
const AGENDA_SCOPE = "platform_learning_agenda";
const MAX_ROWS = 2000;
const MIN_CONTRADICTION_RESULTS = 2;
const MIN_CONTRADICTION_REPLICATIONS = 2;
const MIN_RESULT_VERIFICATION_METHODS = 2;
const MAX_REVISION_REQUESTS_PER_TRANSFER = 1;
const MATURE_FAILURE_STATES = new Set(["BOUNDARY_LIMITED", "REFUTED"]);
const CONTRADICTION_KINDS = new Set([
  "INVARIANT_MECHANISM",
  "BOUNDARY_CONDITION",
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

function uniqueText(values, limit = 40) {
  return [...new Set(
    list(values).map((value) => text(value, 2000)).filter(Boolean),
  )].slice(0, limit);
}

function normalized(value) {
  return text(value, 2000).toLowerCase();
}

function normalizedSet(values) {
  return new Set(uniqueText(values, 200).map(normalized));
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function fingerprint(value, code) {
  const candidate = normalized(value);
  if (!/^[a-f0-9]{16,128}$/.test(candidate)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_${code}_INVALID`);
  }
  return candidate;
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function canonicalMember(values, candidate) {
  const target = normalized(candidate);
  return uniqueText(values, 200).find((value) => normalized(value) === target) || "";
}

function setDiff(before, after) {
  const beforeValues = uniqueText(before, 200);
  const afterValues = uniqueText(after, 200);
  const beforeSet = new Set(beforeValues.map(normalized));
  const afterSet = new Set(afterValues.map(normalized));
  return {
    removed: beforeValues.filter((value) => !afterSet.has(normalized(value))),
    added: afterValues.filter((value) => !beforeSet.has(normalized(value))),
  };
}

function sameSet(left, right) {
  const leftSet = normalizedSet(left);
  const rightSet = normalizedSet(right);
  if (leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((value) => rightSet.has(value));
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function transferFingerprintOf(row) {
  return normalized(object(row.metadata).transfer_fingerprint);
}

function matureFailureClassification(row) {
  const metadata = object(row.metadata);
  const classification = text(metadata.classification, 80).toUpperCase();
  return MATURE_FAILURE_STATES.has(classification) ? classification : "";
}

function assumptionValues(hypothesisMetadata, kind) {
  if (kind === "INVARIANT_MECHANISM") {
    return uniqueText(hypothesisMetadata.invariant_mechanisms, 40);
  }
  if (kind === "BOUNDARY_CONDITION") {
    return uniqueText(hypothesisMetadata.boundary_conditions, 40);
  }
  return [];
}

function assumptionFingerprint(kind, value) {
  return digest("transfer-contradicted-assumption", kind, value);
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

async function loadResult(organizationId, resultFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", RESULT_SCOPE)
    .eq("metadata->>result_fingerprint", resultFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadValidation(organizationId, transferFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", VALIDATION_SCOPE)
    .eq("metadata->>transfer_fingerprint", transferFingerprint)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadExistingContradiction(organizationId, contradictionFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", CONTRADICTION_SCOPE)
    .eq("metadata->>contradiction_fingerprint", contradictionFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadRevisionRequest(organizationId, requestFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", REVISION_REQUEST_SCOPE)
    .eq("metadata->>revision_request_fingerprint", requestFingerprint)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
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

async function updateMemoryRow(row, metadata, nowIso) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata, updated_at: nowIso })
    .eq("id", row.id)
    .select("id")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function recordAvantiqoTransferContradiction({
  transfer_fingerprint,
  result_fingerprint,
  contradiction_fingerprint,
  contradicted_assumption_kind,
  contradicted_assumption,
  attribution_evidence_fingerprint,
  verification_method,
  confirmed_falsifier = null,
  independent_attribution = false,
  customer_private_content_used = false,
  customer_identifiers_used = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }

  const transferFingerprint = fingerprint(transfer_fingerprint, "TRANSFER_FINGERPRINT");
  const resultFingerprint = fingerprint(result_fingerprint, "RESULT_FINGERPRINT");
  const contradictionFingerprint = fingerprint(
    contradiction_fingerprint,
    "CONTRADICTION_FINGERPRINT",
  );
  const attributionEvidenceFingerprint = fingerprint(
    attribution_evidence_fingerprint,
    "ATTRIBUTION_EVIDENCE_FINGERPRINT",
  );
  const assumptionKind = text(contradicted_assumption_kind, 80).toUpperCase();
  const proposedAssumption = text(contradicted_assumption, 2000);
  const verificationMethod = text(verification_method, 240);
  const confirmedFalsifier = text(confirmed_falsifier, 2000);

  if (!CONTRADICTION_KINDS.has(assumptionKind)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_CONTRADICTION_KIND_INVALID`);
  }
  if (!proposedAssumption || !verificationMethod) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_ATTRIBUTION_EVIDENCE_REQUIRED`);
  }
  if (independent_attribution !== true) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_INDEPENDENT_ATTRIBUTION_REQUIRED`);
  }
  if (customer_private_content_used === true || customer_identifiers_used === true) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_CUSTOMER_PRIVATE_ATTRIBUTION_FORBIDDEN`);
  }

  const [hypothesis, resultRow, validation] = await Promise.all([
    loadHypothesis(organizationId, transferFingerprint),
    loadResult(organizationId, resultFingerprint),
    loadValidation(organizationId, transferFingerprint),
  ]);
  if (!hypothesis) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_PARENT_TRANSFER_HYPOTHESIS_NOT_FOUND`);
  }
  if (!resultRow || !activeAndUnexpired(resultRow)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_GOVERNED_TRANSFER_RESULT_NOT_FOUND`);
  }
  if (!validation || !activeAndUnexpired(validation)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_MATURE_TRANSFER_VALIDATION_NOT_FOUND`);
  }

  const hypothesisMetadata = object(hypothesis.metadata);
  const resultMetadata = object(resultRow.metadata);
  const validationMetadata = object(validation.metadata);
  const classification = matureFailureClassification(validation);
  if (!classification) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_MATURE_FAILURE_STATE_REQUIRED`);
  }
  if (
    text(hypothesisMetadata.contract, 160) !== TRANSFER_CONTRACT ||
    text(resultMetadata.contract, 160) !== VALIDATION_CONTRACT ||
    text(validationMetadata.contract, 160) !== VALIDATION_CONTRACT ||
    transferFingerprintOf(resultRow) !== transferFingerprint ||
    transferFingerprintOf(validation) !== transferFingerprint
  ) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_TRANSFER_LINEAGE_MISMATCH`);
  }
  const resultOutcome = text(resultMetadata.outcome, 80).toUpperCase();
  if (!new Set(["LIMITS_TRANSFER", "REFUTES_TRANSFER"]).has(resultOutcome)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_CONTRADICTORY_RESULT_REQUIRED`);
  }
  if (resultMetadata.independent_verifier_attested !== true) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_INDEPENDENT_RESULT_VERIFICATION_REQUIRED`);
  }

  const canonicalAssumption = canonicalMember(
    assumptionValues(hypothesisMetadata, assumptionKind),
    proposedAssumption,
  );
  if (!canonicalAssumption) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_ASSUMPTION_NOT_PREEXISTING`);
  }

  let canonicalFalsifier = "";
  if (resultOutcome === "REFUTES_TRANSFER") {
    canonicalFalsifier = canonicalMember(hypothesisMetadata.falsifiers, confirmedFalsifier);
    const triggeredFalsifier = canonicalMember(resultMetadata.falsifiers_triggered, confirmedFalsifier);
    if (!canonicalFalsifier || !triggeredFalsifier) {
      throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_REFUTATION_FALSIFIER_LINK_REQUIRED`);
    }
  } else if (confirmedFalsifier) {
    canonicalFalsifier = canonicalMember(hypothesisMetadata.falsifiers, confirmedFalsifier);
    if (!canonicalFalsifier) {
      throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_UNREGISTERED_CONFIRMED_FALSIFIER`);
    }
  }

  const existing = await loadExistingContradiction(organizationId, contradictionFingerprint);
  if (existing) {
    const metadata = object(existing.metadata);
    const immutableMatch = Boolean(
      text(metadata.transfer_fingerprint, 128) === transferFingerprint &&
      text(metadata.result_fingerprint, 128) === resultFingerprint &&
      text(metadata.attribution_evidence_fingerprint, 128) === attributionEvidenceFingerprint &&
      text(metadata.contradicted_assumption_kind, 80) === assumptionKind &&
      normalized(metadata.contradicted_assumption) === normalized(canonicalAssumption)
    );
    if (!immutableMatch) {
      throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_CONTRADICTION_FINGERPRINT_COLLISION`);
    }
    return {
      success: true,
      contract: AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT,
      status: "TRANSFER_CONTRADICTION_ALREADY_RECORDED",
      contradiction: existing,
      idempotent: true,
    };
  }

  const nowIso = new Date().toISOString();
  const assumptionFp = assumptionFingerprint(assumptionKind, canonicalAssumption);
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: CONTRADICTION_SCOPE,
    memory_key: `transfer-contradiction:${contradictionFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Transfer contradiction ${transferFingerprint.slice(0, 16)}`,
    content: "Independent contradiction attribution against a pre-existing transfer assumption. This row preserves causal failure evidence and cannot mutate the parent mechanism or create reusable platform knowledge.",
    importance: 0.97,
    confidence: 1,
    source: "cross_domain_transfer_contradiction_attribution",
    active: true,
    valid_until: resultRow.valid_until || validation.valid_until || null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT,
      status: "VERIFIED_TRANSFER_CONTRADICTION_RECORDED",
      transfer_fingerprint: transferFingerprint,
      parent_mechanism_fingerprint: text(hypothesisMetadata.mechanism_fingerprint, 128),
      parent_hypothesis_fingerprint: text(hypothesisMetadata.hypothesis_fingerprint, 128),
      mature_transfer_classification: classification,
      result_fingerprint: resultFingerprint,
      result_outcome: resultOutcome,
      result_replication_fingerprint: text(resultMetadata.replication_fingerprint, 128),
      result_verification_method_fingerprint: text(
        resultMetadata.verification_method_fingerprint,
        128,
      ),
      result_boundary_context_fingerprint: text(
        resultMetadata.boundary_context_fingerprint,
        128,
      ),
      contradiction_fingerprint: contradictionFingerprint,
      attribution_evidence_fingerprint: attributionEvidenceFingerprint,
      attribution_verification_method: verificationMethod,
      attribution_verification_method_fingerprint: digest(
        "transfer-contradiction-attribution-method",
        verificationMethod,
      ),
      independent_attribution_attested: true,
      contradicted_assumption_kind: assumptionKind,
      contradicted_assumption: canonicalAssumption,
      contradicted_assumption_fingerprint: assumptionFp,
      confirmed_falsifier: canonicalFalsifier || null,
      contradiction_targets_preexisting_assumption: true,
      contradiction_is_not_semantic_similarity: true,
      result_is_not_self_graded: true,
      automatic_mechanism_mutation: false,
      automatic_hypothesis_creation: false,
      parent_mechanism_mutated: false,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_used: false,
      customer_identifiers_used: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
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
    contract: AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT,
    status: "VERIFIED_TRANSFER_CONTRADICTION_RECORDED",
    contradiction: written.data,
    governance: {
      automatic_mechanism_mutation: false,
      automatic_hypothesis_creation: false,
      parent_mechanism_mutated: false,
      platform_knowledge_written: false,
      runpod_job_submitted: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

function eligibleContradiction(row) {
  const metadata = object(row.metadata);
  return Boolean(
    activeAndUnexpired(row) &&
      text(metadata.contract, 160) === AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT &&
      text(metadata.status, 160) === "VERIFIED_TRANSFER_CONTRADICTION_RECORDED" &&
      metadata.independent_attribution_attested === true &&
      metadata.contradiction_targets_preexisting_assumption === true &&
      metadata.automatic_mechanism_mutation === false &&
      metadata.reusable_platform_knowledge === false &&
      text(metadata.result_fingerprint, 128) &&
      text(metadata.result_replication_fingerprint, 128) &&
      text(metadata.result_verification_method_fingerprint, 128) &&
      text(metadata.contradicted_assumption_fingerprint, 128)
  );
}

function summarizeContradictions(rows) {
  const deduped = [];
  const contradictionFingerprints = new Set();
  for (const row of list(rows).filter(eligibleContradiction)) {
    const fingerprintValue = text(object(row.metadata).contradiction_fingerprint, 128);
    if (!fingerprintValue || contradictionFingerprints.has(fingerprintValue)) continue;
    contradictionFingerprints.add(fingerprintValue);
    deduped.push(row);
  }
  const resultFingerprints = new Set(
    deduped.map((row) => text(object(row.metadata).result_fingerprint, 128)).filter(Boolean),
  );
  const replications = new Set(
    deduped
      .map((row) => text(object(row.metadata).result_replication_fingerprint, 128))
      .filter(Boolean),
  );
  const methods = new Set(
    deduped
      .map((row) => text(object(row.metadata).result_verification_method_fingerprint, 128))
      .filter(Boolean),
  );
  const refutingResults = new Set(
    deduped
      .filter((row) => text(object(row.metadata).result_outcome, 80) === "REFUTES_TRANSFER")
      .map((row) => text(object(row.metadata).result_fingerprint, 128))
      .filter(Boolean),
  );
  return {
    rows: deduped,
    contradiction_count: deduped.length,
    result_count: resultFingerprints.size,
    independent_replication_count: replications.size,
    result_verification_method_count: methods.size,
    refuting_result_count: refutingResults.size,
    qualified: Boolean(
      resultFingerprints.size >= MIN_CONTRADICTION_RESULTS &&
        replications.size >= MIN_CONTRADICTION_REPLICATIONS &&
        methods.size >= MIN_RESULT_VERIFICATION_METHODS
    ),
  };
}

function summaryScore(summary) {
  return [
    summary.independent_replication_count,
    summary.result_count,
    summary.result_verification_method_count,
    summary.refuting_result_count,
  ];
}

function compareScore(left, right) {
  const a = summaryScore(left);
  const b = summaryScore(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index];
  }
  return 0;
}

function sameScore(left, right) {
  const a = summaryScore(left);
  const b = summaryScore(right);
  return a.every((value, index) => value === b[index]);
}

function revisionRequestRow({ organizationId, hypothesis, validation, selected, nowIso }) {
  const hypothesisMetadata = object(hypothesis.metadata);
  const validationMetadata = object(validation.metadata);
  const first = object(selected.rows[0]?.metadata);
  const contradictionFingerprints = selected.rows
    .map((row) => text(object(row.metadata).contradiction_fingerprint, 128))
    .filter(Boolean)
    .sort();
  const requestFingerprint = digest(
    "transfer-revision-request",
    transferFingerprintOf(hypothesis),
    first.contradicted_assumption_fingerprint,
    validationMetadata.classification,
    contradictionFingerprints.join("|"),
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: REVISION_REQUEST_SCOPE,
    memory_key: `transfer-revision-request:${requestFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `Transfer revision request ${transferFingerprintOf(hypothesis).slice(0, 16)}`,
    content: [
      `Revise only the contradicted ${text(first.contradicted_assumption_kind, 80).toLowerCase()}: ${text(first.contradicted_assumption, 2000)}.`,
      "Preserve every unrelated invariant mechanism and boundary condition from the parent transfer hypothesis.",
      "Do not reuse or cosmetically rename the parent mechanism fingerprint.",
      "Add at least one new falsifier for the changed component and at least two discriminating experiments, including one that isolates only the changed causal component.",
      "The revised mechanism remains a hypothesis and must re-enter the normal governed transfer experiment and replication lifecycle from zero.",
    ].join(" "),
    importance: 0.97,
    confidence: 1,
    source: "contradiction_driven_transfer_revision_request",
    active: true,
    valid_until: validation.valid_until || hypothesis.valid_until || null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT,
      status: "READY_FOR_SINGLE_COMPONENT_TRANSFER_REVISION",
      revision_request_fingerprint: requestFingerprint,
      parent_transfer_fingerprint: transferFingerprintOf(hypothesis),
      parent_mechanism_fingerprint: text(hypothesisMetadata.mechanism_fingerprint, 128),
      parent_hypothesis_fingerprint: text(hypothesisMetadata.hypothesis_fingerprint, 128),
      source_topic_key: text(hypothesisMetadata.source_topic_key, 240),
      source_domain: text(hypothesisMetadata.source_domain, 120),
      target_topic_key: text(hypothesisMetadata.target_topic_key, 240),
      target_domain: text(hypothesisMetadata.target_domain, 120),
      mature_transfer_classification: text(validationMetadata.classification, 80),
      contradicted_assumption_kind: text(first.contradicted_assumption_kind, 80),
      contradicted_assumption: text(first.contradicted_assumption, 2000),
      contradicted_assumption_fingerprint: text(
        first.contradicted_assumption_fingerprint,
        128,
      ),
      contradiction_fingerprints: contradictionFingerprints,
      contradiction_result_count: selected.result_count,
      contradiction_independent_replication_count: selected.independent_replication_count,
      contradiction_result_verification_method_count:
        selected.result_verification_method_count,
      contradiction_refuting_result_count: selected.refuting_result_count,
      contradiction_replication_threshold_met: true,
      single_component_mutation_required: true,
      unrelated_component_changes_forbidden: true,
      parent_mechanism_fingerprint_reuse_forbidden: true,
      cosmetic_rename_is_not_mechanism_revision: true,
      parent_negative_transfer_memory_bypass_forbidden: true,
      minimum_new_falsifiers: 1,
      minimum_discriminating_experiments: 2,
      changed_component_isolation_experiment_required: true,
      revised_hypothesis_must_reenter_phase14_phase15_lifecycle: true,
      automatic_mechanism_mutation: false,
      automatic_hypothesis_creation: false,
      automatic_experiment_execution: false,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_allowed: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      created_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function revisionAgendaRow(requestRow, nowIso) {
  const metadata = object(requestRow.metadata);
  const requestFingerprint = text(metadata.revision_request_fingerprint, 128);
  return {
    ...requestRow,
    memory_scope: AGENDA_SCOPE,
    memory_key: `transfer-revision-agenda:${requestFingerprint.slice(0, 40)}`,
    subject: `transfer-revision-${requestFingerprint.slice(0, 20)}`,
    source: "contradiction_driven_transfer_revision_agenda",
    metadata: {
      ...metadata,
      status: "READY",
      continuous_learning: true,
      self_directed_learning: true,
      research_mode: "mechanism_revision",
      topic_key: `transfer-revision-${requestFingerprint.slice(0, 20)}`,
      parent_topic_key: metadata.target_topic_key,
      knowledge_domain: metadata.target_domain,
      next_research_at: nowIso,
      transfer_revision_request_only: true,
      provider_execution_performed_here: false,
    },
  };
}

async function loadRevisionState(organizationId) {
  const [hypotheses, validations, contradictions] = await Promise.all([
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
      .eq("memory_scope", VALIDATION_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", CONTRADICTION_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
  ]);
  if (hypotheses.error) throw hypotheses.error;
  if (validations.error) throw validations.error;
  if (contradictions.error) throw contradictions.error;
  return {
    hypotheses: list(hypotheses.data),
    validations: list(validations.data),
    contradictions: list(contradictions.data),
  };
}

export async function reconcileAvantiqoLearningTransferRevisions({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      revision_request_count: 0,
    };
  }

  const state = await loadRevisionState(organizationId);
  const hypothesisByTransfer = new Map(
    state.hypotheses
      .filter((row) => text(object(row.metadata).contract, 160) === TRANSFER_CONTRACT)
      .map((row) => [transferFingerprintOf(row), row]),
  );
  const validationByTransfer = new Map(
    state.validations
      .filter((row) => matureFailureClassification(row))
      .map((row) => [transferFingerprintOf(row), row]),
  );
  const contradictionsByTransfer = new Map();
  for (const row of state.contradictions.filter(eligibleContradiction)) {
    const transferFingerprint = transferFingerprintOf(row);
    if (!transferFingerprint) continue;
    const bucket = contradictionsByTransfer.get(transferFingerprint) || [];
    bucket.push(row);
    contradictionsByTransfer.set(transferFingerprint, bucket);
  }

  const requests = [];
  const agendas = [];
  const blocked = [];
  const nowIso = new Date().toISOString();

  for (const [transferFingerprint, validation] of validationByTransfer.entries()) {
    const hypothesis = hypothesisByTransfer.get(transferFingerprint);
    if (!hypothesis) {
      blocked.push({
        transfer_fingerprint: transferFingerprint,
        reason: "ACTIVE_PARENT_TRANSFER_HYPOTHESIS_NOT_FOUND",
      });
      continue;
    }
    const rows = contradictionsByTransfer.get(transferFingerprint) || [];
    const grouped = new Map();
    for (const row of rows) {
      const metadata = object(row.metadata);
      const key = [
        text(metadata.contradicted_assumption_kind, 80),
        text(metadata.contradicted_assumption_fingerprint, 128),
      ].join("|");
      const bucket = grouped.get(key) || [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    const qualified = [...grouped.values()]
      .map(summarizeContradictions)
      .filter((summary) => summary.qualified)
      .sort(compareScore);
    if (!qualified.length) {
      blocked.push({
        transfer_fingerprint: transferFingerprint,
        reason: "CONTRADICTION_ATTRIBUTION_REPLICATION_REQUIRED",
      });
      continue;
    }
    if (qualified.length > 1 && sameScore(qualified[0], qualified[1])) {
      blocked.push({
        transfer_fingerprint: transferFingerprint,
        reason: "AMBIGUOUS_MULTI_ASSUMPTION_CONTRADICTION",
        tied_assumption_count: qualified.filter((entry) => sameScore(entry, qualified[0])).length,
      });
      continue;
    }

    const selected = qualified[0];
    const request = revisionRequestRow({
      organizationId,
      hypothesis,
      validation,
      selected,
      nowIso,
    });
    requests.push(request);
    agendas.push(revisionAgendaRow(request, nowIso));
    if (requests.length >= validationByTransfer.size * MAX_REVISION_REQUESTS_PER_TRANSFER) {
      break;
    }
  }

  let requestWriteCount = 0;
  let agendaWriteCount = 0;
  if (persist) {
    [requestWriteCount, agendaWriteCount] = await Promise.all([
      upsertRows(requests),
      upsertRows(agendas),
    ]);
  }

  return {
    success: true,
    contract: AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT,
    status: requests.length
      ? "CONTRADICTION_DRIVEN_TRANSFER_REVISION_REQUESTS_READY"
      : "NO_TRANSFER_REVISION_REQUEST_READY",
    mature_failed_or_limited_transfer_count: validationByTransfer.size,
    contradiction_evidence_count: state.contradictions.filter(eligibleContradiction).length,
    revision_request_count: requests.length,
    revision_request_write_count: requestWriteCount,
    revision_agenda_write_count: agendaWriteCount,
    blocked_count: blocked.length,
    blocked,
    revision_policy: {
      minimum_contradiction_results: MIN_CONTRADICTION_RESULTS,
      minimum_independent_replications: MIN_CONTRADICTION_REPLICATIONS,
      minimum_result_verification_methods: MIN_RESULT_VERIFICATION_METHODS,
      maximum_revision_requests_per_transfer: MAX_REVISION_REQUESTS_PER_TRANSFER,
      ambiguous_equal_strength_assumptions_block_revision: true,
      single_component_mutation_required: true,
      parent_mechanism_reuse_forbidden: true,
      cosmetic_rename_is_not_revision: true,
      revised_hypothesis_must_restart_transfer_validation: true,
    },
    governance: {
      provider_free: true,
      web_research_executed_here: false,
      mechanism_mutation_performed_here: false,
      revised_hypothesis_created_here: false,
      experiment_execution_performed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      platform_knowledge_written: false,
      reusable_platform_knowledge_created: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

function ensureSingleComponentMutation({
  requestMetadata,
  parentMetadata,
  revisedInvariants,
  revisedBoundaries,
}) {
  const kind = text(requestMetadata.contradicted_assumption_kind, 80);
  const contradicted = text(requestMetadata.contradicted_assumption, 2000);
  const originalInvariants = uniqueText(parentMetadata.invariant_mechanisms, 40);
  const originalBoundaries = uniqueText(parentMetadata.boundary_conditions, 40);
  const invariantDiff = setDiff(originalInvariants, revisedInvariants);
  const boundaryDiff = setDiff(originalBoundaries, revisedBoundaries);

  if (kind === "INVARIANT_MECHANISM") {
    if (
      invariantDiff.removed.length !== 1 ||
      invariantDiff.added.length !== 1 ||
      normalized(invariantDiff.removed[0]) !== normalized(contradicted) ||
      !sameSet(originalBoundaries, revisedBoundaries)
    ) {
      throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_NON_MINIMAL_INVARIANT_MUTATION`);
    }
    return {
      mutation_kind: "INVARIANT_REPLACEMENT",
      removed_component: invariantDiff.removed[0],
      added_component: invariantDiff.added[0],
    };
  }

  if (kind === "BOUNDARY_CONDITION") {
    if (
      boundaryDiff.removed.length !== 1 ||
      boundaryDiff.added.length !== 1 ||
      normalized(boundaryDiff.removed[0]) !== normalized(contradicted) ||
      !sameSet(originalInvariants, revisedInvariants)
    ) {
      throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_NON_MINIMAL_BOUNDARY_MUTATION`);
    }
    return {
      mutation_kind: "BOUNDARY_REFINEMENT",
      removed_component: boundaryDiff.removed[0],
      added_component: boundaryDiff.added[0],
    };
  }

  throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_REVISION_KIND_INVALID`);
}

async function completeRevisionRequestAndAgenda({
  request,
  childTransferFingerprint,
  revisedMechanismFingerprint,
  nowIso,
}) {
  const requestMetadata = object(request.metadata);
  await updateMemoryRow(
    request,
    {
      ...requestMetadata,
      status: "VERIFIED_SINGLE_COMPONENT_TRANSFER_REVISION_RECORDED",
      child_transfer_fingerprint: childTransferFingerprint,
      revised_mechanism_fingerprint: revisedMechanismFingerprint,
      revision_completed_at: nowIso,
      automatic_experiment_execution: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
    },
    nowIso,
  );

  const agenda = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata")
    .eq("organization_id", request.organization_id)
    .eq("memory_scope", AGENDA_SCOPE)
    .eq(
      "metadata->>revision_request_fingerprint",
      text(requestMetadata.revision_request_fingerprint, 128),
    )
    .eq("active", true)
    .maybeSingle();
  if (agenda.error) throw agenda.error;
  if (agenda.data) {
    const agendaMetadata = object(agenda.data.metadata);
    const updated = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        metadata: {
          ...agendaMetadata,
          status: "COMPLETED",
          child_transfer_fingerprint: childTransferFingerprint,
          revised_mechanism_fingerprint: revisedMechanismFingerprint,
          completed_at: nowIso,
        },
        updated_at: nowIso,
      })
      .eq("id", agenda.data.id)
      .select("id")
      .single();
    if (updated.error) throw updated.error;
  }
}

export async function recordAvantiqoVerifiedTransferRevisionHypothesis({
  revision_request_fingerprint,
  revised_mechanism_fingerprint,
  revised_hypothesis_fingerprint,
  evidence_fingerprint,
  verification_method,
  source_contract,
  revised_invariant_mechanisms,
  revised_boundary_conditions,
  revised_falsifiers,
  discriminating_experiments,
  mutation_falsifier,
  mutation_discriminating_experiment,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }

  const requestFingerprint = fingerprint(
    revision_request_fingerprint,
    "REVISION_REQUEST_FINGERPRINT",
  );
  const revisedMechanismFingerprint = fingerprint(
    revised_mechanism_fingerprint,
    "REVISED_MECHANISM_FINGERPRINT",
  );
  const revisedHypothesisFingerprint = fingerprint(
    revised_hypothesis_fingerprint,
    "REVISED_HYPOTHESIS_FINGERPRINT",
  );
  const evidenceFingerprint = fingerprint(evidence_fingerprint, "EVIDENCE_FINGERPRINT");
  const verificationMethod = text(verification_method, 240);
  const sourceContract = text(source_contract, 240);
  const revisedInvariants = uniqueText(revised_invariant_mechanisms, 40);
  const revisedBoundaries = uniqueText(revised_boundary_conditions, 40);
  const revisedFalsifierList = uniqueText(revised_falsifiers, 40);
  const experiments = uniqueText(discriminating_experiments, 20);
  const mutationFalsifier = text(mutation_falsifier, 2000);
  const mutationExperiment = text(mutation_discriminating_experiment, 2000);

  if (!verificationMethod || !sourceContract) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_VERIFICATION_EVIDENCE_REQUIRED`);
  }
  if (revisedInvariants.length < 1 || revisedBoundaries.length < 2) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_REVISED_MECHANISM_STRUCTURE_INSUFFICIENT`);
  }
  if (experiments.length < 2 || !mutationFalsifier || !mutationExperiment) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_MUTATION_DISCRIMINATION_REQUIRED`);
  }

  const request = await loadRevisionRequest(organizationId, requestFingerprint);
  if (!request) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_REVISION_REQUEST_NOT_FOUND`);
  }
  const requestMetadata = object(request.metadata);
  if (
    text(requestMetadata.contract, 160) !== AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT ||
    text(requestMetadata.status, 160) !== "READY_FOR_SINGLE_COMPONENT_TRANSFER_REVISION" ||
    requestMetadata.single_component_mutation_required !== true ||
    requestMetadata.automatic_hypothesis_creation !== false
  ) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_REVISION_REQUEST_NOT_GOVERNED`);
  }

  const parentTransferFingerprint = fingerprint(
    requestMetadata.parent_transfer_fingerprint,
    "PARENT_TRANSFER_FINGERPRINT",
  );
  const parent = await loadHypothesis(organizationId, parentTransferFingerprint);
  const validation = await loadValidation(organizationId, parentTransferFingerprint);
  if (!parent || !validation || !matureFailureClassification(validation)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_PARENT_FAILURE_NO_LONGER_MATURE`);
  }
  const parentMetadata = object(parent.metadata);
  const parentMechanismFingerprint = fingerprint(
    parentMetadata.mechanism_fingerprint,
    "PARENT_MECHANISM_FINGERPRINT",
  );
  if (revisedMechanismFingerprint === parentMechanismFingerprint) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_PARENT_MECHANISM_REUSE_FORBIDDEN`);
  }
  if (
    revisedHypothesisFingerprint === normalized(parentMetadata.hypothesis_fingerprint)
  ) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_PARENT_HYPOTHESIS_REUSE_FORBIDDEN`);
  }

  const mutation = ensureSingleComponentMutation({
    requestMetadata,
    parentMetadata,
    revisedInvariants,
    revisedBoundaries,
  });

  const originalFalsifiers = uniqueText(parentMetadata.falsifiers, 40);
  const originalFalsifierSet = normalizedSet(originalFalsifiers);
  const revisedFalsifierSet = normalizedSet(revisedFalsifierList);
  if (![...originalFalsifierSet].every((value) => revisedFalsifierSet.has(value))) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_ORIGINAL_FALSIFIER_REMOVAL_FORBIDDEN`);
  }
  const newFalsifiers = revisedFalsifierList.filter(
    (value) => !originalFalsifierSet.has(normalized(value)),
  );
  const canonicalMutationFalsifier = canonicalMember(newFalsifiers, mutationFalsifier);
  if (!canonicalMutationFalsifier) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_NEW_MUTATION_FALSIFIER_REQUIRED`);
  }
  const canonicalMutationExperiment = canonicalMember(experiments, mutationExperiment);
  if (!canonicalMutationExperiment) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_MUTATION_EXPERIMENT_NOT_PROPOSED`);
  }
  if (canonicalMember(parentMetadata.discriminating_experiments, canonicalMutationExperiment)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT}_MUTATION_EXPERIMENT_MUST_BE_NEW`);
  }

  const phase14 = await recordAvantiqoVerifiedTransferHypothesis({
    source_topic_key: text(parentMetadata.source_topic_key, 240),
    target_topic_key: text(parentMetadata.target_topic_key, 240),
    source_domain: text(parentMetadata.source_domain, 120),
    target_domain: text(parentMetadata.target_domain, 120),
    mechanism_fingerprint: revisedMechanismFingerprint,
    hypothesis_fingerprint: revisedHypothesisFingerprint,
    evidence_fingerprint: evidenceFingerprint,
    verification_method: verificationMethod,
    source_contract: sourceContract,
    invariant_mechanisms: revisedInvariants,
    boundary_conditions: revisedBoundaries,
    falsifiers: revisedFalsifierList,
    discriminating_experiments: experiments,
  });

  const childMetadata = object(phase14.transfer_hypothesis?.metadata);
  const childTransferFingerprint = fingerprint(
    childMetadata.transfer_fingerprint,
    "CHILD_TRANSFER_FINGERPRINT",
  );
  const nowIso = new Date().toISOString();
  const lineageFingerprint = digest(
    "verified-transfer-revision-lineage",
    requestFingerprint,
    parentTransferFingerprint,
    childTransferFingerprint,
    revisedMechanismFingerprint,
  );
  const lineage = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: REVISION_HYPOTHESIS_SCOPE,
    memory_key: `transfer-revision-hypothesis:${lineageFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Verified transfer revision ${parentTransferFingerprint.slice(0, 12)} -> ${childTransferFingerprint.slice(0, 12)}`,
    content: "A contradiction-driven single-component mechanism revision passed structural verification and was re-entered as a new Phase 14 transfer hypothesis. The parent failure and negative-transfer memory remain intact.",
    importance: 0.98,
    confidence: 1,
    source: "verified_single_component_transfer_revision",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT,
      status: "VERIFIED_TRANSFER_REVISION_REENTERED_PHASE14",
      revision_lineage_fingerprint: lineageFingerprint,
      revision_request_fingerprint: requestFingerprint,
      parent_transfer_fingerprint: parentTransferFingerprint,
      parent_mechanism_fingerprint: parentMechanismFingerprint,
      parent_hypothesis_fingerprint: text(parentMetadata.hypothesis_fingerprint, 128),
      child_transfer_fingerprint: childTransferFingerprint,
      revised_mechanism_fingerprint: revisedMechanismFingerprint,
      revised_hypothesis_fingerprint: revisedHypothesisFingerprint,
      contradicted_assumption_kind: text(requestMetadata.contradicted_assumption_kind, 80),
      contradicted_assumption: text(requestMetadata.contradicted_assumption, 2000),
      mutation_kind: mutation.mutation_kind,
      removed_component: mutation.removed_component,
      added_component: mutation.added_component,
      single_component_mutation_verified: true,
      unrelated_invariants_preserved: mutation.mutation_kind !== "INVARIANT_REPLACEMENT" ||
        revisedInvariants.length === uniqueText(parentMetadata.invariant_mechanisms, 40).length,
      unrelated_boundaries_preserved: mutation.mutation_kind !== "BOUNDARY_REFINEMENT" ||
        revisedBoundaries.length === uniqueText(parentMetadata.boundary_conditions, 40).length,
      parent_mechanism_reused: false,
      cosmetic_rename_only: false,
      original_falsifiers_retained: true,
      new_mutation_falsifier: canonicalMutationFalsifier,
      new_mutation_discriminating_experiment: canonicalMutationExperiment,
      parent_negative_transfer_memory_retired: false,
      parent_negative_transfer_memory_bypassed: false,
      child_starts_with_zero_transfer_success_credit: true,
      child_requires_phase14_experiments: true,
      child_requires_phase15_replication_validation: true,
      transfer_success_proven: false,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      experiment_execution_performed_here: false,
      provider_execution_performed_here: false,
      runpod_job_submitted: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      verified_at: nowIso,
    },
    updated_at: nowIso,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(lineage, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,metadata")
    .single();
  if (written.error) throw written.error;

  await completeRevisionRequestAndAgenda({
    request,
    childTransferFingerprint,
    revisedMechanismFingerprint,
    nowIso,
  });

  return {
    success: true,
    contract: AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT,
    status: "VERIFIED_SINGLE_COMPONENT_TRANSFER_REVISION_REENTERED_PHASE14",
    revision_lineage: written.data,
    child_transfer_hypothesis: phase14.transfer_hypothesis,
    child_experiment_proposal_count: phase14.experiment_proposal_count,
    governance: {
      single_component_mutation_verified: true,
      parent_mechanism_reused: false,
      parent_negative_transfer_memory_retired: false,
      parent_negative_transfer_memory_bypassed: false,
      child_transfer_success_credit_inherited: false,
      experiment_execution_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      reusable_platform_knowledge_created: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoLearningTransferRevisionRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_TRANSFER_REVISION_CONTRACT,
  recordContradiction: recordAvantiqoTransferContradiction,
  reconcile: reconcileAvantiqoLearningTransferRevisions,
  recordVerifiedRevisionHypothesis: recordAvantiqoVerifiedTransferRevisionHypothesis,
});
