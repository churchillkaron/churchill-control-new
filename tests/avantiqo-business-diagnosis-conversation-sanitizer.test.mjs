import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT,
  buildBusinessDiagnosisAuditProjection,
  businessDiagnosisAuditProjectionFingerprint,
  businessDiagnosisAnswerContentFingerprint,
} from "../lib/intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js";
import {
  businessDiagnosisTurnVerification,
  sanitizeBusinessDiagnosisConversation,
  sanitizeBusinessDiagnosisSnapshotTurn,
  sanitizeBusinessDiagnosisSnapshot,
} from "../lib/operator/runtime/BusinessDiagnosisConversationSanitizerRuntime.js";
import { sealBusinessDiagnosisProofAuthenticity, verifyBusinessDiagnosisProofScope, bindBusinessDiagnosisScopeChecksum, businessDiagnosisUserTurnContentFingerprint } from "../lib/intelligence/runtime/AvantiqoBusinessDiagnosisProofAuthenticityRuntime.js";

function diagnosisEvidence({ status = "verified", legacy = false, answer = "diagnosis" } = {}) {
  const projection = buildBusinessDiagnosisAuditProjection({
    receipt_fingerprint: "receipt-1",
    receipt_contract: "AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V2",
    diagnosis_class: "CAUSAL_DIAGNOSIS",
    business_timezone: "Asia/Bangkok",
    answer_content_fingerprint: businessDiagnosisAnswerContentFingerprint(answer),
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
    receipt_contract: projection.receipt_contract,
    business_timezone: projection.business_timezone,
    answer_content_fingerprint: projection.answer_content_fingerprint,
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
    delete legacyProjection.answer_content_fingerprint;
    delete legacyProjection.receipt_contract;
    const canonical = (value) => Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
        : value;
    delete diagnosis.receipt_contract;
    delete diagnosis.answer_content_fingerprint;
    diagnosis.audit_projection_fingerprint = createHash("sha256").update(JSON.stringify(canonical(legacyProjection))).digest("hex");
  } else {
    diagnosis.audit_projection_contract = AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT;
    diagnosis.audit_projection_fingerprint = businessDiagnosisAuditProjectionFingerprint({
      receipt_fingerprint: projection.receipt_fingerprint,
      receipt_contract: projection.receipt_contract,
      diagnosis_class: projection.diagnosis_class,
      business_timezone: projection.business_timezone,
      answer_content_fingerprint: projection.answer_content_fingerprint,
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
  const row = { role: "assistant", content: "legacy diagnosis", evidence: diagnosisEvidence({ legacy: true, answer: "legacy diagnosis" }) };
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


test("verified snapshot diagnosis preserves answer and marks verification", () => {
  const turn = { role: "assistant", content: "verified answer", decision: { response_text: "verified answer", clarification: { options: ["A"] } }, evidence: { provider: "safe", ...diagnosisEvidence({ answer: "verified answer" }) }, execution: { status: "read" }, navigation: { href: "/safe" } };
  const result = sanitizeBusinessDiagnosisSnapshotTurn(turn);
  assert.equal(result.content, "verified answer");
  assert.deepEqual(result.decision.clarification.options, ["A"]);
  assert.equal(result.evidence.provider, "safe");
  assert.equal(result.evidence.business_diagnosis.audit_projection_verification_status, "VERIFIED");
  assert.equal(result.evidence.business_diagnosis.audit_projection_verified, true);
  assert.deepEqual(result.execution, { status: "read" });
  assert.deepEqual(result.navigation, { href: "/safe" });
});

test("unverified snapshot diagnosis is reduced to minimum safe payload", () => {
  const turn = { role: "assistant", content: "unsafe answer", decision: { response_text: "unsafe answer", clarification: { options: ["stale"] }, secret: "drop" }, evidence: { provider: "drop", ...diagnosisEvidence({ status: "mismatch" }) }, execution: { status: "danger" }, navigation: { href: "/stale" } };
  const result = sanitizeBusinessDiagnosisSnapshotTurn(turn);
  assert.match(result.content, /historical diagnosis is hidden/i);
  assert.deepEqual(result.decision, { response_text: result.content });
  assert.deepEqual(Object.keys(result.evidence), ["business_diagnosis"]);
  assert.equal(result.evidence.business_diagnosis.audit_projection_verification_status, "MISMATCH");
  assert.equal(result.evidence.business_diagnosis.audit_projection_verified, false);
  assert.deepEqual(result.execution, {});
  assert.deepEqual(result.navigation, {});
});

test("multiple unsafe diagnosis pairs are removed without deleting surrounding safe conversation", () => {
  const rows = [
    { role: "assistant", content: "safe latest answer", evidence: {} },
    { role: "user", content: "latest normal question", evidence: {} },
    { role: "assistant", content: "unsafe two", evidence: diagnosisEvidence({ status: "mismatch" }) },
    { role: "user", content: "unsafe question two", evidence: {} },
    { role: "assistant", content: "verified diagnosis", evidence: diagnosisEvidence({ answer: "verified diagnosis" }) },
    { role: "user", content: "verified question", evidence: {} },
    { role: "assistant", content: "unsafe one", evidence: diagnosisEvidence({ status: "mismatch" }) },
    { role: "user", content: "unsafe question one", evidence: {} },
    { role: "assistant", content: "safe oldest answer", evidence: {} },
    { role: "user", content: "oldest normal question", evidence: {} },
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows), [
    { role: "user", content: "oldest normal question" },
    { role: "assistant", content: "safe oldest answer" },
    { role: "user", content: "verified question" },
    { role: "assistant", content: "verified diagnosis" },
    { role: "user", content: "latest normal question" },
    { role: "assistant", content: "safe latest answer" },
  ]);
});

test("unsafe diagnosis without an immediately preceding user does not delete a safe assistant", () => {
  const rows = [
    { role: "assistant", content: "unsafe orphan diagnosis", evidence: diagnosisEvidence({ status: "mismatch" }) },
    { role: "assistant", content: "safe answer", evidence: {} },
    { role: "user", content: "safe question", evidence: {} },
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows), [
    { role: "user", content: "safe question" },
    { role: "assistant", content: "safe answer" },
  ]);
});

test("two consecutive unsafe diagnosis pairs both disappear", () => {
  const rows = [
    { role: "assistant", content: "unsafe second", evidence: diagnosisEvidence({ status: "mismatch" }) },
    { role: "user", content: "second unsafe question", evidence: {} },
    { role: "assistant", content: "unsafe first", evidence: diagnosisEvidence({ status: "mismatch" }) },
    { role: "user", content: "first unsafe question", evidence: {} },
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows), []);
});

test("snapshot sanitizer quarantines only unsafe diagnoses in a mixed transcript", () => {
  const normal = { role: "assistant", content: "normal", evidence: { provider: "safe" }, decision: { response_text: "normal" } };
  const verified = { role: "assistant", content: "verified", evidence: diagnosisEvidence({ answer: "verified" }), decision: { response_text: "verified" } };
  const unsafe = { role: "assistant", content: "unsafe", evidence: diagnosisEvidence({ status: "mismatch" }), decision: { response_text: "unsafe", clarification: { options: ["stale"] } }, execution: { status: "stale" } };
  const result = [normal, verified, unsafe].map(sanitizeBusinessDiagnosisSnapshotTurn);
  assert.equal(result[0].content, "normal");
  assert.equal(result[0].evidence.provider, "safe");
  assert.equal(result[1].content, "verified");
  assert.equal(result[1].evidence.business_diagnosis.audit_projection_verified, true);
  assert.match(result[2].content, /historical diagnosis is hidden/i);
  assert.deepEqual(result[2].execution, {});
});

test("V3 answer text tampering makes an otherwise valid diagnosis unsafe", () => {
  const evidence = diagnosisEvidence({ answer: "original answer" });
  const verification = businessDiagnosisTurnVerification({ role: "assistant", content: "altered answer", evidence });
  assert.equal(verification.metadata_status, "VERIFIED");
  assert.equal(verification.answer_status, "MISMATCH");
  assert.equal(verification.status, "ANSWER_MISMATCH");
  assert.equal(verification.safe, false);
});

test("answer-tampered diagnosis and its paired request are removed from model context", () => {
  const rows = [
    { role: "assistant", content: "altered answer", evidence: diagnosisEvidence({ answer: "original answer" }) },
    { role: "user", content: "why did profit drop?", evidence: {} },
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows), []);
});

test("answer-tampered snapshot is quarantined even when metadata checksum is valid", () => {
  const turn = { role: "assistant", content: "altered answer", evidence: diagnosisEvidence({ answer: "original answer" }), decision: { response_text: "altered answer" } };
  const result = sanitizeBusinessDiagnosisSnapshotTurn(turn);
  assert.match(result.content, /historical diagnosis is hidden/i);
  assert.equal(result.evidence.business_diagnosis.audit_projection_verification_status, "ANSWER_MISMATCH");
  assert.equal(result.evidence.business_diagnosis.answer_content_verification_status, "MISMATCH");
  assert.equal(result.evidence.business_diagnosis.audit_projection_verified, false);
});

test("unknown receipt contract makes current proof unsafe", () => {
  const evidence = diagnosisEvidence({ answer: "diagnosis" });
  const diagnosis = { ...evidence.business_diagnosis, receipt_contract: "AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V99" };
  const result = businessDiagnosisTurnVerification({ role: "assistant", content: "diagnosis", evidence: { business_diagnosis: diagnosis } });
  assert.equal(result.safe, false);
  assert.equal(result.status, "UNSUPPORTED_RECEIPT_VERSION");
});

test("receipt and projection version mismatch is quarantined", () => {
  const evidence = diagnosisEvidence({ answer: "diagnosis" });
  const diagnosis = { ...evidence.business_diagnosis, receipt_contract: "AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V1" };
  const result = sanitizeBusinessDiagnosisSnapshotTurn({ role: "assistant", content: "diagnosis", evidence: { business_diagnosis: diagnosis }, decision: { response_text: "diagnosis" } });
  assert.match(result.content, /historical diagnosis is hidden/i);
  assert.equal(result.evidence.business_diagnosis.audit_projection_verification_status, "RECEIPT_PROJECTION_VERSION_MISMATCH");
  assert.equal(result.evidence.business_diagnosis.audit_projection_verified, false);
});


test("authenticated diagnosis proof with bad MAC is quarantined", () => {
  const oldId=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID;
  const oldRing=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON;
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID="k1";
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=JSON.stringify({k1:"11".repeat(32)});
  try {
    const evidence=diagnosisEvidence({answer:"diagnosis"});
    evidence.business_diagnosis.authenticity_contract="AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_V1";
    evidence.business_diagnosis.authenticity_algorithm="HMAC-SHA256";
    evidence.business_diagnosis.authenticity_key_id="k1";
    evidence.business_diagnosis.authenticity_mac="00".repeat(32);
    const result=businessDiagnosisTurnVerification({role:"assistant",content:"diagnosis",evidence});
    assert.equal(result.safe,false);
    assert.equal(result.status,"AUTHENTICITY_MISMATCH");
  } finally {
    if(oldId===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID=oldId;
    if(oldRing===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=oldRing;
  }
});


test("required authenticity quarantines otherwise valid unsigned diagnosis", () => {
  const oldRequired=process.env.AVANTIQO_BUSINESS_DIAGNOSIS_AUTHENTICITY_REQUIRED;
  const oldId=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID;
  const oldRing=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON;
  process.env.AVANTIQO_BUSINESS_DIAGNOSIS_AUTHENTICITY_REQUIRED="true";
  delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID;
  delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON;
  try {
    const result=businessDiagnosisTurnVerification({role:"assistant",content:"diagnosis",evidence:diagnosisEvidence({answer:"diagnosis"})});
    assert.equal(result.safe,false);
    assert.equal(result.authenticity_status,"AUTHENTICITY_NOT_AVAILABLE");
  } finally {
    if(oldRequired===undefined) delete process.env.AVANTIQO_BUSINESS_DIAGNOSIS_AUTHENTICITY_REQUIRED; else process.env.AVANTIQO_BUSINESS_DIAGNOSIS_AUTHENTICITY_REQUIRED=oldRequired;
    if(oldId===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID=oldId;
    if(oldRing===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=oldRing;
  }
});


test("snapshot redaction never returns authenticity key id or MAC to clients", () => {
  const oldId=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID;
  const oldRing=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON;
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID="k1";
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=JSON.stringify({k1:"11".repeat(32)});
  try {
    const evidence=diagnosisEvidence({answer:"diagnosis"});
    const sealed=sealBusinessDiagnosisProofAuthenticity(evidence.business_diagnosis).proof;
    const result=sanitizeBusinessDiagnosisSnapshotTurn({role:"assistant",content:"diagnosis",evidence:{business_diagnosis:sealed}});
    assert.equal(Object.prototype.hasOwnProperty.call(result.evidence.business_diagnosis,"authenticity_key_id"),false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.evidence.business_diagnosis,"authenticity_mac"),false);
    assert.equal(result.evidence.business_diagnosis.authenticity_status,"AUTHENTICATED");
  } finally {
    if(oldId===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID=oldId;
    if(oldRing===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=oldRing;
  }
});


test("scoped diagnosis proof verifies only in its persisted organization conversation and entity", () => {
  const oldId=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID;
  const oldRing=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON;
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID="k1";
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=JSON.stringify({k1:"11".repeat(32)});
  try {
    const evidence=diagnosisEvidence({answer:"diagnosis"});
    const sealed=sealBusinessDiagnosisProofAuthenticity({
      ...evidence.business_diagnosis,
      scope_organization_id:"org-a",
      scope_conversation_id:"conv-a",
      scope_entity_id:"entity-a",
    }).proof;
    assert.equal(verifyBusinessDiagnosisProofScope(sealed,{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a"}).status,"SCOPE_VERIFIED");
    assert.equal(verifyBusinessDiagnosisProofScope(sealed,{organization_id:"org-b",conversation_id:"conv-a",entity_id:"entity-a"}).status,"SCOPE_ORGANIZATION_MISMATCH");
    assert.equal(verifyBusinessDiagnosisProofScope(sealed,{organization_id:"org-a",conversation_id:"conv-b",entity_id:"entity-a"}).status,"SCOPE_CONVERSATION_MISMATCH");
    assert.equal(verifyBusinessDiagnosisProofScope(sealed,{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-b"}).status,"SCOPE_ENTITY_MISMATCH");
  } finally {
    if(oldId===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID=oldId;
    if(oldRing===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=oldRing;
  }
});

test("replayed scoped diagnosis is quarantined from model context", () => {
  const oldId=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID;
  const oldRing=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON;
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID="k1";
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=JSON.stringify({k1:"11".repeat(32)});
  try {
    const evidence=diagnosisEvidence({answer:"diagnosis"});
    const sealed=sealBusinessDiagnosisProofAuthenticity({...evidence.business_diagnosis,scope_organization_id:"org-a",scope_conversation_id:"conv-a",scope_entity_id:"entity-a"}).proof;
    const rows=[{role:"assistant",content:"diagnosis",evidence:{business_diagnosis:sealed}},{role:"user",content:"why?",evidence:{}}];
    assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows,{organization_id:"org-b",conversation_id:"conv-a",entity_id:"entity-a"}),[]);
    assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows,{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a"}),[{role:"user",content:"why?"},{role:"assistant",content:"diagnosis"}]);
  } finally {
    if(oldId===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID=oldId;
    if(oldRing===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=oldRing;
  }
});


test("legacy unscoped diagnosis remains compatible when scope requirement is disabled", () => {
  const oldRequired=process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_REQUIRED;
  delete process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_REQUIRED;
  try {
    const result=businessDiagnosisTurnVerification({role:"assistant",content:"diagnosis",evidence:diagnosisEvidence({answer:"diagnosis"})},{organization_id:"org",conversation_id:"conv"});
    assert.equal(result.safe,true);
    assert.equal(result.scope_status,"SCOPE_NOT_BOUND");
  } finally {
    if(oldRequired===undefined) delete process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_REQUIRED; else process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_REQUIRED=oldRequired;
  }
});

test("required scope quarantines legacy unscoped diagnosis history", () => {
  const oldRequired=process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_REQUIRED;
  process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_REQUIRED="true";
  try {
    const result=businessDiagnosisTurnVerification({role:"assistant",content:"diagnosis",evidence:diagnosisEvidence({answer:"diagnosis"})},{organization_id:"org",conversation_id:"conv"});
    assert.equal(result.safe,false);
    assert.equal(result.status,"SCOPE_REQUIRED");
    assert.equal(result.scope_status,"SCOPE_REQUIRED");
  } finally {
    if(oldRequired===undefined) delete process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_REQUIRED; else process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_REQUIRED=oldRequired;
  }
});


test("scoped diagnosis period mismatch is excluded from future model context", () => {
  const oldId=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID;
  const oldRing=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON;
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID="k1";
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=JSON.stringify({k1:"11".repeat(32)});
  try {
    const evidence=diagnosisEvidence({answer:"diagnosis"});
    const sealed=sealBusinessDiagnosisProofAuthenticity({...evidence.business_diagnosis,scope_organization_id:"org-a",scope_conversation_id:"conv-a",scope_entity_id:"entity-a",scope_period_id:"2026-09"}).proof;
    const rows=[{role:"assistant",content:"diagnosis",evidence:{business_diagnosis:sealed}},{role:"user",content:"why?",evidence:{}}];
    assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows,{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a",period_id:"2026-10"}),[]);
    assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows,{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a",period_id:"2026-09"}),[{role:"user",content:"why?"},{role:"assistant",content:"diagnosis"}]);
  } finally {
    if(oldId===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID=oldId;
    if(oldRing===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=oldRing;
  }
});

test("historical snapshot remains visible after active period changes", () => {
  const oldId=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID;
  const oldRing=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON;
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID="k1";
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=JSON.stringify({k1:"11".repeat(32)});
  try {
    const evidence=diagnosisEvidence({answer:"diagnosis"});
    const sealed=sealBusinessDiagnosisProofAuthenticity({...evidence.business_diagnosis,scope_organization_id:"org-a",scope_conversation_id:"conv-a",scope_entity_id:"entity-a",scope_period_id:"2026-09"}).proof;
    const snapshot=sanitizeBusinessDiagnosisSnapshotTurn({role:"assistant",content:"diagnosis",evidence:{business_diagnosis:sealed},decision:{response_text:"diagnosis"}},{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a"});
    assert.equal(snapshot.content,"diagnosis");
    assert.equal(snapshot.evidence.business_diagnosis.scope_verified,true);
  } finally {
    if(oldId===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID=oldId;
    if(oldRing===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=oldRing;
  }
});


test("period-scoped diagnosis is excluded from model context when active period is unavailable", () => {
  const oldId=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID;
  const oldRing=process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON;
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID="k1";
  process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=JSON.stringify({k1:"11".repeat(32)});
  try {
    const evidence=diagnosisEvidence({answer:"diagnosis"});
    const sealed=sealBusinessDiagnosisProofAuthenticity({...evidence.business_diagnosis,scope_organization_id:"org-a",scope_conversation_id:"conv-a",scope_entity_id:"entity-a",scope_period_id:"2026-09"}).proof;
    const rows=[{role:"assistant",content:"diagnosis",evidence:{business_diagnosis:sealed}},{role:"user",content:"why?",evidence:{}}];
    assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows,{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a",require_period_context:true}),[]);
    const verification=businessDiagnosisTurnVerification(rows[0],{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a",require_period_context:true});
    assert.equal(verification.status,"SCOPE_PERIOD_CONTEXT_MISSING");
  } finally {
    if(oldId===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID=oldId;
    if(oldRing===undefined) delete process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON; else process.env.AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=oldRing;
  }
});


test("governed diagnosis readiness failure pair stays out of future model context", () => {
  const rows=[
    {role:"assistant",content:"not started",evidence:{business_diagnosis_readiness_failure:{code:"BUSINESS_DIAGNOSIS_NOT_READY",authority_effect:"NONE"}}},
    {role:"user",content:"why did profit drop?",evidence:{}},
    {role:"assistant",content:"normal answer",evidence:{}},
    {role:"user",content:"hello",evidence:{}},
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows),[
    {role:"user",content:"hello"},
    {role:"assistant",content:"normal answer"},
  ]);
});

test("governed diagnosis integrity failure pair stays out of future model context", () => {
  const rows=[
    {role:"assistant",content:"proof failed",evidence:{business_diagnosis_integrity_failure:{code:"BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_FAILURE",stage:"LIVE_PROOF_REJECTED",authority_effect:"NONE"}}},
    {role:"user",content:"why is revenue down?",evidence:{}},
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows),[]);
});

test("governed diagnosis failure turn remains visible in historical snapshot", () => {
  const turn={role:"assistant",content:"proof failed",evidence:{business_diagnosis_integrity_failure:{code:"BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_FAILURE",authority_effect:"NONE"}},decision:{response_text:"proof failed"}};
  assert.deepEqual(sanitizeBusinessDiagnosisSnapshotTurn(turn),turn);
});


test("failure pair uses exact persisted user turn id even when timestamp ordering is ambiguous", () => {
  const rows=[
    {id:"assistant-failure",role:"assistant",content:"proof failed",evidence:{business_diagnosis_integrity_failure:{code:"BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_FAILURE"},diagnosis_failure_pair:{user_turn_id:"user-target",authority_effect:"NONE"}},created_at:"2026-09-18T10:00:00.000Z"},
    {id:"user-other",role:"user",content:"keep me",evidence:{},created_at:"2026-09-18T10:00:00.000Z"},
    {id:"user-target",role:"user",content:"remove me",evidence:{},created_at:"2026-09-18T10:00:00.000Z"},
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows),[{role:"user",content:"keep me"}]);
});

test("duplicate governed failure turns tied to the same user do not leak the request", () => {
  const rows=[
    {id:"f2",role:"assistant",content:"failure two",evidence:{business_diagnosis_readiness_failure:{code:"BUSINESS_DIAGNOSIS_NOT_READY"},diagnosis_failure_pair:{user_turn_id:"u1"}}},
    {id:"f1",role:"assistant",content:"failure one",evidence:{business_diagnosis_readiness_failure:{code:"BUSINESS_DIAGNOSIS_NOT_READY"},diagnosis_failure_pair:{user_turn_id:"u1"}}},
    {id:"u1",role:"user",content:"diagnose this",evidence:{}},
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows),[]);
});


test("unsafe diagnosis removes its exact persisted user turn id despite ambiguous ordering", () => {
  const evidence=diagnosisEvidence({answer:"original diagnosis"});
  evidence.business_diagnosis.scope_user_turn_id="user-target";
  const rows=[
    {id:"assistant-diagnosis",role:"assistant",content:"tampered diagnosis",evidence,created_at:"2026-09-18T10:00:00.000Z"},
    {id:"user-other",role:"user",content:"keep me",evidence:{},created_at:"2026-09-18T10:00:00.000Z"},
    {id:"user-target",role:"user",content:"remove me",evidence:{},created_at:"2026-09-18T10:00:00.000Z"},
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows),[{role:"user",content:"keep me"}]);
});

test("duplicate unsafe diagnosis turns tied to the same exact request do not leak it", () => {
  const first=diagnosisEvidence({answer:"one"});
  const second=diagnosisEvidence({answer:"two"});
  first.business_diagnosis.scope_user_turn_id="u1";
  second.business_diagnosis.scope_user_turn_id="u1";
  const rows=[
    {id:"d2",role:"assistant",content:"tampered two",evidence:second},
    {id:"d1",role:"assistant",content:"tampered one",evidence:first},
    {id:"u1",role:"user",content:"diagnose this",evidence:{}},
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows),[]);
});


test("legacy scoped diagnosis without checksum stays compatible when checksum requirement is disabled", () => {
  const oldRequired=process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_CHECKSUM_REQUIRED;
  delete process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_CHECKSUM_REQUIRED;
  try {
    const evidence=diagnosisEvidence({answer:"diagnosis"});
    Object.assign(evidence.business_diagnosis,{scope_organization_id:"org-a",scope_conversation_id:"conv-a",scope_entity_id:"entity-a"});
    const result=businessDiagnosisTurnVerification({role:"assistant",content:"diagnosis",evidence},{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a"});
    assert.equal(result.safe,true);
    assert.equal(result.scope_checksum_status,"SCOPE_CHECKSUM_NOT_AVAILABLE");
  } finally {
    if(oldRequired===undefined) delete process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_CHECKSUM_REQUIRED; else process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_CHECKSUM_REQUIRED=oldRequired;
  }
});

test("required scope checksum quarantines legacy scoped diagnosis without checksum", () => {
  const oldRequired=process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_CHECKSUM_REQUIRED;
  process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_CHECKSUM_REQUIRED="true";
  try {
    const evidence=diagnosisEvidence({answer:"diagnosis"});
    Object.assign(evidence.business_diagnosis,{scope_organization_id:"org-a",scope_conversation_id:"conv-a",scope_entity_id:"entity-a"});
    const result=businessDiagnosisTurnVerification({role:"assistant",content:"diagnosis",evidence},{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a"});
    assert.equal(result.safe,false);
    assert.equal(result.scope_checksum_status,"SCOPE_CHECKSUM_NOT_AVAILABLE");
  } finally {
    if(oldRequired===undefined) delete process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_CHECKSUM_REQUIRED; else process.env.AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_CHECKSUM_REQUIRED=oldRequired;
  }
});


test("diagnosis pair is excluded when originating persisted user text is altered", () => {
  const evidence=diagnosisEvidence({answer:"diagnosis"});
  const scoped=bindBusinessDiagnosisScopeChecksum({...evidence.business_diagnosis,scope_user_turn_id:"u1",scope_user_content_fingerprint:businessDiagnosisUserTurnContentFingerprint("why did profit drop?")});
  const rows=[
    {id:"d1",role:"assistant",content:"diagnosis",evidence:{business_diagnosis:scoped}},
    {id:"u1",role:"user",content:"show invoices",evidence:{}},
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows),[]);
});

test("diagnosis pair remains reusable when originating persisted user text matches", () => {
  const evidence=diagnosisEvidence({answer:"diagnosis"});
  const scoped=bindBusinessDiagnosisScopeChecksum({...evidence.business_diagnosis,scope_user_turn_id:"u1",scope_user_content_fingerprint:businessDiagnosisUserTurnContentFingerprint("why did profit drop?")});
  const rows=[
    {id:"d1",role:"assistant",content:"diagnosis",evidence:{business_diagnosis:scoped}},
    {id:"u1",role:"user",content:"why did profit drop?",evidence:{}},
  ];
  assert.deepEqual(sanitizeBusinessDiagnosisConversation(rows),[{role:"user",content:"why did profit drop?"},{role:"assistant",content:"diagnosis"}]);
});


test("historical snapshot quarantines diagnosis when originating user text was tampered", () => {
  const evidence=diagnosisEvidence({answer:"diagnosis"});
  const scoped=bindBusinessDiagnosisScopeChecksum({...evidence.business_diagnosis,scope_user_turn_id:"u1",scope_user_content_fingerprint:businessDiagnosisUserTurnContentFingerprint("why did profit drop?")});
  const rows=[
    {id:"u1",role:"user",content:"show invoices",evidence:{}},
    {id:"d1",role:"assistant",content:"diagnosis",decision:{response_text:"diagnosis"},evidence:{business_diagnosis:scoped},execution:{x:1},navigation:{target_id:"finance"}},
  ];
  const result=sanitizeBusinessDiagnosisSnapshot(rows);
  assert.equal(result[0].content,"show invoices");
  assert.match(result[1].content,/historical diagnosis is hidden/i);
  assert.equal(result[1].evidence.business_diagnosis.origin_user_verification_status,"ORIGIN_USER_CONTENT_MISMATCH");
  assert.equal(result[1].evidence.business_diagnosis.origin_user_verified,false);
  assert.deepEqual(result[1].execution,{});
  assert.deepEqual(result[1].navigation,{});
});

test("historical snapshot keeps diagnosis verified when originating user text still matches", () => {
  const evidence=diagnosisEvidence({answer:"diagnosis"});
  const scoped=bindBusinessDiagnosisScopeChecksum({...evidence.business_diagnosis,scope_user_turn_id:"u1",scope_user_content_fingerprint:businessDiagnosisUserTurnContentFingerprint("why did profit drop?")});
  const rows=[
    {id:"u1",role:"user",content:"why did profit drop?",evidence:{}},
    {id:"d1",role:"assistant",content:"diagnosis",decision:{response_text:"diagnosis"},evidence:{business_diagnosis:scoped}},
  ];
  const result=sanitizeBusinessDiagnosisSnapshot(rows);
  assert.equal(result[1].content,"diagnosis");
  assert.equal(result[1].evidence.business_diagnosis.origin_user_verification_status,"ORIGIN_USER_VERIFIED");
  assert.equal(result[1].evidence.business_diagnosis.origin_user_verified,true);
  assert.equal(result[1].evidence.business_diagnosis.audit_projection_verified,true);
});
