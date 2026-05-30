import { supabase } from "@/lib/supabase";

export async function getTrialBalance({
  tenantId,
}) {
  const { data, error } = await supabase
    .from("journal_entry_lines")
    .select(`
      debit,
      credit,
      chart_of_accounts (
        id,
        code,
        name,
        type
      )
    `)
    .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  const grouped = {};

  for (const line of data) {
    const account = line.chart_of_accounts;

    if (!grouped[account.id]) {
      grouped[account.id] = {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debit: 0,
        credit: 0,
      };
    }

    grouped[account.id].debit += Number(line.debit || 0);
    grouped[account.id].credit += Number(line.credit || 0);
  }

  return Object.values(grouped);
}
