import { verifyBusinessDiagnosisProofAuthenticity, businessDiagnosisProofAuthenticityAcceptable, redactBusinessDiagnosisProofForClient, verifyBusinessDiagnosisProofScope, businessDiagnosisProofScopeAcceptable, verifyBusinessDiagnosisOriginatingUserTurn, businessDiagnosisOriginatingUserAcceptable } from "../../intelligence/runtime/AvantiqoBusinessDiagnosisProofAuthenticityRuntime.js";
import { verifyBusinessDiagnosisAuditProjection, verifyBusinessDiagnosisAnswerContent } from "../../intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}


function governedDiagnosisFailureTurn(row = {}) {
  if (row?.role !== "assistant") return false;
  const evidence = object(row?.evidence);
  return Boolean(
    Object.keys(object(evidence.business_diagnosis_readiness_failure)).length ||
    Object.keys(object(evidence.business_diagnosis_integrity_failure)).length
  );
}


function governedDiagnosisFailurePairedUserTurnId(row = {}) {
  if (!governedDiagnosisFailureTurn(row)) return null;
  return text(object(row?.evidence)?.diagnosis_failure_pair?.user_turn_id) || null;
}


function diagnosisPairedUserTurnId(row = {}) {
  if (row?.role !== "assistant") return null;
  return text(object(row?.evidence)?.business_diagnosis?.scope_user_turn_id) || null;
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
    scope_checksum_status: scopeVerification.checksum_status || null,
  };
}

export function sanitizeBusinessDiagnosisConversation(rows = [], expectedScope = {}, supportRows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const pairedFailureUserIds = new Set(
    sourceRows.map((row) => governedDiagnosisFailurePairedUserTurnId(row)).filter(Boolean),
  );
  const verificationRows = [...sourceRows, ...(Array.isArray(supportRows) ? supportRows : [])];
  const userTurnsById = new Map(
    verificationRows.filter((row) => row?.role === "user" && text(row?.id)).map((row) => [text(row.id), row]),
  );
  const unsafeDiagnosisUserIds = new Set();
  const originUnsafeDiagnosisIds = new Set();
  for (const row of sourceRows) {
    const verification = businessDiagnosisTurnVerification(row, expectedScope);
    if (!verification.diagnosis) continue;
    const pairedUserTurnId = diagnosisPairedUserTurnId(row);
    if (!verification.safe) {
      if (pairedUserTurnId) unsafeDiagnosisUserIds.add(pairedUserTurnId);
      continue;
    }
    const originVerification = verifyBusinessDiagnosisOriginatingUserTurn(
      object(row?.evidence)?.business_diagnosis,
      pairedUserTurnId ? userTurnsById.get(pairedUserTurnId) || {} : {},
    );
    if (!businessDiagnosisOriginatingUserAcceptable(originVerification)) {
      if (pairedUserTurnId) unsafeDiagnosisUserIds.add(pairedUserTurnId);
      if (text(row?.id)) originUnsafeDiagnosisIds.add(text(row.id));
    }
  }
  const chronological = sourceRows.slice().reverse();
  const safeRows = [];
  for (const row of chronological) {
    if (row?.role === "user" && (pairedFailureUserIds.has(text(row?.id)) || unsafeDiagnosisUserIds.has(text(row?.id)))) continue;
    if (governedDiagnosisFailureTurn(row)) {
      if (!governedDiagnosisFailurePairedUserTurnId(row)) {
        const previous = safeRows.at(-1);
        if (previous?.role === "user") safeRows.pop();
      }
      continue;
    }
    const verification = businessDiagnosisTurnVerification(row, expectedScope);
    if (originUnsafeDiagnosisIds.has(text(row?.id))) {
      if (!diagnosisPairedUserTurnId(row)) {
        const previous = safeRows.at(-1);
        if (previous?.role === "user") safeRows.pop();
      }
      continue;
    }
    if (verification.diagnosis && !verification.safe) {
      if (!diagnosisPairedUserTurnId(row)) {
        const previous = safeRows.at(-1);
        if (previous?.role === "user") safeRows.pop();
      }
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


export function sanitizeBusinessDiagnosisSnapshotTurn(turn = {}, expectedScope = {}, originatingUserTurn = null) {
  const evidence = object(turn?.evidence);
  const diagnosis = object(evidence?.business_diagnosis);
  if (!Object.keys(diagnosis).length) return turn;
  const verification = businessDiagnosisTurnVerification(turn, expectedScope);
  const originVerification = verification.safe === true
    ? verifyBusinessDiagnosisOriginatingUserTurn(diagnosis, originatingUserTurn || {})
    : { status: "NOT_CHECKED", verified: false, legacy: false };
  const originSafe = businessDiagnosisOriginatingUserAcceptable(originVerification);
  const proofVerified = verification.safe === true && originSafe;
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
    scope_checksum_verification_status: verification.scope_checksum_status || null,
    origin_user_verification_status: originVerification.status || null,
    origin_user_verified: originVerification.verified === true,
    origin_user_accepted: originSafe,
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

export function sanitizeBusinessDiagnosisSnapshot(rows = [], expectedScope = {}, supportRows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const verificationRows = [...sourceRows, ...(Array.isArray(supportRows) ? supportRows : [])];
  const userTurnsById = new Map(
    verificationRows.filter((row) => row?.role === "user" && text(row?.id)).map((row) => [text(row.id), row]),
  );
  return sourceRows.map((turn) => {
    const pairedUserTurnId = diagnosisPairedUserTurnId(turn);
    const originatingUserTurn = pairedUserTurnId ? userTurnsById.get(pairedUserTurnId) || null : null;
    return sanitizeBusinessDiagnosisSnapshotTurn(turn, expectedScope, originatingUserTurn);
  });
}

export const BusinessDiagnosisConversationSanitizerRuntime = Object.freeze({
  verifyTurn: businessDiagnosisTurnVerification,
  isGovernedFailureTurn: governedDiagnosisFailureTurn,
  pairedUserTurnId: governedDiagnosisFailurePairedUserTurnId,
  diagnosisPairedUserTurnId,
  sanitize: sanitizeBusinessDiagnosisConversation,
  sanitizeSnapshotTurn: sanitizeBusinessDiagnosisSnapshotTurn,
  sanitizeSnapshot: sanitizeBusinessDiagnosisSnapshot,
});
