import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runBankReconciliation({
  tenantId,
}) {
  const { data: statements, error: statementError } =
    await supabase
      .from("bank_statements")
      .select("*")
      .eq("tenant_id", tenantId);

  if (statementError) {
    throw statementError;
  }

  const { data: ledger, error: ledgerError } =
    await supabase
      .from("bank_ledger")
      .select("*")
      .eq("tenant_id", tenantId);

  if (ledgerError) {
    throw ledgerError;
  }

  let statementBalance = 0;

  for (const row of statements || []) {
    const amount = Number(row.amount || 0);
    const direction = String(row.direction || "").toLowerCase();

    statementBalance +=
      direction === "out" ||
      direction === "withdrawal" ||
      direction === "credit"
        ? -amount
        : amount;
  }

  let ledgerBalance = 0;

  for (const row of ledger || []) {
    const amount = Number(row.amount || 0);
    const direction = String(row.direction || "").toLowerCase();

    ledgerBalance +=
      direction === "out" ||
      direction === "withdrawal" ||
      direction === "credit"
        ? -amount
        : amount;
  }

  const variance =
    statementBalance -
    ledgerBalance;

  const unmatchedStatements =
    (statements || []).filter(
      (row) => row.matched !== true
    );

  return {
    tenantId,
    statementBalance,
    ledgerBalance,
    variance,
    status:
      Math.abs(variance) < 0.01
        ? "balanced"
        : "out_of_balance",
    unmatchedCount:
      unmatchedStatements.length,
    unmatchedStatements,
  };
}
