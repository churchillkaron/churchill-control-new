import { supabase } from "@/lib/supabase";

export async function getLedgerBalances({
  tenantId,
  startDate,
  endDate,
}) {
  let query = supabase
    .from("general_ledger_entries")
    .select(`
      account_id,
      debit,
      credit,
      balance,
      entry_date,
      chart_of_accounts (
        code,
        name,
        type
      )
    `)
    .eq("tenant_id", tenantId);

  if (startDate) {
    query = query.gte("entry_date", startDate);
  }

  if (endDate) {
    query = query.lte("entry_date", endDate);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const grouped = {};

  for (const row of data || []) {
    const account = row.chart_of_accounts;

    if (!account) continue;

    if (!grouped[row.account_id]) {
      grouped[row.account_id] = {
        accountId: row.account_id,
        code: account.code,
        name: account.name,
        type: account.type,
        debit: 0,
        credit: 0,
        balance: 0,
      };
    }

    grouped[row.account_id].debit += Number(row.debit || 0);
    grouped[row.account_id].credit += Number(row.credit || 0);
    grouped[row.account_id].balance += Number(row.balance || 0);
  }

  return Object.values(grouped);
}
