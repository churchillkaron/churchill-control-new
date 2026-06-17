import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runBudgetVariance({
  tenantId,
  budgetId,
  actualRevenue,
  actualExpenses,
}) {
  const budget =
    await supabase
      .from("budgeting_plans")
      .select("*")
      .eq("id", budgetId)
      .single();

  if (!budget.data) {
    throw new Error(
      "Budget plan missing"
    );
  }

  const revenueVariance =
    Number(actualRevenue || 0) -
    Number(
      budget.data
        .planned_revenue || 0
    );

  const expenseVariance =
    Number(actualExpenses || 0) -
    Number(
      budget.data
        .planned_expenses || 0
    );

  const actualProfit =
    Number(actualRevenue || 0) -
    Number(actualExpenses || 0);

  const profitVariance =
    actualProfit -
    Number(
      budget.data
        .planned_profit || 0
    );

  const { data, error } =
    await supabase
      .from(
        "budgeting_variances"
      )
      .insert({
        tenant_id: tenantId,
        budget_id: budgetId,
        actual_revenue:
          actualRevenue,
        actual_expenses:
          actualExpenses,
        revenue_variance:
          revenueVariance,
        expense_variance:
          expenseVariance,
        profit_variance:
          profitVariance,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
