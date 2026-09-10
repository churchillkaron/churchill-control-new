const BANK_STATEMENT_CAPABILITY = "finance.bank_statements.create";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function integer(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

export function deterministicFinanceExecutionVerification({ capability, result } = {}) {
  if (text(capability?.key) !== BANK_STATEMENT_CAPABILITY) return null;
  const action = object(result);
  if (action.success !== true || action.imported !== true) return null;

  const lineCount = integer(action.line_count);
  const reconciliation = object(action.reconciliation);
  const paymentEvidence = object(action.payment_evidence);
  const parts = [
    `Bank statement imported${lineCount !== null ? ` with ${lineCount} transaction line${lineCount === 1 ? "" : "s"}` : ""}.`,
  ];
  const matched = integer(reconciliation.matched_count);
  const unmatched = integer(reconciliation.unmatched_count);
  if (reconciliation.success === false || text(reconciliation.status) === "REVIEW_REQUIRED") {
    parts.push("Automatic accounting reconciliation needs review; the import itself completed successfully.");
  } else if (matched !== null || unmatched !== null) {
    parts.push(`Accounting reconciliation matched ${matched ?? 0}; ${unmatched ?? 0} remain${(unmatched ?? 0) === 1 ? "s" : ""} unmatched.`);
  }

  const evidenceMatched = integer(paymentEvidence.matched_count);
  const evidenceUnmatched = integer(paymentEvidence.unmatched_count);
  if (paymentEvidence.reconciliation_authority === false && (evidenceMatched !== null || evidenceUnmatched !== null)) {
    parts.push(`${evidenceMatched ?? 0} line${(evidenceMatched ?? 0) === 1 ? "" : "s"} matched known payment evidence; this evidence is not itself accounting reconciliation.`);
  }

  return {
    response_text: parts.join(" "),
    provider_evidence: {
      provider: "avantiqo-local",
      model: "finance-bank-statement-result-v1",
      usage_id: null,
      pricing_id: null,
    },
  };
}

export default deterministicFinanceExecutionVerification;
