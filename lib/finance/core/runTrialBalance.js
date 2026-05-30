import { supabase } from "@/lib/supabase";

export async function runTrialBalance({
  tenantId,
}) {
  const journals =
    await supabase
      .from(
        "accounting_journal_entries"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  const balances = {};

  for (const row of journals.data || []) {
    if (
      !balances[row.account_code]
    ) {
      balances[row.account_code] =
        {
          debit: 0,
          credit: 0,
        };
    }

    if (
      row.entry_type ===
      "DEBIT"
    ) {
      balances[
        row.account_code
      ].debit += Number(
        row.amount || 0
      );
    }

    if (
      row.entry_type ===
      "CREDIT"
    ) {
      balances[
        row.account_code
      ].credit += Number(
        row.amount || 0
      );
    }
  }

  const inserts =
    Object.entries(
      balances
    ).map(
      ([
        account,
        values,
      ]) => ({
        tenant_id: tenantId,
        account_code:
          account,
        debit_balance:
          values.debit,
        credit_balance:
          values.credit,
        balance_difference:
          values.debit -
          values.credit,
      })
    );

  const { data, error } =
    await supabase
      .from(
        "trial_balance_snapshots"
      )
      .insert(inserts)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
