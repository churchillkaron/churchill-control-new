import { supabase } from "@/lib/supabase";

export async function generateProfitLoss({
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

  let revenue = 0;
  let expenses = 0;

  for (const line of data || []) {
    const account = line.chart_of_accounts;

    if (!account) continue;

    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (account.type === "revenue") {
      revenue += credit - debit;
    }

    if (account.type === "expense") {
      expenses += debit - credit;
    }
  }

  return {
    revenue,
    expenses,
    netProfit: revenue - expenses,
  };
}
