import {
  assertAvantiqoExperimentExecutionReceiptCurrent,
} from "@/lib/intelligence/runtime/AvantiqoExperimentExecutionReceiptRuntime";
import {
  recordAvantiqoScientificExperimentResult,
} from "@/lib/intelligence/runtime/AvantiqoScientificLearningExperimentRuntime";
import {
  recordAvantiqoTransferExperimentResult,
} from "@/lib/intelligence/runtime/AvantiqoLearningTransferValidationRuntime";

export const AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_CONTRACT =
  "AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function fingerprint(value, code) {
  const candidate = text(value, 160).toLowerCase();
  if (!/^[a-f0-9]{16,128}$/.test(candidate)) {
    throw new Error(`${AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_CONTRACT}_${code}_INVALID`);
  }
  return candidate;
}

export async function recordAvantiqoGovernedScientificExperimentResult({
  execution_receipt_fingerprint,
  experiment_fingerprint,
  hypothesis_fingerprints = [],
  outcome,
  replication_key,
  evidence_fingerprint,
  verification_method,
  measurement_fingerprint,
} = {}) {
  const receiptFingerprint = fingerprint(
    execution_receipt_fingerprint,
    "EXECUTION_RECEIPT_FINGERPRINT",
  );
  const experimentFingerprint = fingerprint(experiment_fingerprint, "EXPERIMENT_FINGERPRINT");
  const evidenceFingerprint = fingerprint(evidence_fingerprint, "EVIDENCE_FINGERPRINT");
  const measurementFingerprint = fingerprint(
    measurement_fingerprint,
    "MEASUREMENT_FINGERPRINT",
  );

  const provenance = await assertAvantiqoExperimentExecutionReceiptCurrent({
    execution_receipt_fingerprint: receiptFingerprint,
    experiment_fingerprint: experimentFingerprint,
    evidence_fingerprint: evidenceFingerprint,
    measurement_fingerprint: measurementFingerprint,
    require_completed: true,
  });

  const result = await recordAvantiqoScientificExperimentResult({
    experiment_fingerprint: experimentFingerprint,
    hypothesis_fingerprints,
    outcome,
    replication_key,
    evidence_fingerprint: evidenceFingerprint,
    verification_method,
    measurement_fingerprint: measurementFingerprint,
  });

  return {
    ...result,
    ingress_contract: AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_CONTRACT,
    execution_receipt_fingerprint: receiptFingerprint,
    execution_claim_fingerprint: provenance.claim_fingerprint,
    experiment_version_fingerprint: provenance.experiment_version_fingerprint,
    execution_mode: provenance.execution_mode,
    actual_cost_units: provenance.actual_cost_units,
    execution_provenance_verified: true,
    governance: {
      ...(result.governance || {}),
      execution_receipt_required: true,
      execution_provenance_verified: true,
      result_ingress_authorizes_execution: false,
      platform_knowledge_written_directly: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

export async function recordAvantiqoGovernedTransferExperimentResult({
  execution_receipt_fingerprint,
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
  const receiptFingerprint = fingerprint(
    execution_receipt_fingerprint,
    "EXECUTION_RECEIPT_FINGERPRINT",
  );
  const experimentFingerprint = fingerprint(experiment_fingerprint, "EXPERIMENT_FINGERPRINT");
  const evidenceFingerprint = fingerprint(evidence_fingerprint, "EVIDENCE_FINGERPRINT");

  const provenance = await assertAvantiqoExperimentExecutionReceiptCurrent({
    execution_receipt_fingerprint: receiptFingerprint,
    experiment_fingerprint: experimentFingerprint,
    evidence_fingerprint: evidenceFingerprint,
    require_completed: true,
  });

  const executedAt = text(executed_at, 120);
  if (executedAt && provenance.executed_at && executedAt !== provenance.executed_at) {
    throw new Error(
      `${AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_CONTRACT}_EXECUTED_AT_PROVENANCE_MISMATCH`,
    );
  }

  const result = await recordAvantiqoTransferExperimentResult({
    transfer_fingerprint,
    experiment_fingerprint: experimentFingerprint,
    result_fingerprint,
    evidence_fingerprint: evidenceFingerprint,
    replication_fingerprint,
    boundary_context_fingerprint,
    verification_method,
    execution_contract,
    outcome,
    tested_boundary_conditions,
    falsifiers_triggered,
    executed_at: provenance.executed_at,
    independent_verifier,
    customer_private_content_used,
    customer_identifiers_used,
  });

  return {
    ...result,
    ingress_contract: AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_CONTRACT,
    execution_receipt_fingerprint: receiptFingerprint,
    execution_claim_fingerprint: provenance.claim_fingerprint,
    experiment_version_fingerprint: provenance.experiment_version_fingerprint,
    execution_mode: provenance.execution_mode,
    actual_cost_units: provenance.actual_cost_units,
    execution_provenance_verified: true,
    governance: {
      ...(result.governance || {}),
      execution_receipt_required: true,
      execution_provenance_verified: true,
      result_ingress_authorizes_execution: false,
      platform_knowledge_written_directly: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoGovernedExperimentResultIngressRuntime = Object.freeze({
  contract: AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_CONTRACT,
  recordScientificResult: recordAvantiqoGovernedScientificExperimentResult,
  recordTransferResult: recordAvantiqoGovernedTransferExperimentResult,
});
