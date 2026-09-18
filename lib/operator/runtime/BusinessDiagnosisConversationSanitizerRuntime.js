import { verifyBusinessDiagnosisProofAuthenticity, businessDiagnosisProofAuthenticityAcceptable, redactBusinessDiagnosisProofForClient, verifyBusinessDiagnosisProofScope, businessDiagnosisProofScopeAcceptable } from "../../intelligence/runtime/AvantiqoBusinessDiagnosisProofAuthenticityRuntime.js";
import { verifyBusinessDiagnosisAuditProjection, verifyBusinessDiagnosisAnswerContent } from "../../intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

export function businessDiagnosisTurnVerification(row = {}, expectedScope = {}) {
  if (row?.role !== "assistant") return { diagnosis: false, safe: true, status: "NOT_APPLICABLE" };
  const evidence = object(row?.evidence);
  const diagnosis = object(evidence?.business_diagnosis);
  if (!Object.keys(diagnosis).length) return { diagnosis: false, safe: true, status: "NOT_APPLICABLE" };
  const verification = verifyBusinessDiagnosisAuditProjection(diagnosis);
  const metadataSafe = verification.status === "VERIFIED" || verification.status === "VERIFIED_LEGACY";
  const answerVerification = metadataSafe ? verifyBusinessDiagnosisAnswerContent(diagnosis,row?.content) : {status:"NOT_CHECKED",verified:false};
  const answerSafe = answerVerification.status === "VERIFIED" || answerVerification.status === "LEGACY_NOT_BOUND";
  const authenticityVerification = metadataSafe && answerSafe ? verifyBusinessDiagnosisProofAuthenticity(diagnosis) : {status:"NOT_CHECKED",verified:false};
  const authenticitySafe = businessDiagnosisProofAuthenticityAcceptable(authenticityVerification);
  const scopeVerification = metadataSafe && answerSafe && authenticitySafe ? verifyBusinessDiagnosisProofScope(diagnosis, expectedScope) : {status:"NOT_CHECKED",verified:false};
  const scopeSafe = businessDiagnosisProofScopeAcceptable(scopeVerification);
  const scopeStatus = !scopeSafe && scopeVerification.status === "SCOPE_NOT_BOUND" ? "SCOPE_REQUIRED" : scopeVerification.status;
  const status = !metadataSafe ? verification.status : !answerSafe ? "ANSWER_MISMATCH" : !authenticitySafe ? authenticityVerification.status : !scopeSafe ? scopeStatus : verification.status;
  return {
    diagnosis: true,
    safe: metadataSafe && answerSafe && authenticitySafe && scopeSafe,
    status,
    metadata_status: verification.status,
    receipt_status: verification.receipt_verification_status || verification.status,
    answer_status: answerVerification.status,
    authenticity_status: authenticityVerification.status,
    authenticity_verified: authenticityVerification.verified === true,
    scope_status: scopeStatus,
    scope_verified: scopeVerification.verified === true,
  };
}

export function sanitizeBusinessDiagnosisConversation(rows = [], expectedScope = {}) {
  const chronological = (Array.isArray(rows) ? rows : []).slice().reverse();
  const safeRows = [];
  for (const row of chronological) {
    const verification = businessDiagnosisTurnVerification(row, expectedScope);
    if (verification.diagnosis && !verification.safe) {
      const previous = safeRows.at(-1);
      if (previous?.role === "user") safeRows.pop();
      continue;
    }
    safeRows.push(row);
  }
  return safeRows
    .map((row) => ({
      role: row?.role === "assistant" ? "assistant" : "user",
      content: text(row?.content),
    }))
    .filter((row) => row.content);
}


export function sanitizeBusinessDiagnosisSnapshotTurn(turn = {}, expectedScope = {}) {
  const evidence = object(turn?.evidence);
  const diagnosis = object(evidence?.business_diagnosis);
  if (!Object.keys(diagnosis).length) return turn;
  const verification = businessDiagnosisTurnVerification(turn, expectedScope);
  const proofVerified = verification.safe === true;
  const verifiedDiagnosis = redactBusinessDiagnosisProofForClient({
    ...diagnosis,
    audit_projection_verification_status: verification.status,
    audit_projection_verified: proofVerified,
    receipt_contract_verification_status: verification.receipt_status || null,
    answer_content_verification_status: verification.answer_status || null,
    authenticity_status: verification.authenticity_status || null,
    authenticity_verified: verification.authenticity_verified === true,
    scope_verification_status: verification.scope_status || null,
    scope_verified: verification.scope_verified === true,
  });
  if (proofVerified) {
    return {
      ...turn,
      evidence: { ...evidence, business_diagnosis: verifiedDiagnosis },
    };
  }
  const quarantineMessage = "This historical diagnosis is hidden because its proof could not be verified. No action was executed. Re-run the diagnosis to obtain a verified answer.";
  return {
    ...turn,
    content: quarantineMessage,
    decision: { response_text: quarantineMessage },
    evidence: { business_diagnosis: verifiedDiagnosis },
    execution: {},
    navigation: {},
  };
}

export function sanitizeBusinessDiagnosisSnapshot(rows = [], expectedScope = {}) {
  return (Array.isArray(rows) ? rows : []).map((turn) => sanitizeBusinessDiagnosisSnapshotTurn(turn, expectedScope));
}

export const BusinessDiagnosisConversationSanitizerRuntime = Object.freeze({
  verifyTurn: businessDiagnosisTurnVerification,
  sanitize: sanitizeBusinessDiagnosisConversation,
  sanitizeSnapshotTurn: sanitizeBusinessDiagnosisSnapshotTurn,
  sanitizeSnapshot: sanitizeBusinessDiagnosisSnapshot,
});
