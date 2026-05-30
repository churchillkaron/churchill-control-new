import { supabase } from "@/lib/supabase";

export async function createBudgetPlan({
  tenantId,
  budgetName,
  budgetPeriod,
  department,
  plannedRevenue,
  plannedExpenses,
}) {
  const plannedProfit =
    Number(plannedRevenue || 0) -
    Number(plannedExpenses || 0);

  const { data, error } =
    await supabase
      .from("budgeting_plans")
      .insert({
        tenant_id: tenantId,
        budget_name: budgetName,
        budget_period: budgetPeriod,
        department,
        planned_revenue:
          plannedRevenue,
        planned_expenses:
          plannedExpenses,
        planned_profit:
          plannedProfit,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
