function text(value) {
  return String(value ?? "").trim();
}

function normalizedReference(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function directionFromTransactionType(value) {
  const type = text(value).toUpperCase();
  if (["DEPOSIT", "CREDIT", "IN", "INFLOW", "RECEIPT"].includes(type)) return "IN";
  if (["WITHDRAWAL", "DEBIT", "OUT", "OUTFLOW", "PAYMENT"].includes(type)) return "OUT";
  return null;
}

function sameEvidence(statement, transaction) {
  const statementDirection = text(statement.direction).toUpperCase();
  if (!statementDirection || directionFromTransactionType(transaction.type) !== statementDirection) return false;
  if (Number(statement.amount) !== Number(transaction.amount)) return false;
  if (text(statement.transaction_date).slice(0, 10) !== text(transaction.transaction_date).slice(0, 10)) return false;
  const a = normalizedReference(statement.reference_number);
  const b = normalizedReference(transaction.reference);
  if (a && b && a !== b) return false;
  return true;
}
export function matchStatementPaymentEvidence({ statements = [], transactions = [] } = {}) {
  const available = new Map(transactions.map((row) => [row.id, row]));
  const matches = [];
  const unmatched = [];

  for (const statement of statements) {
    const candidates = [...available.values()].filter((transaction) => sameEvidence(statement, transaction));
    const statementRef = normalizedReference(statement.reference_number);
    const exactRef = statementRef
      ? candidates.filter((transaction) => normalizedReference(transaction.reference) === statementRef)
      : [];
    const eligible = exactRef.length ? exactRef : candidates;

    if (eligible.length !== 1) {
      unmatched.push({
        statement_id: statement.id,
        reason: eligible.length > 1 ? "AMBIGUOUS_PAYMENT_EVIDENCE" : "PAYMENT_EVIDENCE_NOT_FOUND",
      });
      continue;
    }

    const transaction = eligible[0];
    available.delete(transaction.id);
    matches.push({
      statement_id: statement.id,
      bank_transaction_id: transaction.id,
      match_basis: statementRef ? "DATE_AMOUNT_DIRECTION_REFERENCE" : "DATE_AMOUNT_DIRECTION_UNIQUE",
    });
  }

  return {
    contract: "BANK_STATEMENT_PAYMENT_EVIDENCE_MATCH_V1",
    matched_count: matches.length,
    unmatched_count: unmatched.length,
    matches,
    unmatched,
    reconciliation_authority: false,
  };
}

export async function buildStatementPaymentEvidenceReport({
  organizationId,
  entityId,
  bankAccountId,
  statementImportId,
} = {}) {
  if (!text(organizationId) || !text(entityId) || !text(bankAccountId) || !text(statementImportId)) {
    throw new Error("statement evidence scope required");
  }

  const { supabaseAdmin } = await import("../../shared/supabase/admin.js");
  const statementResult = await supabaseAdmin
    .from("bank_statements")
    .select("id,transaction_date,amount,direction,reference_number")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("bank_account_id", bankAccountId)
    .eq("statement_import_id", statementImportId)
    .order("statement_line_number", { ascending: true });
  if (statementResult.error) throw statementResult.error;
  const statements = statementResult.data || [];
  if (!statements.length) {
    return {
      contract: "BANK_STATEMENT_PAYMENT_EVIDENCE_MATCH_V1",
      matched_count: 0,
      unmatched_count: 0,
      matches: [],
      unmatched: [],
      reconciliation_authority: false,
    };
  }

  const dates = statements.map((row) => text(row.transaction_date).slice(0, 10)).filter(Boolean).sort();
  let transactionQuery = supabaseAdmin
    .from("bank_transactions")
    .select("id,transaction_date,amount,type,reference")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("bank_account_id", bankAccountId);
  if (dates[0]) transactionQuery = transactionQuery.gte("transaction_date", dates[0]);
  if (dates.at(-1)) transactionQuery = transactionQuery.lte("transaction_date", dates.at(-1));
  const transactionResult = await transactionQuery;
  if (transactionResult.error) throw transactionResult.error;

  return matchStatementPaymentEvidence({
    statements,
    transactions: transactionResult.data || [],
  });
}

export default buildStatementPaymentEvidenceReport;
