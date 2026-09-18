import { verifyBusinessDiagnosisAuditProjection, verifyBusinessDiagnosisAnswerContent } from "../../intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

export function businessDiagnosisTurnVerification(row = {}) {
  if (row?.role !== "assistant") return { diagnosis: false, safe: true, status: "NOT_APPLICABLE" };
  const evidence = object(row?.evidence);
  const diagnosis = object(evidence?.business_diagnosis);
  if (!Object.keys(diagnosis).length) return { diagnosis: false, safe: true, status: "NOT_APPLICABLE" };
  const verification = verifyBusinessDiagnosisAuditProjection(diagnosis);
  const metadataSafe = verification.status === "VERIFIED" || verification.status === "VERIFIED_LEGACY";
  const answerVerification = metadataSafe ? verifyBusinessDiagnosisAnswerContent(diagnosis,row?.content) : {status:"NOT_CHECKED",verified:false};
  const answerSafe = verification.status === "VERIFIED_LEGACY" || answerVerification.status === "VERIFIED";
  return {
    diagnosis: true,
    safe: metadataSafe && answerSafe,
    status: metadataSafe && !answerSafe ? "ANSWER_MISMATCH" : verification.status,
    metadata_status: verification.status,
    answer_status: answerVerification.status,
  };
}

export function sanitizeBusinessDiagnosisConversation(rows = []) {
  const chronological = (Array.isArray(rows) ? rows : []).slice().reverse();
  const safeRows = [];
  for (const row of chronological) {
    const verification = businessDiagnosisTurnVerification(row);
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


export function sanitizeBusinessDiagnosisSnapshotTurn(turn = {}) {
  const evidence = object(turn?.evidence);
  const diagnosis = object(evidence?.business_diagnosis);
  if (!Object.keys(diagnosis).length) return turn;
  const verification = businessDiagnosisTurnVerification(turn);
  const proofVerified = verification.safe === true;
  const verifiedDiagnosis = {
    ...diagnosis,
    audit_projection_verification_status: verification.status,
    audit_projection_verified: proofVerified,
    answer_content_verification_status: verification.answer_status || null,
  };
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

export function sanitizeBusinessDiagnosisSnapshot(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((turn) => sanitizeBusinessDiagnosisSnapshotTurn(turn));
}

export const BusinessDiagnosisConversationSanitizerRuntime = Object.freeze({
  verifyTurn: businessDiagnosisTurnVerification,
  sanitize: sanitizeBusinessDiagnosisConversation,
  sanitizeSnapshotTurn: sanitizeBusinessDiagnosisSnapshotTurn,
  sanitizeSnapshot: sanitizeBusinessDiagnosisSnapshot,
});
