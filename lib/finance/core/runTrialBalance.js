import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runTrialBalance({
  tenantId,
}) {
  const { data: ledger, error } = await supabase
    .from("general_ledger")
    .select("*")
    .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  const balances = {};

  for (const row of ledger || []) {
    const accountKey =
      row.account_id ||
      row.account_code ||
      row.account_name ||
      "UNKNOWN_ACCOUNT";

    if (!balances[accountKey]) {
      balances[accountKey] = {
        account_id: row.account_id || null,
        account_code: row.account_code || null,
        account_name: row.account_name || null,
        debit: 0,
        credit: 0,
      };
    }

    balances[accountKey].debit += Number(row.debit || 0);
    balances[accountKey].credit += Number(row.credit || 0);
  }

  const inserts = Object.values(balances).map((values) => ({
    tenant_id: tenantId,
    account_id: values.account_id,
    account_code: values.account_code,
    account_name: values.account_name,
    debit_balance: Number(values.debit.toFixed(2)),
    credit_balance: Number(values.credit.toFixed(2)),
    balance_difference: Number((values.debit - values.credit).toFixed(2)),
  }));

  if (inserts.length === 0) {
    return [];
  }

  const { data, error: insertError } = await supabase
    .from("trial_balance_snapshots")
    .insert(inserts)
    .select();

  if (insertError) {
    throw insertError;
  }

  return data;
}
