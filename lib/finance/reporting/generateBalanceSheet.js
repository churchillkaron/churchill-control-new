import { supabase } from "@/lib/supabase";

export async function generateBalanceSheet({
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

  let assets = 0;
  let liabilities = 0;
  let equity = 0;

  for (const line of data || []) {
    const account = line.chart_of_accounts;

    if (!account) continue;

    const value =
      Number(line.debit || 0) -
      Number(line.credit || 0);

    if (account.type === "asset") {
      assets += value;
    }

    if (account.type === "liability") {
      liabilities += Math.abs(value);
    }

    if (account.type === "equity") {
      equity += Math.abs(value);
    }
  }

  return {
    assets,
    liabilities,
    equity,
  };
}
