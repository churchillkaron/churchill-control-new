import { supabase } from "@/lib/supabase";

export async function generateConsolidatedReport({
  tenantIds,
  startDate,
  endDate,
}) {
  const combined = [];

  for (const tenantId of tenantIds) {
    let query = supabase
      .from("general_ledger_entries")
      .select(`
        debit,
        credit,
        balance,
        chart_of_accounts (
          code,
          name,
          type
        )
      `)
      .eq("tenant_id", tenantId);

    if (startDate) {
      query = query.gte(
        "entry_date",
        startDate
      );
    }

    if (endDate) {
      query = query.lte(
        "entry_date",
        endDate
      );
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    combined.push(...(data || []));
  }

  const grouped = {};

  for (const row of combined) {
    const account =
      row.chart_of_accounts;

    if (!account) continue;

    if (!grouped[account.code]) {
      grouped[account.code] = {
        code: account.code,
        name: account.name,
        type: account.type,
        debit: 0,
        credit: 0,
        balance: 0,
      };
    }

    grouped[account.code].debit +=
      Number(row.debit || 0);

    grouped[account.code].credit +=
      Number(row.credit || 0);

    grouped[account.code].balance +=
      Number(row.balance || 0);
  }

  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenue = 0;
  let expenses = 0;

  for (const item of Object.values(grouped)) {
    const value =
      Number(item.balance || 0);

    if (item.type === "asset") {
      assets += value;
    }

    if (item.type === "liability") {
      liabilities += Math.abs(value);
    }

    if (item.type === "equity") {
      equity += Math.abs(value);
    }

    if (item.type === "revenue") {
      revenue += Math.abs(value);
    }

    if (item.type === "expense") {
      expenses += Math.abs(value);
    }
  }

  return {
    accounts: Object.values(grouped),

    balanceSheet: {
      assets,
      liabilities,
      equity,
    },

    profitLoss: {
      revenue,
      expenses,
      netProfit:
        revenue - expenses,
    },
  };
}
