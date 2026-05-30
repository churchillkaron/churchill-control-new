import { supabase } from "@/lib/supabase";

export async function getProfitLoss({
  tenantId,
  startDate,
  endDate,
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
      ),
      journal_entries (
        entry_date
      )
    `)
    .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  const revenue = [];
  const expenses = [];

  for (const line of data) {
    const account = line.chart_of_accounts;

    if (!account) continue;

    const item = {
      code: account.code,
      name: account.name,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      balance:
        Number(line.credit || 0) -
        Number(line.debit || 0),
    };

    if (account.type === "revenue") {
      revenue.push(item);
    }

    if (account.type === "expense") {
      expenses.push(item);
    }
  }

  const totalRevenue = revenue.reduce(
    (sum, item) => sum + item.balance,
    0
  );

  const totalExpenses = expenses.reduce(
    (sum, item) => sum + Math.abs(item.balance),
    0
  );

  return {
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
  };
}
