import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT,
  buildBusinessDiagnosisAuditProjection,
  businessDiagnosisAuditProjectionFingerprint,
} from "../lib/intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js";
import {
  businessDiagnosisTurnVerification,
  sanitizeBusinessDiagnosisConversation,
} from "../lib/operator/runtime/BusinessDiagnosisConversationSanitizerRuntime.js";

function diagnosisEvidence({ status = "verified", legacy = false } = {}) {
  const projection = buildBusinessDiagnosisAuditProjection({
    receipt_fingerprint: "receipt-1",
    diagnosis_class: "CAUSAL_DIAGNOSIS",
    business_timezone: "Asia/Bangkok",
    final_evidence_state: "INTERNAL_SUFFICIENT",
    residual_material: false,
    answer_boundary_status: "PASS",
    validated_external_context_count: 0,
    unresolved_external_context_count: 0,
    baseline_period_id: "aug",
    baseline_period_start_date: "2026-08-01",
    baseline_period_end_date: "2026-08-31",
    current_period_id: "sep",
    current_period_start_date: "2026-09-01",
    current_period_end_date: "2026-09-30",
  });
  const diagnosis = {
    class: projection.diagnosis_class,
    business_timezone: projection.business_timezone,
    receipt_fingerprint: projection.receipt_fingerprint,
    final_evidence_state: projection.final_evidence_state,
    residual_material: projection.residual_material,
    answer_boundary_status: projection.answer_boundary_status,
    validated_external_context_count: projection.validated_external_context_count,
    unresolved_external_context_count: projection.unresolved_external_context_count,
    periods: projection.periods,
  };
  if (legacy) {
    const legacyProjection = { ...projection };
    delete legacyProjection.projection_contract;
    const canonical = (value) => Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
        : value;
    diagnosis.audit_projection_fingerprint = createHash("sha256").update(JSON.stringify(canonical(legacyProjection))).digest("hex");
  } else {
    diagnosis.audit_projection_contract = AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT;
    diagnosis.audit_projection_fingerprint = businessDiagnosisAuditProjectionFingerprint({
      receipt_fingerprint: projection.receipt_fingerprint,
      diagnosis_class: projection.diagnosis_class,
      business_timezone: projection.business_timezone,
      final_evidence_state: projection.final_evidence_state,
      residual_material: projection.residual_material,
      answer_boundary_status: projection.answer_boundary_status,
      answer_unsupported_recommendation_outcome_detected: projection.answer_unsupported_recommendation_outcome_detected,
      validated_external_context_count: projection.validated_external_context_count,
      unresolved_external_context_count: projection.unresolved_external_context_count,
      baseline_period_id: projection.periods.baseline_period_id,
      baseline_period_start_date: projection.periods.baseline_start_date,
      baseline_period_end_date: projection.periods.baseline_end_date,
      current_period_id: projection.periods.current_period_id,
      current_period_start_date: projection.periods.current_start_date,
      current_period_end_date: projection.periods.current_end_date,
    });
  }
  if (status === "mismatch") diagnosis.final_evidence_state = "TAMPERED";
  return { business_diagnosis: diagnosis };
}

test("verified diagnosis pair stays in conversation", () => {
  const rows = [
    { role: "assistant", content: "diagnosis", evidence: diagnosisEvidence() },
    { role: "user", content: "why profit down?", evidence: {} },
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows), [
    { role: "user", content: "why profit down?" },
    { role: "assistant", content: "diagnosis" },
  ]);
});

test("mismatched diagnosis removes assistant and paired user prompt", () => {
  const rows = [
    { role: "assistant", content: "unsafe diagnosis", evidence: diagnosisEvidence({ status: "mismatch" }) },
    { role: "user", content: "why profit down?", evidence: {} },
    { role: "assistant", content: "safe normal answer", evidence: {} },
    { role: "user", content: "hello", evidence: {} },
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows), [
    { role: "user", content: "hello" },
    { role: "assistant", content: "safe normal answer" },
  ]);
});

test("verified legacy diagnosis remains usable", () => {
  const row = { role: "assistant", content: "legacy diagnosis", evidence: diagnosisEvidence({ legacy: true }) };
  const result = businessDiagnosisTurnVerification(row);
  assert.equal(result.safe, true);
  assert.equal(result.status, "VERIFIED_LEGACY");
});

test("assistant without diagnosis evidence remains normal conversation", () => {
  assert.deepEqual(sanitizeBusinessDiagnosisConversation([
    { role: "assistant", content: "normal answer", evidence: { provider: "safe" } },
    { role: "user", content: "hello" },
  ]), [
    { role: "user", content: "hello" },
    { role: "assistant", content: "normal answer" },
  ]);
});
