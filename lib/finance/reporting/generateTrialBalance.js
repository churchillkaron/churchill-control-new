import { supabase } from "@/lib/supabase";

export async function generateTrialBalance({
  tenantId,
}) {
  const { data, error } = await supabase
    .from("journal_entry_lines")
    .select(`
      debit,
      credit,
      chart_of_accounts (
        code,
        name,
        type
      )
    `)
    .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  const balances = {};

  for (const line of data || []) {
    const account = line.chart_of_accounts;

    if (!account) continue;

    if (!balances[account.code]) {
      balances[account.code] = {
        code: account.code,
        name: account.name,
        debit: 0,
        credit: 0,
      };
    }

    balances[account.code].debit += Number(line.debit || 0);
    balances[account.code].credit += Number(line.credit || 0);
  }

  return Object.values(balances);
}
