import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function optionalNumber(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be a valid number`);
  return number;
}

function signedLedgerAmount(row) {
  const amount = Number(row?.amount || 0);
  const direction = String(row?.direction || "").toUpperCase();
  if (direction === "OUTFLOW" || direction === "DEBIT") return -amount;
  if (direction === "INFLOW" || direction === "CREDIT") return amount;
  return amount;
}

export default async function runBankReconciliation({
  organization_id,
  entity_id,
  bank_account_id,
  bank_statement_id = null,
  reconciliation_date,
  book_closing_balance = null,
  statement_closing_balance = null,
  notes = null,
  created_by = null,
}) {
  const organizationId = required(organization_id, "organization_id");
  const entityId = required(entity_id, "entity_id");
  const bankAccountId = required(bank_account_id, "bank_account_id");
  const reconciliationDate = required(reconciliation_date, "reconciliation_date");

  const { data: bankAccount, error: bankError } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, account_name, bank_name, account_number, currency")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", bankAccountId)
    .maybeSingle();

  if (bankError) throw bankError;
  if (!bankAccount) {
    throw new Error("Bank account not found in organization and entity scope");
  }

  let statement = null;
  if (bank_statement_id) {
    const { data, error } = await supabaseAdmin
      .from("finance_bank_statement_imports")
      .select("id, bank_account_id, statement_number, statement_end_date, closing_balance, currency_code, status")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("bank_account_id", bankAccountId)
      .eq("id", bank_statement_id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error("Bank statement not found for selected bank account and entity");
    }
    statement = data;
  }

  let resolvedBookBalance = optionalNumber(book_closing_balance, "book_closing_balance");
  if (resolvedBookBalance === null) {
    const endOfDay = `${reconciliationDate}T23:59:59.999Z`;
    const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
      .from("bank_ledger")
      .select("amount, direction")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("bank_account_id", bankAccountId)
      .lte("created_at", endOfDay);

    if (ledgerError) throw ledgerError;
    resolvedBookBalance = (ledgerRows || []).reduce(
      (sum, row) => sum + signedLedgerAmount(row),
      0
    );
  }

  const resolvedStatementBalance =
    optionalNumber(statement_closing_balance, "statement_closing_balance") ??
    optionalNumber(statement?.closing_balance, "statement closing balance");

  if (resolvedStatementBalance === null) {
    throw new Error("statement_closing_balance or bank_statement_id required");
  }

  const difference = resolvedStatementBalance - resolvedBookBalance;
  const balanced = Math.abs(difference) <= 0.005;
  const now = new Date().toISOString();

  const { data: run, error: insertError } = await supabaseAdmin
    .from("finance_bank_reconciliation_runs")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      bank_account_id: bankAccountId,
      bank_statement_id: statement?.id || null,
      reconciliation_date: reconciliationDate,
      book_closing_balance: resolvedBookBalance,
      statement_closing_balance: resolvedStatementBalance,
      difference_amount: difference,
      notes: notes ? String(notes).trim() : null,
      status: balanced ? "BALANCED" : "OPEN",
      created_by: created_by || null,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;

  return {
    run,
    balanced,
    difference_amount: difference,
    bank_account: {
      id: bankAccount.id,
      account_name: bankAccount.account_name,
      bank_name: bankAccount.bank_name,
      account_number: bankAccount.account_number,
    },
    statement: statement
      ? {
          id: statement.id,
          statement_number: statement.statement_number,
          statement_end_date: statement.statement_end_date,
        }
      : null,
  };
}
