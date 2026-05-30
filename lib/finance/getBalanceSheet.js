import { supabase } from "@/lib/supabase";

export async function getBalanceSheet({
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

  const grouped = {
    assets: [],
    liabilities: [],
    equity: [],
  };

  for (const line of data) {
    const account = line.chart_of_accounts;

    if (!account) continue;

    const balance =
      Number(line.debit || 0) -
      Number(line.credit || 0);

    const item = {
      code: account.code,
      name: account.name,
      balance,
    };

    if (account.type === "asset") {
      grouped.assets.push(item);
    }

    if (account.type === "liability") {
      grouped.liabilities.push(item);
    }

    if (account.type === "equity") {
      grouped.equity.push(item);
    }
  }

  return grouped;
}
