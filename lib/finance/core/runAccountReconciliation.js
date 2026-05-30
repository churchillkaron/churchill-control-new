import { supabase } from "@/lib/supabase";

export async function runAccountReconciliation({
  tenantId,
  accountCode,
  sourceBalance,
}) {
  const journals =
    await supabase
      .from(
        "accounting_journal_entries"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "account_code",
        accountCode
      );

  let ledgerBalance = 0;

  for (const row of journals.data || []) {
    if (
      row.entry_type ===
      "DEBIT"
    ) {
      ledgerBalance += Number(
        row.amount || 0
      );
    }

    if (
      row.entry_type ===
      "CREDIT"
    ) {
      ledgerBalance -= Number(
        row.amount || 0
      );
    }
  }

  const variance =
    ledgerBalance -
    Number(sourceBalance || 0);

  const status =
    Math.abs(variance) < 1
      ? "matched"
      : "variance";

  const { data, error } =
    await supabase
      .from(
        "account_reconciliation_items"
      )
      .insert({
        tenant_id: tenantId,
        account_code:
          accountCode,
        ledger_balance:
          ledgerBalance,
        source_balance:
          sourceBalance,
        variance_amount:
          variance,
        reconciliation_status:
          status,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
