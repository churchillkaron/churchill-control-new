import { supabase } from "@/lib/supabase";

export async function runBankReconciliation({
  tenantId,
  bankAccountId,
}) {
  const { data: transactions } =
    await supabase
      .from(
        "bank_transaction_imports"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "bank_account_id",
        bankAccountId
      );

  let bankBalance = 0;

  for (const row of transactions || []) {
    bankBalance += Number(
      row.amount || 0
    );
  }

  const { data: ledger } =
    await supabase
      .from(
        "general_ledger_entries"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  let ledgerBalance = 0;

  for (const row of ledger || []) {
    ledgerBalance +=
      Number(row.debit || 0) -
      Number(row.credit || 0);
  }

  const variance =
    bankBalance -
    ledgerBalance;

  const { data, error } =
    await supabase
      .from(
        "bank_reconciliations"
      )
      .insert({
        tenant_id: tenantId,
        bank_account_id:
          bankAccountId,
        bank_balance:
          bankBalance,
        ledger_balance:
          ledgerBalance,
        variance,
        reconciliation_status:
          Math.abs(variance) < 0.01
            ? "balanced"
            : "out_of_balance",
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
