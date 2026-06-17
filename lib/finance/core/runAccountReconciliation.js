import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runAccountReconciliation({
  tenantId,
  accountCode,
  accountId,
  sourceBalance,
}) {
  let query = supabase
    .from("general_ledger")
    .select("*")
    .eq("tenant_id", tenantId);

  if (accountId) {
    query = query.eq("account_id", accountId);
  } else {
    query = query.eq("account_code", accountCode);
  }

  const { data: ledger, error } = await query;

  if (error) {
    throw error;
  }

  let ledgerBalance = 0;

  for (const row of ledger || []) {
    ledgerBalance += Number(row.debit || 0);
    ledgerBalance -= Number(row.credit || 0);
  }

  const variance =
    ledgerBalance -
    Number(sourceBalance || 0);

  const status =
    Math.abs(variance) < 1
      ? "matched"
      : "variance";

  const { data, error: insertError } = await supabase
    .from("account_reconciliation_items")
    .insert({
      tenant_id: tenantId,
      account_id: accountId || null,
      account_code: accountCode || null,
      ledger_balance: ledgerBalance,
      source_balance: sourceBalance,
      variance_amount: variance,
      reconciliation_status: status,
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  return data;
}
