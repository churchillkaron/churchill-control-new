import { supabase } from "@/lib/supabase";

import { getLedgerBalances } from "./getLedgerBalances";

export async function getBudgetVariance({
  tenantId,
  budgetId,
  startDate,
  endDate,
}) {
  const {
    data: budgetLines,
    error,
  } = await supabase
    .from("budget_lines")
    .select(`
      *,
      chart_of_accounts (
        code,
        name,
        type
      )
    `)
    .eq("budget_id", budgetId);

  if (error) {
    throw error;
  }

  const actuals =
    await getLedgerBalances({
      tenantId,
      startDate,
      endDate,
    });

  const results = [];

  for (const line of budgetLines || []) {
    const actual =
      actuals.find(
        (a) =>
          a.accountId ===
          line.account_id
      );

    const actualBalance =
      Math.abs(
        Number(
          actual?.balance || 0
        )
      );

    const budgetAmount =
      Number(
        line.annual_amount || 0
      );

    results.push({
      accountCode:
        line.chart_of_accounts
          ?.code,
      accountName:
        line.chart_of_accounts
          ?.name,
      budget:
        budgetAmount,
      actual:
        actualBalance,
      variance:
        actualBalance -
        budgetAmount,
    });
  }

  return results;
}
