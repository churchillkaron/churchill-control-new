import { verifyBusinessDiagnosisAuditProjection } from "../../intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js";

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
  return {
    diagnosis: true,
    safe: verification.status === "VERIFIED" || verification.status === "VERIFIED_LEGACY",
    status: verification.status,
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

export const BusinessDiagnosisConversationSanitizerRuntime = Object.freeze({
  verifyTurn: businessDiagnosisTurnVerification,
  sanitize: sanitizeBusinessDiagnosisConversation,
});
